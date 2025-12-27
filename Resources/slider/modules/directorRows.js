import { getSessionInfo, makeApiRequest, getCachedUserTopGenres, playNow, withServer } from "./api.js";
import { getConfig } from "./config.js";
import { getLanguageLabels } from "../language/index.js";
import { attachMiniPosterHover } from "./studioHubsUtils.js";
import { openDirectorExplorer } from "./genreExplorer.js";
import { REOPEN_COOLDOWN_MS, OPEN_HOVER_DELAY_MS } from "./hoverTrailerModal.js";
import { createTrailerIframe } from "./utils.js";
import { setupScroller } from "./personalRecommendations.js";

const config = getConfig();
const labels = getLanguageLabels?.() || {};
const IS_MOBILE = (navigator.maxTouchPoints > 0) || (window.innerWidth <= 820);

const PLACEHOLDER_URL = (config.placeholderImage) || '../slider/src/images/placeholder.png';
const ROWS_COUNT = Number.isFinite(config.directorRowsCount) ? Math.max(1, config.directorRowsCount|0) : 5;
const ROW_CARD_COUNT = Number.isFinite(config.directorRowCardCount) ? Math.max(1, config.directorRowCardCount|0) : 10;
const EFFECTIVE_ROW_CARD_COUNT = ROW_CARD_COUNT;
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

let __dirScrollIdleTimer = null;
let __dirScrollIdleAttached = false;
let __dirArrowObserver = null;

const __dirDownScrollLock = {
  enabled: false,
  y: 0,
  touchStartY: null,
  installed: false,
};

function dirLockDownScroll() {
  __dirDownScrollLock.enabled = true;
  __dirDownScrollLock.y = window.scrollY || 0;
}

function dirUnlockDownScroll() {
  __dirDownScrollLock.enabled = false;
  __dirDownScrollLock.touchStartY = null;
}

function __ensureDirDownScrollLockInstalled() {
  if (__dirDownScrollLock.installed) return;
  __dirDownScrollLock.installed = true;

  window.addEventListener('wheel', (e) => {
    if (!__dirDownScrollLock.enabled) return;
    if (e.deltaY > 0) {
      e.preventDefault();
      if ((window.scrollY || 0) > __dirDownScrollLock.y) {
        window.scrollTo(0, __dirDownScrollLock.y);
      }
    }
  }, { passive: false });

  window.addEventListener('touchstart', (e) => {
    if (!__dirDownScrollLock.enabled) return;
    const t = e.touches && e.touches[0];
    __dirDownScrollLock.touchStartY = t ? t.clientY : null;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!__dirDownScrollLock.enabled) return;
    const t = e.touches && e.touches[0];
    if (!t || __dirDownScrollLock.touchStartY == null) return;

    const dy = t.clientY - __dirDownScrollLock.touchStartY;
    if (dy < 0) {
      e.preventDefault();
      if ((window.scrollY || 0) > __dirDownScrollLock.y) {
        window.scrollTo(0, __dirDownScrollLock.y);
      }
    }
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (!__dirDownScrollLock.enabled) return;
    const downKeys = ['ArrowDown', 'PageDown', 'End', ' ', 'Spacebar'];
    if (downKeys.includes(e.key)) {
      e.preventDefault();
      if ((window.scrollY || 0) > __dirDownScrollLock.y) {
        window.scrollTo(0, __dirDownScrollLock.y);
      }
    }
  }, { passive: false });

  window.addEventListener('scroll', () => {
    if (!__dirDownScrollLock.enabled) return;
    const y = window.scrollY || 0;
    if (y > __dirDownScrollLock.y) window.scrollTo(0, __dirDownScrollLock.y);
  }, { passive: true });
}

__ensureDirDownScrollLockInstalled();

function setDirectorArrowLoading(isLoading) {
  const arrow = STATE._loadMoreArrow;
  if (!arrow) return;

  if (isLoading) {
    arrow.classList.add('is-loading');
    arrow.disabled = true;
    arrow.innerHTML = `<span class="gh-spinner" aria-hidden="true"></span>`;
    arrow.setAttribute('aria-busy', 'true');
  } else {
    arrow.classList.remove('is-loading');
    arrow.disabled = false;
    arrow.innerHTML = `<span class="material-icons">expand_more</span>`;
    arrow.removeAttribute('aria-busy');
  }
}

