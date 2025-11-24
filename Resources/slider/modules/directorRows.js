import { getSessionInfo, makeApiRequest, getCachedUserTopGenres } from "./api.js";
import { getConfig } from "./config.js";
import { getLanguageLabels } from "../language/index.js";
import { attachMiniPosterHover } from "./studioHubsUtils.js";
import { openDirectorExplorer } from "./genreExplorer.js";
import { REOPEN_COOLDOWN_MS, OPEN_HOVER_DELAY_MS } from "./hoverTrailerModal.js";

const config = getConfig();
const labels = getLanguageLabels?.() || {};
const IS_MOBILE = (navigator.maxTouchPoints > 0) || (window.innerWidth <= 820);

const PLACEHOLDER_URL = (config.placeholderImage) || './slider/src/images/placeholder.png';
const ROWS_COUNT = Number.isFinite(config.directorRowsCount) ? Math.max(1, config.directorRowsCount|0) : 5;
const ROW_CARD_COUNT = Number.isFinite(config.directorRowCardCount) ? Math.max(1, config.directorRowCardCount|0) : 10;
const EFFECTIVE_ROW_CARD_COUNT = IS_MOBILE ? Math.min(ROW_CARD_COUNT, 8) : Math.min(ROW_CARD_COUNT, 12);
const MIN_RATING = 0;
const HOVER_MODE = (config.directorRowsHoverPreviewMode === 'studioMini' || config.directorRowsHoverPreviewMode === 'modal')
  ? config.directorRowsHoverPreviewMode
  : 'inherit';

const MIN_CONTENTS = Number.isFinite(config.directorRowsMinItemsPerDirector)
  ? Math.max(1, config.directorRowsMinItemsPerDirector|0)
  : 8;

const STATE = {
  directors: [],
  nextIndex: 0,
  batchSize: 2,
  started: false,
  loading: false,
  batchObserver: null,
  wrapEl: null,
  serverId: null,
  userId: null,
  renderedCount: 0,
  maxRenderCount: 10,
  sectionIOs: new Set(),
  autoPumpScheduled: false
};

(function ensurePerfCssOnce(){
  if (document.getElementById('dir-rows-perf-css')) return;
  const st = document.createElement('style');
  st.id = 'dir-rows-perf-css';
  st.textContent = `
    #director-rows .dir-row-section {
      contain-intrinsic-size: 260px 600px;
      margin-bottom: 8px;
    }
    #director-rows .personal-recs-row {
      contain-intrinsic-size: 260px 400px;
      contain: layout style paint;
    }
    #director-rows .personal-recs-card {
      contain: layout style paint;
      will-change: transform;
    }
    .skeleton-line {
      background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
      background-size: 200% 100%;
      animation: skeleton-pulse 1.5s ease-in-out infinite;
      border-radius: 4px;
    }
    @keyframes skeleton-pulse {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    img.is-lqip {
      filter: blur(8px);
      transform: translateZ(0);
      transition: filter 0.3s ease;
    }
    img.is-lqip.__hydrated {
      filter: none;
    }
  `;
  document.head.appendChild(st);
})();

const COMMON_FIELDS = [
  "Type","PrimaryImageAspectRatio","ImageTags","CommunityRating","Genres",
  "OfficialRating","ProductionYear","CumulativeRunTimeTicks","RunTimeTicks","People"
].join(",");

function buildPosterUrl(item, height = 540, quality = 72) {
  const tag = item?.ImageTags?.Primary || item?.PrimaryImageTag;
  if (!tag) return null;
  return `/Items/${item.Id}/Images/Primary?tag=${encodeURIComponent(tag)}&maxHeight=${height}&quality=${quality}&EnableImageEnhancers=false`;
}
function buildPosterUrlHQ(item){ return buildPosterUrl(item, 540, 72); }
function buildPosterUrlLQ(item){ return buildPosterUrl(item, 80, 20); }
function buildPosterSrcSet(item) {
  const hs = [240, 360, 540];
  const q  = 50;
  const ar = Number(item.PrimaryImageAspectRatio) || 0.6667;
  return hs.map(h => `${buildPosterUrl(item, h, q)} ${Math.round(h * ar)}w`).join(", ");
}

let __imgIO = window.__JMS_DIR_IMGIO;
if (!__imgIO) {
  __imgIO = new IntersectionObserver((entries) => {
    for (const ent of entries) {
      if (!ent.isIntersecting) continue;
      const img = ent.target;
      const data = img.__data || {};
      if (!img.__hiRequested) {
        img.__hiRequested = true;
        img.__phase = 'hi';
        if (data.hqSrc) {
          img.src = data.hqSrc;
          requestIdleCallback(() => {
            if (img.__hiRequested && data.hqSrcset) {
              img.srcset = data.hqSrcset;
            }
          });
        }
      }
    }
  }, {
    rootMargin: IS_MOBILE ? '400px 0px' : '600px 0px',
    threshold: 0.1
  });
  window.__JMS_DIR_IMGIO = __imgIO;
}

function hydrateBlurUp(img, { lqSrc, hqSrc, hqSrcset, fallback }) {
  const fb = fallback || PLACEHOLDER_URL;

  img.__data = { lqSrc, hqSrc, hqSrcset, fallback: fb };
  img.__phase = 'lq';
  img.__hiRequested = false;

  try {
    img.removeAttribute('srcset');
    img.loading = 'lazy';
  } catch {}

  img.src = lqSrc || fb;
  img.classList.add('is-lqip');
  img.__hydrated = false;

  const onError = () => {
    if (img.__phase === 'hi') {
      try { img.removeAttribute('srcset'); } catch {}
      img.src = lqSrc || fb;
      img.classList.add('is-lqip');
      img.__phase = 'lq';
      img.__hiRequested = false;
    }
  };

  const onLoad = () => {
    if (img.__phase === 'hi') {
      img.classList.add('__hydrated');
      img.classList.remove('is-lqip');
      img.__hydrated = true;
    }
  };

  img.__onErr = onError;
  img.__onLoad = onLoad;
  img.addEventListener('error', onError, { passive:true });
  img.addEventListener('load',  onLoad,  { passive:true });
  __imgIO.observe(img);
}

