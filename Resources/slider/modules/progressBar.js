import { startSlideTimer, stopSlideTimer, pauseSlideTimer, resumeSlideTimer, SLIDE_DURATION } from "./timer.js";
import {
  getCurrentIndex, setCurrentIndex, getSlideDuration, setAutoSlideTimeout, getAutoSlideTimeout,
  setSlideStartTime, getSlideStartTime, setRemainingTime, getRemainingTime
} from "./sliderState.js";
import { attachMouseEvents, setupVisibilityHandler } from "./events.js";
import { getConfig } from './config.js';
import { applyContainerStyles } from "./positionUtils.js";

let progressBarEl = null;
let secondsEl = null;
let pausedProgressPct = 0;
let secondsTimer = null;
let secondsPausedMs = 0;
let secondsEndAt = 0;
let frameLockRaf = null;
let __pbInited = false;
let __paused = false;
let secondsRunId = 0;

function now() { return performance.now(); }

function getSlidesContainer() {
  return document.querySelector("#indexPage:not(.hide) #slides-container");
}

function useSecondsMode() {
  const cfg = getConfig();
  return !!(cfg.showProgressBar && cfg.showProgressAsSeconds);
}

function clearRaf() {
  if (frameLockRaf) {
    cancelAnimationFrame(frameLockRaf);
    frameLockRaf = null;
  }
}

function frameLock(el, fixedScale) {
  clearRaf();
  const tick = () => {
    if (el && el.isConnected) {
      el.style.transform = `scaleX(${fixedScale})`;
      frameLockRaf = requestAnimationFrame(tick);
    } else {
      clearRaf();
    }
  };
  frameLockRaf = requestAnimationFrame(tick);
}

function getComputedScaleX(el) {
  if (!el) return 0;
  const st = getComputedStyle(el);
  const tr = st.transform || st.webkitTransform || "";
  if (!tr || tr === "none") return 0;
  if (tr.startsWith("matrix3d(")) {
    const vals = tr.slice(9, -1).split(",").map(s => parseFloat(s.trim()));
    const m11 = vals[0];
    return Number.isFinite(m11) ? m11 : 0;
  }
  if (tr.startsWith("matrix(")) {
    const vals = tr.slice(7, -1).split(",").map(s => parseFloat(s.trim()));
    const a = vals[0];
    return Number.isFinite(a) ? a : 0;
  }
  const m = tr.match(/scaleX\(([-+]?[\d.]+)\)/i);
  if (m) {
    const v = parseFloat(m[1]);
    return Number.isFinite(v) ? v : 0;
  }
  return 0;
}

function targetScaleFromCfg() {
  return Math.max(0, Math.min(1, (getConfig().progressBarWidth || 100) / 100));
}

export function ensureProgressBarExists() {
  if (!getConfig().showProgressBar || useSecondsMode()) {
    if (progressBarEl && document.body.contains(progressBarEl)) {
      progressBarEl.remove();
      progressBarEl = null;
    }
    return null;
  }
  if (progressBarEl && !document.body.contains(progressBarEl)) progressBarEl = null;

  if (!progressBarEl) {
    progressBarEl = document.querySelector(".slide-progress-bar");
    if (!progressBarEl) {
      progressBarEl = document.createElement("div");
      progressBarEl.className = "slide-progress-bar";
      applyContainerStyles(progressBarEl, 'progress');
      const sc = getSlidesContainer();
      if (sc) sc.appendChild(progressBarEl);
    }
    Object.assign(progressBarEl.style, {
      transformOrigin: '0 50%',
      willChange: 'transform',
      width: (getConfig().progressBarWidth || 100) + '%',
      animationPlayState: 'paused'
    });
    __pbInited = true;
  } else {
    const sc = getSlidesContainer();
    if (sc && progressBarEl.parentElement !== sc) sc.appendChild(progressBarEl);
  }
  return progressBarEl;
}

