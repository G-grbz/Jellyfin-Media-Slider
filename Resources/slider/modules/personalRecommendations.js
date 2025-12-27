import { getSessionInfo, makeApiRequest, getCachedUserTopGenres, playNow, withServer, withServerSrcset } from "./api.js";
import { getConfig } from "./config.js";
import { getLanguageLabels } from "../language/index.js";
import { attachMiniPosterHover } from "./studioHubsUtils.js";
import { openGenreExplorer, openPersonalExplorer } from "./genreExplorer.js";
import { REOPEN_COOLDOWN_MS, OPEN_HOVER_DELAY_MS } from "./hoverTrailerModal.js";
import { createTrailerIframe } from "./utils.js";

const config = getConfig();
const labels = getLanguageLabels?.() || {};
const IS_MOBILE = (navigator.maxTouchPoints > 0) || (window.innerWidth <= 820);
const PERSONAL_RECS_LIMIT = Number.isFinite(config.personalRecsCardCount)
  ? Math.max(1, config.personalRecsCardCount | 0)
  : 3;
const EFFECTIVE_CARD_COUNT = PERSONAL_RECS_LIMIT;
const MIN_RATING = Number.isFinite(config.studioHubsMinRating)
  ? Math.max(0, Number(config.studioHubsMinRating))
  : 0;
const PLACEHOLDER_URL = (config.placeholderImage) || './slider/src/images/placeholder.png';
const ENABLE_GENRE_HUBS = !!config.enableGenreHubs;
const GENRE_ROWS_COUNT = Number.isFinite(config.studioHubsGenreRowsCount)
  ? Math.max(1, config.studioHubsGenreRowsCount | 0)
  : 4;
const GENRE_ROW_CARD_COUNT = Number.isFinite(config.studioHubsGenreCardCount)
  ? Math.max(1, config.studioHubsGenreCardCount | 0)
  : 10;
const EFFECTIVE_GENRE_ROWS = Number.isFinite(config.studioHubsGenreRowsCount)
  ? GENRE_ROWS_COUNT
  : 50;
const EFFECTIVE_GENRE_ROW_CARD_COUNT = GENRE_ROW_CARD_COUNT;
const __hoverIntent = new WeakMap();
const __enterTimers = new WeakMap();
const __enterSeq     = new WeakMap();
const __cooldownUntil= new WeakMap();
const __openTokenMap = new WeakMap();
const __boundPreview = new WeakMap();
const GENRE_LAZY = true;
const GENRE_BATCH_SIZE = 1;
const GENRE_ROOT_MARGIN = '500px 0px';
const GENRE_FIRST_SCROLL_PX = Number(getConfig()?.genreRowsFirstBatchScrollPx) || 200;

const GENRE_STATE = {
  genres: [],
  sections: [],
  nextIndex: 0,
  loading: false,
  wrap: null,
  batchObserver: null,
  serverId: null,
  _loadMoreArrow: null,
};

let __genreScrollIdleTimer = null;
let __genreScrollIdleAttached = false;
let __genreArrowObserver = null;
let __genreScrollHandler = null;
let __personalRecsInitDone = false;

const __downScrollLock = {
  enabled: false,
  y: 0,
  touchStartY: null,
  installed: false,
};

export function lockDownScroll() {
  __downScrollLock.enabled = true;
  __downScrollLock.y = window.scrollY || 0;
}

export function unlockDownScroll() {
  __downScrollLock.enabled = false;
  __downScrollLock.touchStartY = null;
}

function setGenreArrowLoading(isLoading) {
  const arrow = GENRE_STATE._loadMoreArrow;
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

function __ensureDownScrollLockInstalled() {
  if (__downScrollLock.installed) return;
  __downScrollLock.installed = true;

  window.addEventListener('wheel', (e) => {
    if (!__downScrollLock.enabled) return;
    if (e.deltaY > 0) {
      e.preventDefault();
      if ((window.scrollY || 0) > __downScrollLock.y) {
        window.scrollTo(0, __downScrollLock.y);
      }
    }
  }, { passive: false });

  window.addEventListener('touchstart', (e) => {
    if (!__downScrollLock.enabled) return;
    const t = e.touches && e.touches[0];
    __downScrollLock.touchStartY = t ? t.clientY : null;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!__downScrollLock.enabled) return;
    const t = e.touches && e.touches[0];
    if (!t || __downScrollLock.touchStartY == null) return;

    const dy = t.clientY - __downScrollLock.touchStartY;
    if (dy < 0) {
      e.preventDefault();
      if ((window.scrollY || 0) > __downScrollLock.y) {
        window.scrollTo(0, __downScrollLock.y);
      }
    }
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (!__downScrollLock.enabled) return;
    const k = e.key;
    const downKeys = ['ArrowDown', 'PageDown', 'End', ' ', 'Spacebar'];
    if (downKeys.includes(k)) {
      e.preventDefault();
      if ((window.scrollY || 0) > __downScrollLock.y) {
        window.scrollTo(0, __downScrollLock.y);
      }
    }
  }, { passive: false });

  window.addEventListener('scroll', () => {
    if (!__downScrollLock.enabled) return;
    const y = window.scrollY || 0;
    if (y > __downScrollLock.y) window.scrollTo(0, __downScrollLock.y);
  }, { passive: true });
}
__ensureDownScrollLockInstalled();

function attachGenreScrollIdleLoader() {
  if (__genreScrollIdleAttached) return;
  __genreScrollIdleAttached = true;

  if (!GENRE_STATE.wrap || !GENRE_STATE.genres || !GENRE_STATE.genres.length) return;
  if (GENRE_STATE.nextIndex >= GENRE_STATE.genres.length) return;

  if (!GENRE_STATE._loadMoreArrow) {
    const arrow = document.createElement('button');
    arrow.className = 'genre-load-more-arrow';
    arrow.type = 'button';
    arrow.innerHTML = `<span class="material-icons">expand_more</span>`;
    arrow.setAttribute(
      'aria-label',
      (labels.loadMoreGenres ||
        config.languageLabels?.loadMoreGenres ||
        'Daha fazla tür göster')
    );

    GENRE_STATE.wrap.appendChild(arrow);
    GENRE_STATE._loadMoreArrow = arrow;

    arrow.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      loadNextGenreViaArrow();
    }, { passive: false });
  }

  if (__genreArrowObserver) {
    try { __genreArrowObserver.disconnect(); } catch {}
    __genreArrowObserver = null;
  }

  const onScroll = () => {
  if (!GENRE_STATE.wrap) return;

  const rect = GENRE_STATE.wrap.getBoundingClientRect();
  const viewportH = window.innerHeight || document.documentElement.clientHeight || 800;

  if (rect.bottom - viewportH <= GENRE_FIRST_SCROLL_PX) {
    if (__genreScrollIdleTimer) return;
    __genreScrollIdleTimer = setTimeout(() => {
      __genreScrollIdleTimer = null;

      if (GENRE_STATE.nextIndex >= GENRE_STATE.sections.length) {
        detachGenreScrollIdleLoader();
        return;
      }

      loadNextGenreViaArrow();

      if (GENRE_STATE.nextIndex >= GENRE_STATE.sections.length) {
        detachGenreScrollIdleLoader();
      }
    }, 220);
  }
};

  __genreScrollHandler = onScroll;
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  requestAnimationFrame(onScroll);
  setGenreArrowLoading(!!GENRE_STATE.loading);
}

function loadNextGenreViaArrow() {
  if (GENRE_STATE.loading) return;
  if (GENRE_STATE.nextIndex >= (GENRE_STATE.genres?.length || 0)) {
    detachGenreScrollIdleLoader();
    return;
  }

  GENRE_STATE.loading = true;
  setGenreArrowLoading(true);
  lockDownScroll();

  const start = GENRE_STATE.nextIndex;
  const end = Math.min(start + GENRE_BATCH_SIZE, GENRE_STATE.genres.length);

  const jobs = [];
  for (let i = start; i < end; i++) jobs.push(ensureGenreLoaded(i));
  GENRE_STATE.nextIndex = end;

  Promise.all(jobs).finally(() => {
    GENRE_STATE.loading = false;
    setGenreArrowLoading(false);
    unlockDownScroll();

    if (GENRE_STATE.nextIndex >= GENRE_STATE.genres.length) {
      detachGenreScrollIdleLoader();
    }
  });
}