function unobserveImage(img) {
  try { __imgIO.unobserve(img); } catch {}
  try { img.removeEventListener('error', img.__onErr); } catch {}
  try { img.removeEventListener('load',  img.__onLoad); } catch {}
  delete img.__onErr; delete img.__onLoad;
  if (img) {
    img.removeAttribute('srcset');
    img.removeAttribute('src');
  }
}

function formatRuntime(ticks) {
  if (!ticks) return null;
  const minutes = Math.floor(ticks / 600000000);
  if (minutes < 60) return `${minutes}d`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}s ${remainingMinutes}d` : `${hours}s`;
}

function getRuntimeWithIcons(runtime) {
  if (!runtime) return '';
  return runtime.replace(/(\d+)s/g, `$1${config.languageLabels?.sa || 'sa'}`)
               .replace(/(\d+)d/g, `$1${config.languageLabels?.dk || 'dk'}`);
}

function normalizeAgeChip(rating) {
  if (!rating) return null;
  const r = String(rating).toUpperCase().trim();
  if (/(18\+|R18|NC-17|XXX|AO)/.test(r)) return "18+";
  if (/(17\+|R|TV-MA)/.test(r)) return "17+";
  if (/(16\+|R16|M)/.test(r)) return "16+";
  if (/(15\+|TV-15)/.test(r)) return "15+";
  if (/(13\+|TV-14|PG-13)/.test(r)) return "13+";
  if (/(12\+|TV-12)/.test(r)) return "12+";
  if (/(10\+|TV-Y10)/.test(r)) return "10+";
  if (/(7\+|TV-Y7|E10\+)/.test(r)) return "7+";
  if (/(G|PG|TV-G|TV-PG|E|U|UC)/.test(r)) return "7+";
  if (/(ALL AGES|ALL|TV-Y|KIDS|Y)/.test(r)) return "0+";
  return r;
}

function getDetailsUrl(itemId, serverId) {
  return `#/details?id=${itemId}&serverId=${encodeURIComponent(serverId)}`;
}

function createRecommendationCard(item, serverId, aboveFold = false) {
  const card = document.createElement("div");
  card.className = "card personal-recs-card";
  card.dataset.itemId = item.Id;

  const posterUrlHQ = buildPosterUrlHQ(item);
  const posterSetHQ = posterUrlHQ ? buildPosterSrcSet(item) : "";
  const posterUrlLQ = buildPosterUrlLQ(item);
  const year = item.ProductionYear || "";
  const ageChip = normalizeAgeChip(item.OfficialRating || "");
  const runtimeTicks = item.Type === "Series" ? item.CumulativeRunTimeTicks : item.RunTimeTicks;
  const runtime = formatRuntime(runtimeTicks);
  const genres = Array.isArray(item.Genres) ? item.Genres.slice(0, 2).join(", ") : "";
  const isSeries = item.Type === "Series";
  const typeLabel = isSeries
    ? ((config.languageLabels && config.languageLabels.dizi) || "Dizi")
    : ((config.languageLabels && config.languageLabels.film) || "Film");
  const typeIcon = isSeries ? '🎬' : '🎞️';
  const community = Number.isFinite(item.CommunityRating)
    ? `<div class="community-rating" title="Community Rating">⭐ ${item.CommunityRating.toFixed(1)}</div>`
    : "";

  card.innerHTML = `
    <div class="cardBox">
      <a class="cardLink" href="${getDetailsUrl(item.Id, serverId)}">
        <div class="cardImageContainer">
          <img class="cardImage"
            alt="${item.Name}"
            loading="${aboveFold ? 'eager' : 'lazy'}"
            decoding="async"
            ${aboveFold ? 'fetchpriority="high"' : ''}>
          <div class="prc-top-badges">
            ${community}
            <div class="prc-type-badge">
              <span class="prc-type-icon">${typeIcon}</span>
              ${typeLabel}
            </div>
          </div>
          <div class="prc-gradient"></div>
          <div class="prc-overlay">
            <div class="prc-meta">
              ${ageChip ? `<span class="prc-age">${ageChip}</span><span class="prc-dot">•</span>` : ""}
              ${year ? `<span class="prc-year">${year}</span><span class="prc-dot">•</span>` : ""}
              ${runtime ? `<span class="prc-runtime">${getRuntimeWithIcons(runtime)}</span>` : ""}
            </div>
            ${genres ? `<div class="prc-genres">${genres}</div>` : ""}
          </div>
        </div>
      </a>
    </div>
  `;

  const img = card.querySelector('.cardImage');
  try {
    const sizesMobile = '(max-width: 640px) 45vw, (max-width: 820px) 38vw, 200px';
    const sizesDesk   = '(max-width: 1200px) 20vw, 200px';
    img.setAttribute('sizes', IS_MOBILE ? sizesMobile : sizesDesk);
  } catch {}

  if (posterUrlHQ) {
    hydrateBlurUp(img, {
      lqSrc: posterUrlLQ,
      hqSrc: posterUrlHQ,
      hqSrcset: posterSetHQ,
      fallback: PLACEHOLDER_URL
    });
  } else {
    try { img.style.display = 'none'; } catch {}
    const noImg = document.createElement('div');
    noImg.className = 'prc-noimg-label';
    noImg.textContent =
      (config.languageLabels && (config.languageLabels.noImage || config.languageLabels.loadingText))
      || (labels.noImage || 'Görsel yok');
    noImg.style.minHeight = '200px';
    noImg.style.display = 'flex';
    noImg.style.alignItems = 'center';
    noImg.style.justifyContent = 'center';
    noImg.style.textAlign = 'center';
    noImg.style.padding = '12px';
    noImg.style.fontWeight = '600';
    card.querySelector('.cardImageContainer')?.prepend(noImg);
  }

  const mode = (HOVER_MODE === 'inherit')
    ? (getConfig()?.globalPreviewMode === 'studioMini' ? 'studioMini' : 'modal')
    : HOVER_MODE;

  setTimeout(() => {
    if (card.isConnected) {
      attachPreviewByMode(card, { Id: item.Id, Name: item.Name }, mode);
    }
  }, 500);

  card.addEventListener('jms:cleanup', () => { unobserveImage(img); }, { once:true });
  return card;
}