function ensureSecondsExists() {
  if (!useSecondsMode()) {
    if (secondsEl && document.body.contains(secondsEl)) {
      secondsEl.remove();
      secondsEl = null;
    }
    clearSecondsTimer();
    return null;
  }
  if (secondsEl && !document.body.contains(secondsEl)) secondsEl = null;
  if (!secondsEl) {
    secondsEl = document.querySelector(".slide-progress-seconds");
    if (!secondsEl) {
      secondsEl = document.createElement("div");
      secondsEl.className = "slide-progress-seconds";
      applyContainerStyles(secondsEl, 'progressSeconds');
      const sc = getSlidesContainer();
      if (sc) sc.appendChild(secondsEl);
    }
  } else {
    const sc = getSlidesContainer();
    if (sc && secondsEl.parentElement !== sc) sc.appendChild(secondsEl);
  }
  return secondsEl;
}

function clearSecondsTimer() {
  if (secondsTimer) {
    clearInterval(secondsTimer);
    secondsTimer = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (!getConfig().showProgressBar) return;
  if (document.hidden) {
    pauseProgressBar();
  } else {
    resumeProgressBar();
  }
}, { passive: true });

export function resetProgressBar() {
  const dur = (typeof getSlideDuration === 'function' ? (getSlideDuration() || SLIDE_DURATION) : SLIDE_DURATION);

  if (useSecondsMode()) {
    const el = ensureSecondsExists();
    if (!el) return;
    clearSecondsTimer();
    secondsPausedMs = 0;
    secondsEndAt = 0;
    el.removeAttribute('data-done');
    el.textContent = Math.ceil(dur / 1000).toString();
    setSlideStartTime(now());
    setRemainingTime(dur);
    return;
  }

  const bar = ensureProgressBarExists();
  if (!bar) return;

  __paused = false;
  clearRaf();
  bar.style.animationPlayState = 'paused';
  bar.style.transition = "none";
  bar.style.transform = "scaleX(0)";
  setSlideStartTime(now());
  setRemainingTime(dur);
  void bar.offsetWidth;
}

export function startProgressBarWithDuration(duration) {
  const dur = Math.max(0, duration ?? (typeof getSlideDuration === 'function' ? (getSlideDuration() || SLIDE_DURATION) : SLIDE_DURATION));

  if (useSecondsMode()) {
    const el = ensureSecondsExists();
    if (!el) return;
    clearSecondsTimer();
    const t0 = now();
    secondsRunId = (secondsRunId + 1) || 1;
    const runId = secondsRunId;
    const startIndex = (typeof getCurrentIndex === 'function') ? getCurrentIndex() : null;
    secondsEndAt = t0 + dur + 30;
    secondsPausedMs = 0;
    el.removeAttribute('data-done');
    el.textContent = Math.max(0, Math.ceil(dur / 1000)).toString();
    secondsTimer = setInterval(() => {
      if (runId !== secondsRunId) { clearSecondsTimer(); return; }
      const idxNow = (typeof getCurrentIndex === 'function') ? getCurrentIndex() : startIndex;
      if (startIndex != null && idxNow !== startIndex) { clearSecondsTimer(); return; }

      const t = secondsEndAt - now();
      const left = Math.ceil(Math.max(0, t) / 1000);
      if (t <= 0) {
        clearSecondsTimer();
        el.setAttribute('data-done', '1');
        el.textContent = "0";
      } else {
        el.textContent = left.toString();
      }
    }, 100);
    setSlideStartTime(t0);
    setRemainingTime(dur);
    return;
  }

  const bar = ensureProgressBarExists();
  if (!bar) return;

  __paused = false;
  clearRaf();

  const targetScale = targetScaleFromCfg();
  const t0 = now();
  setSlideStartTime(t0);
  setRemainingTime(dur);
  pausedProgressPct = 0;

  bar.style.animationPlayState = 'paused';
  bar.style.transition = 'none';
  bar.style.transform = 'scaleX(0)';
  requestAnimationFrame(() => {
    bar.style.transition = `transform ${dur}ms linear`;
    bar.style.transform = `scaleX(${targetScale})`;
  });
}

