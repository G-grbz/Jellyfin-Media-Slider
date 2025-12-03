import { getSessionInfo, makeApiRequest, getCachedUserTopGenres } from "./api.js";
import { getConfig } from "./config.js";
import { getLanguageLabels } from "../language/index.js";
import { attachMiniPosterHover } from "./studioHubsUtils.js";
import { openGenreExplorer, openPersonalExplorer } from "./genreExplorer.js";
import { mountDirectorRowsLazy } from "./directorRows.js";
import { REOPEN_COOLDOWN_MS, OPEN_HOVER_DELAY_MS } from "./hoverTrailerModal.js";

const config = getConfig();
const labels = getLanguageLabels?.() || {};
const IS_MOBILE = (navigator.maxTouchPoints > 0) || (window.innerWidth <= 820);
const PERSONAL_RECS_LIMIT = Number.isFinite(config.personalRecsCardCount)
  ? Math.max(1, config.personalRecsCardCount | 0)
  : 3;
const EFFECTIVE_CARD_COUNT = IS_MOBILE
  ? Math.min(PERSONAL_RECS_LIMIT, 8)
  : PERSONAL_RECS_LIMIT;
const MIN_RATING = Number.isFinite(config.studioHubsMinRating)
  ? Math.max(0, Number(config.studioHubsMinRating))
  : 0;
const PLACEHOLDER_URL = (config.placeholderImage) || '/slider/src/images/placeholder.png';
const ENABLE_GENRE_HUBS = !!config.enableGenreHubs;
const GENRE_ROWS_COUNT = Number.isFinite(config.studioHubsGenreRowsCount)
  ? Math.max(1, config.studioHubsGenreRowsCount | 0)
  : 4;
const GENRE_ROW_CARD_COUNT = Number.isFinite(config.studioHubsGenreCardCount)
  ? Math.max(1, config.studioHubsGenreCardCount | 0)
  : 10;