function detachGenreScrollIdleLoader() {
  if (!__genreScrollIdleAttached) return;
  __genreScrollIdleAttached = false;

  if (__genreArrowObserver) {
    try { __genreArrowObserver.disconnect(); } catch {}
    __genreArrowObserver = null;
  }

  if (GENRE_STATE._loadMoreArrow && GENRE_STATE._loadMoreArrow.parentElement) {
    try { GENRE_STATE._loadMoreArrow.parentElement.removeChild(GENRE_STATE._loadMoreArrow); } catch {}
  }
  GENRE_STATE._loadMoreArrow = null;

  if (__genreScrollIdleTimer) {
    clearTimeout(__genreScrollIdleTimer);
    __genreScrollIdleTimer = null;
  }

  if (__genreScrollHandler) {
    try {
      window.removeEventListener('scroll', __genreScrollHandler);
      window.removeEventListener('resize', __genreScrollHandler);
    } catch {}
    __genreScrollHandler = null;
  }
}

function setPrimaryCtaText(cardEl, text) {
  const btn =
    cardEl.querySelector('.dir-row-hero-play') ||
    cardEl.querySelector('.preview-play-button') ||
    cardEl.querySelector('.cardImageContainer .play') ||
    null;

  if (btn) {
    if (btn.classList.contains('dir-row-hero-play')) {
      const icon = btn.querySelector('.material-icons');
      btn.innerHTML = `${icon ? icon.outerHTML : ''} ${escapeHtml(text)}`;
    } else {
      btn.textContent = text;
    }
  }

  try { cardEl.dataset.prcResume = (text === 'Sürdür') ? '1' : '0'; } catch {}
}

async function applyResumeLabelsToCards(cardEls, userId) {
  const ids = cardEls
    .map(el => el?.dataset?.itemId)
    .filter(Boolean);

  if (!ids.length) return;
  const url =
    `/Users/${encodeURIComponent(userId)}/Items?` +
    `Ids=${encodeURIComponent(ids.join(','))}&Fields=UserData`;

  let items = [];
  try {
    const r = await makeApiRequest(url);
    items = Array.isArray(r?.Items) ? r.Items : (Array.isArray(r) ? r : []);
  } catch {
    return;
  }

  const byId = new Map(items.map(it => [it.Id, it]));
  for (const el of cardEls) {
    const id = el?.dataset?.itemId;
    const it = byId.get(id);
    const pos = Number(it?.UserData?.PlaybackPositionTicks || 0);
    const isResume = pos > 0;
    setPrimaryCtaText(el, isResume ? (config.languageLabels?.devamet || 'Sürdür') : (config.languageLabels?.izle || 'Oynat'));
  }
}

let __personalRecsBusy = false;
let   __lastMoveTS   = 0;
let __pmLast = 0;
window.addEventListener('pointermove', () => {
  const now = Date.now();
  if (now - __pmLast > 80) { __pmLast = now; __lastMoveTS = now; }
}, {passive:true});
let __touchStickyOpen = false;
let __touchLastOpenTS = 0;
let __activeGenre = null;
let __currentGenreCtrl = null;
const __genreCache = new Map();
const __globalGenreHeroLoose = new Set();
const __globalGenreHeroStrict = new Set();
const TOUCH_STICKY_GRACE_MS = 1500;
const __imgIO = new IntersectionObserver((entries) => {
  for (const ent of entries) {
    const img = ent.target;
    const data = img.__data || {};
    if (ent.isIntersecting) {
      if (!img.__hiRequested) {
        img.__hiRequested = true;
        img.__phase = 'hi';
        if (data.hqSrcset) img.srcset = data.hqSrcset;
        if (data.hqSrc)    img.src    = data.hqSrc;
      }
    } else {
    }
  }
}, { rootMargin: '300px 0px' });

function makePRCKey(it) {
  const nm = String(it?.Name || "")
    .normalize?.('NFKD')
    .replace(/[^\p{Letter}\p{Number} ]+/gu, ' ')
    .replace(/\s+/g,' ')
    .trim()
    .toLowerCase();
  const yr = it?.ProductionYear
    ? String(it.ProductionYear)
    : (it?.PremiereDate ? String(new Date(it.PremiereDate).getUTCFullYear() || '') : '');
   const tp = it?.Type === "Series" ? "series" : "movie";
   return `${tp}::${nm}|${yr}`;
 }

function makePRCLooseKey(it) {
  const nm = String(it?.Name || "")
    .normalize?.('NFKD')
    .replace(/[^\p{Letter}\p{Number} ]+/gu, ' ')
    .replace(/\s+/g,' ')
    .trim()
    .toLowerCase();

  const tp = it?.Type === "Series" ? "series" : "movie";
  return `${tp}::${nm}`;
}

(function injectPerfCssOnce(){
  if (document.getElementById('prc-perf-css')) return;
  const st = document.createElement('style');
  st.id = 'prc-perf-css';
  st.textContent = `
    .personal-recs-row, .genre-row {
      content-visibility: auto;
      contain-intrinsic-size: 260px 1200px;
      contain: layout paint style;
    }
    .personal-recs-card { contain: paint; }
    @media (max-width: 820px) {
      .personal-recs-card .cardImage { aspect-ratio: 2/3; }
    }
    .personal-recs-card .prc-top-badges,
    .personal-recs-card .prc-overlay {
      will-change: transform;
      transform: translateZ(0);
      backface-visibility: hidden;
    }
  `;
  document.head.appendChild(st);
})();

function buildPosterUrlLQ(item) {
  return buildPosterUrl(item, 120, 25);
}

function buildPosterUrlHQ(item) {
  return buildPosterUrl(item, 540, 72);
}

function buildLogoUrl(item, width = 220, quality = 80) {
  if (!item) return null;

  const tag =
    (item.ImageTags && (item.ImageTags.Logo || item.ImageTags.logo || item.ImageTags.LogoImageTag)) ||
    item.LogoImageTag ||
    null;

  if (!tag) return null;

  const url = `/Items/${item.Id}/Images/Logo` +
         `?tag=${encodeURIComponent(tag)}` +
         `&maxWidth=${width}` +
         `&quality=${quality}` +
         `&EnableImageEnhancers=false`;
        return withServer(url);
    }

function buildBackdropUrl(item, width = "auto", quality = 90) {
  if (!item) return null;

  const tag =
    (Array.isArray(item.BackdropImageTags) && item.BackdropImageTags[0]) ||
    item.BackdropImageTag ||
    (item.ImageTags && item.ImageTags.Backdrop);

  if (!tag) return null;

  const url = `/Items/${item.Id}/Images/Backdrop` +
          `?tag=${encodeURIComponent(tag)}` +
          `&maxWidth=${width}` +
          `&quality=${quality}` +
          `&EnableImageEnhancers=false`;
  return withServer(url);
 }

function buildBackdropUrlHQ(item) {
  return buildBackdropUrl(item, 1920, 80);
}

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
  try {
    const matchBtn = modal.querySelector('.preview-match-button');
    if (matchBtn) {
      matchBtn.textContent = '';
      matchBtn.style.display = 'none';
    }
  } catch {}
  try {
    const btns = modal.querySelector('.preview-buttons');
    if (btns) {
      btns.style.opacity = '0';
      btns.style.pointerEvents = 'none';
    }
    const playBtn = modal.querySelector('.preview-play-button');
    if (playBtn) playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    const favBtn = modal.querySelector('.preview-favorite-button');
    if (favBtn) {
      favBtn.classList.remove('favorited');
      favBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
    }
    const volBtn = modal.querySelector('.preview-volume-button');
    if (volBtn) volBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
  } catch {}

  modal.classList.add('is-skeleton');
}

