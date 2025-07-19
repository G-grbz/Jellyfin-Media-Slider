import { getConfig } from "../config.js";
import { createCheckbox, createSection, createImageTypeSelect, bindCheckboxKontrol, bindTersCheckboxKontrol } from "../settings.js";

export function createStatusRatingPanel(config, labels) {
        const panel = document.createElement('div');
        panel.id = 'status-rating-panel';
        panel.className = 'settings-panel';

        const statusSection = createSection(labels.showStatusInfo || 'Durum Bilgileri');
        const statusCheckbox = createCheckbox('showStatusInfo', labels.showStatusInfo || 'Durum Bilgilerini Göster', config.showStatusInfo);
        statusSection.appendChild(statusCheckbox);

        const statusSubOptions = document.createElement('div');
        statusSubOptions.className = 'sub-options status-sub-options';
        statusSubOptions.appendChild(createCheckbox('showTypeInfo', labels.showTypeInfo || 'Medya Türü', config.showTypeInfo));
        statusSubOptions.appendChild(createCheckbox('showWatchedInfo', labels.showWatchedInfo || 'İzlenme', config.showWatchedInfo));
        statusSubOptions.appendChild(createCheckbox('showRuntimeInfo', labels.showRuntimeInfo || 'Süre', config.showRuntimeInfo));
        statusSubOptions.appendChild(createCheckbox('showQualityInfo', labels.showQualityInfo || 'Kalite', config.showQualityInfo));

        const qualityDetailSubOptions = document.createElement('div');
        qualityDetailSubOptions.className = 'sub-options quality-detail-options';
        qualityDetailSubOptions.appendChild(createCheckbox('showQualityDetail', labels.showQualityDetail || 'Kalite Detayı', config.showQualityDetail));
        statusSubOptions.appendChild(qualityDetailSubOptions);
        statusSection.appendChild(statusSubOptions);

        bindCheckboxKontrol('#showStatusInfo', '.status-sub-options');
        bindCheckboxKontrol('#showQualityInfo', '.quality-detail-options');

        const ratingSection = createSection(labels.ratingInfoHeader || 'Puan Bilgileri');
        const ratingCheckbox = createCheckbox('showRatingInfo', labels.ratingInfo || 'Derecelendirmeleri Göster', config.showRatingInfo);
        ratingSection.appendChild(ratingCheckbox);

        const ratingSubOptions = document.createElement('div');
        ratingSubOptions.className = 'sub-options rating-sub-options';
        ratingSubOptions.appendChild(createCheckbox('showCommunityRating', labels.showCommunityRating || 'Topluluk', config.showCommunityRating));
        ratingSubOptions.appendChild(createCheckbox('showCriticRating', labels.showCriticRating || 'Rotten Tomato', config.showCriticRating));
        ratingSubOptions.appendChild(createCheckbox('showOfficialRating', labels.showOfficialRating || 'Sertifikasyon', config.showOfficialRating));
        ratingSection.appendChild(ratingSubOptions);

        bindCheckboxKontrol('#showRatingInfo', '.rating-sub-options');

        const description = document.createElement('div');
        description.className = 'description-text';
        description.textContent = labels.statusRatingDescription || 'Bu ayar, içeriğin kalite, izlenme durumu, medya türü, süre ve puanlama bilgilerinin görünürlüğünü kontrol eder.';
        ratingSection.appendChild(description);

        panel.append(statusSection, ratingSection);
        return panel;
    }