const __hoverIntent = new WeakMap();
const __enterTimers = new WeakMap();
const __enterSeq     = new WeakMap();
const __cooldownUntil= new WeakMap();
const __openTokenMap = new WeakMap();
const __boundPreview = new WeakMap();

let __lastMoveTS = 0;
let __pmLast = 0;
window.addEventListener('pointermove', () => {
  const now = Date.now();
  if (now - __pmLast > 100) { __pmLast = now; __lastMoveTS = now; }
}, {passive:true});

let __touchStickyOpen = false;
let __touchLastOpenTS = 0;
const TOUCH_STICKY_GRACE_MS = 1200;

function hardWipeHoverModalDom() {
  const modal = document.querySelector('.video-preview-modal');
  if (!modal) return;
  try { modal.dataset.itemId = ""; } catch {}
  modal.querySelectorAll('img').forEach(img => {
    try { img.removeAttribute('src'); img.removeAttribute('srcset'); } catch {}
  });
  modal.querySelectorAll('[data-field="title"],[data-field="subtitle"],[data-field="meta"],[data-field="genres"]').forEach(el => {
    el.textContent = '';
  });
}

(function ensureGlobalTouchOutsideCloser(){
  if (window.__jmsTouchCloserBound_dir) return;
  window.__jmsTouchCloserBound_dir = true;
  document.addEventListener('pointerdown', (e) => {
    if (!__touchStickyOpen) return;
    const inModal = e.target?.closest?.('.video-preview-modal');
    if (!inModal) {
      try { safeCloseHoverModal(); } catch {}
      __touchStickyOpen = false;
    }
  }, { passive: true });
  document.addEventListener('keydown', (e) => {
    if (!__touchStickyOpen) return;
    if (e.key === 'Escape') {
      try { safeCloseHoverModal(); } catch {}
      __touchStickyOpen = false;
    }
  });
})();

function isHoveringCardOrModal(cardEl) {
  try {
    const overCard  = cardEl?.isConnected && cardEl.matches(':hover');
    const overModal = !!document.querySelector('.video-preview-modal:hover');
    return !!(overCard || overModal);
  } catch { return false; }
}

function schedulePostOpenGuard(cardEl, token, delay=300) {
  setTimeout(() => {
    if (__openTokenMap.get(cardEl) !== token) return;
    if (!isHoveringCardOrModal(cardEl)) {
      try { safeCloseHoverModal(); } catch {}
    }
  }, delay);
}

function scheduleClosePollingGuard(cardEl, tries=4, interval=120) {
  let count = 0;
  const iid = setInterval(() => {
    count++;
    if (isHoveringCardOrModal(cardEl)) { clearInterval(iid); return; }
    if (Date.now() - __lastMoveTS > 120 || count >= tries) {
      try { safeCloseHoverModal(); } catch {}
      clearInterval(iid);
    }
  }, interval);
}

function clearEnterTimer(cardEl) {
  const t = __enterTimers.get(cardEl);
  if (t) { clearTimeout(t); __enterTimers.delete(cardEl); }
}

function safeOpenHoverModal(itemId, anchorEl) {
  if (typeof window.tryOpenHoverModal === 'function') {
    try { window.tryOpenHoverModal(itemId, anchorEl, { bypass: true }); return; } catch {}
  }
  if (window.__hoverTrailer && typeof window.__hoverTrailer.open === 'function') {
    try { window.__hoverTrailer.open({ itemId, anchor: anchorEl, bypass: true }); return; } catch {}
  }
  window.dispatchEvent(new CustomEvent('jms:hoverTrailer:open', { detail: { itemId, anchor: anchorEl, bypass: true }}));
}

function safeCloseHoverModal() {
  if (typeof window.closeHoverPreview === 'function') {
    try { window.closeHoverPreview(); return; } catch {}
  }
  if (window.__hoverTrailer && typeof window.__hoverTrailer.close === 'function') {
    try { window.__hoverTrailer.close(); return; } catch {}
  }
  window.dispatchEvent(new CustomEvent('jms:hoverTrailer:close'));
  try { hardWipeHoverModalDom(); } catch {}
}

