import { getConfig } from "./config.js";
import {
  fetchItemDetails,
  getIntroVideoUrl,
  getVideoStreamUrl,
  fetchLocalTrailers,
  pickBestLocalTrailer,
  getAuthHeader,
} from "./api.js";

const config = getConfig();

export function getYoutubeEmbedUrl(input) {
  if (!input || typeof input !== "string") return input;

  const isHttps = (() => {
    try { return window.location.protocol === "https:"; } catch { return false; }
  })();
  const host = (() => {
    try { return new URL(window.location.href).hostname; } catch { return ""; }
  })();
  const isPrivateHost = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)$/.test(host);
  const canUseOriginAndJSAPI = isHttps && !isPrivateHost;

  if (/^[a-zA-Z0-9_-]{10,}$/.test(input) && !/youtu\.?be|youtube\.com/i.test(input)) {
    const params = new URLSearchParams({
      autoplay: "1",
      rel: "0",
      modestbranding: "1",
      iv_load_policy: "3",
      enablejsapi: canUseOriginAndJSAPI ? "1" : "0",
      playsinline: "1",
      mute: "0",
      controls: "1",
    });
    try {
      const orig = window.location?.origin;
      if (canUseOriginAndJSAPI && orig && /^https:\/\//.test(orig)) params.set("origin", orig);
    } catch {}
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(input)}?${params.toString()}`;
  }

  const isMobile = (() => {
    try {
      return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
             (navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 1024);
    } catch { return false; }
  })();

  const parseYouTubeTime = (t) => {
    if (!t) return 0;
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
    if (!m) return 0;
    const h = parseInt(m[1] || "0", 10);
    const min = parseInt(m[2] || "0", 10);
    const s = parseInt(m[3] || "0", 10);
    return h * 3600 + min * 60 + s;
  };

  const ensureUrl = (raw) => {
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
    const lower = raw.toLowerCase();
    const isYT = /\b(youtu\.be|youtube\.com)\b/.test(lower);
    const scheme = "https:";
    return `${scheme}//${raw}`;
  };

  let parsed;
  try {
    parsed = new URL(ensureUrl(input));
  } catch {
    return input;
  }

  const ytHost = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const isYouTube = ytHost === "youtu.be" || ytHost.endsWith("youtube.com");
  if (!isYouTube) return input;

  let videoId = "";
  if (ytHost === "youtu.be") {
    videoId = parsed.pathname.split("/").filter(Boolean)[0] || "";
  } else {
    if (parsed.pathname.startsWith("/embed/")) {
      videoId = parsed.pathname.split("/").filter(Boolean)[1] || "";
    } else if (parsed.pathname.startsWith("/shorts/")) {
      videoId = parsed.pathname.split("/").filter(Boolean)[1] || "";
    } else {
      videoId = parsed.searchParams.get("v") || "";
    }
  }
  if (!videoId) return input;

  const startParam = parsed.searchParams.get("start");
  const tParam = parsed.searchParams.get("t");
  const start = startParam ? parseInt(startParam, 10) : parseYouTubeTime(tParam);

  const params = new URLSearchParams({
    autoplay: "1",
    rel: "0",
    modestbranding: "1",
    iv_load_policy: "3",
    enablejsapi: canUseOriginAndJSAPI ? "1" : "0",
    playsinline: "1",
    mute: "0",
    controls: "1",
  });
  try {
    const orig = (typeof window !== "undefined" && window.location?.origin) || "";
    if (canUseOriginAndJSAPI && orig && /^https:\/\//.test(orig)) {
      params.set("origin", orig);
    }
  } catch {}

  if (Number.isFinite(start) && start > 0) params.set("start", String(start));

  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(
    videoId
  )}?${params.toString()}`;
}

export function getProviderUrl(provider, id, slug = "") {
  if (!provider || !id) return "#";

  const normalizedProvider = provider.toString().trim().toLowerCase();
  const cleanId = id.toString().trim();
  const cleanSlug = slug.toString().trim();

  switch (normalizedProvider) {
    case "imdb":
      return `https://www.imdb.com/title/${cleanId}/`;
    case "tmdb":
      return `https://www.themoviedb.org/movie/${cleanId}`;
    case "tvdb": {
      const pathSegment = cleanSlug || cleanId;
      const isSeries = /series/i.test(pathSegment) || /^series[-_]/i.test(pathSegment);
      return `https://www.thetvdb.com/${isSeries ? "series" : "movies"}/${pathSegment}`;
    }
    default:
      return "#";
  }
}

