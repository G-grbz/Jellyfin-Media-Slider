import { makeApiRequest, updateFavoriteStatus, getSessionInfo, fetchItemDetails } from "./api.js";
import { getConfig } from "./config.js";
import { getVideoQualityText } from "./containerUtils.js";
import { tryOpenTrailerPopover, hideTrailerPopover } from "./studioTrailerPopover.js";

const config = getConfig();
const DETAILS_TTL = 60 * 60 * 1000;
const detailsCache = new Map();
const DETAILS_LRU_MAX = 300;
let __miniPop = null;
let __miniCloseTimer = null;
let __cssLoaded = false;
let __miniOpenSeq = 0;
let __miniNavSeq  = 0;
let __miniTombstoneUntil = 0;
const __miniTimers = new Set();
const __abortByCard = new WeakMap();

function isAudioItem(it) {
  const t = (it?.Type || it?.MediaType || '').toLowerCase();
  return ['audio', 'musictrack', 'musicalbum', 'audiobook', 'playlist'].includes(t);
}

function allowTrailerPopover() {
  const cfg = getConfig();
  const localOk  = !!cfg?.studioHubsHoverVideo;
  const globalOk = (cfg?.globalPreviewMode === 'studioMini') && !!cfg?.studioMiniTrailerPopover;
  return localOk || globalOk;
}

function ensureCss() {
  if (__cssLoaded) return;
  const link = document.createElement("link");
  link.id = "studioHubsMiniCss";
  link.rel = "stylesheet";
  link.href = "/slider/src/studioHubsMini.css";
  (document.head || document.documentElement).appendChild(link);
  __cssLoaded = true;
}

function isMobileLike() {
  return (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches)
    || (typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent))
    || (window.innerWidth <= 768);
}

 function ensureMiniPopover() {
   if (__miniPop) return __miniPop;

   const el = document.createElement("div");
   el.className = "mini-poster-popover";
   el.innerHTML = `
     <div class="mini-bg" aria-hidden="true"></div>
     <div class="mini-overlay">
     <button class="mini-close" type="button" aria-label="Kapat" title="Kapat">✕</button>
     <div class="mini-title"></div>
      <div class="mini-meta">
        <div class="mini-topline">
          <div class="mini-left">
            <span class="mini-year">📅 <b class="v"></b></span>
            <span class="mini-dot" aria-hidden="true">•</span>
            <span class="mini-runtime">⏱️ <b class="v"></b></span>
             <span class="mini-quality-inline"></span>
          </div>
        </div>
        <div class="mini-ratings">
          <span class="mini-star" title="Community">⭐ <b class="v"></b></span>
          <span class="mini-tomato" title="Critic">🍅 <b class="v"></b></span>
          <span class="mini-age" title="Age"></span>
        </div>
        <div class="mini-tags"></div>
        <div class="mini-audio"></div>
      </div>
       <p class="mini-overview"></p>
     </div>
   `;
  const host = window.__studioHubPreviewContainer || document.body;
  host.appendChild(el);

   __miniPop = el;
   const closeBtn = __miniPop.querySelector('.mini-close');
   closeBtn?.addEventListener('click', (e) => {
     e.preventDefault();
     try { hideMiniPopover(); } catch {}
     try { hideTrailerPopover(0); } catch {}
   }, { passive: false });
   return el;
 }

 function destroyMiniPopover() {
  if (!__miniPop) return;
  try { hideTrailerPopover(0); } catch {}
  try {
    window.dispatchEvent(new Event("studiohubs:miniDestroyed"));
  } catch {}
  try { __miniPop.remove(); } catch {}
  __miniPop = null;
}

function scheduleHideMini(delay = 140) {
  if (__miniCloseTimer) clearTimeout(__miniCloseTimer);
  __miniCloseTimer = setTimeout(() => hideMiniPopover(), delay);
  try { hideTrailerPopover(delay); } catch {}
}

function __resetFx(el) {
  if (!el) return;
  el.style.animation = "none";
  el.style.transition = "none";
  void el.offsetWidth;
  el.style.animation = "";
  el.style.transition = "";
}