function attachHoverTrailer(cardEl, itemLike) {
  if (!cardEl || !itemLike?.Id) return;
  if (!__enterSeq.has(cardEl)) __enterSeq.set(cardEl, 0);

  const onEnter = (e) => {
    const isTouch = e?.pointerType === 'touch';
    const until = __cooldownUntil.get(cardEl) || 0;
    if (Date.now() < until) return;

    __hoverIntent.set(cardEl, true);
    clearEnterTimer(cardEl);

    const seq = (__enterSeq.get(cardEl) || 0) + 1;
    __enterSeq.set(cardEl, seq);

    const timer = setTimeout(() => {
      if ((__enterSeq.get(cardEl) || 0) !== seq) return;
      if (!__hoverIntent.get(cardEl)) return;
      if (!isTouch) {
        if (!cardEl.isConnected || !cardEl.matches(':hover')) return;
      }
      try { window.dispatchEvent(new Event('closeAllMiniPopovers')); } catch {}

      const token = (Date.now() ^ Math.random()*1e9) | 0;
      __openTokenMap.set(cardEl, token);

      try { hardWipeHoverModalDom(); } catch {}
      safeOpenHoverModal(itemLike.Id, cardEl);

      if (isTouch) {
        __touchStickyOpen = true;
        __touchLastOpenTS = Date.now();
      }
      if (!isTouch) schedulePostOpenGuard(cardEl, token, 300);
    }, OPEN_HOVER_DELAY_MS);

    __enterTimers.set(cardEl, timer);
  };

  const onLeave = (e) => {
    const isTouch = e?.pointerType === 'touch';
    __hoverIntent.set(cardEl, false);
    clearEnterTimer(cardEl);
    __enterSeq.set(cardEl, (__enterSeq.get(cardEl) || 0) + 1);
    if (isTouch && __touchStickyOpen) {
      if (Date.now() - __touchLastOpenTS <= TOUCH_STICKY_GRACE_MS) return;
      return;
    }

    const rt = e?.relatedTarget || null;
    const goingToModal = !!(rt && (rt.closest ? rt.closest('.video-preview-modal') : null));
    if (goingToModal) return;

    try { safeCloseHoverModal(); } catch {}
    try { hardWipeHoverModalDom(); } catch {}
    __cooldownUntil.set(cardEl, Date.now() + REOPEN_COOLDOWN_MS);
    scheduleClosePollingGuard(cardEl, 4, 120);
  };

  cardEl.addEventListener('pointerenter', onEnter, { passive: true });
  cardEl.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') onEnter(e); }, { passive: true });
  cardEl.addEventListener('pointerleave', onLeave,  { passive: true });
  __boundPreview.set(cardEl, { mode: 'modal', onEnter, onLeave });
}

function detachPreviewHandlers(cardEl) {
  const rec = __boundPreview.get(cardEl);
  if (!rec) return;
  try { cardEl.removeEventListener('pointerenter', rec.onEnter); } catch {}
  try { cardEl.removeEventListener('pointerleave', rec.onLeave); } catch {}
  clearEnterTimer(cardEl);
  __hoverIntent.delete(cardEl);
  __openTokenMap.delete(cardEl);
  __boundPreview.delete(cardEl);
}

function attachPreviewByMode(cardEl, itemLike, mode) {
  detachPreviewHandlers(cardEl);
  if (mode === 'studioMini') {
    attachMiniPosterHover(cardEl, itemLike);
    __boundPreview.set(cardEl, { mode: 'studioMini', onEnter: ()=>{}, onLeave: ()=>{} });
  } else {
    attachHoverTrailer(cardEl, itemLike);
  }
}