export function pauseProgressBar() {
  const dur = (typeof getSlideDuration === 'function' ? (getSlideDuration() || SLIDE_DURATION) : SLIDE_DURATION);

  if (useSecondsMode()) {
    const el = ensureSecondsExists();
    if (!el) return;
    if (secondsEndAt) {
      secondsPausedMs = Math.max(0, secondsEndAt - now());
    } else {
      secondsPausedMs = 0;
    }
    clearSecondsTimer();
    const t0 = getSlideStartTime?.() || now();
    const elapsed = Math.max(0, Math.min(dur, now() - t0));
    setRemainingTime(dur - elapsed);
    __paused = true;
    return;
  }

  const bar = ensureProgressBarExists();
  if (!bar) return;

  const t0 = getSlideStartTime?.() || now();
  const elapsed = Math.max(0, Math.min(dur, now() - t0));
  const doneFrac = dur > 0 ? (elapsed / dur) : 0;
  pausedProgressPct = Math.max(0, Math.min(100, doneFrac * 100));
  const targetScale = targetScaleFromCfg();
  const computedScale = getComputedScaleX(bar);
  const currentScale = Number.isFinite(computedScale) && computedScale > 0
    ? computedScale
    : (targetScale * (pausedProgressPct / 100));
  bar.style.animationPlayState = 'paused';
  bar.style.transition = 'none';
  bar.style.transform = `scaleX(${currentScale})`;
  frameLock(bar, currentScale);

  setRemainingTime(dur - elapsed);
  __paused = true;
}

export function resumeProgressBar() {
  const dur = (typeof getSlideDuration === 'function' ? (getSlideDuration() || SLIDE_DURATION) : SLIDE_DURATION);

  if (useSecondsMode()) {
    const el = ensureSecondsExists();
    if (!el) return;
    const remaining = secondsPausedMs > 0 ? secondsPausedMs : 0;
    const t0 = now();
    secondsEndAt = t0 + remaining + 30;
    clearSecondsTimer();
    el.removeAttribute('data-done');
    secondsTimer = setInterval(() => {
      const t = secondsEndAt - now();
      const left = Math.ceil(Math.max(0, t) / 1000);
      if (t <= 0) {
        clearSecondsTimer();
        el.setAttribute('data-done', '1');
        el.textContent = "0";
      } else {
        el.textContent = left.toString();
      }
    }, 100);
    setSlideStartTime(t0 - (dur - remaining));
    setRemainingTime(remaining);
    __paused = false;
    return;
  }

  const bar = ensureProgressBarExists();
  if (!bar) return;

  clearRaf();

  const prevRemaining = getRemainingTime?.();
  const total = dur;

  let remainingTime = typeof prevRemaining === 'number' && isFinite(prevRemaining)
    ? Math.max(0, Math.min(total, prevRemaining))
    : Math.max(0, (1 - (pausedProgressPct / 100)) * total);

  const targetScale = targetScaleFromCfg();
  const computedScale = getComputedScaleX(bar);
  const startScale =
    Number.isFinite(computedScale) && computedScale >= 0
      ? Math.max(0, Math.min(targetScale, computedScale))
      : Math.max(0, Math.min(1, (1 - (remainingTime / total)) * targetScale));

  bar.style.animationPlayState = 'paused';
  bar.style.transition = 'none';
  bar.style.transform = `scaleX(${startScale})`;

  const t0 = now();
  setSlideStartTime(t0 - (total - remainingTime));

  requestAnimationFrame(() => {
    bar.style.transition = `transform ${remainingTime}ms linear`;
    bar.style.transform = `scaleX(${targetScale})`;
  });

  __paused = false;
}
