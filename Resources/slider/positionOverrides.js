import { getConfig } from './config.js';

let homeTopObserver = null;
let skinHeaderObserver = null;

function isMobileDevice() {
  const widthNarrow = window.matchMedia?.('(max-width: 768px)')?.matches;
  const coarse     = window.matchMedia?.('(pointer: coarse)')?.matches;
  const hoverNone  = window.matchMedia?.('(hover: none)')?.matches;
  const touchPts   = navigator.maxTouchPoints || 0;
  const uaMobile   = navigator.userAgentData?.mobile ?? /Mobi|Android/i.test(navigator.userAgent);

  return widthNarrow && (coarse || hoverNone || touchPts > 0 || uaMobile);
}

function normalizeVariant(x) {
  const s = String(x ?? '').toLowerCase().trim();
  if (!s) return 'slider';

  if (s.includes('normalslider') || s.includes('normal')) return 'normalslider';
  if (s.includes('fullslider')   || s.includes('full'))   return 'fullslider';
  if (s.includes('peakslider')   || s.includes('peak'))   return 'peakslider';
  if (s.includes('slider'))                                   return 'slider';
  return 'slider';
}

function detectCssVariantFromDom() {
  if (window.__cssVariant) return normalizeVariant(window.__cssVariant);

  const dv = document.documentElement?.dataset?.cssVariant;
  if (dv) return normalizeVariant(dv);

  const has = (s) => !!document.querySelector(`link[href*="${s}"]`);
  if (has('peakslider.css'))   return 'peakslider';
  if (has('normalslider.css')) return 'normalslider';
  if (has('fullslider.css'))   return 'fullslider';
  if (has('slider.css'))       return 'slider';
  return 'slider';
}

function computeEffectiveTop() {
  const cfg = (typeof getConfig === 'function') ? getConfig() : {};
  const userTop = readUserTopFromLocalStorage();
  if (userTop !== null) return userTop;

  const rawVariant = (cfg && 'cssVariant' in cfg) ? cfg.cssVariant : undefined;
  const variant = normalizeVariant(rawVariant ?? detectCssVariantFromDom());

  try {
  } catch {}

  return getDefaultTopByVariant(variant);
}

function getDefaultTopByVariant(variant) {
  const mobile = isMobileDevice();
  if (mobile) {
    switch (variant) {
      case 'normalslider': return -20;
      case 'fullslider': return -16;
      case 'peakslider': return 0;
      case 'slider': return 0;
      default: return 0;
    }
  } else {
    switch (variant) {
      case 'normalslider': return -23;
      case 'fullslider': return 4;
      case 'peakslider': return -7;
      case 'slider': return -3;
      default: return 0;
    }
  }
}

function readUserTopFromLocalStorage() {
  const raw = localStorage.getItem('homeSectionsTop');
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return null;
  return n;
}

function applyTopToElements(vh) {
  const value = `${vh}vh`;
  const targets = [
    ...document.querySelectorAll('.homeSectionsContainer'),
    document.querySelector('#favoritesTab')
  ];
  for (const el of targets) {
    if (!el) continue;
    if (el.style.top !== value) {
      el.style.setProperty('top', value, 'important');
    }
  }
}

function waitForFavoritesTabAndApply(topValue) {
  let tries = 0;
  function attempt() {
    const el = document.querySelector('#favoritesTab');
    if (el) {
      el.style.setProperty('top', `${topValue}vh`, 'important');
      return;
    }
    if (++tries < 30) setTimeout(attempt, 100);
  }
  attempt();
}

export function forceHomeSectionsTop() {
  const applyAlways = () => {
    const top = computeEffectiveTop();
    applyTopToElements(top);
    waitForFavoritesTabAndApply(top);
  };

  if (!homeTopObserver) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyAlways, { once: true });
    } else {
      applyAlways();
    }

    homeTopObserver = new MutationObserver(applyAlways);
    homeTopObserver.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: false
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        try { homeTopObserver.disconnect(); } catch {}
      } else {
        try {
          homeTopObserver.observe(document.documentElement, {
            subtree: true,
            childList: true,
            attributes: false
          });
          applyAlways();
        } catch {}
      }
    });

    window.addEventListener('pagehide', () => {
      try { homeTopObserver.disconnect(); } catch {}
      homeTopObserver = null;
    }, { once: true });
  } else {
    applyAlways();
  }
}

export function forceSkinHeaderPointerEvents() {
  const apply = () => {
    document.querySelectorAll('html .skinHeader').forEach(el => {
      el.style.setProperty('pointer-events', 'all', 'important');
    });

    const playerToggle = document.querySelector('button#jellyfinPlayerToggle');
    if (playerToggle) {
      playerToggle.style.setProperty('display', 'block', 'important');
      playerToggle.style.setProperty('opacity', '1', 'important');
      playerToggle.style.setProperty('pointer-events', 'all', 'important');
      playerToggle.style.setProperty('background', 'none', 'important');
      playerToggle.style.setProperty('text-shadow', 'rgb(255, 255, 255) 0px 0px 2px', 'important');
      playerToggle.style.setProperty('cursor', 'pointer', 'important');
      playerToggle.style.setProperty('border', 'none', 'important');
    }
  };

  if (!skinHeaderObserver) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', apply, { once: true });
    } else {
      apply();
    }

    skinHeaderObserver = new MutationObserver(apply);
    skinHeaderObserver.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: false
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        try { skinHeaderObserver.disconnect(); } catch {}
      } else {
        try {
          skinHeaderObserver.observe(document.documentElement, {
            subtree: true,
            childList: true,
            attributes: false
          });
          apply();
        } catch {}
      }
    });

    window.addEventListener('pagehide', () => {
      try { skinHeaderObserver.disconnect(); } catch {}
      skinHeaderObserver = null;
    }, { once: true });
  } else {
    apply();
  }
}