function setupScroller(row) {
  if (row.dataset.scrollerMounted === "1") {
    requestAnimationFrame(() => row.dispatchEvent(new Event('scroll')));
    return;
  }
  row.dataset.scrollerMounted = "1";
  const section = row.closest(".dir-row-section") || row.parentElement;
  if (!section) return;

  const btnL = section.querySelector(".hub-scroll-left");
  const btnR = section.querySelector(".hub-scroll-right");
  const canScroll = () => (row.scrollWidth - row.clientWidth) > 20;
  const STEP_PCT = 0.8;
  const stepPx   = () => Math.max(200, Math.floor(row.clientWidth * STEP_PCT));

  let _rafToken = null;
  const updateButtonsNow = () => {
      if (!row.isConnected) return;
    const max = Math.max(0, row.scrollWidth - row.clientWidth);
    const atStart = !canScroll() || row.scrollLeft <= 1;
    const atEnd = !canScroll() || row.scrollLeft >= max - 1;
    if (btnL) btnL.setAttribute("aria-disabled", atStart ? "true" : "false");
    if (btnR) btnR.setAttribute("aria-disabled", atEnd ? "true" : "false");
  };
  const scheduleUpdate = () => {
    if (_rafToken) return;
    _rafToken = requestAnimationFrame(() => { _rafToken = null; updateButtonsNow(); });
  };

  function animateScrollTo(targetLeft, duration = 350) {
    const start = row.scrollLeft;
    const dist  = targetLeft - start;
    if (Math.abs(dist) < 1) { row.scrollLeft = targetLeft; scheduleUpdate(); return; }
    let startTs = null;
    const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
    function tick(ts) {
      if (startTs == null) startTs = ts;
      const p = Math.min(1, (ts - startTs) / duration);
      row.scrollLeft = start + dist * easeOutCubic(p);
      if (p < 1) requestAnimationFrame(tick); else scheduleUpdate();
    }
    requestAnimationFrame(tick);
  }
  function doScroll(dir, evt) {
    if (!canScroll()) return;
    const fast = evt?.shiftKey ? 2 : 1;
    const delta = (dir < 0 ? -1 : 1) * stepPx() * fast;
    const max = Math.max(0, row.scrollWidth - row.clientWidth);
    const target = Math.max(0, Math.min(max, row.scrollLeft + delta));
    animateScrollTo(target, 180);
  }

  if (btnL) btnL.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); doScroll(-1, e); });
  if (btnR) btnR.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); doScroll( 1, e); });

  const onWheel = (e) => {
    const horizontalIntent = Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey;
    if (!horizontalIntent) return;
    const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
    row.scrollLeft += delta;
    e.preventDefault();
    e.stopPropagation();
    scheduleUpdate();
  };
  row.addEventListener("wheel", onWheel, { passive: false });

  let tStartX = 0, tStartY = 0, tStartScroll = 0;
  let tActive = false, lockedX = false, swiped = false;
  const MOVE_LOCK_THRESHOLD = 8;
  const CLICK_SUPPRESS_MS   = 250;

  const onTouchStart = (e) => {
    const t = e.touches && e.touches[0];
    if (!t) return;
    tStartX = t.clientX;
    tStartY = t.clientY;
    tStartScroll = row.scrollLeft;
    tActive = true;
    lockedX = false;
    swiped  = false;
    e.stopPropagation();
  };

  const onTouchMove = (e) => {
    if (!tActive) return;
    const t = e.touches && e.touches[0];
    if (!t) return;

    const dx = t.clientX - tStartX;
    const dy = t.clientY - tStartY;

    if (!lockedX && Math.abs(dx) > Math.abs(dy) + MOVE_LOCK_THRESHOLD) {
      lockedX = true;
    }

    if (lockedX) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();

      const max = Math.max(0, row.scrollWidth - row.clientWidth);
      const target = Math.max(0, Math.min(max, tStartScroll - dx));
      if (row.scrollLeft !== target) {
        row.scrollLeft = target;
        swiped = true;
        scheduleUpdate();
      }
    } else {
      e.stopPropagation();
    }
  };

  const endTouch = () => { tActive = false; lockedX = false; };
  const onTouchEnd = (e) => {
    if (swiped) {
      const block = (ev) => {
        ev.stopPropagation();
        if (ev.cancelable) ev.preventDefault();
      };
      row.addEventListener('click', block, true);
      setTimeout(() => { try { row.removeEventListener('click', block, true); } catch {} }, CLICK_SUPPRESS_MS);
    }
    endTouch();
  };
  const onTouchCancel = () => endTouch();

  row.addEventListener("touchstart", onTouchStart, { passive: false });
  row.addEventListener("touchmove",  onTouchMove,  { passive: false });
  row.addEventListener("touchend",   onTouchEnd,   { passive: true  });
  row.addEventListener("touchcancel",onTouchCancel,{ passive: true  });

  const onScroll = () => scheduleUpdate();
  row.addEventListener("scroll", onScroll, { passive: true });

  const ro = new ResizeObserver(() => scheduleUpdate());
  ro.observe(row);
  row.__ro = ro;

  row.addEventListener('jms:cleanup', () => {
    try { row.removeEventListener("wheel", onWheel); } catch {}
    try { row.removeEventListener("scroll", onScroll); } catch {}
    try { row.removeEventListener("touchstart", onTouchStart); } catch {}
    try { row.removeEventListener("touchmove", onTouchMove); } catch {}
    try { row.removeEventListener("touchend", onTouchEnd); } catch {}
    try { row.removeEventListener("touchcancel", onTouchCancel); } catch {}
    try { ro.disconnect(); } catch {}
  }, { once:true });

  requestAnimationFrame(() => updateButtonsNow());
  setTimeout(() => updateButtonsNow(), 400);
}

function renderSkeletonRow(row, count=EFFECTIVE_ROW_CARD_COUNT) {
  row.innerHTML = "";
  const fragment = document.createDocumentFragment();
  for (let i=0; i<count; i++) {
    const el = document.createElement("div");
    el.className = "card personal-recs-card skeleton";
    el.innerHTML = `
      <div class="cardBox">
        <div class="cardImageContainer">
          <div class="cardImage"></div>
          <div class="prc-gradient"></div>
          <div class="prc-overlay">
            <div class="prc-meta">
              <span class="skeleton-line" style="width:42px;height:18px;border-radius:999px;"></span>
              <span class="prc-dot">•</span>
              <span class="skeleton-line" style="width:38px;height:12px;"></span>
              <span class="prc-dot">•</span>
              <span class="skeleton-line" style="width:38px;height:12px;"></span>
            </div>
            <div class="prc-genres">
              <span class="skeleton-line" style="width:90px;height:12px;"></span>
            </div>
          </div>
        </div>
      </div>
    `;
    fragment.appendChild(el);
  }
  row.appendChild(fragment);
}

function filterAndTrimByRating(items, minRating, maxCount) {
  const seen = new Set();
  const out = [];
  for (const it of items || []) {
    if (!it || !it.Id) continue;
    if (seen.has(it.Id)) continue;
    seen.add(it.Id);
    out.push(it);
    if (out.length >= maxCount) break;
  }
  return out;
}

async function hasAtLeastNByDirector(userId, directorId, n=MIN_CONTENTS) {
  const url = `/Users/${userId}/Items?IncludeItemTypes=Movie,Series&Recursive=true&PersonIds=${encodeURIComponent(directorId)}&Limit=1&SortBy=DateCreated&SortOrder=Descending`;
  try {
    const data = await makeApiRequest(url);
    const total = Number(data?.TotalRecordCount) || 0;
    return total >= n;
  } catch (e) {
    console.warn('directorRows: count check failed for', directorId, e);
    return false;
  }
}

async function pMapLimited(list, limit, mapper) {
  const ret = new Array(list.length);
  let i = 0;
  const workers = new Array(Math.min(limit, list.length)).fill(0).map(async () => {
    while (i < list.length) {
      const cur = i++;
      ret[cur] = await mapper(list[cur], cur);
    }
  });
  await Promise.all(workers);
  return ret;
}