export function createActorPanel(config, labels) {
        const panel = document.createElement('div');
        panel.id = 'actor-panel';
        panel.className = 'settings-panel';

        const section = createSection(labels.actorInfo || 'Artist Bilgileri');

        const actorAllCheckbox = createCheckbox('showActorAll', labels.showActorAll || 'Hiçbiri', config.showActorAll);
        section.appendChild(actorAllCheckbox);

        const actorCheckbox = createCheckbox('showActorInfo', labels.showActorInfo || 'Artist İsimlerini Göster', config.showActorInfo);
        const actorCheckboxInput = actorCheckbox.querySelector('input');
        actorCheckboxInput.setAttribute('data-group', 'actor');
        section.appendChild(actorCheckbox);

        const actorSubOptions = document.createElement('div');
        actorSubOptions.className = 'sub-options actor-sub-options';
        const actorImgCheckbox = createCheckbox('showActorImg', labels.showActorImg || 'Artist Resimlerini Göster', config.showActorImg);
        const actorImgCheckboxInput = actorImgCheckbox.querySelector('input');
        actorImgCheckboxInput.setAttribute('data-group', 'actor');
        actorSubOptions.appendChild(actorImgCheckbox);
        section.appendChild(actorSubOptions);

        const actorRolOptions = document.createElement('div');
        actorRolOptions.className = 'sub-options actor-rol-options';
        const actorRoleCheckbox = createCheckbox('showActorRole', labels.showActorRole || 'Artist Rollerini Göster', config.showActorRole);
        const actorRoleCheckboxInput = actorRoleCheckbox.querySelector('input');
        actorRoleCheckboxInput.setAttribute('data-group', 'actor');
        actorRolOptions.appendChild(actorRoleCheckbox);
        section.appendChild(actorRolOptions);

        const artistLimitDiv = document.createElement('div');
        artistLimitDiv.className = 'setting-item artist-limit-container';
        const artistLimitLabel = document.createElement('label');
        artistLimitLabel.textContent = labels.artistLimit || 'Gösterilecek Aktör Sayısı:';
        const artistLimitInput = document.createElement('input');
        artistLimitInput.type = 'number';
        artistLimitInput.value = config.artistLimit || 3;
        artistLimitInput.name = 'artistLimit';
        artistLimitInput.min = 1;
        artistLimitInput.step = 1;
        artistLimitInput.setAttribute('data-group', 'actor');
        artistLimitDiv.append(artistLimitLabel, artistLimitInput);
        section.appendChild(artistLimitDiv);

        const description = document.createElement('div');
        description.className = 'description-text';
        description.textContent = labels.actorInfoDescription || 'Bu ayar, içeriğin ilk 3 artist bilgilerinin görünürlüğünü kontrol eder.';
        section.appendChild(description);

        panel.appendChild(section);

    setTimeout(() => {
        bindTersCheckboxKontrol(
            'input[name="showActorAll"]',
            null,
            0.5,
            Array.from(panel.querySelectorAll('[data-group="actor"]'))
        );
    }, 0);

    return panel;
}

 export function createDirectorPanel(config, labels) {
        const panel = document.createElement('div');
        panel.id = 'director-panel';
        panel.className = 'settings-panel';

        const section = createSection(labels.directorWriter || 'Yönetmen ve Yazar Ayarları');
        const directorCheckbox = createCheckbox('showDirectorWriter', labels.showDirectorWriter || 'Yönetmen ve Yazar Bilgilerini Göster', config.showDirectorWriter);
        section.appendChild(directorCheckbox);

        const subOptions = document.createElement('div');
        subOptions.className = 'sub-options director-sub-options';
        subOptions.appendChild(createCheckbox('showDirector', labels.showDirector || 'Yönetmen', config.showDirector));
        subOptions.appendChild(createCheckbox('showWriter', labels.showWriter || 'Yazar', config.showWriter));
        section.appendChild(subOptions);

        bindCheckboxKontrol('#showDirectorWriter', '.director-sub-options');

        const description = document.createElement('div');
        description.className = 'description-text';
        description.textContent = labels.directorWriterDescription || 'Bu ayar, içeriğin yazar ve yönetmen görünürlüğünü kontrol eder. (Yazar bilgisi sadece aşağıdaki listede var ise)';
        section.appendChild(description);

        const writersHeader = document.createElement('h2');
        writersHeader.textContent = labels.writersListHeader || 'Yazarlar Listesi';
        section.appendChild(writersHeader);

        const writersDiv = document.createElement('div');
        writersDiv.className = 'setting-item writersLabel';
        const writersLabel = document.createElement('label');
        writersLabel.textContent = labels.writersListLabel || 'İsimleri virgül ile ayırınız:';
        const writersInput = document.createElement('textarea');
        writersInput.id = 'allowedWritersInput';
        writersInput.name = 'allowedWriters';
        writersInput.rows = 4;
        writersInput.placeholder = labels.writersListPlaceholder || 'Örnek: Quentin TARANTINO, Nuri Bilge CEYLAN';
        writersInput.value = config.allowedWriters ? config.allowedWriters.join(', ') : '';
        writersDiv.append(writersLabel, writersInput);
        section.appendChild(writersDiv);

        const girisSureDiv = document.createElement('div');
        girisSureDiv.className = 'setting-item writersLabel';
        const girisSureLabel = document.createElement('label');
        girisSureLabel.textContent = labels.girisSure || 'Giriş Süresi (ms):';
        const girisSureInput = document.createElement('input');
        girisSureInput.type = 'number';
        girisSureInput.value = config.girisSure || 1000;
        girisSureInput.name = 'girisSure';
        girisSureInput.min = 50;
        girisSureInput.step = 50;

        girisSureDiv.append(girisSureLabel, girisSureInput);
        section.appendChild(girisSureDiv);

        const aktifSureDiv = document.createElement('div');
        aktifSureDiv.className = 'setting-item writersLabel';
        const aktifSureLabel = document.createElement('label');
        aktifSureLabel.textContent = labels.aktifSure || 'Aktiflik Süresi (ms):';
        const aktifSureInput = document.createElement('input');
        aktifSureInput.type = 'number';
        aktifSureInput.value = config.aktifSure || 5000;
        aktifSureInput.name = 'aktifSure';
        aktifSureInput.min = 50;
        aktifSureInput.step = 50;
        aktifSureDiv.append(aktifSureLabel, aktifSureInput);
        section.appendChild(aktifSureDiv);

        panel.appendChild(section);
        return panel;
    }

