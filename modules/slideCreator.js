import { getYoutubeEmbedUrl, getProviderUrl, isValidUrl, createTrailerIframe, debounce, getHighResImageUrls, prefetchImages, getHighestQualityBackdropIndex } from "./utils.js";
import { updateFavoriteStatus, updatePlayedStatus } from "./api.js";
import { getConfig } from "./config.js";
import { getLanguageLabels, getDefaultLanguage } from "../language/index.js";
import { createSlidesContainer, createGradientOverlay, createHorizontalGradientOverlay, createLogoContainer, createStatusContainer, createActorSlider, createInfoContainer, createDirectorContainer, createRatingContainer, createLanguageContainer, createMetaContainer, createMainContentContainer, createPlotContainer, createTitleContainer } from "./containerUtils.js";
import { createButtons, createProviderContainer } from './buttons.js';

const config = getConfig();
const settingsBackgroundSlides = [];

async function createSlide(item) {
  const indexPage = document.querySelector("#indexPage:not(.hide)");
  if (!indexPage) return;

  const slidesContainer = createSlidesContainer(indexPage);
  const itemId = item.Id;
  const {
    Overview,
    Type: itemType,
    People,
    UserData,
    MediaStreams,
    Name: title,
    RunTimeTicks,
    OriginalTitle,
    Taglines,
    Genres,
    ChildCount,
    ProductionYear,
    ProductionLocations,
    CommunityRating,
    CriticRating,
    OfficialRating,
    RemoteTrailers,
    ProviderIds
  } = item;

let highestQualityBackdropIndex;
  if (config.manualBackdropSelection) {
    highestQualityBackdropIndex = "0";
    console.log("Manuel arka plan seçimi aktif; highestQualityBackdropIndex devre dışı bırakıldı.");
  } else if (config.indexZeroSelection) {
    highestQualityBackdropIndex = "0";
    console.log("indexZeroSelection aktif; her zaman 0 indeksli görsel seçiliyor.");
  } else {
    highestQualityBackdropIndex = await getHighestQualityBackdropIndex(itemId);
    console.log("Otomatik arka plan seçimi aktif; seçilen index:", highestQualityBackdropIndex);
}

  function storeBackdropUrl(itemId, backdropUrl) {
    const storedUrls = JSON.parse(localStorage.getItem("backdropUrls")) || [];
    if (!storedUrls.includes(backdropUrl)) {
      storedUrls.push(backdropUrl);
      localStorage.setItem("backdropUrls", JSON.stringify(storedUrls));
    }
  }

  const autoBackdropUrl = `/Items/${itemId}/Images/Backdrop/${highestQualityBackdropIndex}`;
  const landscapeUrl = `/Items/${itemId}/Images/Thumb/0`;
  const primaryUrl = `/Items/${itemId}/Images/Primary`;
  let logoUrl = `/Items/${itemId}/Images/Logo`;
  const bannerUrl = `/Items/${itemId}/Images/Banner`;
  const artUrl = `/Items/${itemId}/Images/Art`;
  const discUrl = `/Items/${itemId}/Images/Disc`;

  let logoExists = true;
  try {
    const logoResponse = await fetch(logoUrl, { method: "HEAD" });
    logoExists = logoResponse.ok;
  } catch (err) {
    logoExists = false;
  }
  storeBackdropUrl(itemId, autoBackdropUrl);

  const manualBackdropUrl = {
    backdropUrl: `/Items/${itemId}/Images/Backdrop/0`,
    landscapeUrl: landscapeUrl,
    primaryUrl: primaryUrl,
    logoUrl: logoExists ? logoUrl : `/Items/${itemId}/Images/Backdrop/0`,
    bannerUrl: bannerUrl,
    artUrl: artUrl,
    discUrl: discUrl,
    none: ""
  }[config.backdropImageType];

  addSlideToSettingsBackground(itemId, autoBackdropUrl);

  const slide = document.createElement("div");
  slide.className = "slide";
  slide.style.position = "absolute";
  slide.style.display = "none";
  slide.dataset.detailUrl = `/web/#/details?id=${itemId}`;

  const selectedOverlayUrl = {
    backdropUrl: autoBackdropUrl,
    landscapeUrl: landscapeUrl,
    primaryUrl: primaryUrl,
    logoUrl: logoExists ? logoUrl : autoBackdropUrl,
    bannerUrl: bannerUrl,
    artUrl: artUrl,
    discUrl: discUrl,
    none: ""
  }[config.gradientOverlayImageType];

  slide.dataset.background = selectedOverlayUrl;
  slide.dataset.backdropUrl = autoBackdropUrl;
  slide.dataset.landscapeUrl = landscapeUrl;
  slide.dataset.primaryUrl = primaryUrl;
  slide.dataset.logoUrl = logoExists ? logoUrl : autoBackdropUrl;
  slide.dataset.bannerUrl = bannerUrl;
  slide.dataset.artUrl = artUrl;
  slide.dataset.discUrl = discUrl;

  const { backdropUrl, placeholderUrl } = await getHighResImageUrls(item, highestQualityBackdropIndex);
  if (slidesContainer.children.length === 0) {
    const preloadLink = document.createElement('link');
    preloadLink.rel = 'preload';
    preloadLink.as = 'image';
    preloadLink.href = backdropUrl;
    document.head.appendChild(preloadLink);
  } else {
    prefetchImages([backdropUrl]);
  }

  const backdropImg = document.createElement('img');
  backdropImg.className = 'backdrop';
  backdropImg.sizes = '100vw';
  backdropImg.alt = 'Backdrop';
  backdropImg.loading = 'lazy';
  backdropImg.style.opacity = '0';
  backdropImg.src = placeholderUrl;

  const io = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const finalBackdrop = config.manualBackdropSelection ? manualBackdropUrl : backdropUrl;
      backdropImg.src = finalBackdrop;
      backdropImg.onload = () => {
        backdropImg.style.transition = 'opacity 0.5s ease';
        backdropImg.style.opacity = '1';
      };
      observer.unobserve(backdropImg);
    }
  });
});
  io.observe(backdropImg);

  backdropImg.addEventListener('click', () => {
    window.location.href = slide.dataset.detailUrl;
  });

  slide.appendChild(backdropImg);

  const gradientOverlay = createGradientOverlay(selectedOverlayUrl);
  const horizontalGradientOverlay = createHorizontalGradientOverlay();

  slide.appendChild(backdropImg);
  slide.appendChild(gradientOverlay);
  slide.appendChild(horizontalGradientOverlay);
  slidesContainer.appendChild(slide);

  createTrailerIframe({
    config,
    RemoteTrailers: item.RemoteTrailers,
    slide,
    backdropImg
  });

  const commonImageStyle = {
    maxWidth: "100%",
    height: "auto",
    objectFit: "contain",
    aspectRatio: "1/1",
    display: "block"
  };

  function createLogoElement(fallback) {
    const logoImg = document.createElement("img");
    logoImg.className = "logo";
    logoImg.src = logoUrl;
    logoImg.alt = "";
    logoImg.loading = "lazy";
    Object.assign(logoImg.style, commonImageStyle, { aspectRatio: "initial" });
    logoImg.onerror = fallback;
    return logoImg;
  }

  function createDiskElement(fallback) {
    const discImg = document.createElement("img");
    discImg.className = "disk";
    discImg.src = discUrl;
    discImg.alt = "";
    discImg.loading = "lazy";
    Object.assign(discImg.style, commonImageStyle, {
      maxHeight: "75%",
      maxWidth: "75%",
      width: "auto",
      borderRadius: "50%"
    });
    discImg.onerror = fallback;
    return discImg;
  }

  function createTitleElement() {
    const titleDiv = document.createElement("div");
    titleDiv.className = "no-logo-container";
    titleDiv.textContent = OriginalTitle;
    titleDiv.style.display = "flex";
    titleDiv.style.alignItems = "center";
    titleDiv.style.justifyContent = "center";
    return titleDiv;
  }

  let order;
  if (config.showDiscOnly) {
    order = ["disk"];
  } else if (config.showTitleOnly) {
    order = ["originalTitle"];
  } else if (config.showLogoOrTitle) {
    order = config.displayOrder.split(",").map(item => item.trim());
  } else {
    order = [];
  }

  const logoContainer = createLogoContainer();
  function tryDisplayElement(index) {
    if (index >= order.length) return;
    const type = order[index];
    if (type === "logo" && config.showLogoOrTitle) {
      const element = createLogoElement(() => {
        logoContainer.innerHTML = "";
        tryDisplayElement(index + 1);
      });
      logoContainer.appendChild(element);
    } else if (type === "disk" && (config.showDiscOnly || config.showLogoOrTitle)) {
      const element = createDiskElement(() => {
        logoContainer.innerHTML = "";
        tryDisplayElement(index + 1);
      });
      logoContainer.appendChild(element);
    } else if (type === "originalTitle" && (config.showTitleOnly || config.showLogoOrTitle)) {
      const element = createTitleElement();
      logoContainer.appendChild(element);
    } else {
      tryDisplayElement(index + 1);
    }
  }
  tryDisplayElement(0);

  const buttonContainer = createButtons(
    slide,
    config,
    UserData,
    itemId,
    RemoteTrailers,
    updatePlayedStatus,
    updateFavoriteStatus,
    openTrailerModal
  );
  document.body.appendChild(buttonContainer);

  const plotContainer = createPlotContainer(config, Overview);
  const titleContainer = createTitleContainer({
    config,
    Taglines: item.Taglines,
    title: item.Name,
    OriginalTitle: item.OriginalTitle
  });

  const statusContainer = createStatusContainer(
    itemType,
    config,
    UserData,
    ChildCount,
    RunTimeTicks,
    MediaStreams
  );

  const actorSlider = createActorSlider(People, getConfig());
  slide.appendChild(actorSlider);

  const infoContainer = createInfoContainer({
    config,
    Genres: item.Genres,
    ProductionYear: item.ProductionYear,
    ProductionLocations: item.ProductionLocations
  });
  slide.appendChild(infoContainer);

  const directorContainer = createDirectorContainer({
    config,
    People: item.People
  });

  const { container: ratingContainer, ratingExists } = createRatingContainer({
    config,
    CommunityRating: item.CommunityRating,
    CriticRating: item.CriticRating,
    OfficialRating: item.OfficialRating
  });

  const providerContainer = createProviderContainer({
  config,
  ProviderIds: item.ProviderIds,
  RemoteTrailers: item.RemoteTrailers,
  itemId: item.Id,
  slide: slide
});

  const languageContainer = createLanguageContainer({
    config,
    MediaStreams: item.MediaStreams,
    itemType: item.Type
  });

  const metaContainer = createMetaContainer();
  if (statusContainer) metaContainer.appendChild(statusContainer);
  if (ratingExists) metaContainer.appendChild(ratingContainer);
  if (languageContainer) metaContainer.appendChild(languageContainer);

  const mainContentContainer = createMainContentContainer();
  mainContentContainer.append(logoContainer, titleContainer, plotContainer, providerContainer);

  slide.append(
    gradientOverlay,
    infoContainer,
    directorContainer,
    backdropImg,
    metaContainer,
    mainContentContainer,
    buttonContainer,
    actorSlider
  );
  slidesContainer.appendChild(slide);

  console.log(`Item ${itemId} slide eklendi.`);
  if (slidesContainer.children.length === 1) {
    import("./navigation.js").then(mod => mod.displaySlide(0));
  }
}