async function pickRandomDirectorsFromTopGenres(userId, targetCount = ROWS_COUNT) {
  const requestedPrimary = 300;
  const requestedFallback = 600;
  const fields = COMMON_FIELDS;
  const topGenres = (config.directorRowsUseTopGenres !== false)
    ? (await getCachedUserTopGenres(2).catch(()=>[]))
    : [];
  const peopleMap = new Map();

  async function scanItems(url, takeUntil) {
    try {
      const data = await makeApiRequest(url);
      const items = Array.isArray(data?.Items) ? data.Items : [];
      for (const it of items) {
        const ppl = Array.isArray(it?.People) ? it.People : [];
        for (const p of ppl) {
          if (!p?.Id || !p?.Name) continue;
          if (String(p?.Type || '').toLowerCase() !== 'director') continue;
          const entry = peopleMap.get(p.Id) || { Id: p.Id, Name: p.Name, Count: 0 };
          entry.Count++;
          peopleMap.set(p.Id, entry);
          if (peopleMap.size >= takeUntil) break;
        }
        if (peopleMap.size >= takeUntil) break;
      }
    } catch (e) {
      console.warn("directorRows: people scan error:", e);
    }
  }

  if (topGenres?.length) {
    const g = encodeURIComponent(topGenres.join("|"));
    const url = `/Users/${userId}/Items?IncludeItemTypes=Movie,Series&Recursive=true&Fields=${fields}&SortBy=Random,CommunityRating,DateCreated&SortOrder=Descending&Limit=${requestedPrimary}&Genres=${g}`;
    await scanItems(url, targetCount * 8);
  }
  if (peopleMap.size < targetCount * 2) {
    const url = `/Users/${userId}/Items?IncludeItemTypes=Movie,Series&Recursive=true&Fields=${fields}&SortBy=Random,CommunityRating,DateCreated&SortOrder=Descending&Limit=${requestedFallback}`;
    await scanItems(url, targetCount * 12);
  }

  let directors = [...peopleMap.values()];
  if (!directors.length) return [];
  directors.sort((a,b)=>b.Count-a.Count);
  const head = directors.slice(0, Math.min(60, directors.length));
  const checks = await pMapLimited(head, 3, async (d) => ({ d, ok: await hasAtLeastNByDirector(userId, d.Id, MIN_CONTENTS) }));
  const eligible = checks.filter(x=>x.ok).map(x=>x.d);

  if (!eligible.length) return [];

  shuffle(eligible);
  return eligible.slice(0, targetCount);
}

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j=(Math.random()*(i+1))|0;
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}

async function fetchItemsByDirector(userId, directorId, limit=EFFECTIVE_ROW_CARD_COUNT*2) {
  const fields = COMMON_FIELDS;
  const url =
    `/Users/${userId}/Items?` +
    `IncludeItemTypes=Movie,Series&Recursive=true&Fields=${fields}&` +
    `PersonIds=${encodeURIComponent(directorId)}&` +
    `SortBy=Random,CommunityRating,DateCreated&SortOrder=Descending&Limit=${Math.max(40, limit)}`;
  try {
    const data = await makeApiRequest(url);
    const items = Array.isArray(data?.Items) ? data.Items : [];
    return filterAndTrimByRating(items, MIN_RATING, EFFECTIVE_ROW_CARD_COUNT);
  } catch (e) {
    console.warn("directorRows: yönetmen içerik çekilemedi:", e);
    return [];
  }
}

export function mountDirectorRowsLazy() {
  const cfg = getConfig();
  if (!cfg.enableDirectorRows) return;

  let wrap = document.getElementById('director-rows');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'director-rows';
    wrap.className = 'homeSection director-rows-wrapper';
  }

  const parent = getHomeSectionsContainer() || document.body;
  (parent || document.body).appendChild(wrap);
  try { ensureIntoHomeSections(wrap); } catch {}

  let ioStart = new IntersectionObserver(async (ents, obs) => {
    for (const ent of ents) {
      if (ent.isIntersecting) {
        obs.disconnect();
        requestIdleCallback(async () => {
          try { await initAndRenderFirstBatch(wrap); } catch (e) { console.error(e); }
        }, { timeout: 1200 });
      }
    }
  }, {
    rootMargin: '0px 0px',
    threshold: 0.01
  });
  ioStart.observe(wrap);
}