function attachDirectorScrollIdleLoader() {
  if (__dirScrollIdleAttached) return;
  __dirScrollIdleAttached = true;

  if (!STATE.wrapEl) return;
  if (!STATE._loadMoreArrow) {
    const arrow = document.createElement('button');
    arrow.className = 'dir-load-more-arrow';
    arrow.type = 'button';
    arrow.innerHTML = `<span class="material-icons">expand_more</span>`;
    arrow.setAttribute(
      'aria-label',
      (labels.loadMoreDirectors ||
        config.languageLabels?.loadMoreDirectors ||
        'Daha fazla yönetmen göster')
    );

    STATE.wrapEl.appendChild(arrow);
    STATE._loadMoreArrow = arrow;

    arrow.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (
        !STATE.loading &&
        STATE.nextIndex < STATE.directors.length &&
        STATE.renderedCount < STATE.maxRenderCount
      ) {
        renderNextDirectorBatch(false);
      }
    }, { passive: false });
  }

  if (__dirArrowObserver) {
    try { __dirArrowObserver.disconnect(); } catch {}
  }

  __dirArrowObserver = new IntersectionObserver((entries) => {
  for (const ent of entries) {
    if (!ent.isIntersecting) continue;
    if (STATE.loading) continue;
    if (STATE.nextIndex >= STATE.directors.length || STATE.renderedCount >= STATE.maxRenderCount) {
      detachDirectorScrollIdleLoader();
      return;
    }
    renderNextDirectorBatch(false);
    break;
  }
}, {
  root: null,
  rootMargin: '0px 0px 0px 0px',
  threshold: 0.6,
});

  if (STATE._loadMoreArrow) {
    __dirArrowObserver.observe(STATE._loadMoreArrow);
  }
}

function detachDirectorScrollIdleLoader() {
  if (!__dirScrollIdleAttached) return;
  __dirScrollIdleAttached = false;

  if (__dirArrowObserver) {
    try {
      if (STATE._loadMoreArrow) {
        __dirArrowObserver.unobserve(STATE._loadMoreArrow);
      }
      __dirArrowObserver.disconnect();
    } catch {}
    __dirArrowObserver = null;
  }

  if (STATE._loadMoreArrow && STATE._loadMoreArrow.parentElement) {
    try { STATE._loadMoreArrow.parentElement.removeChild(STATE._loadMoreArrow); } catch {}
  }
  STATE._loadMoreArrow = null;

  if (__dirScrollIdleTimer) {
    clearTimeout(__dirScrollIdleTimer);
    __dirScrollIdleTimer = null;
  }
}

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
  "Type",
  "PrimaryImageAspectRatio",
  "ImageTags",
  "BackdropImageTags",
  "CommunityRating",
  "Genres",
  "OfficialRating",
  "ProductionYear",
  "CumulativeRunTimeTicks",
  "RunTimeTicks",
  "People",
  "Overview",
  "RemoteTrailers"
].join(",");

function pickBestItemByRating(items) {
  if (!items || !items.length) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const it of items) {
    if (!it) continue;
    const score = Number(it.CommunityRating);
    const s = Number.isFinite(score) ? score : 0;
    if (!best || s > bestScore) {
      bestScore = s;
      best = it;
    }
  }
  return best || items[0] || null;
}

function buildPosterUrl(item, height = 540, quality = 72) {
  const tag = item?.ImageTags?.Primary || item?.PrimaryImageTag;
  if (!tag) return null;
  return withServer(`/Items/${item.Id}/Images/Primary?tag=${encodeURIComponent(tag)}&maxHeight=${height}&quality=${quality}&EnableImageEnhancers=false`);
}
function buildPosterUrlHQ(item){ return buildPosterUrl(item, 540, 72); }

function buildPosterUrlLQ(item){ return buildPosterUrl(item, 80, 20); }

function buildLogoUrl(item, width = 220, quality = 80) {
  if (!item) return null;

  const tag =
    (item.ImageTags && (item.ImageTags.Logo || item.ImageTags.logo || item.ImageTags.LogoImageTag)) ||
    item.LogoImageTag ||
    null;

  if (!tag) return null;

  return withServer(`/Items/${item.Id}/Images/Logo` +
         `?tag=${encodeURIComponent(tag)}` +
         `&maxWidth=${width}` +
         `&quality=${quality}` +
         `&EnableImageEnhancers=false`);
}

function buildBackdropUrl(item, width = 1920, quality = 80) {
  if (!item) return null;

  const tag =
    (Array.isArray(item.BackdropImageTags) && item.BackdropImageTags[0]) ||
    item.BackdropImageTag ||
    (item.ImageTags && item.ImageTags.Backdrop);

  if (!tag) return null;

  return withServer(`/Items/${item.Id}/Images/Backdrop` +
         `?tag=${encodeURIComponent(tag)}` +
         `&maxWidth=${width}` +
         `&quality=${quality}` +
         `&EnableImageEnhancers=false`);
}

