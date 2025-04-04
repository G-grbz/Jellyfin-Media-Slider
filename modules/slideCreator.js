import { getYoutubeEmbedUrl, getProviderUrl } from "./utils.js";
import { updateFavoriteStatus } from "./api.js";
import { getConfig } from "./config.js";
import { getLanguageLabels, getDefaultLanguage } from "../language/index.js";

const config = getConfig();
const settingsBackgroundSlides = [];
async function createSlide(item) {
  const indexPage = document.querySelector("#indexPage:not(.hide)");
  if (!indexPage) return;

  let slidesContainer = indexPage.querySelector("#slides-container");
  if (!slidesContainer) {
    slidesContainer = document.createElement("div");
    slidesContainer.id = "slides-container";
    indexPage.insertBefore(slidesContainer, indexPage.firstChild);
  }

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
  } else {
    highestQualityBackdropIndex = await import("./api.js").then(mod => mod.getHighestQualityBackdropIndex(itemId));
    console.log("Otomatik arka plan seçimi aktif; seçilen index:", highestQualityBackdropIndex);
  }

  function storeBackdropUrl(itemId, backdropUrl) {
  const storedUrls = JSON.parse(localStorage.getItem('backdropUrls')) || [];
  if (!storedUrls.includes(backdropUrl)) {
    storedUrls.push(backdropUrl);
    localStorage.setItem('backdropUrls', JSON.stringify(storedUrls));
  }
}

  const autoBackdropUrl = `${window.location.origin}/Items/${itemId}/Images/Backdrop/${highestQualityBackdropIndex}`;
  const landscapeUrl = `${window.location.origin}/Items/${itemId}/Images/Thumb/0`;
  const primaryUrl = `${window.location.origin}/Items/${itemId}/Images/Primary`;
  let logoUrl = `${window.location.origin}/Items/${itemId}/Images/Logo`;
  const bannerUrl = `${window.location.origin}/Items/${itemId}/Images/Banner`;
  const artUrl = `${window.location.origin}/Items/${itemId}/Images/Art`;
  const discUrl = `${window.location.origin}/Items/${itemId}/Images/Disc`;

  let logoExists = true;
  try {
    const logoResponse = await fetch(logoUrl, { method: "HEAD" });
    logoExists = logoResponse.ok;
  } catch (err) {
    logoExists = false;
  }
  storeBackdropUrl(itemId, autoBackdropUrl);

  const manualBackdropUrl = {
    backdropUrl: `${window.location.origin}/Items/${itemId}/Images/Backdrop/0`,
    landscapeUrl: landscapeUrl,
    primaryUrl: primaryUrl,
    logoUrl: logoExists ? logoUrl : `${window.location.origin}/Items/${itemId}/Images/Backdrop/0`,
    bannerUrl: bannerUrl,
    artUrl: artUrl,
    discUrl: discUrl,
    none: ''
  }[config.backdropImageType];

  addSlideToSettingsBackground(itemId, autoBackdropUrl);

  const slide = document.createElement("div");
  slide.className = "slide";
  slide.style.position = "absolute";
  slide.style.display = "none";
  slide.dataset.detailUrl = `${window.location.origin}/web/#/details?id=${itemId}`;

  const selectedOverlayUrl = {
    backdropUrl: autoBackdropUrl,
    landscapeUrl: landscapeUrl,
    primaryUrl: primaryUrl,
    logoUrl: logoExists ? logoUrl : autoBackdropUrl,
    bannerUrl: bannerUrl,
    artUrl: artUrl,
    discUrl: discUrl,
    none: ''
  }[config.gradientOverlayImageType];

  slide.dataset.background = selectedOverlayUrl;
  slide.dataset.backdropUrl = autoBackdropUrl;
  slide.dataset.landscapeUrl = landscapeUrl;
  slide.dataset.primaryUrl = primaryUrl;
  slide.dataset.logoUrl = logoExists ? logoUrl : autoBackdropUrl;
  slide.dataset.bannerUrl = bannerUrl;
  slide.dataset.artUrl = artUrl;
  slide.dataset.discUrl = discUrl;

  const backdropImg = document.createElement("img");
  backdropImg.className = "backdrop";
  backdropImg.sizes = "100vw";
  backdropImg.alt = "Backdrop";
  backdropImg.loading = "lazy";
  backdropImg.style.opacity = "0";

  const gradientOverlay = document.createElement("div");
  gradientOverlay.className = "gradient-overlay";

  function setGradientOverlay(imageUrl) {
    if (!imageUrl) {
      gradientOverlay.style.backgroundImage = "none";
      return;
    }

    gradientOverlay.style.backgroundImage = `url(${imageUrl})`;
    gradientOverlay.style.backgroundRepeat = 'no-repeat';
    gradientOverlay.style.backgroundPosition = '50%';
    gradientOverlay.style.backgroundSize = 'cover';
    gradientOverlay.style.aspectRatio = '1 / 1';
    gradientOverlay.style.filter = "brightness(0.8)";
  }

  if (config.manualBackdropSelection) {
    backdropImg.src = manualBackdropUrl;
    console.log("backdropImg.src, manuel modda manualBackdropUrl ile ayarlandı:", manualBackdropUrl);
  } else {
    backdropImg.src = autoBackdropUrl;
    console.log("backdropImg.src, otomatik modda autoBackdropUrl ile ayarlandı:", autoBackdropUrl);
  }
  backdropImg.onload = () => { backdropImg.style.opacity = "1"; };

  setGradientOverlay(selectedOverlayUrl);

  const horizontalGradientOverlay = document.createElement("div");
  horizontalGradientOverlay.className = "horizontal-gradient-overlay";
  horizontalGradientOverlay.style.position = "absolute";
  horizontalGradientOverlay.style.top = "0";
  horizontalGradientOverlay.style.left = "0";
  horizontalGradientOverlay.style.width = "100%";
  horizontalGradientOverlay.style.height = "100%";
  horizontalGradientOverlay.style.background = "linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)";
  horizontalGradientOverlay.style.pointerEvents = "none";
  horizontalGradientOverlay.style.zIndex = "3";
  horizontalGradientOverlay.style.opacity = "0.9";
  horizontalGradientOverlay.style.mixBlendMode = "multiply";

  slide.appendChild(backdropImg);
  slide.appendChild(gradientOverlay);
  slide.appendChild(horizontalGradientOverlay);
  slidesContainer.appendChild(slide);

  if (config.enableTrailerPlayback && RemoteTrailers && RemoteTrailers.length > 0) {
    const trailer = RemoteTrailers[0];
    const trailerIframe = document.createElement("iframe");
    trailerIframe.title = trailer.Name;
    trailerIframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    trailerIframe.allowFullscreen = true;
    Object.assign(trailerIframe.style, { width: "70%", height: "100%", border: "none", display: "none", position: "absolute", top: "0%", right: "0%" });
    slide.appendChild(trailerIframe);
    let trailerPlaying = false;
    let enterTimeout = null;
    backdropImg.addEventListener("mouseenter", () => {
      enterTimeout = setTimeout(() => {
        backdropImg.style.opacity = "0";
        trailerIframe.style.display = "block";
        trailerIframe.src = getYoutubeEmbedUrl(trailer.Url);
        slide.classList.add("trailer-active");
        trailerPlaying = true;
      }, 1000);
    });
    backdropImg.addEventListener("mouseleave", () => {
      if (enterTimeout) {
        clearTimeout(enterTimeout);
        enterTimeout = null;
      }
      if (trailerPlaying) {
        trailerIframe.style.display = "none";
        trailerIframe.src = "";
        backdropImg.style.opacity = "1";
        slide.classList.remove("trailer-active");
        trailerPlaying = false;
      }
    });
  }