function addSlideToSettingsBackground(itemId, backdropUrl) {
  const settingsSlider = document.getElementById("settingsBackgroundSlider");
  if (!settingsSlider) return;
  const existingSlide = settingsSlider.querySelector(`[data-item-id="${itemId}"]`);
  if (existingSlide) return;
  const slide = document.createElement("div");
  slide.className = "slide";
  slide.dataset.itemId = itemId;
  slide.style.backgroundImage = `url('${backdropUrl}')`;
  const img = new Image();
  img.src = backdropUrl;
  img.onerror = () => {
    if (slide.parentNode) {
      slide.parentNode.removeChild(slide);
    }
  };
  settingsSlider.appendChild(slide);
  if (settingsSlider.children.length === 1) {
    slide.classList.add("active");
  }
}

function openTrailerModal(trailerUrl, trailerName) {
  const embedUrl = getYoutubeEmbedUrl(trailerUrl);
  const overlay = document.createElement("div");
  overlay.className = "trailer-modal-overlay";
  overlay.style.opacity = "0";
  overlay.style.transition = "opacity 1s ease-in-out";
  const modal = document.createElement("div");
  modal.className = "trailer-modal";
  const closeBtn = document.createElement("button");
  closeBtn.className = "trailer-modal-close";
  closeBtn.innerHTML = "×";
  closeBtn.addEventListener("click", () => {
    document.body.removeChild(overlay);
    document.removeEventListener("keydown", escListener);
  });
  const iframe = document.createElement("iframe");
  iframe.src = embedUrl;
  iframe.title = trailerName;
  iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
  iframe.allowFullscreen = true;
  Object.assign(iframe.style, { width: "100%", height: "100%", border: "none" });
  modal.appendChild(closeBtn);
  modal.appendChild(iframe);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  setTimeout(() => {
    overlay.style.opacity = "1";
  }, 1000);
  const escListener = (e) => {
    if (e.key === "Escape" || e.keyCode === 27) {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
      document.removeEventListener("keydown", escListener);
    }
  };
  document.addEventListener("keydown", escListener);
}

export { createSlide, openTrailerModal };
