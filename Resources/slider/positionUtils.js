import { getConfig } from "./config.js";
import { forceHomeSectionsTop } from './positionOverrides.js';

const config = getConfig();

export function applyContainerStyles(container, type = '') {
  const config = getConfig();
  let prefix;

  if (type === 'progress') {
    prefix = 'progressBar';
  } else if (type === 'progressSeconds') {
    prefix = 'progressSeconds';
  } else if (type) {
    prefix = `${type}Container`;
  } else {
    prefix = 'slide';
  }

  container.style.top    = config[`${prefix}Top`]    ? `${config[`${prefix}Top`]}%`    : '';
  container.style.left   = config[`${prefix}Left`]   ? `${config[`${prefix}Left`]}%`   : '';
  container.style.width  = config[`${prefix}Width`]  ? `${config[`${prefix}Width`]}%`  : '';
  container.style.height = config[`${prefix}Height`] ? `${config[`${prefix}Height`]}%` : '';

  if (type && type !== 'slide' && type !== 'progressSeconds' && type !== 'progress') {
    container.style.display        = config[`${prefix}Display`]        || '';
    container.style.flexDirection  = config[`${prefix}FlexDirection`]  || '';
    container.style.justifyContent = config[`${prefix}JustifyContent`] || '';
    container.style.alignItems     = config[`${prefix}AlignItems`]     || '';
    container.style.flexWrap       = config[`${prefix}FlexWrap`]       || '';
  }
}

export function updateSlidePosition() {
  const config = getConfig();

  const slidesContainer = document.querySelector("#slides-container");
  if (slidesContainer) applyContainerStyles(slidesContainer);

  const containerTypes = [
    'logo','meta','status','rating','plot',
    'title','director','info','button',
    'existingDot','provider','providericons'
  ];

  containerTypes.forEach(type => {
    document.querySelectorAll(`.${type}-container`).forEach(container => {
      applyContainerStyles(container, type);
    });
  });

  const sliderWrapper = document.querySelector(".slider-wrapper");
  if (sliderWrapper) applyContainerStyles(sliderWrapper, 'slider');

  const progressBar = document.querySelector(".slide-progress-bar");
  if (progressBar) applyContainerStyles(progressBar, 'progress');

  const progressSeconds = document.querySelector(".slide-progress-seconds");
  if (progressSeconds) applyContainerStyles(progressSeconds, 'progressSeconds');

  const homeSectionsContainer = document.querySelector(".homeSectionsContainer");
  if (homeSectionsContainer) {
    homeSectionsContainer.style.top = config.homeSectionsTop ? `${config.homeSectionsTop}vh` : '';
  }
}