function __getTotalAnimMs(el) {
  const cs = getComputedStyle(el);
  const toArr = (v) => (v || "0s").split(",").map(s => s.trim());
  const toMs = (s) => {
    const n = parseFloat(s) || 0;
    return s.endsWith("ms") ? n : n * 1000;
  };
  const ad = toArr(cs.animationDuration).map(toMs);
  const at = toArr(cs.animationDelay).map(toMs);
  const td = toArr(cs.transitionDuration).map(toMs);
  const tt = toArr(cs.transitionDelay).map(toMs);
  const maxAnim = ad.reduce((m,v,i)=>Math.max(m, v+(at[i]||0)), 0);
  const maxTran = td.reduce((m,v,i)=>Math.max(m, v+(tt[i]||0)), 0);
  return Math.max(maxAnim, maxTran, 0);
}

export  function hideMiniPopover() {
   if (__miniCloseTimer) { clearTimeout(__miniCloseTimer); __miniCloseTimer = null; }
   if (!__miniPop) return;
   const el = __miniPop;
   const wasVisible = el.classList.contains("visible");
   el.classList.remove("visible");

   if (!wasVisible) {
     el.classList.remove("leaving");
     el.style.display = "none";
     return;
   }

   el.classList.remove("leaving");
   __resetFx(el);
   __resetFx(el.querySelector(".mini-bg"));
   __resetFx(el.querySelector(".mini-overlay"));
   void el.offsetWidth;
   el.classList.add("leaving");
   el.style.pointerEvents = "none";

   let done = false;
   const cleanup = () => {
     if (done) return;
     done = true;
    if (el.classList.contains("visible")) {
      el.classList.remove("leaving");
      el.style.pointerEvents = "";
      el.removeEventListener("animationend", onEnd, true);
      el.removeEventListener("animationcancel", onEnd, true);
      el.removeEventListener("transitionend", onEnd, true);
      if (safety) clearTimeout(safety);
      return;
    }

     el.classList.remove("leaving");
     el.style.display = "none";
     el.style.pointerEvents = "";
     el.removeEventListener("animationend", onEnd, true);
     el.removeEventListener("animationcancel", onEnd, true);
     el.removeEventListener("transitionend", onEnd, true);
     if (safety) clearTimeout(safety);
     try { window.dispatchEvent(new Event("studiohubs:miniHidden")); } catch {}
     try { hideTrailerPopover(0); } catch {}
   };
   const onEnd = (evt) => {
     cleanup();
   };
   el.addEventListener("animationend", onEnd, true);
   el.addEventListener("animationcancel", onEnd, true);
   el.addEventListener("transitionend", onEnd, true);
   const total = Math.max(__getTotalAnimMs(el), 100);
   const safety = setTimeout(cleanup, total + 0);
 }


function posNear(anchor, pop) {
  const margin = 8;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const r = anchor.getBoundingClientRect();

  pop.style.display = "block";
  pop.style.opacity = "0";
  pop.style.pointerEvents = "none";

  const pw = Math.min(pop.offsetWidth || 360, vw - 2 * margin);
  const ph = Math.min(pop.offsetHeight || 260, vh - 2 * margin);

  const spaceRight  = vw - r.right  - margin;
  const spaceLeft   = r.left        - margin;
  const spaceBottom = vh - r.bottom - margin;
  const spaceTop    = r.top         - margin;

  let place = "right";
  if (spaceRight >= pw) place = "right";
  else if (spaceLeft >= pw) place = "left";
  else if (spaceBottom >= ph) place = "bottom";
  else if (spaceTop >= ph) place = "top";
  else {
    const arr = [
      { side: "right",  size: spaceRight },
      { side: "left",   size: spaceLeft },
      { side: "bottom", size: spaceBottom },
      { side: "top",    size: spaceTop }
    ].sort((a,b) => b.size - a.size);
    place = arr[0].side;
  }

  let left, top;
  switch (place) {
    case "right":  left = r.right + margin; top = r.top + (r.height - ph)/2; break;
    case "left":   left = r.left - margin - pw; top = r.top + (r.height - ph)/2; break;
    case "bottom": left = r.left + (r.width - pw)/2; top = r.bottom + margin; break;
    case "top":    left = r.left + (r.width - pw)/2; top = r.top - margin - ph; break;
  }
  left = Math.max(margin, Math.min(left, vw - margin - pw));
  top  = Math.max(margin, Math.min(top,  vh - margin - ph));

  pop.style.left = `${Math.round(left + window.scrollX)}px`;
  pop.style.top  = `${Math.round(top  + window.scrollY)}px`;
  pop.style.opacity = "";
  pop.style.pointerEvents = "";
}

