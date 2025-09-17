import {
  startSlideTimer,
  stopSlideTimer,
  pauseSlideTimer,
  resumeSlideTimer,
  SLIDE_DURATION,
} from "./timer.js";
import {
  ensureProgressBarExists,
  resetProgressBar,
  startProgressBarWithDuration,
  pauseProgressBar,
  resumeProgressBar,
} from "./progressBar.js";

export function setupVisibilityHandler() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      pauseSlideTimer();
      pauseProgressBar();
    } else {
      resumeSlideTimer();
      resumeProgressBar();
    }
  });
}

export function attachMouseEvents() {
  const indexPage = document.querySelector("#indexPage:not(.hide)");
  if (!indexPage) return;

  const slidesContainer = indexPage.querySelector("#slides-container");
  if (slidesContainer) {
    slidesContainer.addEventListener("mouseenter", () => {
      pauseSlideTimer(); pauseProgressBar();
    }, { passive: true });
    slidesContainer.addEventListener("mouseleave", () => {
      resumeSlideTimer(); resumeProgressBar();
    }, { passive: true });

    if (slidesContainer.matches(":hover")) {
      pauseSlideTimer();
      pauseProgressBar();
    }
  }

  indexPage.addEventListener('mouseover', (e) => {
    if (e.target?.closest?.('.slide')) { pauseSlideTimer(); pauseProgressBar(); }
  }, { passive: true });
  indexPage.addEventListener('mouseout', (e) => {
    if (e.target?.closest?.('.slide')) { resumeSlideTimer(); resumeProgressBar(); }
  }, { passive: true });
}