function ensureIntoHomeSections(el, indexPage, { placeAfterId } = {}) {
  if (!el) return;
  const apply = () => {
    const page = indexPage ||
      document.querySelector("#indexPage:not(.hide)") ||
      document.querySelector("#homePage:not(.hide)") ||
      document.body;
    const container =
      page.querySelector(".homeSectionsContainer") ||
      document.querySelector(".homeSectionsContainer");
    if (!container) return false;

    const ref = placeAfterId ? document.getElementById(placeAfterId) : null;
    if (ref && ref.parentElement === container) {
      ref.insertAdjacentElement('afterend', el);
    } else if (el.parentElement !== container) {
      container.appendChild(el);
    }
    return true;
  };

  if (apply()) return;

  let tries = 0;
  const maxTries = 100;
  const mo = new MutationObserver(() => {
    tries++;
    if (apply() || tries >= maxTries) { try { mo.disconnect(); } catch {} }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  setTimeout(apply, 3000);
}

function getHomeSectionsContainer(indexPage) {
  const page = indexPage ||
    document.querySelector("#indexPage:not(.hide)") ||
    document.querySelector("#homePage:not(.hide)") ||
    document.body;
  return page.querySelector(".homeSectionsContainer") ||
         document.querySelector(".homeSectionsContainer") ||
         page;
}

async function initAndRenderFirstBatch(wrap) {
  if (STATE.started) return;
  const { userId, serverId } = getSessionInfo();
  if (!userId) return;

  STATE.started = true;
  STATE.wrapEl = wrap;
  STATE.userId = userId;
  STATE.serverId = serverId;
  const seen = new Set();
STATE.directors = [];
for (let attempt = 0; attempt < 4 && STATE.directors.length < ROWS_COUNT; attempt++) {
  const need = ROWS_COUNT - STATE.directors.length;
  const batch = await pickRandomDirectorsFromTopGenres(userId, need);
  for (const d of batch) {
    if (!seen.has(d.Id)) {
      seen.add(d.Id);
      STATE.directors.push(d);
      if (STATE.directors.length >= ROWS_COUNT) break;
    }
  }
}

if (STATE.directors.length < ROWS_COUNT) {
  console.warn(`DirectorRows: sadece ${STATE.directors.length}/${ROWS_COUNT} yönetmen bulunabildi (kütüphane kısıtlı olabilir).`);
}

  STATE.nextIndex = 0;
  STATE.renderedCount = 0;

  console.log(`DirectorRows: ${STATE.directors.length} uygun yönetmen bulundu (>=${MIN_CONTENTS} içerik), ilk batch scroll’dan sonra başlayacak...`);
  await waitForFirstScrollGate();
  await renderNextDirectorBatch(false);
  setupBatchSentinel();
}

function waitForFirstScrollGate() {
  const px = Math.max(0, Number(config.directorRowsFirstBatchScrollPx) || 200);
  const cur = (window.scrollY || document.documentElement.scrollTop || 0);
  if (cur > px) return Promise.resolve();

  return new Promise((resolve) => {
    const onScroll = () => {
      const y = (window.scrollY || document.documentElement.scrollTop || 0);
      if (y > px) {
        try { window.removeEventListener('scroll', onScroll, { passive: true }); } catch { window.removeEventListener('scroll', onScroll); }
        resolve();
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  });
}

function setupBatchSentinel() {
  let batchSentinel = document.getElementById('director-rows-batch-sentinel');
  if (!batchSentinel) {
    batchSentinel = document.createElement('div');
    batchSentinel.id = 'director-rows-batch-sentinel';
    batchSentinel.style.height = '1px';
    batchSentinel.style.margin = '8px 0 0 0';
    batchSentinel.style.clear = 'both';
    STATE.wrapEl.appendChild(batchSentinel);
  }

  if (STATE.batchObserver) {
    STATE.batchObserver.disconnect();
  }

  STATE.batchObserver = new IntersectionObserver(async (ents) => {
    for (const ent of ents) {
      if (ent.isIntersecting &&
          !STATE.loading &&
          STATE.nextIndex < STATE.directors.length &&
          STATE.renderedCount < STATE.maxRenderCount) {

        console.log('Batch sentinel görüldü, yeni batch render ediliyor...');
        await renderNextDirectorBatch(false);
        setTimeout(checkAndAutoPump, 100);
      }
    }
  }, {
    rootMargin: '400px 0px',
    threshold: 0
  });

  STATE.batchObserver.observe(batchSentinel);
  setTimeout(checkAndAutoPump, 200);
}

function checkAndAutoPump() {
  const sentinel = document.getElementById('director-rows-batch-sentinel');
  if (!sentinel) return;

  const rect = sentinel.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const isVisible = rect.top <= viewportHeight + 500;

  if (isVisible &&
      !STATE.loading &&
      STATE.nextIndex < STATE.directors.length &&
      STATE.renderedCount < STATE.maxRenderCount) {

    console.log('Auto-pump tetiklendi...');
    renderNextDirectorBatch(false).then(() => {
      setTimeout(checkAndAutoPump, 150);
    });
  }
}

async function renderNextDirectorBatch(immediateLoadForThisBatch = false) {
  if (STATE.loading || STATE.renderedCount >= STATE.maxRenderCount) {
    return;
  }

  if (STATE.nextIndex >= STATE.directors.length) {
    console.log('Tüm yönetmenler render edildi.');
    if (STATE.batchObserver) {
      STATE.batchObserver.disconnect();
    }
    return;
  }

  STATE.loading = true;

  const end = Math.min(STATE.nextIndex + STATE.batchSize, STATE.directors.length);
  const slice = STATE.directors.slice(STATE.nextIndex, end);

  console.log(`Render batch: ${STATE.nextIndex}-${end} (${slice.length} yönetmen)`);

  for (let idx = 0; idx < slice.length; idx++) {
    if (STATE.renderedCount >= STATE.maxRenderCount) break;

    const dir = slice[idx];
    await renderDirectorSection(dir, immediateLoadForThisBatch);
    STATE.renderedCount++;
  }

  STATE.nextIndex = end;
  STATE.loading = false;

  console.log(`Render tamamlandı. Toplam: ${STATE.renderedCount}/${STATE.directors.length} yönetmen`);
}

function getDirectorUrl(directorId, directorName, serverId) {
  return `#/details?id=${directorId}&serverId=${encodeURIComponent(serverId)}`;
}

function buildDirectorTitle(name) {
  const lbl = (getConfig()?.languageLabels || {}).showDirector || "Director {name}";
  const safeName = escapeHtml(name || "");
  if (lbl.includes("{name}")) {
    return lbl.replace("{name}", safeName);
  }
  return `${escapeHtml(lbl)} ${safeName}`;
}

function renderDirectorSection(dir, immediateLoad = false) {
  const section = document.createElement('section');
  section.className = 'dir-row-section';

  const title = document.createElement('div');
  title.className = 'sectionTitleContainer sectionTitleContainer-cards';
  const dirTitleText = buildDirectorTitle(dir.Name);
  title.innerHTML = `
    <h2 class="sectionTitle sectionTitle-cards dir-row-title">
      <span class="dir-row-title-text" role="button" tabindex="0"
        aria-label="${(labels.seeAll || config.languageLabels?.seeAll || 'Tümünü gör')}: ${dirTitleText}">
        ${dirTitleText}
      </span>
      <div class="dir-row-see-all"
           aria-label="${(labels.seeAll || config.languageLabels?.seeAll || 'Tümünü gör')}"
           title="${(labels.seeAll || config.languageLabels?.seeAll || 'Tümünü gör')}">
        <span class="material-icons">keyboard_arrow_right</span>
      </div>
      <span class="dir-row-see-all-tip">${(labels.seeAll || config.languageLabels?.seeAll || 'Tümünü gör')}</span>
    </h2>
  `;

  const titleBtn = title.querySelector('.dir-row-title-text');
  const seeAllBtn = title.querySelector('.dir-row-see-all');

  if (titleBtn) {
    const open = (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        openDirectorExplorer({ Id: dir.Id, Name: dir.Name });
      } catch (err) {
        console.error('Director explorer açılırken hata:', err);
      }
    };
    titleBtn.addEventListener('click', open, { passive: false });
    titleBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') open(e);
    });
  }

  if (seeAllBtn) {
    seeAllBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        openDirectorExplorer({ Id: dir.Id, Name: dir.Name });
      } catch (err) {
        console.error('Director explorer açılırken hata:', err);
      }
    }, { passive: false });
  }

  const scrollWrap = document.createElement('div');
  scrollWrap.className = 'personal-recs-scroll-wrap';

  const btnL = document.createElement('button');
  btnL.className = 'hub-scroll-btn hub-scroll-left';
  btnL.setAttribute('aria-label', (config.languageLabels?.scrollLeft) || "Sola kaydır");
  btnL.setAttribute('aria-disabled', 'true');
  btnL.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>`;

  const row = document.createElement('div');
  row.className = 'itemsContainer personal-recs-row';
  row.setAttribute('role', 'list');

  const btnR = document.createElement('button');
  btnR.className = 'hub-scroll-btn hub-scroll-right';
  btnR.setAttribute('aria-label', (config.languageLabels?.scrollRight) || "Sağa kaydır");
  btnR.setAttribute('aria-disabled', 'true');
  btnR.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>`;

  scrollWrap.appendChild(btnL);
  scrollWrap.appendChild(row);
  scrollWrap.appendChild(btnR);

  section.appendChild(title);
  section.appendChild(scrollWrap);
  STATE.wrapEl.appendChild(section);

  renderSkeletonRow(row, EFFECTIVE_ROW_CARD_COUNT);

  const startFilling = () => fillRowWhenReady(row, dir);

  if (immediateLoad) {
    startFilling();
  } else {
    const io = new IntersectionObserver((ents, obs) => {
      for (const ent of ents) {
        if (ent.isIntersecting) {
          obs.disconnect();
          STATE.sectionIOs.delete(obs);
          console.log(`Yönetmen section görüldü: ${dir.Name}`);
          startFilling();
          break;
        }
      }
    }, {
      rootMargin: '100px 0px',
      threshold: 0.01
    });

    io.observe(section);
    STATE.sectionIOs.add(io);
  }
}