function ticksToHMin(ticks) {
  if (!ticks || typeof ticks !== "number") return "";
  const totalMinutes = Math.round(ticks / 600000000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const hLbl = (config?.languageLabels?.sa ?? "h");
  const mLbl = (config?.languageLabels?.dk ?? "m");
  if (h > 0) return `${h}${hLbl} ${m}${mLbl}`;
  return `${m}${mLbl}`;
}

function uniq(arr) { return Array.from(new Set(arr)); }

const LANG_SHORT = {
  tur: "TR", tr: "TR", turkish:"TR",
  eng: "EN", en: "EN", english:"EN",
  deu: "DE", ger:"DE", de:"DE", german:"DE",
  fra: "FR", fre:"FR", fr:"FR", french:"FR",
  rus: "RU", ru:"RU", russian:"RU",
  spa: "ES", es:"ES", spanish:"ES",
  ita: "IT", it:"IT", italian:"IT",
  jpn: "JA", ja:"JA", japanese:"JA",
  kor: "KO", ko:"KO", korean:"KO",
  zho: "ZH", chi:"ZH", zh:"ZH", chinese:"ZH"
};

function shortLang(v) {
  if (!v) return null;
  const s = String(v).toLowerCase();
  return LANG_SHORT[s] || LANG_SHORT[s.slice(0,2)] || s.slice(0,2).toUpperCase();
}

function buildPosterUrl(it, h = 400, q = 95) {
  const tag = it?.ImageTags?.Primary || it?.PrimaryImageTag;
  if (!tag) return null;
  return `/Items/${it.Id}/Images/Primary?tag=${encodeURIComponent(tag)}&fillHeight=${h}&quality=${q}`;
}

function buildBackdropUrl(it, idx = 0) {
  const t = (it?.BackdropImageTags || [])[idx];
  if (!t) return null;
  return `/Items/${it.Id}/Images/Backdrop/${idx}?tag=${encodeURIComponent(t)}&quality=90`;
}

async function getDetails(itemId, abortSignal) {
  const cached = detailsCache.get(itemId);
  if (cached && (Date.now() - cached.ts) < DETAILS_TTL) return cached.data;

  try {
    const data = await fetchItemDetails(itemId, { signal: abortSignal });
    if (!data) return null;
    if (data.Type === 'Season' && data.SeriesId) {
      const series = await fetchItemDetails(data.SeriesId, { signal: abortSignal });
      data.__series = series || null;
    }

    detailsCache.set(itemId, { ts: Date.now(), data });
    if (detailsCache.size > DETAILS_LRU_MAX) {
      const oldest = detailsCache.keys().next().value;
      detailsCache.delete(oldest);
    }
    return data;
  } catch {
    return null;
  }
}


function fillMiniContent(pop, itemBase, details) {
  const titleWrap = pop.querySelector(".mini-title");
  const yearWrap = pop.querySelector(".mini-year");
  const yearEl = pop.querySelector(".mini-year .v");
  const rtWrap = pop.querySelector(".mini-runtime");
  const rtEl = pop.querySelector(".mini-runtime .v");
  const dotEl = pop.querySelector(".mini-dot");
  const starWrap = pop.querySelector(".mini-star");
  const starVal = pop.querySelector(".mini-star .v");
  const tomWrap = pop.querySelector(".mini-tomato");
  const tomVal = pop.querySelector(".mini-tomato .v");
  const ageWrap = pop.querySelector(".mini-age");
  const tagsEl = pop.querySelector(".mini-tags");
  const audioEl = pop.querySelector(".mini-audio");
  const qualityEl = pop.querySelector(".mini-quality-inline");
  const ovEl = pop.querySelector(".mini-overview");
  const bgEl = pop.querySelector(".mini-bg");

  let item = { ...itemBase, ...details };

  if (item?.Type === 'Season' && details?.__series) {
    const s = details.__series;
    item = {
      ...item,
      Overview: item.Overview || s.Overview,
      Genres: (Array.isArray(item.Genres) && item.Genres.length) ? item.Genres : (s.Genres || []),
      OfficialRating: item.OfficialRating || s.OfficialRating,
      ProductionYear: item.ProductionYear || s.ProductionYear,
      CommunityRating: (typeof item.CommunityRating === 'number') ? item.CommunityRating : s.CommunityRating,
      CriticRating: (typeof item.CriticRating === 'number') ? item.CriticRating : s.CriticRating,
      ImageTags: item.ImageTags && Object.keys(item.ImageTags).length ? item.ImageTags : s.ImageTags,
      BackdropImageTags: (Array.isArray(item.BackdropImageTags) && item.BackdropImageTags.length)
        ? item.BackdropImageTags : (s.BackdropImageTags || []),
      MediaStreams: Array.isArray(item.MediaStreams) && item.MediaStreams.length ? item.MediaStreams : (s.MediaStreams || [])
    };
  }

  const poster = buildPosterUrl(item, 600, 95) || buildBackdropUrl(item, 0);
  bgEl.style.backgroundImage = poster ? `url("${poster}")` : "none";

  if (isAudioItem(item)) {
    const artistName = item.Artists && item.Artists.length > 0
      ? item.Artists[0]
      : item.AlbumArtist || item.SeriesName || '';

    const titleText = item.Name || item.Album || '';

    if (titleWrap) {
      if (artistName && titleText) {
        titleWrap.textContent = `${artistName} - ${titleText}`;
      } else if (titleText) {
        titleWrap.textContent = titleText;
      } else {
        titleWrap.textContent = '';
      }
      titleWrap.style.display = titleWrap.textContent ? '' : 'none';
    }
  } else {
    if (titleWrap) {
      titleWrap.textContent = item.Name || item.SeriesName || '';
      titleWrap.style.display = titleWrap.textContent ? '' : 'none';
    }
  }

  const hasYear = !!item.ProductionYear;
  yearEl.textContent = hasYear ? String(item.ProductionYear) : "";
  yearWrap.style.display = hasYear ? "" : "none";

  const rtTxt = ticksToHMin(item.RunTimeTicks) || "";
  const hasRt = rtTxt.length > 0;
  rtEl.textContent = rtTxt;
  rtWrap.style.display = hasRt ? "" : "none";

  let hasQual = false;

  const hasCommunity = (typeof item.CommunityRating === "number");
  starVal.textContent = hasCommunity ? item.CommunityRating.toFixed(1) : "";
  starWrap.style.display = hasCommunity ? "" : "none";

  const hasCritic = (typeof item.CriticRating === "number");
  tomVal.textContent = hasCritic ? `${Math.round(item.CriticRating)}%` : "";
  tomWrap.style.display = hasCritic ? "" : "none";

  const hasAge = !!item.OfficialRating;
  ageWrap.textContent = hasAge ? item.OfficialRating : "";
  ageWrap.style.display = hasAge ? "" : "none";

  const gs = Array.isArray(item.Genres) ? item.Genres.slice(0, 3) : [];
  if (gs.length) {
    tagsEl.innerHTML = gs.map(g => `<span class="mini-tag">${g}</span>`).join("");
    tagsEl.style.display = "";
  } else {
    tagsEl.innerHTML = "";
    tagsEl.style.display = "none";
  }

  let langs = [];
  const streams = Array.isArray(item.MediaStreams) ? item.MediaStreams : [];
  langs = uniq(streams.filter(s => s?.Type === "Audio")
                      .map(s => shortLang(s?.Language || s?.DisplayLanguage || s?.DisplayTitle))
                      .filter(Boolean)
                ).slice(0, 3);
  if (langs.length) {
    audioEl.innerHTML = `<span class="mini-audio-badge">🔊 ${langs.join(" • ")}</span>`;
    audioEl.style.display = "";
  } else {
    audioEl.innerHTML = "";
    audioEl.style.display = "none";
  }

  const videoStream = Array.isArray(item.MediaStreams)
    ? item.MediaStreams.find(s => s?.Type === "Video")
    : null;
  if (videoStream) {
    const html = getVideoQualityText(videoStream);
    if (html && html.trim().length) {
      qualityEl.innerHTML = html;
      qualityEl.style.display = "";
      hasQual = true;
    } else {
      qualityEl.innerHTML = "";
      qualityEl.style.display = "none";
    }
  } else {
    qualityEl.innerHTML = "";
    qualityEl.style.display = "none";
  }

  if (dotEl) dotEl.style.display = (hasYear && (hasRt || hasQual)) ? "" : "none";

  const ov = (item.Overview || "").trim();
  ovEl.textContent = ov;

  const nonPosterContent =
    rtEl.textContent ||
    starVal.textContent ||
    tomVal.textContent ||
    ageWrap.textContent ||
    tagsEl.innerHTML ||
    audioEl.innerHTML ||
    qualityEl.innerHTML ||
    ovEl.textContent;

  return Boolean(nonPosterContent && String(nonPosterContent).trim().length);
}

export function attachMiniPosterHover(cardEl, itemLike) {
  if (!cardEl || !itemLike || !itemLike.Id) return;

  ensureCss();
  ensureMiniPopover();

  if (cardEl.dataset.miniHoverBound === '1') return;
  cardEl.dataset.miniHoverBound = '1';

  let overTimer = null;
  if (!window.__studioLastHumanInputTs) window.__studioLastHumanInputTs = 0;
  const markHuman = () => (window.__studioLastHumanInputTs = Date.now());
  if (!window.__miniHumanBound) {
    window.__miniHumanBound = true;
    window.addEventListener("pointerdown", markHuman, { capture: true, passive: true });
    window.addEventListener("mousemove",   markHuman, { capture: true, passive: true });
    window.addEventListener("keydown",     markHuman, { capture: true, passive: true });
    window.addEventListener("touchstart",  markHuman, { capture: true, passive: true });
  }

  const cancelOpen = () => {
    if (overTimer) { clearTimeout(overTimer); __miniTimers.delete(overTimer); overTimer = null; }
    const ac = __abortByCard.get(cardEl);
    if (ac) { try { ac.abort(); } catch {} __abortByCard.delete(cardEl); }
  };

  const open = async () => {
    if (document.hidden || Date.now() < __miniTombstoneUntil) return;

    const myOpenSeq = ++__miniOpenSeq;
    const myNavSeq  = __miniNavSeq;
    const myKill    = window.__studioMiniKillToken || 0;
    const ac = new AbortController();
    __abortByCard.set(cardEl, ac);
    if (!document.contains(cardEl)) { cancelOpen(); return; }
    let details = null;
    try {
      details = await getDetails(itemLike.Id, ac.signal);
    } catch {}
    if (ac.signal.aborted) return;
    if (document.hidden || Date.now() < __miniTombstoneUntil) return;
    if (myOpenSeq !== __miniOpenSeq || myNavSeq !== __miniNavSeq) return;
    if ((window.__studioMiniKillToken || 0) !== myKill) return;
    if (!document.contains(cardEl)) { cancelOpen(); return; }
    const pop = ensureMiniPopover();
    if (!details) {
      hideMiniPopover();
      if (allowTrailerPopover()) {
        try { await tryOpenTrailerPopover(cardEl, itemLike.Id, { requireMini: false }); } catch {}
      }
      return;
    }
    const hasContent = fillMiniContent(pop, itemLike, details || {});
    if (!hasContent) {
      hideMiniPopover();
      if (allowTrailerPopover()) {
        try { await tryOpenTrailerPopover(cardEl, itemLike.Id, { requireMini: false }); } catch {}
      }
      return;
    }
    try {
      posNear(cardEl, pop);
    } catch {}
    if (!document.contains(cardEl)) { hideMiniPopover(); return; }
    requestAnimationFrame(() => {
     if (!__miniPop) return;
      if (document.hidden || Date.now() < __miniTombstoneUntil) return;
      if (myOpenSeq !== __miniOpenSeq || myNavSeq !== __miniNavSeq) return;
      if ((window.__studioMiniKillToken || 0) !== myKill) return;
      if (!document.contains(cardEl)) return;

      __miniPop.style.display = "block";
      __miniPop.classList.remove("leaving");
      __miniPop.classList.add("visible");
     try { window.dispatchEvent(new Event("studiohubs:miniShown")); } catch {}
    });
    await new Promise(requestAnimationFrame);
    if (allowTrailerPopover()) {
      try { await tryOpenTrailerPopover(cardEl, itemLike.Id, { requireMini: false }); } catch {}
    }
  };

  const scheduleOpen = () => {
    cancelOpen();
    if (document.hidden || Date.now() < __miniTombstoneUntil) return;
    const idleOk = Date.now() - (window.__studioLastHumanInputTs || 0) <= 1000;
    if (!idleOk) return;
    overTimer = setTimeout(open, isMobileLike() ? 0 : 160);
    __miniTimers.add(overTimer);
  };

  cardEl.addEventListener("mouseenter", scheduleOpen, { passive: true });
  cardEl.addEventListener("mouseleave", () => {
    cancelOpen();
    scheduleHideMini(120);
    hideTrailerPopover(120);
  }, { passive: true });
  if (isMobileLike()) {
    cardEl.addEventListener('touchstart', (e) => {
      __miniTombstoneUntil = Date.now() + 500;
      scheduleOpen();
    }, { passive: true });
  }
}

(() => {
  if (window.__studioHubsAutoCloseInstalled) return;
  window.__studioHubsAutoCloseInstalled = true;

  const killAllTimers = () => {
    for (const t of __miniTimers) { try { clearTimeout(t); } catch {} }
    __miniTimers.clear();
  };

  const closeAll = (destroy = false) => {
    __miniOpenSeq++;
    try { hideMiniPopover(); } catch {}
    try { hideTrailerPopover(0); } catch {}
    killAllTimers();
    try {
      __abortByCard && __abortByCard.forEach?.(ac => { try { ac.abort(); } catch {} });
    } catch {}
    if (destroy) destroyMiniPopover();
  };

  const markNav = () => {
    if (window.__studioMiniSuppressNextNavClose && Date.now() < window.__studioMiniSuppressNextNavClose) {
    window.__studioMiniSuppressNextNavClose = 0;
    return;
  }
    __miniNavSeq++;
    __miniTombstoneUntil = Date.now() + 1500;
    window.__studioMiniKillToken = (window.__studioMiniKillToken || 0) + 1;
    closeAll(true);
  };

  const markWake = () => {
    __miniTombstoneUntil = Date.now() + 1500;
    window.__studioMiniKillToken = (window.__studioMiniKillToken || 0) + 1;
    closeAll(true);
  };

  ["pushState", "replaceState"].forEach((fn) => {
    const orig = history[fn];
    if (typeof orig === "function") {
      history[fn] = function (...args) {
        const ret = orig.apply(this, args);
        window.dispatchEvent(new Event("studiohubs:navigated"));
        markNav();
        return ret;
      };
    }
  });

  window.addEventListener("studiohubs:navigated", markNav, true);
  window.addEventListener("popstate", markNav, true);
  window.addEventListener("hashchange", markNav, true);
  window.addEventListener("pagehide", () => markNav(), true);
  window.addEventListener("beforeunload", () => markNav(), true);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) markNav();
    else markWake();
  }, true);
  window.addEventListener("focus", markWake, true);
  window.addEventListener("blur", () => markNav(), true);
  document.addEventListener("click", (e) => {
    const a = e.target?.closest?.("a,[data-link],[data-href]") || null;
    if (!a) return;
    setTimeout(markNav, 0);
  }, true);
  try {
    const router = window.AppRouter || window.appRouter || window.router;
    if (router && typeof router.on === "function") {
      router.on("navigated", markNav);
      router.on("viewshow", markNav);
      router.on("viewhide", markNav);
    }
  } catch {}
})();