const EFFECTIVE_GENRE_ROWS = IS_MOBILE ? Math.min(GENRE_ROWS_COUNT, 5) : GENRE_ROWS_COUNT;
const EFFECTIVE_GENRE_ROW_CARD_COUNT = IS_MOBILE ? Math.min(GENRE_ROW_CARD_COUNT, 10) : GENRE_ROW_CARD_COUNT;
const __hoverIntent = new WeakMap();
const __enterTimers = new WeakMap();
const __enterSeq     = new WeakMap();
const __cooldownUntil= new WeakMap();
const __openTokenMap = new WeakMap();
const __boundPreview = new WeakMap();
const GENRE_LAZY = true;
const GENRE_BATCH_SIZE = IS_MOBILE ? 1 : 2;
const GENRE_ROOT_MARGIN = '500px 0px';
const GENRE_FIRST_SCROLL_PX = Number(getConfig()?.genreRowsFirstBatchScrollPx) || 200;
const GENRE_STATE = {
  sections: [],
  nextIndex: 0,
  loading: false,
  wrap: null,
  batchObserver: null,
};

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
    const placeAbovePersonal = !!cfg.placeGenreHubsAbovePersonalRecs;
    let ref = studio;

    if (cfg.placePersonalRecsUnderStudioHubs && recs && recs.parentElement === parent) {
      ref = placeAbovePersonal ? studio : recs;
    }
    insertAfter(parent, genre, ref);
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
  if (__personalRecsBusy) return;
  if (!pageReady()) {
    scheduleRecsRetry(700);
    return;
  }
  __personalRecsBusy = true;

  try {
    document.documentElement.dataset.jmsSoftBlock = "1";
    const indexPage =
      document.querySelector("#indexPage:not(.hide)") ||
      document.querySelector("#homePage:not(.hide)");
    if (!indexPage) return;

    const jobs = [];

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
        jobs.push((async () => {
          const { userId, serverId } = getSessionInfo();
          const recommendations = await fetchPersonalRecommendations(userId, EFFECTIVE_CARD_COUNT, MIN_RATING);
          renderRecommendationCards(row, recommendations, serverId);
        })());
      }
    }

    if (ENABLE_GENRE_HUBS) {
      jobs.push(renderGenreHubs(indexPage));
    }

    try {
      const target = indexPage || document.body;
      const mo = new MutationObserver(() => {
        const hsc = indexPage.querySelector(".homeSectionsContainer") || document.querySelector(".homeSectionsContainer");
        if (hsc) {
          try {
            hsc.querySelectorAll('.itemsContainer').forEach(el => el.dispatchEvent(new Event('scroll')));
          } catch {}
          mo.disconnect();
        }
      });
      mo.observe(target, { childList: true, subtree: true });
      mountDirectorRowsLazy();
    } catch {}

    await Promise.allSettled(jobs);
    try { enforceOrder(getHomeSectionsContainer(indexPage)); } catch {}
  } catch (error) {
    console.error("Kişisel öneriler / tür hub render hatası:", error);
  } finally {
    try { delete document.documentElement.dataset.jmsSoftBlock; } catch {}
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

function renderSkeletonCards(row, count = 8) {
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

  let idx = aboveFoldCount;
  function pump() {
    if (row.querySelectorAll('.personal-recs-card').length >= EFFECTIVE_CARD_COUNT) return;
    if (idx >= slice.length) return;
    const chunk = IS_MOBILE ? 2 : 3;
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
  "CommunityRating",
  "Genres",
  "OfficialRating",
  "ProductionYear",
  "CumulativeRunTimeTicks",
  "RunTimeTicks",
].join(",");

function buildPosterSrcSet(item) {
  const hs = [240, 360, 540, 720];
  const q  = 50;
  const ar = Number(item.PrimaryImageAspectRatio) || 0.6667;
  return hs.map(h => `${buildPosterUrl(item, h, q)} ${Math.round(h * ar)}w`).join(", ");
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
  return `/Items/${item.Id}/Images/Primary?tag=${encodeURIComponent(tag)}&maxHeight=${height}&quality=${quality}&EnableImageEnhancers=false`;
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

function setupScroller(row) {
  if (row.dataset.scrollerMounted === "1") {
    requestAnimationFrame(() => row.dispatchEvent(new Event('scroll')));
    return;
  }
  row.dataset.scrollerMounted = "1";
  const section = row.closest(".genre-pane, .genre-hub-section, #personal-recommendations");
  if (!section) return;

  const btnL = section.querySelector(".hub-scroll-left");
  const btnR = section.querySelector(".hub-scroll-right");
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
      if (p < 1) {
        requestAnimationFrame(tick);
      } else {
        scheduleUpdate();
      }
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
  row.addEventListener('jms:cleanup', () => {
    try { row.removeEventListener("wheel", onWheel); } catch {}
    try { row.removeEventListener("scroll", onScroll); } catch {}
    try { row.removeEventListener("touchstart", onTs); } catch {}
    try { row.removeEventListener("touchmove", onTm); } catch {}
    try { ro.disconnect(); } catch {}
  }, { once:true });

  requestAnimationFrame(() => updateButtonsNow());
  setTimeout(() => updateButtonsNow(), 400);
}

async function renderGenreHubs(indexPage) {
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
  } else {
    wrap = document.createElement("div");
    wrap.id = "genre-hubs";
    wrap.className = "homeSection genre-hubs-wrapper";
  }

  placeSection(wrap, homeSections, !!getConfig().placeGenreHubsUnderStudioHubs);
  try { ensureIntoHomeSections(wrap, indexPage); } catch {}
  enforceOrder(homeSections);

  const { userId, serverId } = getSessionInfo();
  const allGenres = await getCachedGenresWeekly(userId);
  if (!allGenres || !allGenres.length) return;

  const picked = pickOrderedFirstK(allGenres, EFFECTIVE_GENRE_ROWS);
  if (!picked.length) return;

  GENRE_STATE.sections = [];
  GENRE_STATE.nextIndex = 0;
  GENRE_STATE.loading = false;
  GENRE_STATE.wrap = wrap;

  for (const genre of picked) {
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
    wrap.appendChild(section);

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
    GENRE_STATE.sections.push({ genre, section, row, loaded: false, serverId });
  }

  await waitForGenreFirstScrollGate(GENRE_FIRST_SCROLL_PX);

  if (!GENRE_LAZY) {
    for (let i=0;i<GENRE_STATE.sections.length;i++) await ensureGenreLoaded(i);
    return;
  }

  for (let i = 0; i < GENRE_STATE.sections.length; i++) {
    const { section } = GENRE_STATE.sections[i];
    const io = new IntersectionObserver((ents, obs) => {
      for (const ent of ents) {
        if (ent.isIntersecting) {
          obs.disconnect();
          ensureGenreLoaded(i);
          break;
        }
      }
    }, { rootMargin: GENRE_ROOT_MARGIN, threshold: 0.01 });
    io.observe(section);
  }

  setupGenreBatchSentinel();
 }

 function waitForGenreFirstScrollGate(px = 200) {
  const cur = (window.scrollY || document.documentElement.scrollTop || 0);
  if (cur > px) return Promise.resolve();
  return new Promise((resolve) => {
    const onScroll = () => {
      const y = (window.scrollY || document.documentElement.scrollTop || 0);
      if (y > px) {
        window.removeEventListener('scroll', onScroll, { passive: true });
        resolve();
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  });
}

async function ensureGenreLoaded(idx) {
  const rec = GENRE_STATE.sections[idx];
  if (!rec || rec.loaded) return;
  rec.loaded = true;

  const { genre, row, serverId } = rec;
  const { userId } = getSessionInfo();
  try {
    const items = await fetchItemsBySingleGenre(userId, genre, GENRE_ROW_CARD_COUNT * 3, MIN_RATING);
    row.innerHTML = '';
    setupScroller(row);
    if (!items || !items.length) {
      row.innerHTML = `<div class="no-recommendations">${labels.noRecommendations || "Uygun içerik yok"}</div>`;
      triggerScrollerUpdate(row);
      return;
    }
    const unique = items.slice(0, GENRE_ROW_CARD_COUNT);
    const head = Math.min(unique.length, IS_MOBILE ? 4 : 6);
    const f1 = document.createDocumentFragment();
    for (let i=0;i<head;i++) f1.appendChild(createRecommendationCard(unique[i], serverId, i<2));
    row.appendChild(f1);
    triggerScrollerUpdate(row);

    let j = head;
    const rIC = window.requestIdleCallback || ((fn)=>setTimeout(fn,0));
    (function pump(){
      if (j >= unique.length) { triggerScrollerUpdate(row); return; }
      const chunk = IS_MOBILE ? 2 : 3;
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

function setupGenreBatchSentinel() {
  let sentinel = document.getElementById('genre-hubs-batch-sentinel');
  if (!sentinel) {
    sentinel = document.createElement('div');
    sentinel.id = 'genre-hubs-batch-sentinel';
    sentinel.style.height = '1px';
    sentinel.style.margin = '8px 0 0 0';
    GENRE_STATE.wrap.appendChild(sentinel);
  }

  if (GENRE_STATE.batchObserver) GENRE_STATE.batchObserver.disconnect();

  GENRE_STATE.batchObserver = new IntersectionObserver(async (ents) => {
    for (const ent of ents) {
      if (!ent.isIntersecting) continue;
      let loaded = 0;
      while (GENRE_STATE.nextIndex < GENRE_STATE.sections.length && loaded < GENRE_BATCH_SIZE) {
        const i = GENRE_STATE.nextIndex++;
        await ensureGenreLoaded(i);
        loaded++;
      }
    }
  }, { rootMargin: '300px 0px', threshold: 0 });

  GENRE_STATE.batchObserver.observe(sentinel);
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
  "Genres"
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