function fillRowWhenReady(row, dir){
  (async () => {
    try {
      const ok = await hasAtLeastNByDirector(STATE.userId, dir.Id, MIN_CONTENTS);
      if (!ok) {
        row.innerHTML = `<div class="no-recommendations">${(config.languageLabels?.noRecommendations) || (labels.noRecommendations || "Uygun içerik yok")}</div>`;
        setupScroller(row);
        return;
      }

      const items = await fetchItemsByDirector(STATE.userId, dir.Id, EFFECTIVE_ROW_CARD_COUNT * 2);
      row.innerHTML = "";

      if (!items?.length) {
        row.innerHTML = `<div class="no-recommendations">${(config.languageLabels?.noRecommendations) || (labels.noRecommendations || "Uygun içerik yok")}</div>`;
        setupScroller(row);
      } else {
        const initialCount = IS_MOBILE ? 3 : 4;
        const fragment = document.createDocumentFragment();

        for (let i = 0; i < Math.min(initialCount, items.length); i++) {
          fragment.appendChild(createRecommendationCard(items[i], STATE.serverId, i < 2));
        }
        row.appendChild(fragment);

        let currentIndex = initialCount;

        const pumpMore = () => {
          if (currentIndex >= items.length || row.childElementCount >= EFFECTIVE_ROW_CARD_COUNT) {
            setupScroller(row);
            return;
          }

          const chunkSize = IS_MOBILE ? 1 : 2;
          const fragment = document.createDocumentFragment();

          for (let i = 0; i < chunkSize && currentIndex < items.length; i++) {
            if (row.childElementCount >= EFFECTIVE_ROW_CARD_COUNT) break;
            fragment.appendChild(createRecommendationCard(items[currentIndex], STATE.serverId, false));
            currentIndex++;
          }

          row.appendChild(fragment);
          try { row.dispatchEvent(new Event('scroll')); } catch {}
         setTimeout(pumpMore, 100);
        };
        setTimeout(pumpMore, 200);
      }
    } catch (error) {
      console.error('Yönetmen içerik yükleme hatası:', error);
      row.innerHTML = `<div class="no-recommendations">Yüklenemedi</div>`;
      setupScroller(row);
    }
  })();
}

export function cleanupDirectorRows() {
  try {
    STATE.batchObserver?.disconnect();
    STATE.sectionIOs.forEach(io => io.disconnect());
    STATE.sectionIOs.clear();

    if (STATE.wrapEl) {
      STATE.wrapEl.querySelectorAll('.personal-recs-card').forEach(card => {
        card.dispatchEvent(new CustomEvent('jms:cleanup'));
      });
    }
    Object.keys(STATE).forEach(key => {
      if (key !== 'maxRenderCount') {
        STATE[key] = Array.isArray(STATE[key]) ? [] :
                    typeof STATE[key] === 'number' ? 0 :
                    typeof STATE[key] === 'boolean' ? false : null;
      }
    });
    STATE.sectionIOs = new Set();
    STATE.autoPumpScheduled = false;

  } catch (e) {
    console.warn('Director rows cleanup error:', e);
  }
}

function escapeHtml(s){
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
