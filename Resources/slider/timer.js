import {
  resetProgressBar,
  startProgressBarWithDuration,
  pauseProgressBar,
  resumeProgressBar,
} from "./progressBar.js";
import { changeSlide } from "./navigation.js";
import { getCurrentIndex } from "./sliderState.js";
import { getConfig } from "./config.js";

export const SLIDE_DURATION = getConfig().sliderDuration;

let autoSlideTimeout = null;
let slideStartTime = 0;
let remainingTime = 0;

export function clearAllTimers() {
  try {
    if (autoSlideTimeout) {
      clearTimeout(autoSlideTimeout);
      autoSlideTimeout = null;
    }
    if (window.intervalChangeSlide) {
      clearInterval(window.intervalChangeSlide);
      window.intervalChangeSlide = null;
    }
    if (window.sliderTimeout) {
      clearTimeout(window.sliderTimeout);
      window.sliderTimeout = null;
    }
    if (window.autoSlideTimeout) {
      clearTimeout(window.autoSlideTimeout);
      window.autoSlideTimeout = null;
    }
  } catch {}
}


if (!window.__sliderVisibilityBound) {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      pauseSlideTimer(); pauseProgressBar();
    } else {
      resumeSlideTimer(); resumeProgressBar();
    }
  });
  window.__sliderVisibilityBound = true;
}

export function startSlideTimer() {
  clearAllTimers();
  remainingTime = SLIDE_DURATION;
  slideStartTime = Date.now();

  resetProgressBar();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      startProgressBarWithDuration(remainingTime);
    });
  });
  autoSlideTimeout = setTimeout(handleAutoAdvance, remainingTime);
  window.mySlider = window.mySlider || {};
  window.mySlider.autoSlideTimeout = autoSlideTimeout;
}

function handleAutoAdvance() {
  const ev = new CustomEvent("jms:per-slide-complete", { cancelable: true });
  document.dispatchEvent(ev);
  if (ev.defaultPrevented) {
    return;
  }
  try {
    changeSlide(1);
  } finally {
    startSlideTimer();
  }
}

export function stopSlideTimer() {
  clearAllTimers();
}

export function pauseSlideTimer() {
  if (autoSlideTimeout) {
    clearTimeout(autoSlideTimeout);
    autoSlideTimeout = null;

    const elapsed = Date.now() - slideStartTime;
    remainingTime = Math.max(remainingTime - elapsed, 0);

    window.mySlider = window.mySlider || {};
    window.mySlider.autoSlideTimeout = null;
  }
}

export function resumeSlideTimer() {
  if (!autoSlideTimeout && remainingTime > 0) {
    slideStartTime = Date.now();
    resumeProgressBar();

    autoSlideTimeout = setTimeout(() => {
      handleAutoAdvance();
    }, remainingTime);

    window.mySlider = window.mySlider || {};
    window.mySlider.autoSlideTimeout = autoSlideTimeout;
  }
}