export function createInfoPanel(config, labels) {
    const panel = document.createElement('div');
    panel.id = 'info-panel';
    panel.className = 'settings-panel';

    const section = createSection(labels.infoHeader || 'Tür, Yıl ve Ülke Bilgileri');
    const infoCheckbox = createCheckbox('showInfo', labels.showInfo || 'Tür, Yıl ve Ülke Bilgilerini Göster', config.showInfo);
    section.appendChild(infoCheckbox);

    const subOptions = document.createElement('div');
    subOptions.className = 'sub-options info-sub-options';
    subOptions.appendChild(createCheckbox('showGenresInfo', labels.showGenresInfo || 'Tür', config.showGenresInfo));
    subOptions.appendChild(createCheckbox('showYearInfo', labels.showYearInfo || 'Yıl', config.showYearInfo));
    subOptions.appendChild(createCheckbox('showCountryInfo', labels.showCountryInfo || 'Ülke', config.showCountryInfo));
    section.appendChild(subOptions);

    bindCheckboxKontrol('#showInfo', '.info-sub-options');

    const description = document.createElement('div');
    description.className = 'description-text';
    description.textContent = labels.infoDescription || 'Bu ayar, içeriğin türü, yapım yılı ve yapımcı ülke bilgilerinin görünürlüğünü kontrol eder.';
    section.appendChild(description);

    panel.appendChild(section);
    return panel;
}