function buildBackdropUrlHQ(item) {
  return buildBackdropUrl(item, 1920, 80);
}

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

function createDirectorHeroCard(item, serverId, directorName) {
  const hero = document.createElement('div');
  hero.className = 'dir-row-hero';
  hero.dataset.itemId = item.Id;

  const bg   = buildBackdropUrlHQ(item) || buildPosterUrlHQ(item) || PLACEHOLDER_URL;
  const logo = buildLogoUrl(item);
  const year = item.ProductionYear || '';
  const plot = clampText(item.Overview, 240);
  const ageChip = normalizeAgeChip(item.OfficialRating || '');
  const genres = Array.isArray(item.Genres) ? item.Genres.slice(0, 3).join(", ") : "";

  const metaParts = [];
  if (ageChip) metaParts.push(ageChip);
  if (year) metaParts.push(year);
  if (genres) metaParts.push(genres);
  const meta = metaParts.join(" • ");

  hero.innerHTML = `
    <div class="dir-row-hero-bg-wrap">
      <img class="dir-row-hero-bg" src="${bg}" alt="${escapeHtml(item.Name)}">
    </div>

    <div class="dir-row-hero-inner">
      <div class="dir-row-hero-meta-container">

      <div class="dir-row-hero-label">
          ${(config.languageLabels?.yonetmen || "yönetmen")} ${escapeHtml(directorName || "")}
        </div>

        ${logo ? `
          <div class="dir-row-hero-logo">
            <img src="${logo}" alt="${escapeHtml(item.Name)} logo">
          </div>
        ` : ``}

        <div class="dir-row-hero-title">${escapeHtml(item.Name)}</div>

        ${meta ? `<div class="dir-row-hero-meta">${escapeHtml(meta)}</div>` : ""}

        ${plot ? `<div class="dir-row-hero-plot">${escapeHtml(plot)}</div>` : ""}

        <div class="dir-row-hero-actions">
        <button type="button" class="dir-row-hero-details">
          ${(config.languageLabels?.details || "Ayrıntılar")}
        </button>
      </div>
    </div>
  `;

  const goDetails = () => {
    try {
      window.location.hash = getDetailsUrl(item.Id, serverId);
    } catch {
      window.location.href = getDetailsUrl(item.Id, serverId);
    }
  };

  hero.addEventListener('click', () => {
    goDetails();
  });

  const detailsBtn = hero.querySelector('.dir-row-hero-details');

  if (detailsBtn) {
    detailsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      goDetails();
    });
  }

  hero.classList.add('active');

  try {
    const backdropImg = hero.querySelector('.dir-row-hero-bg');
    const heroInner = hero.querySelector('.dir-row-hero-inner');
    const RemoteTrailers =
      item.RemoteTrailers ||
      item.RemoteTrailerItems ||
      item.RemoteTrailerUrls ||
      [];

    createTrailerIframe({
      config,
      RemoteTrailers,
      slide: hero,
      backdropImg,
      extraHoverTargets: [heroInner],
      itemId: item.Id,
      serverId,
      detailsUrl: getDetailsUrl(item.Id, serverId),
      detailsText: (config.languageLabels?.details || labels.details || "Ayrıntılar"),
    });
  } catch (err) {
    console.error("Director hero için createTrailerIframe hata:", err);
  }

  hero.addEventListener('jms:cleanup', () => {
    detachPreviewHandlers(hero);
  }, { once: true });

  return hero;
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
    `Filters=IsUnplayed&` +
    `PersonIds=${encodeURIComponent(directorId)}&` +
    `SortBy=Random,CommunityRating,DateCreated&SortOrder=Descending&Limit=${Math.max(ROWS_COUNT, limit)}`;
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
    try { pinDirectorRowsToBottom(wrap); } catch {}

  const start = () => {
    try { initAndRenderFirstBatch(wrap); } catch (e) { console.error(e); }
  };

  if (document.readyState === 'complete') {
    setTimeout(start, 0);
  } else {
    window.addEventListener('load', () => setTimeout(start, 0), { once: true });
  }
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
      try { pinDirectorRowsToBottom(el); } catch {}
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