function currentIndexPage() {
  return document.querySelector("#indexPage:not(.hide)") || document.querySelector("#homePage:not(.hide)") || document.body;
}

function getHomeSectionsContainer(indexPage) {
  return (
    indexPage.querySelector(".homeSectionsContainer") ||
    document.querySelector(".homeSectionsContainer") ||
    indexPage
  );
}

function ensureIntoHomeSections(el, indexPage, { placeAfterId } = {}) {
  if (!el) return;
  const apply = () => {
    const container =
      (indexPage && indexPage.querySelector(".homeSectionsContainer")) ||
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

function insertAfter(parent, node, ref) {
  if (!parent || !node) return;
  if (ref && ref.parentElement === parent) {
    ref.insertAdjacentElement('afterend', node);
  } else {
    parent.appendChild(node);
  }
}

function enforceOrder(homeSectionsHint) {
  const cfg = getConfig();
  const studio = document.getElementById('studio-hubs');
  const recs  = document.getElementById('personal-recommendations');
  const genre = document.getElementById('genre-hubs');
  const parent = (studio && studio.parentElement) || homeSectionsHint || getHomeSectionsContainer(currentIndexPage());
  if (!parent) return;
  if (cfg.placePersonalRecsUnderStudioHubs && studio && recs) {
    insertAfter(parent, recs, studio);
  }
  if (cfg.placeGenreHubsUnderStudioHubs && studio && genre) {
  const recent = document.getElementById("recent-rows");
  const pr = document.getElementById("personal-recommendations");
  const parent = (studio && studio.parentElement) || homeSectionsHint || getHomeSectionsContainer(currentIndexPage());

  if (parent) {
    const wantUnderRecent = !!(recent && recent.parentElement === parent);
    const wantUnderPersonal = !wantUnderRecent && !!(cfg.enablePersonalRecommendations && pr && pr.parentElement === parent);

    if (wantUnderRecent) { insertAfter(parent, genre, recent); return; }
    if (wantUnderPersonal) { insertAfter(parent, genre, pr); return; }
    }
  }
}

function placeSection(sectionEl, homeSections, underStudio) {
  if (!sectionEl) return;
  const studio = document.getElementById('studio-hubs');
  const targetParent = (studio && studio.parentElement) || homeSections || getHomeSectionsContainer(currentIndexPage());
  const placeNow = () => {
    if (underStudio && studio && targetParent) {
      insertAfter(targetParent, sectionEl, studio);
    } else {
      (targetParent || document.body).appendChild(sectionEl);
    }
    enforceOrder(targetParent);
  };

  placeNow();
  try { ensureIntoHomeSections(sectionEl, currentIndexPage()); } catch {}
  if (underStudio && !studio) {
    let mo = null;
    let tries = 0;
    const maxTries = 50;
    const stop = () => { try { mo.disconnect(); } catch {} mo = null; };

    mo = new MutationObserver(() => {
      tries++;
      const s = document.getElementById('studio-hubs');
      if (s && s.parentElement) {
        const newParent = s.parentElement;
        insertAfter(newParent, sectionEl, s);
        enforceOrder(newParent);
        stop();
      } else if (tries >= maxTries) {
        stop();
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      const s = document.getElementById('studio-hubs');
      if (s && s.parentElement) {
        insertAfter(s.parentElement, sectionEl, s);
        enforceOrder(s.parentElement);
        stop();
      }
    }, 3000);
  }
}

function hydrateBlurUp(img, { lqSrc, hqSrc, hqSrcset, fallback }) {
  const fb = fallback || PLACEHOLDER_URL;

  img.__data = { lqSrc, hqSrc, hqSrcset, fallback: fb };
  img.__phase = 'lq';
  img.__hiRequested = false;

  try { img.removeAttribute('srcset'); } catch {}
  if (lqSrc) {
    if (img.src !== lqSrc) img.src = lqSrc;
  } else {
    img.src = fb;
  }
  img.classList.add('is-lqip');
  img.__hydrated = false;

  const onError = () => {
    if (img.__phase === 'hi') {
      try { img.removeAttribute('srcset'); } catch {}
      if (lqSrc) {
    if (img.src !== lqSrc) img.src = lqSrc;
  } else {
    img.src = fb;
  }
      img.classList.add('is-lqip');
      img.__phase = 'lq';
      img.__hiRequested = false;
    }
  };

  const onLoad = () => {
    if (img.__phase === 'hi') {
      img.classList.remove('is-lqip');
      img.__hydrated = true;
    }
  };

  img.__onErr = onError;
  img.__onLoad = onLoad;
  img.addEventListener('error', onError, { passive: true });
  img.addEventListener('load',  onLoad,  { passive: true });

  __imgIO.observe(img);
}

function unobserveImage(img) {
  try { __imgIO.unobserve(img); } catch {}
  try { img.removeEventListener('error', img.__onErr); } catch {}
  try { img.removeEventListener('load',  img.__onLoad); } catch {}
  delete img.__onErr;
  delete img.__onLoad;
  if (img) { img.removeAttribute('srcset'); }
}

(function ensureGlobalTouchOutsideCloser(){
  if (window.__jmsTouchCloserBound) return;
  window.__jmsTouchCloserBound = true;
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

window.addEventListener('jms:hoverTrailer:close', () => {
  __touchStickyOpen = false;
  __touchLastOpenTS = 0;
}, { passive: true });
window.addEventListener('jms:hoverTrailer:closed', () => {
  __touchStickyOpen = false;
  __touchLastOpenTS = 0;
}, { passive: true });

function clearEnterTimer(cardEl) {
  const t = __enterTimers.get(cardEl);
  if (t) { clearTimeout(t); __enterTimers.delete(cardEl); }
}

function isHoveringCardOrModal(cardEl) {
  try {
    const overCard  = cardEl?.isConnected && cardEl.matches(':hover');
    const overModal = !!document.querySelector('.video-preview-modal:hover');
    return !!(overCard || overModal);
  } catch { return false; }
}

function schedulePostOpenGuard(cardEl, token, delay=120) {
  setTimeout(() => {
    if (__openTokenMap.get(cardEl) !== token) return;
    if (!isHoveringCardOrModal(cardEl)) {
      try { safeCloseHoverModal(); } catch {}
    }
  }, delay);
}

function scheduleClosePollingGuard(cardEl, tries=6, interval=90) {
  let count = 0;
  const iid = setInterval(() => {
    count++;
    if (isHoveringCardOrModal(cardEl)) { clearInterval(iid); return; }
    if (Date.now() - __lastMoveTS > 80 || count >= tries) {
      try { safeCloseHoverModal(); } catch {}
      clearInterval(iid);
    }
  }, interval);
}

function pageReady() {
  try {
    const page = document.querySelector("#indexPage:not(.hide)") || document.querySelector("#homePage:not(.hide)");
    if (!page) return false;
    const hasSections = !!(page.querySelector(".homeSectionsContainer") || document.querySelector(".homeSectionsContainer"));
    return !!page && (hasSections || true);
  } catch { return false; }
}

let __recsRetryTimer = null;
function scheduleRecsRetry(ms = 600) {
  clearTimeout(__recsRetryTimer);
  __recsRetryTimer = setTimeout(() => {
    __recsRetryTimer = null;
    renderPersonalRecommendations();
  }, ms);
}

export async function renderPersonalRecommendations() {
  if (!config.enablePersonalRecommendations && !ENABLE_GENRE_HUBS) return;

  if (__personalRecsInitDone) {
  const personalOk = !!document.querySelector("#personal-recommendations .personal-recs-card:not(.skeleton)");
  const genreOk = !ENABLE_GENRE_HUBS || !!document.querySelector("#genre-hubs .genre-hub-section");
  if (personalOk && genreOk) {
    scheduleHomeScrollerRefresh(0);
    return;
  }
}
  __personalRecsInitDone = true;

  if (__personalRecsBusy) return;
  if (!pageReady()) {
    scheduleRecsRetry(700);
    return;
  }
  __personalRecsBusy = true;

  try {
    lockDownScroll();
    document.documentElement.dataset.jmsSoftBlock = "1";
    const indexPage =
      document.querySelector("#indexPage:not(.hide)") ||
      document.querySelector("#homePage:not(.hide)");
    if (!indexPage) return;
    if (config.enablePersonalRecommendations) {
      const section = ensurePersonalRecsContainer(indexPage);
      if (section) {
        const row = section.querySelector(".personal-recs-row");
        if (row) {
          if (!row.dataset.mounted || row.childElementCount === 0) {
            row.dataset.mounted = "1";
            renderSkeletonCards(row, EFFECTIVE_CARD_COUNT);
            setupScroller(row);
          }
        }

        try {
          const { userId, serverId } = getSessionInfo();
          const recommendations = await fetchPersonalRecommendations(
            userId,
            EFFECTIVE_CARD_COUNT,
            MIN_RATING
          );
          renderRecommendationCards(row, recommendations, serverId);
        } catch (e) {
          console.error("Kişisel öneriler alınırken hata:", e);
        }
      }
    }

    if (ENABLE_GENRE_HUBS) {
      try {
        await renderGenreHubs(indexPage);
      } catch (e) {
        console.error("Genre hubs render hatası:", e);
      }
    }

    try {
      const hsc = getHomeSectionsContainer(indexPage);
      enforceOrder(hsc);
    } catch {}

  } catch (error) {
    console.error("Kişisel öneriler / tür hub render hatası:", error);
  } finally {
    try { delete document.documentElement.dataset.jmsSoftBlock; } catch {}
    unlockDownScroll();
    __personalRecsBusy = false;
  }
}

function ensurePersonalRecsContainer(indexPage) {
  const homeSections = getHomeSectionsContainer(indexPage);
  let existing = document.getElementById("personal-recommendations");
  if (existing) {
    placeSection(existing, homeSections, !!getConfig().placePersonalRecsUnderStudioHubs);
    return existing;
  }
  const section = document.createElement("div");
  section.id = "personal-recommendations";
  section.classList.add("homeSection", "personal-recs-section");
  section.innerHTML = `
  <div class="sectionTitleContainer sectionTitleContainer-cards">
    <h2 class="sectionTitle sectionTitle-cards prc-title">
      <span class="prc-title-text" role="button" tabindex="0"
        aria-label="${(config.languageLabels?.seeAll || 'Tümünü gör')}: ${(config.languageLabels?.personalRecommendations) || labels.personalRecommendations || "Sana Özel Öneriler"}">
        ${(config.languageLabels?.personalRecommendations) || labels.personalRecommendations || "Sana Özel Öneriler"}
      </span>
      <div class="prc-see-all"
           aria-label="${(config.languageLabels?.seeAll) || "Tümünü gör"}"
           title="${(config.languageLabels?.seeAll) || "Tümünü gör"}">
        <span class="material-icons">keyboard_arrow_right</span>
      </div>
      <span class="prc-see-all-tip">${(config.languageLabels?.seeAll) || "Tümünü gör"}</span>
    </h2>
  </div>

  <div class="personal-recs-scroll-wrap">
    <button class="hub-scroll-btn hub-scroll-left" aria-label="${(config.languageLabels && config.languageLabels.scrollLeft) || "Sola kaydır"}" aria-disabled="true">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
    </button>
    <div class="itemsContainer personal-recs-row" role="list"></div>
    <button class="hub-scroll-btn hub-scroll-right" aria-label="${(config.languageLabels && config.languageLabels.scrollRight) || "Sağa kaydır"}" aria-disabled="true">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
    </button>
  </div>
`;

  const t = section.querySelector('.prc-title-text');
    if (t) {
      const open = (e) => { e.preventDefault(); e.stopPropagation(); openPersonalExplorer(); };
      t.addEventListener('click', open, { passive:false });
      t.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(e); });
    }
    const seeAll = section.querySelector('.prc-see-all');
    if (seeAll) {
      seeAll.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openPersonalExplorer(); }, { passive:false });
    }

      placeSection(section, homeSections, !!getConfig().placePersonalRecsUnderStudioHubs);
      return section;
    }

function renderSkeletonCards(row, count = 1) {
  row.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "card personal-recs-card skeleton";
    el.innerHTML = `
      <div class="cardBox">
        <div class="cardImageContainer">
          <div class="cardImage"></div>
          <div class="prc-gradient"></div>
          <div class="prc-overlay">
            <div class="prc-type-badge skeleton-line" style="width:40px;height:18px;border-radius:4px;"></div>
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
    row.appendChild(el);
  }
}

async function fetchPersonalRecommendations(userId, targetCount = EFFECTIVE_CARD_COUNT, minRating = 0) {
  const requested = Math.max(targetCount * 4, 80);
  const topGenres = await getCachedUserTopGenres(3).catch(()=>[]);
  let pool = [];

  if (topGenres && topGenres.length) {
    const byGenre = await fetchUnwatchedByGenres(userId, topGenres, requested, minRating).catch(()=>[]);
    pool = pool.concat(byGenre);
  }

  const fallback = await getFallbackRecommendations(userId, requested).catch(()=>[]);
  pool = pool.concat(fallback);

  const seen = new Set();
  const uniq = [];

  for (const item of pool) {
    if (!item || !item.Id) continue;

    const key = makePRCKey(item);
    if (!key || seen.has(key)) continue;

    const score = Number(item.CommunityRating);
    if (minRating > 0 && !(Number.isFinite(score) && score >= minRating)) continue;

    seen.add(key);
    uniq.push(item);

    if (uniq.length >= targetCount) break;
  }

  if (uniq.length < targetCount) {
    for (const item of pool) {
      if (!item || !item.Id) continue;

      const key = makePRCKey(item);
      if (!key || seen.has(key)) continue;

      seen.add(key);
      uniq.push(item);

      if (uniq.length >= targetCount) break;
    }
  }

  return uniq.slice(0, targetCount);
}

function dedupeStrong(items = []) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const k = makePRCKey(it);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

async function fetchUnwatchedByGenres(userId, genres, targetCount = 20, minRating = 0) {
  if (!genres || !genres.length) {
    const fb = await getFallbackRecommendations(userId, targetCount * 3);
    return filterAndTrimByRating(fb, minRating, targetCount);
  }

  const genresParam = encodeURIComponent(genres.join("|"));
  const fields = COMMON_FIELDS;
  const requested = Math.max(targetCount * 2, 20);
  const sort = "Random,CommunityRating,DateCreated";

  const url =
    `/Users/${userId}/Items?` +
    `IncludeItemTypes=Movie,Series&Recursive=true&Filters=IsUnplayed&` +
    `Genres=${genresParam}&Fields=${fields}&` +
    `SortBy=${sort}&SortOrder=Descending&Limit=${requested}`;

  try {
    const data = await makeApiRequest(url);
    const items = Array.isArray(data?.Items) ? data.Items : [];
    return filterAndTrimByRating(items, minRating, targetCount);
  } catch (err) {
    console.error("Türe göre içerik alınırken hata:", err);
    const fb = await getFallbackRecommendations(userId, requested);
    return filterAndTrimByRating(fb, minRating, targetCount);
  }
}

async function getFallbackRecommendations(userId, limit = 20) {
  const fields = COMMON_FIELDS;
  const url =
    `/Users/${userId}/Items?` +
    `IncludeItemTypes=Movie,Series&Recursive=true&Filters=IsUnplayed&` +
    `Fields=${fields}&` +
    `SortBy=Random,CommunityRating&SortOrder=Descending&Limit=${limit}`;

  try {
    const data = await makeApiRequest(url);
    return Array.isArray(data?.Items) ? data.Items : [];
  } catch (err) {
    console.error("Fallback öneriler alınırken hata:", err);
    return [];
  }
}

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

function filterAndTrimByRating(items, minRating, maxCount) {
  const seen = new Set();
  const out = [];
  for (const it of items || []) {
    if (!it || !it.Id) continue;
    if (seen.has(it.Id)) continue;
    seen.add(it.Id);
    const score = Number(it.CommunityRating);
    if (minRating > 0 && !(Number.isFinite(score) && score >= minRating)) continue;
    out.push(it);
    if (out.length >= maxCount) break;
  }
  return out;
}

function clearRowWithCleanup(row) {
  if (!row) return;
  try {
    row.querySelectorAll('.personal-recs-card').forEach(el => {
      el.dispatchEvent(new Event('jms:cleanup'));
    });
  } catch {}
  row.innerHTML = '';
}

function cleanupRow(row) {
  if (!row) return;
  try {
    row.querySelectorAll('.personal-recs-card').forEach(el => {
      el.dispatchEvent(new Event('jms:cleanup'));
    });
  } catch {}
  row.innerHTML = '';
}

function renderRecommendationCards(row, items, serverId) {
  clearRowWithCleanup(row);
  if (!items || !items.length) {
    row.innerHTML = `<div class="no-recommendations">${(config.languageLabels?.noRecommendations) || labels.noRecommendations || "Öneri bulunamadı"}</div>`;
    return;
  }

  const unique = items;
  const rIC = window.requestIdleCallback || ((fn)=>setTimeout(fn,0));
  const slice = unique;
  const aboveFoldCount = IS_MOBILE ? Math.min(4, slice.length) : Math.min(6, slice.length);
  const f1 = document.createDocumentFragment();
  const domSeen = new Set();

  for (let i = 0; i < aboveFoldCount; i++) {
    f1.appendChild(createRecommendationCard(slice[i], serverId, true));
  }

  for (let i = 0; i < f1.childNodes.length; i++) {
    domSeen.add(f1.childNodes[i]?.getAttribute?.('data-key') || f1.childNodes[i]?.dataset?.key);
  }

  row.appendChild(f1);

  try {
    const { userId } = getSessionInfo();
    const cardsNow = Array.from(row.querySelectorAll('.personal-recs-card'));
    applyResumeLabelsToCards(cardsNow.slice(0, aboveFoldCount), userId);
  } catch {}

  let idx = aboveFoldCount;
  function pump() {
    if (row.querySelectorAll('.personal-recs-card').length >= EFFECTIVE_CARD_COUNT) return;
    if (idx >= slice.length) return;
    const chunk = IS_MOBILE ? 2 : 10;
    const fx = document.createDocumentFragment();
    let added = 0;
    while (added < chunk && idx < slice.length) {
      const it = slice[idx++];
      const k = makePRCKey(it);
      if (!k || domSeen.has(k)) continue;
      domSeen.add(k);
      fx.appendChild(createRecommendationCard(it, serverId, false));
      added++;
      if (row.querySelectorAll('.personal-recs-card').length + added >= EFFECTIVE_CARD_COUNT) break;
    }
    if (added) row.appendChild(fx);
    if (added) {
      try {
        const { userId } = getSessionInfo();
        const justAdded = Array.from(row.querySelectorAll('.personal-recs-card')).slice(-added);
        applyResumeLabelsToCards(justAdded, userId);
      } catch {}
    }
    if (row.querySelectorAll('.personal-recs-card').length < EFFECTIVE_CARD_COUNT) {
      rIC(pump);
    }
  }
  rIC(pump);
}

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
  "Overview",
  "RemoteTrailers"
].join(",");

function buildPosterSrcSet(item) {
  const hs = [240, 360, 540, 720];
  const q  = 50;
  const ar = Number(item.PrimaryImageAspectRatio) || 0.6667;
  const raw = hs
    .map(h => `${buildPosterUrl(item, h, q)} ${Math.round(h * ar)}w`)
    .join(", ");
  return withServerSrcset(raw);
}

function clampText(s, max = 220) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? (t.slice(0, max - 1) + "…") : t;
}

function formatRuntime(ticks) {
  if (!ticks) return null;
  const minutes = Math.floor(ticks / 600000000);
  if (minutes < 60) return `${minutes}d`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}s ${remainingMinutes}d` : `${hours}s`;
}

function normalizeAgeChip(rating) {
  if (!rating) return null;
  const r = String(rating).toUpperCase().trim();
  if (/(18\+|R18|ADULT|NC-17|X-RATED|XXX|ADULTS ONLY|AO)/.test(r)) return "18+";
  if (/(17\+|R|TV-MA)/.test(r)) return "17+";
  if (/(16\+|R16|M|MATURE)/.test(r)) return "16+";
  if (/(15\+|TV-15)/.test(r)) return "15+";
  if (/(13\+|TV-14|PG-13|TEEN)/.test(r)) return "13+";
  if (/(12\+|TV-12)/.test(r)) return "12+";
  if (/(10\+|TV-Y10)/.test(r)) return "10+";
  if (/(7\+|TV-Y7|E10\+|E10)/.test(r)) return "7+";
  if (/(G|PG|TV-G|TV-PG|E|EVERYONE|U|UC|UNIVERSAL)/.test(r)) return "7+";
  if (/(ALL AGES|ALL|TV-Y|KIDS|Y)/.test(r)) return "0+";
  return r;
}

function getRuntimeWithIcons(runtime) {
  if (!runtime) return '';
  return runtime.replace(/(\d+)s/g, `$1${config.languageLabels?.sa || 'sa'}`)
  .replace(/(\d+)d/g, `$1${config.languageLabels?.dk || 'dk'}`);
}

function getDetailsUrl(itemId, serverId) {
  return `#/details?id=${itemId}&serverId=${encodeURIComponent(serverId)}`;
}

function buildPosterUrl(item, height = 540, quality = 72) {
  const tag = item.ImageTags?.Primary || item.PrimaryImageTag;
  if (!tag) return null;
  const url = `/Items/${item.Id}/Images/Primary?tag=${encodeURIComponent(tag)}&maxHeight=${height}&quality=${quality}&EnableImageEnhancers=false`;
  return withServer(url);
}

function createGenreHeroCard(item, serverId, genreName) {
  const hero = document.createElement('div');
  hero.className = 'dir-row-hero';
  hero.dataset.itemId = item.Id;

  const bg = buildBackdropUrlHQ(item) || buildPosterUrlHQ(item) || PLACEHOLDER_URL;
  const logo = buildLogoUrl(item);
  const year = item.ProductionYear || '';
  const plot = clampText(item.Overview, 240);
  const ageChip = normalizeAgeChip(item.OfficialRating || '');
  const isSeries = item.Type === 'Series';
  const typeLabel = isSeries
    ? ((config.languageLabels && config.languageLabels.dizi) || "Dizi")
    : ((config.languageLabels && config.languageLabels.film) || "Film");
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
          ${(config.languageLabels?.showTypeInfo || "genre")} ${escapeHtml(genreName || "")}
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

  hero.addEventListener('jms:cleanup', () => {
    detachPreviewHandlers(hero);
  }, { once: true });

  return hero;
}

function createRecommendationCard(item, serverId, aboveFold = false) {
  const card = document.createElement("div");
  card.className = "card personal-recs-card";
  card.dataset.itemId = item.Id;
  card.setAttribute('data-key', makePRCKey(item));

  const posterUrlHQ = buildPosterUrlHQ(item);
  const posterSetHQ = posterUrlHQ ? buildPosterSrcSet(item) : "";
  const posterUrlLQ = buildPosterUrlLQ(item);
  const year = item.ProductionYear || "";
  const ageChip = normalizeAgeChip(item.OfficialRating || "");
  const runtimeTicks = item.Type === "Series" ? item.CumulativeRunTimeTicks : item.RunTimeTicks;
  const runtime = formatRuntime(runtimeTicks);
  const genres = Array.isArray(item.Genres) ? item.Genres.slice(0, 3).join(", ") : "";
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
  const sizesMobile = '(max-width: 640px) 45vw, (max-width: 820px) 38vw, 220px';
  const sizesDesk   = '(max-width: 1200px) 22vw, 220px';
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
    noImg.style.minHeight = '220px';
    noImg.style.display = 'flex';
    noImg.style.alignItems = 'center';
    noImg.style.justifyContent = 'center';
    noImg.style.textAlign = 'center';
    noImg.style.padding = '12px';
    noImg.style.fontWeight = '600';
    card.querySelector('.cardImageContainer')?.prepend(noImg);
  }

  const mode = (getConfig()?.globalPreviewMode === 'studioMini') ? 'studioMini' : 'modal';
  const defer = window.requestIdleCallback || ((fn)=>setTimeout(fn, 0));
  defer(() => attachPreviewByMode(card, item, mode));
  card.addEventListener('jms:cleanup', () => {
    unobserveImage(img);
    detachPreviewHandlers(card);
  }, { once: true });
  return card;
}