export function createLogoTitlePanel(config, labels) {
    const panel = document.createElement('div');
    panel.id = 'logo-title-panel';
    panel.className = 'settings-panel';

    const section = createSection(labels.logoOrTitleHeader || 'Logo / Başlık Ayarları');
    const logoCheckbox = createCheckbox('showLogoOrTitle', labels.showLogoOrTitle || 'Logo Görselini Göster', config.showLogoOrTitle);
    section.appendChild(logoCheckbox);

    const displayOrderDiv = document.createElement('div');
    displayOrderDiv.className = 'sub-options logo-sub-options';
    displayOrderDiv.id = 'displayOrderContainer';
    const displayOrderLabel = document.createElement('label');
    const displayOrderSpan = document.createElement('span');
    displayOrderSpan.textContent = labels.displayOrderlabel || 'Görüntüleme Sırası:';
    const displayOrderInput = document.createElement('input');
    displayOrderInput.type = 'text';
    displayOrderInput.id = 'displayOrderInput';
    displayOrderInput.name = 'displayOrder';
    displayOrderInput.placeholder = 'logo,disk,originalTitle';
    displayOrderInput.value = config.displayOrder || '';
    const displayOrderSmall = document.createElement('small');
    displayOrderSmall.textContent = labels.displayOrderhelp || '(Örnek: logo,disk,originalTitle)';
    displayOrderLabel.append(displayOrderSpan, displayOrderInput, displayOrderSmall);
    displayOrderDiv.appendChild(displayOrderLabel);
    section.appendChild(displayOrderDiv);

    const titleOnlyCheckbox = createCheckbox('showTitleOnly', labels.showTitleOnly || 'Logo Yerine Orijinal Başlık Göster', config.showTitleOnly);
    const titleOnlyDiv = document.createElement('div');
    titleOnlyDiv.className = 'sub-options title-sub-options';
    titleOnlyDiv.id = 'showTitleOnlyLabel';
    titleOnlyDiv.appendChild(titleOnlyCheckbox);
    section.appendChild(titleOnlyDiv);

    const discOnlyCheckbox = createCheckbox('showDiscOnly', labels.showDiscOnly || 'Logo Yerine Disk Görseli Göster', config.showDiscOnly);
    const discOnlyDiv = document.createElement('div');
    discOnlyDiv.className = 'sub-options disc-sub-options';
    discOnlyDiv.id = 'showDiscOnlyLabel';
    discOnlyDiv.appendChild(discOnlyCheckbox);
    section.appendChild(discOnlyDiv);

    function setupMutuallyExclusive(checkbox1, checkbox2) {
        const cb1 = checkbox1.querySelector('input');
        const cb2 = checkbox2.querySelector('input');

        cb1.addEventListener('change', function() {
            if (this.checked) {
                cb2.checked = false;
            }
        });

        cb2.addEventListener('change', function() {
            if (this.checked) {
                cb1.checked = false;
            }
        });
    }

    setupMutuallyExclusive(titleOnlyCheckbox, discOnlyCheckbox);

    bindCheckboxKontrol('#showLogoOrTitle', '.logo-sub-options');
    bindTersCheckboxKontrol('#showLogoOrTitle', '.title-sub-options');
    bindTersCheckboxKontrol('#showLogoOrTitle', '.disc-sub-options');

    if (titleOnlyCheckbox.querySelector('input').checked && discOnlyCheckbox.querySelector('input').checked) {
        discOnlyCheckbox.querySelector('input').checked = false;
    }

    const description = document.createElement('div');
    description.className = 'description-text';
    description.textContent = labels.logoOrTitleDescription || 'Bu ayar, slider üzerinde logo veya orijinal başlık görünürlüğünü kontrol eder.';
    section.appendChild(description);

    panel.appendChild(section);
    return panel;
}

export function createDescriptionPanel(config, labels) {
    const panel = document.createElement('div');
    panel.id = 'description-panel';
    panel.className = 'settings-panel';

    const section = createSection(labels.descriptionsHeader || 'Açıklama Ayarları');
    const descCheckbox = createCheckbox('showDescriptions', labels.showDescriptions || 'Bilgileri Göster', config.showDescriptions);
    section.appendChild(descCheckbox);

    const subOptions = document.createElement('div');
    subOptions.className = 'sub-options desc-sub-options';
    subOptions.appendChild(createCheckbox('showSloganInfo', labels.showSloganInfo || 'Slogan', config.showSloganInfo));
    subOptions.appendChild(createCheckbox('showTitleInfo', labels.showTitleInfo || 'Başlık', config.showTitleInfo));
    subOptions.appendChild(createCheckbox('showOriginalTitleInfo', labels.showOriginalTitleInfo || 'Orijinal Başlık', config.showOriginalTitleInfo));

    const hideIfSameWrapper = document.createElement('div');
    hideIfSameWrapper.className = 'hide-original-if-same-wrapper';
    hideIfSameWrapper.appendChild(createCheckbox('hideOriginalTitleIfSame', labels.hideOriginalTitleIfSame || 'Başlık ile Aynı İse Orijinal Başlığı Gösterme', config.hideOriginalTitleIfSame));
    subOptions.appendChild(hideIfSameWrapper);

    subOptions.appendChild(createCheckbox('showPlotInfo', labels.showPlotInfo || 'Konu Metni', config.showPlotInfo));

    const plotOnlyDiv = document.createElement('div');
    plotOnlyDiv.className = 'sub-options plot-sub-options';
    plotOnlyDiv.id = 'showPlotOnlyLabel';
    plotOnlyDiv.appendChild(createCheckbox('showbPlotInfo', labels.showbPlotInfo || 'Konu Başlığı', config.showbPlotInfo));
    subOptions.appendChild(plotOnlyDiv);
    subOptions.appendChild(createCheckbox('showPlaybackProgress', labels.showPlaybackProgress || 'Oynatma İlerleme Çubuğu', config.showPlaybackProgress));

    section.appendChild(subOptions);

    bindCheckboxKontrol('#showDescriptions', '.desc-sub-options');
    bindCheckboxKontrol('#showPlotInfo', '.plot-sub-options');
    bindCheckboxKontrol('#showOriginalTitleInfo', '.hide-original-if-same-wrapper');

    const description = document.createElement('div');
    description.className = 'description-text';
    description.textContent = labels.descriptionsDescription || 'Bu ayar, içeriğin konu, slogan, başlık ve orijinal başlık bilgilerinin görünürlüğünü kontrol eder.';
    section.appendChild(description);

    panel.appendChild(section);
    return panel;
}