const logoContainer = document.createElement("div");
logoContainer.className = "logo-container";

const commonImageStyle = {
  maxWidth: "100%",
  height: "auto",
  objectFit: "contain",
  aspectRatio: "1/1",
  display: "block",
};

if (config.showLogoOrTitle) {
  const logoImg = document.createElement("img");
  logoImg.className = "logo";
  logoImg.src = logoUrl;
  logoImg.alt = "";
  logoImg.loading = "lazy";

  Object.assign(logoImg.style, commonImageStyle, {
    aspectRatio: "initial"
  });

  logoImg.onerror = () => {
    console.log("Logo yüklenemedi, disk resmi deneniyor.");
    logoContainer.innerHTML = "";

    const discImg = document.createElement("img");
    discImg.className = "disk";
    discImg.src = discUrl;
    discImg.alt = "";
    discImg.loading = "lazy";

    Object.assign(discImg.style, commonImageStyle, {
      maxHeight: "100%",
      width: "auto",
      borderRadius: "50%"
    });

    discImg.onerror = () => {
      console.log("Disc yüklenemedi, başlık gösterilecek.");
      const logoDiv = document.createElement("div");
      logoDiv.className = "no-logo-container";
      logoDiv.textContent = OriginalTitle;
      logoDiv.style.display = "flex";
      logoDiv.style.alignItems = "center";
      logoDiv.style.justifyContent = "center";
      logoContainer.appendChild(logoDiv);
    };

    logoContainer.appendChild(discImg);
  };

  logoContainer.appendChild(logoImg);
} else if (config.showDiscOnly) {
  const discImg = document.createElement("img");
  discImg.className = "disk";
  discImg.src = discUrl;
  discImg.alt = "";
  discImg.loading = "lazy";

  Object.assign(discImg.style, commonImageStyle, {
    maxHeight: "100%",
    width: "auto",
    borderRadius: "50%"
  });

  discImg.onerror = () => {
    const logoDiv = document.createElement("div");
    logoDiv.className = "no-logo-container";
    logoDiv.textContent = OriginalTitle;
    logoDiv.style.display = "flex";
    logoDiv.style.alignItems = "center";
    logoDiv.style.justifyContent = "center";
    logoContainer.appendChild(logoDiv);
  };

  logoContainer.appendChild(discImg);
} else if (config.showTitleOnly) {
  const logoDiv = document.createElement("div");
  logoDiv.className = "no-logo-container";
  logoDiv.textContent = OriginalTitle;
  logoDiv.style.display = "flex";
  logoDiv.style.alignItems = "center";
  logoDiv.style.justifyContent = "center";
  logoContainer.appendChild(logoDiv);
} else {
  logoContainer.style.display = "none";
}

  const buttonContainer = document.createElement("div");
  buttonContainer.className = "button-container";

  if (config.showFavoriteButton) {
    const isFavorited = UserData && UserData.IsFavorite;
    const favoriteBtn = document.createElement("button");
    favoriteBtn.className = "favorite-btn";
    const favoriBgType = config.favoriBackgroundImageType || "backdropUrl";
    let favoriBgImage = "";
    if (favoriBgType !== "none") {
      favoriBgImage = slide.dataset[favoriBgType];
    }
    if (favoriBgImage) {
      favoriteBtn.style.backgroundImage = `linear-gradient(to right, rgba(0,0,0,1), rgba(0,0,0,0.5), rgba(0,0,0,0)), url(${favoriBgImage})`;
    } else {
      favoriteBtn.style.backgroundImage = "linear-gradient(to right, rgba(0,0,0,1), rgba(0,0,0,0.5), rgba(0,0,0,0))";
    }
    favoriteBtn.style.backgroundRepeat = 'no-repeat, no-repeat';
    favoriteBtn.style.backgroundPosition = 'left center, left 20%';
    favoriteBtn.style.backgroundSize = '100% 100%, 100% auto';
    favoriteBtn.innerHTML = isFavorited
      ? '<i class="fa-solid fa-heart fa-xl" style="color: #d60a47;"></i>'
      : '<i class="fa-light fa-heart fa-xl"></i>';
    if (isFavorited) favoriteBtn.classList.add("favorited");
    favoriteBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (favoriteBtn.classList.contains("favorited")) {
        favoriteBtn.classList.remove("favorited");
        favoriteBtn.innerHTML = '<i class="fa-light fa-heart fa-xl"></i>';
        updateFavoriteStatus(itemId, false);
      } else {
        favoriteBtn.classList.add("favorited");
        favoriteBtn.innerHTML = '<i class="fa-solid fa-heart fa-xl" style="color: #d60a47;"></i>';
        updateFavoriteStatus(itemId, true);
      }
    });
    buttonContainer.appendChild(favoriteBtn);
  }

  if (config.showWatchButton) {
    const watchBtn = document.createElement("button");
    watchBtn.className = "watch-btn";
    const watchBgType = config.watchBackgroundImageType || "backdropUrl";
    let watchBgImage = "";
    if (watchBgType !== "none") {
      watchBgImage = slide.dataset[watchBgType];
    }
    if (watchBgImage) {
      watchBtn.style.backgroundImage = `linear-gradient(to right, rgba(0,0,0,1), rgba(0,0,0,0.5), rgba(0,0,0,0)), url(${watchBgImage})`;
    } else {
      watchBtn.style.backgroundImage = "linear-gradient(to right, rgba(0,0,0,1), rgba(0,0,0,0.5), rgba(0,0,0,0))";
    }
    watchBtn.style.backgroundRepeat = 'no-repeat, no-repeat';
    watchBtn.style.backgroundPosition = 'left center, left 20%';
    watchBtn.style.backgroundSize = '100% 100%, 100% auto';
    watchBtn.innerHTML = `
      <span class="icon-wrapper">
        <i class="fa-regular fa-circle-play fa-xl icon" style="margin-right: 8px;"></i>
      </span>
      <span class="btn-text">${config.languageLabels.izle}</span>
    `;
    watchBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.location.href = slide.dataset.detailUrl;
    });
    buttonContainer.appendChild(watchBtn);
  }

  if (config.showTrailerButton && RemoteTrailers && RemoteTrailers.length > 0) {
    const trailer = RemoteTrailers[0];
    const trailerBtn = document.createElement("button");
    trailerBtn.className = "trailer-btn";
    const trailerBgType = config.trailerBackgroundImageType || "backdropUrl";
    let trailerBgImage = "";
    if (trailerBgType !== "none") {
      trailerBgImage = slide.dataset[trailerBgType];
    }
    if (trailerBgImage) {
      trailerBtn.style.backgroundImage = `linear-gradient(to right, rgba(0,0,0,1), rgba(0,0,0,0.5), rgba(0,0,0,0)), url(${trailerBgImage})`;
    } else {
      trailerBtn.style.backgroundImage = "linear-gradient(to right, rgba(0,0,0,1), rgba(0,0,0,0.5), rgba(0,0,0,0))";
    }
    trailerBtn.style.backgroundRepeat = 'no-repeat, no-repeat';
    trailerBtn.style.backgroundPosition = 'left center, left 20%';
    trailerBtn.style.backgroundSize = '100% 100%, 100% auto';
    trailerBtn.innerHTML = `
      <span class="icon-wrapper">
        <i class="fa-solid fa-film fa-xl icon"></i>
      </span>
      <span class="btn-text">${config.languageLabels.fragman}</span>
    `;
    trailerBtn.style.transition = 'all 1s ease-in-out';
    trailerBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openTrailerModal(trailer.Url, trailer.Name);
    });
    buttonContainer.appendChild(trailerBtn);
  }
  document.body.appendChild(buttonContainer);

  const plotContainer = document.createElement("div");
  plotContainer.className = "plot-container";
  if (config.showDescriptions && config.showPlotInfo && Overview) {
    if (config.showbPlotInfo && config.languageLabels.konu) {
      const plotBSpan = document.createElement("span");
      plotBSpan.className = "plotb";
      plotBSpan.textContent = config.languageLabels.konu;
      plotContainer.appendChild(plotBSpan);
    }
    const plotSpan = document.createElement("span");
    plotSpan.className = "plot";
    plotSpan.textContent = "\u00A0\u00A0" + Overview;
    plotContainer.appendChild(plotSpan);
  }

  let sloganSpan = null;
  if (Taglines && Taglines.length && config.showDescriptions && config.showSloganInfo) {
    sloganSpan = document.createElement("span");
    sloganSpan.className = "slogan";
    sloganSpan.innerHTML = `“ ${Taglines.join(' <i class="fa-solid fa-sparkle fa-2xs" style="color: #ffffff;"></i> ')} ”`;
  }

  const titleContainer = document.createElement("div");
  titleContainer.className = "baslik-container";
  if (config.showDescriptions && config.showTitleInfo && title) {
    const titleSpan = document.createElement("span");
    titleSpan.className = "baslik";
    titleSpan.textContent = title;
    titleContainer.appendChild(titleSpan);
  }
  if (sloganSpan) {
    titleContainer.appendChild(sloganSpan);
  }
  if (config.showDescriptions && config.showOriginalTitleInfo && OriginalTitle) {
    if (!config.hideOriginalTitleIfSame || title !== OriginalTitle) {
      const originalTitleSpan = document.createElement("span");
      originalTitleSpan.className = "o.baslik";
      originalTitleSpan.textContent = OriginalTitle;
      titleContainer.appendChild(originalTitleSpan);
    }
  }

  const statusContainer = document.createElement("div");
  statusContainer.className = "status-container";

  if (itemType && config.showTypeInfo) {
    const typeSpan = document.createElement("span");
    typeSpan.className = "type";
    const typeTranslations = {
      Series: { text: config.languageLabels.dizi, icon: '<i class="fas fa-tv"></i>' },
      BoxSet: { text: config.languageLabels.boxset, icon: '<i class="fas fa-film"></i>' },
      Movie: { text: config.languageLabels.film, icon: '<i class="fas fa-film"></i>' }
    };
    const typeInfo = typeTranslations[itemType] || { text: itemType, icon: "" };
    typeSpan.innerHTML = `${typeInfo.icon} ${typeInfo.text}`;
    if (itemType === "Series" && ChildCount) {
      typeSpan.innerHTML += ` (${ChildCount} ${config.languageLabels.sezon})`;
    }
    if (itemType === "BoxSet" && ChildCount) {
      typeSpan.innerHTML += ` (${ChildCount} ${config.languageLabels.seri})`;
    }
    statusContainer.appendChild(typeSpan);
  }

  if (UserData && config.showWatchedInfo) {
    const watchedSpan = document.createElement("span");
    watchedSpan.className = "watched-status";
    watchedSpan.innerHTML = UserData.Played
      ? `<i class="fa-light fa-circle-check"></i> ${config.languageLabels.izlendi}`
      : `<i class="fa-light fa-circle-xmark"></i> ${config.languageLabels.izlenmedi}`;
    statusContainer.appendChild(watchedSpan);
  }

  if (RunTimeTicks && config.showRuntimeInfo) {
    const runtimeSpan = document.createElement("span");
    runtimeSpan.className = config.languageLabels.sure;
    const calcRuntime = (ticks) => {
      const totalMinutes = Math.floor(ticks / 600000000);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return hours > 0 ? `${hours}${config.languageLabels.sa} ${minutes}${config.languageLabels.dk}` : `${minutes}${config.languageLabels.dk}`;
    };
    runtimeSpan.innerHTML = `<i class="fa-regular fa-hourglass-end"></i> ${
      Array.isArray(RunTimeTicks)
        ? RunTimeTicks.map(val => calcRuntime(val)).join(", ")
        : calcRuntime(RunTimeTicks)
    }`;
    statusContainer.appendChild(runtimeSpan);
  }

  const videoStream = MediaStreams ? MediaStreams.find(s => s.Type === "Video") : null;
  if (videoStream && config.showQualityInfo) {
    const qualitySpan = document.createElement("span");
    qualitySpan.className = "video-quality";
    let baseQuality = "SD";
    if (videoStream.Width >= 3840) {
      baseQuality = "4K";
    } else if (videoStream.Width >= 2560) {
      baseQuality = "2K";
    } else if (videoStream.Width >= 1920) {
      baseQuality = "FullHD";
    } else if (videoStream.Width >= 1280) {
      baseQuality = "HD";
    }
    let qualityText = baseQuality;
    if (config.showQualityDetail) {
      if (videoStream.Codec) qualityText += ` ${videoStream.Codec}`;
      if (videoStream.VideoRangeType) qualityText += ` ${videoStream.VideoRangeType}`;
    }
    const qualityIcon = videoStream.Width < 1280
      ? `<i class="fa-regular fa-standard-definition"></i>`
      : `<i class="fa-regular fa-high-definition"></i>`;
    qualitySpan.innerHTML = `${qualityIcon} ${qualityText}`;
    statusContainer.appendChild(qualitySpan);
  }

  let actorContainer = document.createElement("div");