function cleanupScroller(row) {
  const s = row && row.__scroller;
  if (!s) { try { row.dataset.scrollerMounted = "0"; } catch {} return; }

  try { s.mo?.disconnect?.(); } catch {}
  try { s.ro?.disconnect?.(); } catch {}

  try { row.removeEventListener("wheel", s.onWheel); } catch {}
  try { row.removeEventListener("scroll", s.onScroll); } catch {}
  try { row.removeEventListener("touchstart", s.onTs); } catch {}
  try { row.removeEventListener("touchmove", s.onTm); } catch {}
  try { row.removeEventListener("load", s.onLoadCapture, true); } catch {}

  try { s.btnL?.removeEventListener?.("click", s.onClickL); } catch {}
  try { s.btnR?.removeEventListener?.("click", s.onClickR); } catch {}

  try { delete row.__scroller; } catch { row.__scroller = null; }
  try { row.dataset.scrollerMounted = "0"; } catch {}
}

export function setupScroller(row) {
  if (row.dataset.scrollerMounted === "1") {
    const s = row.__scroller;
    const btnOk =
      !!(s && (s.btnL?.isConnected || s.btnR?.isConnected));
    if (btnOk) {
      requestAnimationFrame(() => row.dispatchEvent(new Event("scroll")));
      return;
    }
    try { cleanupScroller(row); } catch {}
  }

  row.dataset.scrollerMounted = "1";

  const wrap = row.closest(".personal-recs-scroll-wrap") || row.parentElement;
  const scope =
    row.closest(".dir-row-section, .recent-row-section, .genre-pane, .genre-hub-section, #personal-recommendations")
    || wrap
    || row.parentElement;

  const btnL = scope?.querySelector?.(".hub-scroll-left") || wrap?.querySelector?.(".hub-scroll-left");
  const btnR = scope?.querySelector?.(".hub-scroll-right") || wrap?.querySelector?.(".hub-scroll-right");

  const canScroll = () => row.scrollWidth > row.clientWidth + 2;
  const STEP_PCT = 1;
  const stepPx   = () => Math.max(320, Math.floor(row.clientWidth * STEP_PCT));

  let _rafToken = null;
  const updateButtonsNow = () => {
    const max = Math.max(0, row.scrollWidth - row.clientWidth);
    const atStart = !canScroll() || row.scrollLeft <= 1;
    const atEnd = !canScroll() || row.scrollLeft >= max - 1;
    if (btnL) btnL.setAttribute("aria-disabled", atStart ? "true" : "false");
    if (btnR) btnR.setAttribute("aria-disabled", atEnd ? "true" : "false");
  };
  const scheduleUpdate = () => {
    if (_rafToken) return;
    _rafToken = requestAnimationFrame(() => {
      _rafToken = null;
      updateButtonsNow();
    });
  };

  const mo = new MutationObserver(() => scheduleUpdate());
  mo.observe(row, { childList: true, subtree: true });

  const onLoadCapture = () => scheduleUpdate();
  row.addEventListener("load", onLoadCapture, true);

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
      if (p < 1) requestAnimationFrame(tick);
      else scheduleUpdate();
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

  const onClickL = (e) => { e.preventDefault(); e.stopPropagation(); doScroll(-1, e); };
  const onClickR = (e) => { e.preventDefault(); e.stopPropagation(); doScroll( 1, e); };
  if (btnL) btnL.addEventListener("click", onClickL);
  if (btnR) btnR.addEventListener("click", onClickR);

  const onWheel = (e) => {
    const horizontalIntent = Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey;
    if (!horizontalIntent) return;
    const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
    row.scrollLeft += delta;
    e.preventDefault();
    scheduleUpdate();
  };
  row.addEventListener("wheel", onWheel, { passive: false });

  const onTs = (e)=>e.stopPropagation();
  const onTm = (e)=>e.stopPropagation();
  row.addEventListener("touchstart", onTs, { passive: true });
  row.addEventListener("touchmove", onTm, { passive: true });

  const onScroll = () => scheduleUpdate();
  row.addEventListener("scroll", onScroll, { passive: true });

  const ro = new ResizeObserver(() => scheduleUpdate());
  ro.observe(row);
  row.__ro = ro;
  row.__scroller = { btnL, btnR, onClickL, onClickR, onWheel, onScroll, onTs, onTm, ro, mo, onLoadCapture };
  row.addEventListener("jms:cleanup", () => {
    try { cleanupScroller(row); } catch {}
  }, { once: true });

  requestAnimationFrame(() => updateButtonsNow());
  setTimeout(() => updateButtonsNow(), 400);
}