export function debounce(func, wait = 300, immediate = false) {
  let timeout;
  return function (...args) {
    const context = this;
    const later = () => {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
}

export function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function createTrailerIframe({ config, RemoteTrailers, slide, backdropImg, itemId }) {
  if (config?.disableAllPlayback === true) {
    try {
      slide?.classList.remove("video-active", "intro-active", "trailer-active");
      if (backdropImg) backdropImg.style.opacity = "1";
    } catch {}
    return;
  }

  const isActiveSlide = () => slide?.classList?.contains('active');
  const savedMode = localStorage.getItem("previewPlaybackMode");
  const mode =
    savedMode === "trailer" ||
    savedMode === "video" ||
    savedMode === "trailerThenVideo"
      ? savedMode
      : config.enableTrailerPlayback
      ? "trailer"
      : "video";

  if (!itemId) return;

  const videoContainer = document.createElement("div");
  videoContainer.className = "intro-video-container";
  Object.assign(videoContainer.style, {
    width: "70%",
    height: "100%",
    border: "none",
    display: "none",
    position: "absolute",
    top: "0%",
    right: "0%",
  });

  const videoElement = document.createElement("video");
  videoElement.controls = true;
  videoElement.muted = false;
  videoElement.autoplay = true;
  videoElement.playsInline = true;
  videoElement.style.width = "100%";
  videoElement.style.height = "100%";
  videoElement.style.transition = "opacity 0.2s ease-in-out";
  videoElement.style.opacity = "0";

  videoContainer.appendChild(videoElement);
  slide.appendChild(videoContainer);

  let ytIframe = null;
  let playingKind = null;
  let isMouseOver = false;
  let latestHoverId = 0;
  let abortController = new AbortController();
  let enterTimeout = null;
  let detachGuards = null;

  const enableHls = config.enableHls === true;
  const delayRaw = config && (config.gecikmeSure ?? config.gecikmesure);
  const delay = Number.isFinite(+delayRaw) ? +delayRaw : 500;

  const stopYoutube = (iframe) => {
    try {
      if (!iframe) return;
      iframe.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "stopVideo", args: [] }),
        "*"
      );
    } catch {}
  };

  const destroyHlsIfAny = () => {
    if (videoElement.hls) {
      try {
        videoElement.hls.destroy();
      } catch {}
      delete videoElement.hls;
    }
  };

  const hardStopVideo = () => {
    try {
      videoElement.pause();
    } catch {}
    destroyHlsIfAny();
    try {
      videoElement.removeAttribute("src");
      videoElement.load();
    } catch {}
    videoContainer.style.display = "none";
    videoElement.style.opacity = "0";
    slide.classList.remove("video-active", "intro-active", "trailer-active");
  };

  const hardStopIframe = () => {
    if (ytIframe) {
      stopYoutube(ytIframe);
      try {
        ytIframe.src = "";
      } catch {}
      ytIframe.style.display = "none";
    }
    slide.classList.remove("trailer-active");
  };

  const fullCleanup = () => {
    hardStopVideo();
    hardStopIframe();
    try {
      if (backdropImg) backdropImg.style.opacity = "1";
    } catch {}
    playingKind = null;
  };

  async function loadStreamFor(itemIdToPlay, hoverId, startSeconds = 0) {
    const introUrl = await getVideoStreamUrl(
      itemIdToPlay,
      1920,
      0,
      null,
      ["h264"],
      ["aac"],
      false,
      false,
      enableHls,
      { signal: abortController.signal }
    );
    if (!isMouseOver || hoverId !== latestHoverId) throw new Error("HoverAbortError");

    if (
      enableHls &&
      typeof window.Hls !== "undefined" &&
      window.Hls.isSupported() &&
      introUrl &&
      /\.m3u8(\?|$)/.test(introUrl)
    ) {
      const hls = new window.Hls();
      videoElement.hls = hls;
      hls.loadSource(introUrl);
      hls.attachMedia(videoElement);
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        if (!isMouseOver || hoverId !== latestHoverId) {
          destroyHlsIfAny();
          return;
        }
        videoElement.currentTime = startSeconds;
        videoElement
          .play()
          .then(() => {
            videoElement.style.opacity = "1";
          })
          .catch(() => {});
      });
      hls.on(window.Hls.Events.ERROR, (_e, data) => {
        console.error("HLS ERROR", data);
        if (data.fatal) fullCleanup();
      });
    } else {
      videoElement.src = introUrl;
      videoElement.load();
      const onMeta = () => {
        videoElement.removeEventListener("loadedmetadata", onMeta);
        if (!isMouseOver || hoverId !== latestHoverId) {
          fullCleanup();
          return;
        }
        videoElement.currentTime = startSeconds;
        videoElement
          .play()
          .then(() => {
            videoElement.style.opacity = "1";
          })
          .catch(() => {});
      };
      videoElement.addEventListener("loadedmetadata", onMeta, { once: true });
    }
  }

  async function tryPlayLocalTrailer(hoverId) {
    if (!isActiveSlide()) return false;
    const locals = await fetchLocalTrailers(itemId, { signal: abortController.signal });
    if (!isMouseOver || hoverId !== latestHoverId || !isActiveSlide()) throw new Error("HoverAbortError");
    const best = pickBestLocalTrailer(locals);
    if (!best?.Id) return false;

    if (!isActiveSlide()) return false;
    if (backdropImg) backdropImg.style.opacity = "0";
    hardStopIframe();
    videoContainer.style.display = "block";
    slide.classList.add("video-active", "intro-active", "trailer-active");
    playingKind = "localTrailer";
    await loadStreamFor(best.Id, hoverId, 0);
    return true;
  }

  async function tryPlayRemoteTrailer(_hoverId) {
    if (!isActiveSlide()) return false;
    const trailer = Array.isArray(RemoteTrailers) && RemoteTrailers.length ? RemoteTrailers[0] : null;
    if (!trailer?.Url) return false;

    const url = getYoutubeEmbedUrl(trailer.Url);
    if (!isValidUrl(url) || !isActiveSlide()) return false;

    if (backdropImg) backdropImg.style.opacity = "0";
    hardStopVideo();

    if (!ytIframe) {
      ytIframe = document.createElement("iframe");
      ytIframe.allow = "autoplay; encrypted-media; clipboard-write; accelerometer; gyroscope; picture-in-picture";
      ytIframe.referrerPolicy = "origin-when-cross-origin";
      "autoplay; encrypted-media; clipboard-write; accelerometer; gyroscope; picture-in-picture";
      ytIframe.setAttribute("playsinline", "");
      ytIframe.allowFullscreen = true;
      Object.assign(ytIframe.style, {
        width: "70%",
        height: "90%",
        border: "none",
        display: "none",
        position: "absolute",
        top: "0%",
        right: "0%",
      });
      slide.appendChild(ytIframe);
    }

    if (!isActiveSlide()) return false;
    ytIframe.style.display = "block";
    ytIframe.src = url;
    slide.classList.add("trailer-active");
    playingKind = "remoteTrailer";
    return true;
  }

  async function playMainVideo(hoverId) {
    if (!isActiveSlide()) return false;
    if (backdropImg) backdropImg.style.opacity = "0";
    hardStopIframe();
    videoContainer.style.display = "block";
    slide.classList.add("video-active", "intro-active", "trailer-active");
    playingKind = "video";
    await loadStreamFor(itemId, hoverId, 600);
    return true;
  }

  const handleEnter = () => {
    if (!isActiveSlide()) return;

    isMouseOver = true;
    latestHoverId++;
    const thisHoverId = latestHoverId;
    abortController.abort("hover-cancel");
    abortController = new AbortController();

    if (enterTimeout) {
      clearTimeout(enterTimeout);
      enterTimeout = null;
    }

    enterTimeout = setTimeout(async () => {
      if (!isMouseOver || thisHoverId !== latestHoverId || !isActiveSlide()) return;
      try {
        if (mode === "video") {
          if (await playMainVideo(thisHoverId)) return;
        } else {
          if (await tryPlayLocalTrailer(thisHoverId)) return;
          if (await tryPlayRemoteTrailer(thisHoverId)) return;
          if (mode === "trailerThenVideo") {
            if (await playMainVideo(thisHoverId)) return;
          } else {
            fullCleanup();
          }
        }
      } catch (e) {
        if (e.name === "AbortError" || e.message === "HoverAbortError") return;
        console.error("Hover/play error:", e);
        fullCleanup();
      }
    }, delay);
  };

  const handleLeave = () => {
    isMouseOver = false;
    latestHoverId++;
    abortController.abort("hover-cancel");
    abortController = new AbortController();
    if (enterTimeout) {
      clearTimeout(enterTimeout);
      enterTimeout = null;
    }
    fullCleanup();
  };

  function attachAutoCleanupGuards(slideEl) {
    const cleanups = [];

    const viewport =
      slideEl.closest(".swiper") ||
      slideEl.closest(".splide__track") ||
      slideEl.closest(".embla__viewport") ||
      slideEl.closest(".flickity-viewport") ||
      slideEl.closest("[data-slider-viewport]") ||
      null;

    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.target === slideEl) {
              const visible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
              if (!visible) handleLeave();
            }
          }
        },
        { root: viewport || null, threshold: [0, 0.5, 1] }
      );
      io.observe(slideEl);
      cleanups.push(() => io.disconnect());
    }

    const mo = new MutationObserver(() => {
      if (!document.body.contains(slideEl)) {
        try {
          handleLeave();
        } catch {}
        cleanups.forEach((fn) => {
          try {
            fn();
          } catch {}
        });
        mo.disconnect();
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    cleanups.push(() => mo.disconnect());

    const onVis = () => {
      if (document.hidden) handleLeave();
    };
    document.addEventListener("visibilitychange", onVis);
    cleanups.push(() => document.removeEventListener("visibilitychange", onVis));
    const onPageHide = () => handleLeave();
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);
    cleanups.push(() => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
    });

    const swiperHost = slideEl.closest(".swiper");
    const swiperInst = swiperHost && swiperHost.swiper;
    if (swiperInst?.on && swiperInst?.off) {
      const onSwiperChange = () => handleLeave();
      swiperInst.on("slideChangeTransitionStart", onSwiperChange);
      swiperInst.on("slideChange", onSwiperChange);
      swiperInst.on("transitionStart", onSwiperChange);
      cleanups.push(() => {
        try {
          swiperInst.off("slideChangeTransitionStart", onSwiperChange);
        } catch {}
        try {
          swiperInst.off("slideChange", onSwiperChange);
        } catch {}
        try {
          swiperInst.off("transitionStart", onSwiperChange);
        } catch {}
      });
    }

    const splideRoot = slideEl.closest(".splide");
    const splideInst = splideRoot && (splideRoot.__splide || window.splide);
    if (splideInst?.on && splideInst?.off) {
      const onMove = () => handleLeave();
      splideInst.on("move", onMove);
      splideInst.on("moved", onMove);
      cleanups.push(() => {
        try {
          splideInst.off("move", onMove);
        } catch {}
        try {
          splideInst.off("moved", onMove);
        } catch {}
      });
    }

    const flktyRoot = slideEl.closest(".flickity-enabled");
    const flktyInst = flktyRoot && flktyRoot.flickity;
    if (flktyInst?.on && flktyInst?.off) {
      const onChange = () => handleLeave();
      flktyInst.on("change", onChange);
      flktyInst.on("select", onChange);
      cleanups.push(() => {
        try {
          flktyInst.off("change", onChange);
        } catch {}
        try {
          flktyInst.off("select", onChange);
        } catch {}
      });
    }

    const emblaViewport = slideEl.closest(".embla__viewport");
    const emblaInst = emblaViewport && emblaViewport.__embla;
    if (emblaInst?.on) {
      const onSelect = () => handleLeave();
      const onReInit = () => handleLeave();
      emblaInst.on("select", onSelect);
      emblaInst.on("reInit", onReInit);
      cleanups.push(() => {
        try {
          emblaInst.off("select", onSelect);
        } catch {}
        try {
          emblaInst.off("reInit", onReInit);
        } catch {}
      });
    }

    return () => cleanups.forEach((fn) => { try { fn(); } catch {} });
  }

  let lastActive = isActiveSlide();
  let leavingLock = false;
  detachGuards = attachAutoCleanupGuards(slide);

  const classObserver = new MutationObserver(() => {
  const nowActive = isActiveSlide();

    if (lastActive && !nowActive && !leavingLock) {
      leavingLock = true;
      (typeof queueMicrotask === 'function' ? queueMicrotask : (fn) => Promise.resolve().then(fn))(() => {
        try { handleLeave(); } finally { leavingLock = false; }
      });
    }

    lastActive = nowActive;
  });

  classObserver.observe(slide, { attributes: true, attributeFilter: ['class'] });

  const hoverTarget = slide;
  hoverTarget.addEventListener("mouseenter", handleEnter, { passive: true });
  hoverTarget.addEventListener("mouseleave", handleLeave, { passive: true });

  const mo = new MutationObserver(() => {
    if (!document.body.contains(slide)) {
      try { hoverTarget.removeEventListener("mouseenter", handleEnter); } catch {}
      try { hoverTarget.removeEventListener("mouseleave", handleLeave); } catch {}
      try { detachGuards?.(); } catch {}
      try { classObserver.disconnect(); } catch {}
      mo.disconnect();
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
}

const _bestBackdropCache = new Map();

export function ensureImagePreconnect() {
  const host = window.location?.origin || "";
  if (!host) return;
  if (document.querySelector(`link[rel="preconnect"][href="${host}"]`)) return;
  const l = document.createElement("link");
  l.rel = "preconnect";
  l.href = host;
  l.crossOrigin = "anonymous";
  document.head.appendChild(l);
}

let _supportsWebP;
export function supportsWebP() {
  if (_supportsWebP != null) return _supportsWebP;
  try {
    _supportsWebP = document.createElement("canvas").toDataURL("image/webp").includes("webp");
  } catch {
    _supportsWebP = false;
  }
  return _supportsWebP;
}

export function warmImageOnce(url) {
  if (!url) return;
  if (document.querySelector(`link[rel="preload"][as="image"][href="${url}"]`)) return;
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.href = url;
  try { link.fetchPriority = "high"; } catch {}
  document.head.appendChild(link);
}

export function idleWarmImages(urls = []) {
  const doWarm = () => urls.forEach((u) => warmImageOnce(u));
  const ric = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
  ric(doWarm, { timeout: 800 });
}

export function buildBackdropResponsive(item, index = "0", cfg = getConfig()) {
  const pixelRatio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const maxTarget = Math.max(1280, (cfg.backdropMaxWidth || 1920) * pixelRatio);
  const fmt = supportsWebP() ? "&format=webp" : "";
  const tag = (item.ImageTags?.Backdrop?.[index] || "").toString();
  const id = item.Id;

  const widths = [1280, 1920, 2560, 3840].filter((w) => w <= 1.25 * maxTarget);

  const src = `/Items/${id}/Images/Backdrop/${index}?tag=${tag}&quality=90&maxWidth=${Math.floor(
    maxTarget
  )}${fmt}`;
  const srcset = widths
    .map(
      (w) =>
        `/Items/${id}/Images/Backdrop/${index}?tag=${tag}&quality=90&maxWidth=${w}${fmt} ${w}w`
    )
    .join(", ");

  return { src, srcset, sizes: "100vw" };
}

export async function getHighestQualityBackdropIndex(itemId) {
  const cfg = getConfig();
  if (cfg.indexZeroSelection) return "0";
  if (_bestBackdropCache.has(itemId)) return _bestBackdropCache.get(itemId);
  let details;
  try {
    details = await fetchItemDetails(itemId);
  } catch {
    return "0";
  }
  const tags = details?.BackdropImageTags || [];
  if (!tags.length) return "0";
  if (cfg.manualBackdropSelection) return "0";
  const maxProbe = Number(cfg.limit ?? 6);
  const idxList = Array.from({ length: Math.min(maxProbe, tags.length) }, (_, i) => String(i));
  const results = [];
  const conc = 3;
  for (let i = 0; i < idxList.length; i += conc) {
    const batch = idxList.slice(i, i + conc);
    await Promise.all(
      batch.map(async (idxStr) => {
        const url = `/Items/${itemId}/Images/Backdrop/${idxStr}`;
        const bytes = await getImageSizeInBytes(url).catch(() => NaN);
        if (Number.isFinite(bytes)) {
          results.push({ index: idxStr, kb: bytes / 1024 });
        }
      })
    );
  }

  if (!results.length) return "0";
  const useSizeFilter = Boolean(cfg.enableImageSizeFilter ?? false);
  const minKB = Number(cfg.minImageSizeKB ?? 800);
  const maxKB = Number(cfg.maxImageSizeKB ?? 1500);

  let best;
  if (useSizeFilter) {
    const inRange = results.filter((r) => r.kb >= minKB && r.kb <= maxKB);
    if (inRange.length) {
      best = inRange.reduce((a, b) => (b.kb > a.kb ? b : a));
    } else {
      best = results.reduce((a, b) => (b.kb > a.kb ? b : a));
    }
  } else {
    best = results.reduce((a, b) => (b.kb > a.kb ? b : a));
  }

  const chosen = best?.index ?? "0";
  _bestBackdropCache.set(itemId, chosen);
  return chosen;
}

async function kbInRange(url, minKB, maxKB) {
  const bytes = await getImageSizeInBytes(url).catch(() => NaN);
  if (!Number.isFinite(bytes)) return false;
  const kb = bytes / 1024;
  return kb >= minKB && kb <= maxKB;
}

async function getImageSizeInBytes(url) {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { Authorization: getAuthHeader() },
    });
    const size = res.headers.get("Content-Length") || res.headers.get("content-length");
    if (!size) throw new Error("Content-Length yok");
    const n = parseInt(size, 10);
    if (!Number.isFinite(n)) throw new Error("Content-Length parse edilemedi");
    return n;
  } catch {
    return NaN;
  }
}