export  function createProviderPanel(config, labels) {
    const panel = document.createElement('div');
    panel.id = 'provider-panel';
    panel.className = 'settings-panel';

    const section = createSection(labels.providerHeader || 'Dış Bağlantılar / Sağlayıcı Ayarları');
    section.appendChild(createCheckbox('showProviderInfo', labels.showProviderInfo || 'Metaveri Bağlantıları Göster', config.showProviderInfo));

    section.appendChild(createCheckbox('showCast', labels.showCast || 'Chromecast\'ı Göster', config.showCast));

    const settingsLinkDiv = document.createElement('div');
    settingsLinkDiv.id = 'settingsLinkContainer';
    settingsLinkDiv.appendChild(createCheckbox('showSettingsLink', labels.showSettingsLink || 'Ayarlar Kısayolunu Göster', config.showSettingsLink));
    section.appendChild(settingsLinkDiv);

    const trailerIconDiv = document.createElement('div');
    trailerIconDiv.appendChild(createCheckbox('showTrailerIcon', labels.showTrailerIcon || 'Fragman İkonunu Göster', config.showTrailerIcon));
    section.appendChild(trailerIconDiv);

    const description = document.createElement('div');
    description.className = 'description-text';
    description.textContent = labels.providerDescription || 'Bu ayar, metaveri bağlantılarının görünürlüğünü kontrol eder.';
    section.appendChild(description);

    panel.appendChild(section);
    return panel;
}

export function createAboutPanel(labels) {
    const panel = document.createElement('div');
    panel.id = 'about-panel';
    panel.className = 'settings-panel';

    const section = createSection('JELLYFIN MEDIA SLIDER');

    const info = document.createElement('div');
    info.className = 'ggrbz-info';
    info.textContent = labels.aboutHeader || 'Hakkında';
    section.appendChild(info);

    const aboutContent = document.createElement('div');
    aboutContent.className = 'about-content';

    const creatorInfo = document.createElement('p');
    creatorInfo.textContent = ` G-GRBZ ${labels.aboutCreator || 'Tarafından Hazarlanmıştır'}`;
    creatorInfo.style.fontWeight = 'bold';
    creatorInfo.style.marginBottom = '20px';

    const supportInfo = document.createElement('p');
    supportInfo.textContent = labels.aboutSupport || 'Öneri, istek veya sorunlar için:';
    supportInfo.style.marginBottom = '10px';

    const githubLink = document.createElement('a');
    githubLink.href = 'https://github.com/G-grbz/';
    githubLink.target = '_blank';
    githubLink.textContent = labels.aboutGithub || 'GitHub: https://github.com/G-grbz/';
    githubLink.style.display = 'block';
    githubLink.style.marginBottom = '10px';
    githubLink.style.color = '#00a8ff';

    const emailLink = document.createElement('a');
    emailLink.href = 'mailto:gkhn.gurbuz@hotmail.com';
    emailLink.innerHTML = `${labels.aboutEmail || 'E Posta:'} gkhn.gurbuz@hotmail.com`;
    emailLink.style.display = 'block';
    emailLink.style.color = '#00a8ff';

    aboutContent.append(creatorInfo, supportInfo, githubLink, emailLink);
    section.appendChild(aboutContent);

    panel.appendChild(section);
    return panel;
}