function getGenreHubsAnchor(parent) {
  if (!getConfig().placeGenreHubsUnderStudioHubs) return null;

  const recent = document.getElementById("recent-rows");
  if (recent && recent.parentElement === parent) return recent;

  const pr = document.getElementById("personal-recommendations");
  if (getConfig().enablePersonalRecommendations && pr && pr.parentElement === parent) return pr;

  return null;
}

async function renderGenreHubs(indexPage) {
  detachGenreScrollIdleLoader();
  const homeSections = getHomeSectionsContainer(indexPage);

  let wrap = document.getElementById("genre-hubs");
  if (wrap) {
    try { abortAllGenreFetches(); } catch {}
    try {
      wrap.querySelectorAll('.personal-recs-card,.genre-row').forEach(el => {
        el.dispatchEvent(new Event('jms:cleanup'));
      });
      wrap.querySelectorAll('.genre-row').forEach(r => {
        if (r.__ro) { try { r.__ro.disconnect(); } catch {} delete r.__ro; }
      });
    } catch {}
    wrap.innerHTML = '';
    __globalGenreHeroLoose.clear();
    __globalGenreHeroStrict.clear();
  } else {
    wrap = document.createElement("div");
    wrap.id = "genre-hubs";
    wrap.className = "homeSection genre-hubs-wrapper";
  }

  const parent = homeSections || getHomeSectionsContainer(indexPage) || document.body;

  const recent = document.getElementById("recent-rows");
  if (recent && recent.isConnected) {
    const p = recent.parentElement || parent;
    insertAfter(p, wrap, recent);
  } else {
    placeSection(wrap, homeSections, false);
  }

  try { ensureIntoHomeSections(wrap, indexPage); } catch {}
  enforceOrder(homeSections);

  const { userId, serverId } = getSessionInfo();
  const allGenres = await getCachedGenresWeekly(userId);
  if (!allGenres || !allGenres.length) return;

  const picked = pickOrderedFirstK(allGenres, EFFECTIVE_GENRE_ROWS);
  if (!picked.length) return;

  GENRE_STATE.wrap     = wrap;
  GENRE_STATE.genres   = picked;
  GENRE_STATE.sections = new Array(picked.length);
  GENRE_STATE.nextIndex = 0;
  GENRE_STATE.loading   = false;
  GENRE_STATE.serverId  = serverId;

  await ensureGenreLoaded(0);
  GENRE_STATE.nextIndex = 1;

  if (GENRE_STATE.nextIndex < GENRE_STATE.genres.length) {
    attachGenreScrollIdleLoader();
  }
}