actorContainer.className = "artist-container";
if (People && config.showActorInfo) {
  const actors = People.filter(p => p.Type === "Actor").slice(0, getConfig().artistLimit || 3);
  if (actors.length) {
    const actorNames = actors.map(a => a.Name).join(' <i class="fa-solid fa-sparkle fa-2xs" style="color: #ffffff;"></i> ');
    const actorsSpan = document.createElement("span");
    actorsSpan.className = "artists";
    actorsSpan.innerHTML = actorNames;
    actorContainer.appendChild(actorsSpan);
  }
}

  const infoContainer = document.createElement("div");
  infoContainer.className = "info-container";

  if (Genres && Genres.length && config.showGenresInfo) {
    const genresSpan = document.createElement("span");
    genresSpan.className = "genres";
    genresSpan.innerHTML = `<i class="fa-regular fa-masks-theater"></i> ${Genres
      .map(genre => config.languageLabels.turler[genre] || genre)
      .join(', ')} <i class="fa-solid fa-sparkle fa-2xs" style="color: #ffffff;"></i>`;
    infoContainer.appendChild(genresSpan);
  }

  if (ProductionYear && config.showYearInfo) {
    const yearSpan = document.createElement("span");
    yearSpan.className = "yil";
    yearSpan.innerHTML = `<i class="fa-regular fa-calendar"></i> ${
      Array.isArray(ProductionYear)
        ? ProductionYear.join('<i class="fa-solid fa-sparkle fa-2xs" style="color: #ffffff;"></i>')
        : ProductionYear
    } <i class="fa-solid fa-sparkle fa-2xs" style="color: #ffffff;"></i>`;
    infoContainer.appendChild(yearSpan);
  }

  if (ProductionLocations && config.showCountryInfo) {
    const countrySpan = document.createElement("span");
    countrySpan.className = "ulke";
    function getFlagEmoji(countryCode) {
      return countryCode
        ? countryCode.toUpperCase().split('').map(char => String.fromCodePoint(127397 + char.charCodeAt())).join('')
        : '';
    }
    countrySpan.innerHTML = `<i class="fa-regular fa-location-dot"></i> ${
      Array.isArray(ProductionLocations)
        ? ProductionLocations.map(c => {
            const info = config.languageLabels.ulke[c] || { code: c.slice(0, 2).toUpperCase(), name: c };
            return `${getFlagEmoji(info.code)} ${info.name}`;
          }).join(' <i class="fa-solid fa-sparkle fa-2xs" style="color: #ffffff;"></i> ')
        : (() => {
            const info = config.languageLabels.ulke[ProductionLocations] || { code: ProductionLocations.slice(0, 2).toUpperCase(), name: ProductionLocations };
            return `${getFlagEmoji(info.code)} ${info.name}`;
          })()
    }`;
    infoContainer.appendChild(countrySpan);
  }

  const directorContainer = document.createElement("div");
  directorContainer.className = "director-container";
  if (People && People.length > 0 && config.showDirectorWriter) {
    if (config.showDirector) {
      const directors = People.filter(person => person.Type && person.Type.toLowerCase() === "director");
      if (directors.length) {
        const directorNames = directors.map(director => director.Name).join(", ");
        const yonetmenSpan = document.createElement("span");
        yonetmenSpan.className = "yonetmen";
        yonetmenSpan.textContent = `${config.languageLabels.yonetmen}: ${directorNames}`;
        directorContainer.appendChild(yonetmenSpan);
      }
    }
    if (config.showWriter) {
      const writers = People.filter(person => person.Type && person.Type.toLowerCase() === "writer");
      const matchingWriters = writers.filter(writer => config.allowedWriters.includes(writer.Name.toLowerCase()));
      if (matchingWriters.length) {
        const writerNames = matchingWriters.map(writer => writer.Name).join(", ");
        const writerSpan = document.createElement("span");
        writerSpan.className = "writer";
        writerSpan.textContent = `${writerNames} ${config.languageLabels.yazar}  ...`;
        directorContainer.appendChild(writerSpan);
      }
    }
  }

  let ratingExists = false;
  const ratingContainer = document.createElement("div");
  ratingContainer.className = "rating-container";
  if (config.showRatingInfo) {
    if (config.showCommunityRating && CommunityRating) {
      let ratingValue;
      if (Array.isArray(CommunityRating)) {
        const avg = CommunityRating.reduce((acc, num) => acc + num, 0) / CommunityRating.length;
        ratingValue = Math.round(avg * 10) / 10;
      } else {
        ratingValue = Math.round(CommunityRating * 10) / 10;
      }
      ratingExists = true;
      const ratingPercentage = (typeof ratingValue === "number") ? (ratingValue * 9.5) : 0;
      const ratingSpan = document.createElement("span");
      ratingSpan.className = "rating";
      ratingSpan.innerHTML = `
        <span class="star-rating" style="position: relative; display: inline-block; font-size: 1em; color: #ccc;">
          <i class="fa-regular fa-star"></i>
          <span class="star-filled" style="position: absolute; bottom: 0; left: 0; width: 100%; color: gold; overflow: hidden; clip-path: inset(${100 - ratingPercentage}% 0 0 0);">
            <i class="fa-solid fa-star" style="display: block;"></i>
          </span>
        </span>
        ${ratingValue} <i class="fa-solid fa-sparkle fa-2xs" style="color: #ffffff;"></i>
      `;
      ratingContainer.appendChild(ratingSpan);
    }
    if (config.showCriticRating && CriticRating) {
      ratingExists = true;
      const tomatoRatingSpan = document.createElement("span");
      tomatoRatingSpan.className = "t-rating";
      tomatoRatingSpan.innerHTML = `<i class="fa-duotone fa-solid fa-tomato" style="--fa-primary-color: #01902e; --fa-secondary-color: #f93208; --fa-secondary-opacity: 1;"></i> ${
        Array.isArray(CriticRating) ? CriticRating.join(", ") : CriticRating
      } <i class="fa-solid fa-sparkle fa-2xs" style="color: #ffffff;"></i>`;
      ratingContainer.appendChild(tomatoRatingSpan);
    }
    if (config.showOfficialRating && OfficialRating) {
      ratingExists = true;
      const officialRatingSpan = document.createElement("span");
      officialRatingSpan.className = "officialrating";
      officialRatingSpan.innerHTML = `<i class="fa-solid fa-family"></i> ${
        Array.isArray(OfficialRating) ? OfficialRating.join(", ") : OfficialRating
      }`;
      ratingContainer.appendChild(officialRatingSpan);
    }
  }
  if (ratingExists) {
  }

  let providerContainer = null;
  if (config.showProviderInfo && ProviderIds) {
    const allowedProviders = ["Imdb", "Tmdb", "Tvdb"];
    const providerDiv = document.createElement("div");
    providerDiv.className = "provider-ids";
    const providerIdsTranslations = {
      Imdb: { text: "", icon: '<img src="https://upload.wikimedia.org/wikipedia/commons/6/69/IMDB_Logo_2016.svg" alt="IMDb" width="24" height="24">' },
      Tmdb: { text: "", icon: '<img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_square_1-5bdc75aaebeb75dc7ae79426ddd9be3b2be1e342510f8202baf6bffa71d7f5c4.svg" alt="Tmdb" width="24" height="24">' },
      Tvdb: { text: "", icon: '<img src="https://www.thetvdb.com/images/logo.svg" alt="Tvdb" width="24" height="24">' },
    };
    allowedProviders.forEach(provider => {
      if (ProviderIds[provider]) {
        const link = document.createElement("span");
        if (providerIdsTranslations[provider]) {
          link.innerHTML = `${providerIdsTranslations[provider].icon} ${providerIdsTranslations[provider].text}`;
        } else {
          link.textContent = provider;
        }
        link.className = "provider-link";
        link.style.marginRight = "10px";
        link.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          window.open(getProviderUrl(provider, ProviderIds[provider], ProviderIds["TvdbSlug"]), "_blank", "noopener,noreferrer");
        });
        providerDiv.appendChild(link);
      }
    });
    if (providerDiv.childNodes.length > 0) {
      providerContainer = document.createElement("div");
      providerContainer.className = "provider-container";
      providerContainer.appendChild(providerDiv);
    }
  }
  if (config.showSettingsLink) {
    const settingsLink = document.createElement("span");
    settingsLink.innerHTML = '<i class="fa-solid fa-sliders"></i>';
    settingsLink.className = "provider-link";
    settingsLink.style.marginRight = "10px";
    settingsLink.style.cursor = "pointer";
    settingsLink.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.open(`${window.location.origin}/web/slider/src/settings.html`, "_blank", "noopener,noreferrer");
    });
    if (providerContainer) {
      providerContainer.querySelector(".provider-ids").prepend(settingsLink);
    } else {
      const providerDiv = document.createElement("div");
      providerDiv.className = "provider-ids";
      providerDiv.appendChild(settingsLink);
      providerContainer = document.createElement("div");
      providerContainer.className = "provider-container";
      providerContainer.appendChild(providerDiv);
    }
  }

  let languageContainer = null;
