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
      pauseSlideTimer();
      pauseProgressBar();
    });
    slidesContainer.addEventListener("mouseleave", () => {
      resumeSlideTimer();
      resumeProgressBar();
    });

    if (slidesContainer.matches(":hover")) {
      pauseSlideTimer();
      pauseProgressBar();
    }
  }

  const slides = indexPage.querySelectorAll(".slide");
  slides.forEach((slide) => {
    slide.addEventListener("mouseenter", () => {
      pauseSlideTimer();
      pauseProgressBar();
    });
    slide.addEventListener("mouseleave", () => {
      resumeSlideTimer();
      resumeProgressBar();
    });
  });
}