function ensureGenreSectionElement(idx) {
  const genres = GENRE_STATE.genres || [];
  const wrap   = GENRE_STATE.wrap;
  const serverId = GENRE_STATE.serverId;

  if (!wrap || !genres[idx]) return null;

  let rec = GENRE_STATE.sections[idx];
  if (rec && rec.section && rec.row) return rec;

  const genre = genres[idx];

  const section = document.createElement("div");
  section.className = "homeSection genre-hub-section";
  section.innerHTML = `
    <div class="sectionTitleContainer sectionTitleContainer-cards">
      <h2 class="sectionTitle sectionTitle-cards gh-title">
        <span class="gh-title-text" role="button" tabindex="0"
          aria-label="${(config.languageLabels?.seeAll || 'Tümünü gör')}: ${escapeHtml(genre)}">
          ${escapeHtml(genre)}
        </span>
        <div class="gh-see-all" data-genre="${escapeHtml(genre)}"
             aria-label="${(config.languageLabels?.seeAll) || "Tümünü gör"}"
             title="${(config.languageLabels?.seeAll) || "Tümünü gör"}">
          <span class="material-icons">keyboard_arrow_right</span>
        </div>
        <span class="gh-see-all-tip">${(config.languageLabels?.seeAll) || "Tümünü gör"}</span>
      </h2>
    </div>
    <div class="personal-recs-scroll-wrap">
      <button class="hub-scroll-btn hub-scroll-left" aria-label="${(config.languageLabels && config.languageLabels.scrollLeft) || "Sola kaydır"}" aria-disabled="true">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
      </button>
      <div class="itemsContainer genre-row" role="list"></div>
      <button class="hub-scroll-btn hub-scroll-right" aria-label="${(config.languageLabels && config.languageLabels.scrollRight) || "Sağa kaydır"}" aria-disabled="true">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
      </button>
    </div>
  `;

  const scrollWrap = section.querySelector('.personal-recs-scroll-wrap');
  const heroHost = document.createElement('div');
  heroHost.className = 'dir-row-hero-host';
  section.insertBefore(heroHost, scrollWrap);
  const titleBtn  = section.querySelector('.gh-title-text');
  const seeAllBtn = section.querySelector('.gh-see-all');
  if (titleBtn) {
    const open = (e) => { e.preventDefault(); e.stopPropagation(); openGenreExplorer(genre); };
    titleBtn.addEventListener('click', open, { passive: false });
    titleBtn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(e); });
  }
  if (seeAllBtn) {
    seeAllBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openGenreExplorer(genre); }, { passive: false });
  }

  const row = section.querySelector(".genre-row");
  renderSkeletonCards(row, EFFECTIVE_GENRE_ROW_CARD_COUNT);

  const arrow = GENRE_STATE._loadMoreArrow;
  if (arrow && arrow.parentElement === wrap) {
    wrap.insertBefore(section, arrow);
  } else {
    wrap.appendChild(section);
  }

  rec = { genre, section, row, loaded: false, serverId, heroHost };
  GENRE_STATE.sections[idx] = rec;
  return rec;
}