export function prefetchImages(urls) {
  if (!Array.isArray(urls) || urls.length === 0) return;
  window.addEventListener(
    "load",
    () => {
      urls.forEach((url) => {
        if (!url) return;
        if (document.querySelector(`link[rel="prefetch"][href="${url}"]`)) return;
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.href = url;
        document.head.appendChild(link);
      });
    },
    { once: true }
  );
}

export async function getHighResImageUrls(item, backdropIndex) {
  const itemId = item.Id;
  const imageTag = item.ImageTags?.Primary || "";
  const logoTag = item.ImageTags?.Logo || "";
  const pixelRatio = window.devicePixelRatio || 1;
  const logoHeight = Math.floor(720 * pixelRatio);
  const fmt = supportsWebP() ? "&format=webp" : "";
  const index = backdropIndex !== undefined ? backdropIndex : "0";
  const backdropMaxWidth = (config.backdropMaxWidth || 1920) * pixelRatio;
  const backdropTag = item.ImageTags?.Backdrop?.[index] || "";

  const backdropUrl = `/Items/${itemId}/Images/Backdrop/${index}?tag=${backdropTag}&quality=90&maxWidth=${Math.floor(
    backdropMaxWidth
  )}${fmt}`;
  const placeholderUrl = `/Items/${itemId}/Images/Primary?tag=${imageTag}&maxHeight=50&blur=15`;
  const logoUrl = `/Items/${itemId}/Images/Logo?tag=${logoTag}&quality=90&maxHeight=${logoHeight}${fmt}`;

  return { backdropUrl, placeholderUrl, logoUrl };
}