function pinDirectorRowsToBottom(wrap) {
  if (!wrap) return;

  const moveToBottom = () => {
    const container = getHomeSectionsContainer();
    if (!container) return;
    if (wrap.parentElement !== container) {
      container.appendChild(wrap);
      return;
    }
    if (container.lastElementChild !== wrap) {
      container.appendChild(wrap);
    }
  };

  moveToBottom();

  if (wrap.__pinMO) return;
  const mo = new MutationObserver(() => moveToBottom());
  wrap.__pinMO = mo;

  mo.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('hashchange', moveToBottom, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) moveToBottom();
  }, { passive: true });
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

  console.log(`DirectorRows: ${STATE.directors.length} uygun yönetmen bulundu (>=${MIN_CONTENTS} içerik), ilk row hemen render ediliyor...`);

  const originalBatchSize = STATE.batchSize;
  STATE.batchSize = 1;
  await renderNextDirectorBatch(true);
  STATE.batchSize = originalBatchSize;

  attachDirectorScrollIdleLoader();
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
  setDirectorArrowLoading(true);
  dirLockDownScroll();

  const end = Math.min(STATE.nextIndex + STATE.batchSize, STATE.directors.length);
  const slice = STATE.directors.slice(STATE.nextIndex, end);

  console.log(`Render batch: ${STATE.nextIndex}-${end} (${slice.length} yönetmen)`);

  const prevCount = STATE.renderedCount;

  for (let idx = 0; idx < slice.length; idx++) {
    if (STATE.renderedCount >= STATE.maxRenderCount) break;

    const dir = slice[idx];
    await renderDirectorSection(dir, immediateLoadForThisBatch);
    STATE.renderedCount++;
  }

  if (!window.__directorFirstRowReady && prevCount === 0 && STATE.renderedCount > 0) {
    window.__directorFirstRowReady = true;
    try {
      document.dispatchEvent(new Event("jms:director-first-ready"));
    } catch {}
  }

  STATE.nextIndex = end;
  STATE.loading = false;
  setDirectorArrowLoading(false);
  dirUnlockDownScroll();

  if (STATE.nextIndex >= STATE.directors.length || STATE.renderedCount >= STATE.maxRenderCount) {
    console.log('Tüm yönetmen rowları yüklendi.');
    if (STATE.batchObserver) {
      STATE.batchObserver.disconnect();
      STATE.batchObserver = null;
    }
    detachDirectorScrollIdleLoader();
  }

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

  const heroHost = document.createElement('div');
  heroHost.className = 'dir-row-hero-host';

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
  section.appendChild(heroHost);
  section.appendChild(scrollWrap);

  if (STATE._loadMoreArrow && STATE._loadMoreArrow.parentElement === STATE.wrapEl) {
    STATE.wrapEl.insertBefore(section, STATE._loadMoreArrow);
  } else {
    STATE.wrapEl.appendChild(section);
  }
  renderSkeletonRow(row, EFFECTIVE_ROW_CARD_COUNT);
  fillRowWhenReady(row, dir, heroHost);
}

function fillRowWhenReady(row, dir, heroHost){
  (async () => {
    try {
      const items = await fetchItemsByDirector(STATE.userId, dir.Id, EFFECTIVE_ROW_CARD_COUNT * 2);

      if (!items?.length) {
        row.innerHTML = `<div class="no-recommendations">${(config.languageLabels?.noRecommendations) || (labels.noRecommendations || "Uygun içerik yok")}</div>`;
        if (heroHost) heroHost.innerHTML = "";
        setupScroller(row);
        return;
      }

      const pool = items.slice();
      shuffle(pool);

      const best = pool[0] || null;
      const remaining = best ? pool.slice(1) : pool.slice();

      if (heroHost && best) {
        heroHost.innerHTML = "";
        heroHost.appendChild(createDirectorHeroCard(best, STATE.serverId, dir.Name));
      }

      row.innerHTML = "";

      if (!remaining?.length) {
        row.innerHTML = `<div class="no-recommendations">${(config.languageLabels?.noRecommendations) || (labels.noRecommendations || "Uygun içerik yok")}</div>`;
        setupScroller(row);
      } else {
        const initialCount = IS_MOBILE ? 3 : 4;
        const fragment = document.createDocumentFragment();

        for (let i = 0; i < Math.min(initialCount, remaining.length); i++) {
          fragment.appendChild(createRecommendationCard(remaining[i], STATE.serverId, i < 2));
        }
        row.appendChild(fragment);

        let currentIndex = initialCount;

        const pumpMore = () => {
          if (currentIndex >= remaining.length || row.childElementCount >= EFFECTIVE_ROW_CARD_COUNT) {
            setupScroller(row);
            return;
          }

          const chunkSize = IS_MOBILE ? 1 : 2;
          const fragment = document.createDocumentFragment();

          for (let i = 0; i < chunkSize && currentIndex < remaining.length; i++) {
            if (row.childElementCount >= EFFECTIVE_ROW_CARD_COUNT) break;
            fragment.appendChild(createRecommendationCard(remaining[currentIndex], STATE.serverId, false));
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
    detachDirectorScrollIdleLoader();
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

function clampText(s, max = 220) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? (t.slice(0, max - 1) + "…") : t;
}

function escapeHtml(s){
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