async function ensureGenreLoaded(idx) {
  let rec = GENRE_STATE.sections[idx];
  if (!rec) {
    rec = ensureGenreSectionElement(idx);
  }
  if (!rec || rec.loaded) return;
  rec.loaded = true;

  const { genre, row, serverId, heroHost } = rec;
  const { userId } = getSessionInfo();
  try {
    const items = await fetchItemsBySingleGenre(userId, genre, GENRE_ROW_CARD_COUNT * 3, MIN_RATING);
    row.innerHTML = '';
    setupScroller(row);

    if (!items || !items.length) {
      row.innerHTML = `<div class="no-recommendations">${labels.noRecommendations || "Uygun içerik yok"}</div>`;
      if (heroHost) heroHost.innerHTML = "";
      triggerScrollerUpdate(row);
      return;
    }

    const pool = dedupeStrong(items).slice();
    shuffle(pool);

    let best = null;
    let bestIndex = -1;

    for (let i = 0; i < pool.length; i++) {
      const it = pool[i];
      const kLoose  = makePRCLooseKey(it);
      const kStrict = makePRCKey(it);

      if ((kLoose && __globalGenreHeroLoose.has(kLoose)) || (kStrict && __globalGenreHeroStrict.has(kStrict))) {
        continue;
      }

      best = it;
      bestIndex = i;

      if (kLoose)  __globalGenreHeroLoose.add(kLoose);
      if (kStrict) __globalGenreHeroStrict.add(kStrict);
      break;
    }

    if (!best && pool.length) {
      best = pool[0];
      bestIndex = 0;

      const kLoose  = makePRCLooseKey(best);
      const kStrict = makePRCKey(best);
      if (kLoose)  __globalGenreHeroLoose.add(kLoose);
      if (kStrict) __globalGenreHeroStrict.add(kStrict);
    }

    const remaining = (bestIndex >= 0)
      ? pool.filter((_, i) => i !== bestIndex)
      : pool.slice();

    if (heroHost) {
      heroHost.innerHTML = "";
      if (best) {
        const hero = createGenreHeroCard(best, serverId, genre);
        heroHost.appendChild(hero);

        try {
          const { userId } = getSessionInfo();
          applyResumeLabelsToCards([hero], userId);
        } catch {}

        try {
          const backdropImg = hero.querySelector('.dir-row-hero-bg');
          const RemoteTrailers =
            best.RemoteTrailers ||
            best.RemoteTrailerItems ||
            best.RemoteTrailerUrls ||
            [];

          createTrailerIframe({
            config,
            RemoteTrailers,
            slide: hero,
            backdropImg,
            itemId: best.Id,
            serverId,
            detailsUrl: getDetailsUrl(best.Id, serverId),
            detailsText: (config.languageLabels?.details || labels.details || "Ayrıntılar"),
          });
        } catch (err) {
          console.error("Hero için createTrailerIframe hata:", err);
        }
      }
    }

    if (!remaining.length) {
      row.innerHTML = `<div class="no-recommendations">${labels.noRecommendations || "Uygun içerik yok"}</div>`;
      triggerScrollerUpdate(row);
      return;
    }

    const unique = remaining.slice(0, GENRE_ROW_CARD_COUNT);
    const head = Math.min(unique.length, IS_MOBILE ? 4 : 6);
    const f1 = document.createDocumentFragment();
    for (let i = 0; i < head; i++) {
      f1.appendChild(createRecommendationCard(unique[i], serverId, i < 2));
    }
    row.appendChild(f1);
    triggerScrollerUpdate(row);

    let j = head;
    const rIC = window.requestIdleCallback || ((fn)=>setTimeout(fn,0));
    (function pump(){
      if (j >= unique.length) { triggerScrollerUpdate(row); return; }
      const chunk = IS_MOBILE ? 2 : 10;
      const f = document.createDocumentFragment();
      for (let k=0;k<chunk && j<unique.length;k++,j++) {
        f.appendChild(createRecommendationCard(unique[j], serverId, false));
      }
      row.appendChild(f);
      triggerScrollerUpdate(row);
      rIC(pump);
    })();
  } catch (err) {
    console.warn('Genre hub load failed:', genre, err);
    row.innerHTML = `<div class="no-recommendations">${labels.noRecommendations || "Uygun içerik yok"}</div>`;
    if (heroHost) heroHost.innerHTML = "";
    setupScroller(row);
    triggerScrollerUpdate(row);
  }
}

function triggerScrollerUpdate(row) {
  try { row.dispatchEvent(new Event('scroll')); } catch {}
  requestAnimationFrame(() => {
    try { row.dispatchEvent(new Event('scroll')); } catch {}
  });
  setTimeout(() => {
    try { row.dispatchEvent(new Event('scroll')); } catch {}
  }, 400);
}