if (config.showLanguageInfo && MediaStreams && MediaStreams.length > 0 && itemType.toLowerCase() !== "series") {
  const audioCodecs = ["ac3", "mp3", "aac", "flac", "dts", "truehd", "eac3"];
  const subtitleCodecs = ["srt", "ass", "vtt", "subrip"];
  const audioStreams = MediaStreams.filter(
    stream => stream.Codec && audioCodecs.includes(stream.Codec.toLowerCase())
  );
  const subtitleStreams = MediaStreams.filter(
    stream => stream.Codec && subtitleCodecs.includes(stream.Codec.toLowerCase())
  );

  const hasTurkishAudio = audioStreams.some(
    stream => stream.Language && stream.Language.toLowerCase() === config.defaultLanguage
  );
  const hasTurkishSubtitle = subtitleStreams.some(
    stream => stream.Language && stream.Language.toLowerCase() === config.defaultLanguage
  );

  let audioLabel = "";
  let subtitleLabel = "";

  if (hasTurkishAudio) {
    audioLabel = `<i class="fa-regular fa-language"></i> ${config.languageLabels.audio}`;
  } else {
    const defaultAudioStream = audioStreams.find(stream => stream.IsDefault);
    const fallbackLanguage = defaultAudioStream && defaultAudioStream.Language ? defaultAudioStream.Language : "";
    audioLabel = `<i class="fa-regular fa-language"></i> ${config.languageLabels.original}` + (fallbackLanguage ? ` ${fallbackLanguage}` : "");
  }

  if (!hasTurkishAudio && hasTurkishSubtitle) {
    subtitleLabel = `<i class="fa-solid fa-subtitles"></i> ${config.languageLabels.subtitle}`;
  }

  const selectedAudioStream = audioStreams.find(
    stream => stream.Language && stream.Language.toLowerCase() === config.defaultLanguage
  ) || audioStreams[0];

  if (selectedAudioStream) {
    const channelsText = selectedAudioStream.Channels ? `${selectedAudioStream.Channels} ${config.languageLabels.channel}` : "";
    const bitRateText = selectedAudioStream.BitRate ? `${Math.floor(selectedAudioStream.BitRate / 1000)} kbps` : "";
    const codecText = selectedAudioStream.Codec ? selectedAudioStream.Codec.toUpperCase() : "";
    audioLabel += ` <i class="fa-solid fa-volume-high"></i> ${channelsText} - ${bitRateText} <i class="fa-solid fa-microchip"></i> ${codecText}`;
  }

  if (audioLabel || subtitleLabel) {
    languageContainer = document.createElement("div");
    languageContainer.className = "language-container";

    if (audioLabel) {
      const audioSpan = document.createElement("span");
      audioSpan.className = "audio-label";
      audioSpan.innerHTML = audioLabel;
      languageContainer.appendChild(audioSpan);
    }

    if (subtitleLabel) {
      const subtitleSpan = document.createElement("span");
      subtitleSpan.className = "subtitle-label";
      subtitleSpan.innerHTML = subtitleLabel;
      languageContainer.appendChild(subtitleSpan);
    }
  }
} else {
  console.log("Dil - Ses ve Altyazı bilgileri gösterilmiyor veya bilgi mevcut değil.");
}

  const metaContainer = document.createElement("div");
  metaContainer.className = "meta-container";

  if (statusContainer) metaContainer.appendChild(statusContainer);
  if (languageContainer) metaContainer.appendChild(languageContainer);
  if (ratingExists) metaContainer.appendChild(ratingContainer);
  if (actorContainer) metaContainer.appendChild(actorContainer);

  const mainContentContainer = document.createElement("div");
  mainContentContainer.className = "main-content-container";
  mainContentContainer.append(
  logoContainer,
  titleContainer,
  plotContainer,
  providerContainer
);

  slide.append(
  gradientOverlay,
  infoContainer,
  directorContainer,
  backdropImg,
  metaContainer,
  mainContentContainer,
  buttonContainer
  );
  slidesContainer.appendChild(slide);

  console.log(`Item ${itemId} slide eklendi.`);
  if (slidesContainer.children.length === 1) {
  import("./navigation.js").then(mod => mod.displaySlide(0));
  }
}

    function addSlideToSettingsBackground(itemId, backdropUrl) {
    const settingsSlider = document.getElementById('settingsBackgroundSlider');
    if (!settingsSlider) return;
    const existingSlide = settingsSlider.querySelector(`[data-item-id="${itemId}"]`);
    if (existingSlide) return;

    const slide = document.createElement('div');
    slide.className = 'slide';
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
      slide.classList.add('active');
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

export { createSlide, openTrailerModal};