export function createImageWarmQueue({ concurrency = 3 } = {}) {
  const q = [];
  let active = 0;

  const runNext = () => {
    if (!q.length || active >= concurrency) return;
    const job = q.shift();
    active++;
    (async () => {
      try {
        if (job.shortPreload) {
          const link = document.createElement('link');
          link.rel = 'preload';
          link.as = 'image';
          try { link.fetchPriority = 'low'; } catch {}
          link.href = job.url;
          document.head.appendChild(link);
          setTimeout(() => link.remove(), 1500);
        }
        await new Promise((res) => {
          const img = new Image();
          img.decoding = 'async';
          img.loading = 'eager';
          img.src = job.url;
          img.onload = async () => {
            try { await img.decode?.(); } catch {}
            res();
          };
          img.onerror = () => res();
        });
      } finally {
        active--;
        runNext();
      }
    })();
  };
  const ric = window.requestIdleCallback || ((fn) => setTimeout(fn, 0));

  function enqueue(url, { shortPreload = true } = {}) {
    if (!url) return;
    enqueue._seen ||= new Set();
    if (enqueue._seen.has(url)) return;
    enqueue._seen.add(url);
    q.push({ url, shortPreload });
    ric(runNext, { timeout: 1000 });
  }
  return { enqueue };
}