async function fetchItemsBySingleGenre(userId, genre, limit = 30, minRating = 0) {
  const fields = COMMON_FIELDS;
  const g = encodeURIComponent(genre);
  const url =
    `/Users/${userId}/Items?` +
    `IncludeItemTypes=Movie,Series&Recursive=true&Filters=IsUnplayed&` +
    `Genres=${g}&Fields=${fields}&` +
    `SortBy=Random,CommunityRating,DateCreated&SortOrder=Descending&Limit=${Math.max(60, limit * 3)}`;

  const ctrl = new AbortController();
  __genreFetchCtrls.add(ctrl);
  try {
    const data = await makeApiRequest(url, { signal: ctrl.signal });
    const items = Array.isArray(data?.Items) ? data.Items : [];
    return filterAndTrimByRating(items, minRating, limit);
  } catch (e) {
    if (e?.name !== 'AbortError') console.error("fetchItemsBySingleGenre hata:", e);
    return [];
  } finally {
    __genreFetchCtrls.delete(ctrl);
  }
}

const __genreFetchCtrls = new Set();
function abortAllGenreFetches(){
  for (const c of __genreFetchCtrls) { try { c.abort(); } catch {} }
  __genreFetchCtrls.clear();
}

function pickOrderedFirstK(allGenres, k) {
  const order = Array.isArray(config.genreHubsOrder) && config.genreHubsOrder.length
    ? config.genreHubsOrder
    : allGenres;
  const setAvail = new Set(allGenres.map(g => String(g).toLowerCase()));
  const picked = [];
  for (const g of order) {
    if (!g) continue;
    if (setAvail.has(String(g).toLowerCase())) {
      picked.push(g);
      if (picked.length >= k) break;
    }
  }
  if (picked.length < k) {
    for (const g of allGenres) {
      if (picked.includes(g)) continue;
      picked.push(g);
      if (picked.length >= k) break;
    }
  }
  return picked;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function getCachedGenresWeekly(userId) {
  try {
    const list = await fetchAllGenres(userId);
    const genres = uniqueNormalizedGenres(list);
    return genres;
  } catch (e) {
    console.warn("Tür listesi alınamadı:", e);
    return [];
  }
}

async function fetchAllGenres(userId) {
  const url =
    `/Items/Filters?UserId=${encodeURIComponent(userId)}` +
    `&IncludeItemTypes=Movie,Series&Recursive=true`;

  const r = await makeApiRequest(url);
  const genres = Array.isArray(r?.Genres) ? r.Genres : [];
  return genres.map(g => String(g || "").trim()).filter(Boolean);
}

function uniqueNormalizedGenres(list) {
  const seen = new Set();
  const out = [];
  for (const g of list) {
    const k = g.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(g); }
  }
  return out;
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

const CACHE_ITEM_FIELDS = [
  "Id","Name","Type","ImageTags","PrimaryImageTag",
  "CommunityRating","OfficialRating","ProductionYear","RunTimeTicks","CumulativeRunTimeTicks",
  "Genres",
  "RemoteTrailers"
];

function toSlimItem(it){
  if (!it) return null;
  const slim = {};
  for (const k of CACHE_ITEM_FIELDS) slim[k] = it[k];
  if (!slim.Type) {
    if (it?.Type) {
      slim.Type = it.Type;
    } else if (it?.Series || it?.SeriesId || it?.SeriesName) {
      slim.Type = "Series";
    } else {
      slim.Type = "Movie";
    }
  }
  if (!slim.Name) {
    slim.Name = it?.SeriesName || it?.Name || "";
    if (!slim.ProductionYear && it?.PremiereDate) {
  const y = new Date(it.PremiereDate).getUTCFullYear();
  if (y) slim.ProductionYear = y;
}
  }
  return slim;
}
function toSlimList(list){ return (list||[]).map(toSlimItem).filter(Boolean); }

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
      if (!isTouch) schedulePostOpenGuard(cardEl, token, 240);
    }, OPEN_HOVER_DELAY_MS);

    __enterTimers.set(cardEl, timer);
  };

  const onLeave = (e) => {
    const isTouch = e?.pointerType === 'touch';
    __hoverIntent.set(cardEl, false);
    clearEnterTimer(cardEl);
    __enterSeq.set(cardEl, (__enterSeq.get(cardEl) || 0) + 1);
    if (isTouch && __touchStickyOpen) {
      if (Date.now() - __touchLastOpenTS <= TOUCH_STICKY_GRACE_MS) {
        return;
      } else {
        __touchStickyOpen = false;
      }
    }

    const rt = e?.relatedTarget || null;
    const goingToModal = !!(rt && (rt.closest ? rt.closest('.video-preview-modal') : null));
    if (goingToModal) return;

    try { safeCloseHoverModal(); } catch {}
    try { hardWipeHoverModalDom(); } catch {}
    __cooldownUntil.set(cardEl, Date.now() + REOPEN_COOLDOWN_MS);
    scheduleClosePollingGuard(cardEl, 6, 90);
  };
  cardEl.addEventListener('pointerenter', onEnter, { passive: true });
  cardEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') onEnter(e);
  }, { passive: true });

  cardEl.addEventListener('pointerleave', onLeave,  { passive: true });
  __boundPreview.set(cardEl, { mode: 'modal', onEnter, onLeave });
}


function detachPreviewHandlers(cardEl) {
  const rec = __boundPreview.get(cardEl);
  if (!rec) return;
  cardEl.removeEventListener('pointerenter', rec.onEnter);
  cardEl.removeEventListener('pointerleave', rec.onLeave);
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

window.addEventListener("jms:all-slides-ready", () => {
  if (!__personalRecsBusy) scheduleRecsRetry(0);
}, { once: true, passive: true });

window.addEventListener('jms:globalPreviewModeChanged', (ev) => {
  const mode = ev?.detail?.mode === 'studioMini' ? 'studioMini' : 'modal';
  document.querySelectorAll('.personal-recs-card').forEach(cardEl => {
    const itemId = cardEl?.dataset?.itemId;
    if (!itemId) return;
    const itemLike = {
   Id: itemId,
   Name: cardEl.querySelector('.cardImage')?.alt || ''
 };
    attachPreviewByMode(cardEl, itemLike, mode);
  });
}, { passive: true });

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function resetPersonalRecsAndGenreState() {
  try { detachGenreScrollIdleLoader(); } catch {}
  try { abortAllGenreFetches(); } catch {}

  __personalRecsInitDone = false;
  __personalRecsBusy = false;

  GENRE_STATE.genres = [];
  GENRE_STATE.sections = [];
  GENRE_STATE.nextIndex = 0;
  GENRE_STATE.loading = false;
  GENRE_STATE.wrap = null;
  GENRE_STATE.serverId = null;

  try { __globalGenreHeroLoose.clear(); } catch {}
  try { __globalGenreHeroStrict.clear(); } catch {}
  try { detachGenreScrollIdleLoader(); } catch {}
}

let __homeScrollerRefreshTimer = null;

function refreshHomeScrollers() {
  const page = currentIndexPage();
  if (!page) return;
  page.querySelectorAll(".personal-recs-row, .genre-row").forEach(row => {
    try { setupScroller(row); } catch {}
    try { triggerScrollerUpdate(row); } catch {}
  });
}

function scheduleHomeScrollerRefresh(ms = 120) {
  clearTimeout(__homeScrollerRefreshTimer);
  __homeScrollerRefreshTimer = setTimeout(() => {
    __homeScrollerRefreshTimer = null;
    refreshHomeScrollers();
  }, ms);
}

(function bindHomeScrollerRefreshOnce(){
  if (window.__jmsHomeScrollerRefreshBound) return;
  window.__jmsHomeScrollerRefreshBound = true;

  window.addEventListener("hashchange", () => scheduleHomeScrollerRefresh(180), { passive: true });
  window.addEventListener("pageshow",   () => scheduleHomeScrollerRefresh(0),   { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleHomeScrollerRefresh(0);
  });

  document.addEventListener("viewshow",  () => scheduleHomeScrollerRefresh(0));
  document.addEventListener("viewshown", () => scheduleHomeScrollerRefresh(0));
})();