document.addEventListener('closeAllMiniPopovers', () => {
  try { hideTrailerPopover(0); } catch {}
  try { destroyMiniPopover(); } catch {}
});

if (typeof window !== 'undefined') {
  window.__closeMiniPopover = () => {
    try { destroyMiniPopover(); } catch {}
  };
}

export async function openMiniPopoverFor(cardEl, itemLikeOrId) {
  ensureCss();
  ensureMiniPopover();
  const itemLike = (typeof itemLikeOrId === 'string') ? { Id: itemLikeOrId } : itemLikeOrId;
  if (!cardEl || !itemLike?.Id || !document.contains(cardEl)) return;
  const myKill = (window.__studioMiniKillToken || 0);
  let details = null;
  try { details = await getDetails(itemLike.Id); } catch {}
  const pop = ensureMiniPopover();
  if (!details) { hideMiniPopover(); return; }
  const hasContent = fillMiniContent(pop, itemLike, details || {});
  if (!hasContent) { hideMiniPopover(); return; }
  try { posNear(cardEl, pop); } catch {}
  requestAnimationFrame(() => {
    if ((window.__studioMiniKillToken || 0) !== myKill) return;
    if (!document.contains(cardEl)) return;
    pop.style.display = "block";
    pop.classList.remove("leaving");
    pop.classList.add("visible");
    try { window.dispatchEvent(new Event("studiohubs:miniShown")); } catch {}
    requestAnimationFrame(async () => {
      if (allowTrailerPopover()) {
        try { await tryOpenTrailerPopover(cardEl, itemLike.Id, { requireMini: false }); } catch {}
      }
    });
  });
}

if (typeof window !== 'undefined') {
  window.openMiniPopoverFor = (el, it) => openMiniPopoverFor(el, it);
}
