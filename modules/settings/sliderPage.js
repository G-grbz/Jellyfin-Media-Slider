import { getConfig } from "../config.js";
import { createCheckbox, createImageTypeSelect, bindCheckboxKontrol, bindTersCheckboxKontrol } from "../settings.js";
import { applySettings, applyRawConfig } from "./applySettings.js";

export function createSliderPanel(config, labels) {
    const panel = document.createElement('div');
    panel.id = 'slider-panel';
    panel.className = 'settings-panel';

    const languageDiv = document.createElement('div');
    languageDiv.className = 'setting-item';
    const languageLabel = document.createElement('label');
    languageLabel.textContent = labels.defaultLanguage || 'Dil:';
    const languageSelect = document.createElement('select');
    languageSelect.name = 'defaultLanguage';

    const languages = [
        { value: 'tur', label: labels.optionTurkish || '🇹🇷 Türkçe' },
        { value: 'eng', label: labels.optionEnglish || '🇬🇧 English' },
        { value: 'deu', label: labels.optionGerman || '🇩🇪 Deutsch' },
        { value: 'fre', label: labels.optionFrench || '🇫🇷 Français' },
        { value: 'rus', label: labels.optionRussian || '🇷🇺 Русский' },
    ];

    languages.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang.value;
        option.textContent = lang.label;
        if (lang.value === config.defaultLanguage) {
            option.selected = true;
        }
        languageSelect.appendChild(option);
    });

    languageDiv.append(languageLabel, languageSelect);

    const cssDiv = document.createElement('div');
    cssDiv.className = 'fsetting-item';
    const cssLabel = document.createElement('label');
    cssLabel.textContent = labels.gorunum || 'CSS Varyantı:';
    const cssSelect = document.createElement('select');
    cssSelect.name = 'cssVariant';

    const variants = [
        { value: 'kompak', label: labels.kompaktslider || 'Kompakt' },
        { value: 'fullslider', label: labels.tamslider || 'Tam Ekran' },
        { value: 'normalslider', label: labels.normalslider || 'Normal' },
    ];

    variants.forEach(variant => {
        const option = document.createElement('option');
        option.value = variant.value;
        option.textContent = variant.label;
        if (variant.value === config.cssVariant) {
            option.selected = true;
        }
        cssSelect.appendChild(option);
    });

    cssDiv.append(cssLabel, cssSelect);

    const sliderDiv = document.createElement('div');
    sliderDiv.className = 'fsetting-item';
    const sliderLabel = document.createElement('label');
    sliderLabel.textContent = labels.sliderDuration || 'Slider Süresi (ms):';
    const sliderInput = document.createElement('input');
    sliderInput.type = 'number';
    sliderInput.value = config.sliderDuration || 15000;
    sliderInput.name = 'sliderDuration';
    sliderInput.min = 1000;
    sliderInput.step = 250;
    sliderDiv.append(sliderLabel, sliderInput);

    const sliderDesc = document.createElement('div');
    sliderDesc.className = 'description-text';
    sliderDesc.textContent = labels.sliderDurationDescription || 'Bu ayar, ms cinsinden olmalıdır.';
    sliderDiv.appendChild(sliderDesc);

    const showProgressCheckbox = createCheckbox('showProgressBar', labels.progressBar || 'ProgressBar\'ı Göster', config.showProgressBar);
    sliderDiv.appendChild(showProgressCheckbox);

    const playbackOptionsDiv = document.createElement('div');
    playbackOptionsDiv.className = 'playback-options-container';

    const playbackCheckboxesDiv = document.createElement('div');
    playbackCheckboxesDiv.style.display = 'flex';
    playbackCheckboxesDiv.style.gap = '10px';
    playbackCheckboxesDiv.style.flexDirection = 'column';

    const trailerPlaybackCheckbox = createCheckbox(
    'enableTrailerPlayback',
    labels.enableTrailerPlayback || 'Yerleşik Fragman Oynatımına İzin Ver',
    config.enableTrailerPlayback
);

    const videoPlaybackCheckbox = createCheckbox(
    'enableVideoPlayback',
    labels.enableVideoPlayback || 'Yerleşik Video Oynatımına İzin Ver',
    config.enableVideoPlayback
);

    const enableHls = createCheckbox(
    'enableHls',
    labels.enableHls || 'HLS Desteğini ektinleştir',
    config.enableHls
);

    playbackCheckboxesDiv.appendChild(trailerPlaybackCheckbox);
    playbackCheckboxesDiv.appendChild(videoPlaybackCheckbox);
    playbackCheckboxesDiv.appendChild(enableHls);
    playbackOptionsDiv.appendChild(playbackCheckboxesDiv);

    trailerPlaybackCheckbox.querySelector('input').addEventListener('change', (e) => {
    if (e.target.checked) {
        videoPlaybackCheckbox.querySelector('input').checked = false;
    }
    updateTrailerRelatedFields();
});

videoPlaybackCheckbox.querySelector('input').addEventListener('change', (e) => {
    if (e.target.checked) {
        trailerPlaybackCheckbox.querySelector('input').checked = false;
    }
    updateTrailerRelatedFields();
});

    sliderDiv.appendChild(playbackOptionsDiv);

    const delayDiv = document.createElement('div');
    delayDiv.className = 'fsetting-item trailer-delay-container';
    const delayLabel = document.createElement('label');
    delayLabel.textContent = labels.gecikmeInput || 'Yerleşik Fragman Gecikme Süresi (ms):';
    const delayInput = document.createElement('input');
    delayInput.type = 'number';
    delayInput.value = config.gecikmeSure || 500;
    delayInput.name = 'gecikmeSure';
    delayInput.min = 0;
    delayInput.max = 10000;
    delayInput.step = 50;
    delayDiv.append(delayLabel, delayInput);
    sliderDiv.appendChild(delayDiv);

    const gradientDiv = document.createElement('div');
    gradientDiv.className = 'fsetting-item gradient-overlay-container';
    const gradientLabel = document.createElement('label');
    gradientLabel.textContent = labels.gradientOverlayImageType || 'Yerleşik Fragman Oynatıldığında Gösterilecek Görsel Türü:';
    const gradientSelect = createImageTypeSelect('gradientOverlayImageType', config.gradientOverlayImageType || 'backdropUrl', true);
    gradientDiv.append(gradientLabel, gradientSelect);
    sliderDiv.appendChild(gradientDiv);

    const indexZeroCheckbox = createCheckbox(
    'indexZeroSelection',
    labels.indexZeroSelection || 'Her zaman 0 indeksli görseli seç',
    config.indexZeroSelection
    );
    sliderDiv.appendChild(indexZeroCheckbox);

    const indexZeroDesc = document.createElement('div');
    indexZeroDesc.className = 'description-text';
    indexZeroDesc.textContent = labels.indexZeroDescription || 'Aktif olduğunda her zaman 0 indeksli görsel seçilir (diğer kalite filtrelerini devre dışı bırakır).';
    sliderDiv.appendChild(indexZeroDesc);

    const manualBackdropCheckbox = createCheckbox(
        'manualBackdropSelection',
        labels.manualBackdropSelection || 'Slide Arkaplanı Değiştir',
        config.manualBackdropSelection
    );
    sliderDiv.appendChild(manualBackdropCheckbox);

    const backdropDiv = document.createElement('div');
    backdropDiv.className = 'fsetting-item backdrop-container';
    const backdropLabel = document.createElement('label');
    backdropLabel.textContent = labels.slideBackgroundImageType || 'Slider Arka Plan Görsel Türü:';
    const backdropSelect = createImageTypeSelect('backdropImageType', config.backdropImageType || 'backdropUrl', true);
    backdropDiv.append(backdropLabel, backdropSelect);
    sliderDiv.appendChild(backdropDiv);

    const minQualityDiv = document.createElement('div');
    minQualityDiv.className = 'fsetting-item min-quality-container';
    const minQualityLabel = document.createElement('label');
    minQualityLabel.textContent = labels.minHighQualityWidthInput || 'Minimum Genişlik (px):';

    const minQualityInput = document.createElement('input');
    minQualityInput.type = 'number';
    minQualityInput.value = config.minHighQualityWidth || 1920;
    minQualityInput.name = 'minHighQualityWidth';
    minQualityInput.min = 1;

    const minQualityDesc = document.createElement('div');
    minQualityDesc.className = 'description-text';
    minQualityDesc.textContent = labels.minHighQualitydescriptiontext ||
        'Bu ayar, arkaplan olarak atanacak görselin minimum genişliğini belirler.("Slide Arkaplanı Değiştir" aktif ise çalışmaz. Eğer belirlenen genişlikte görsel yok ise en kalitelisi seçilecektir.)';

    minQualityDiv.append(minQualityLabel, minQualityInput, minQualityDesc);
    sliderDiv.appendChild(minQualityDiv);

    bindCheckboxKontrol('#manualBackdropSelection', '.backdrop-container', 0.6, [backdropSelect]);
    bindTersCheckboxKontrol('#manualBackdropSelection', '.min-quality-container', 0.6, [minQualityInput]);

    const backdropMaxWidthDiv = document.createElement('div');
    backdropMaxWidthDiv.className = 'fsetting-item min-quality-container';
    const backdropMaxWidthLabel = document.createElement('label');
    backdropMaxWidthLabel.textContent = labels.backdropMaxWidthInput || 'Maksimum Ölçek (px):';

    const backdropMaxWidthInput = document.createElement('input');
    backdropMaxWidthInput.type = 'number';
    backdropMaxWidthInput.value = config.backdropMaxWidth || 1920;
    backdropMaxWidthInput.name = 'backdropMaxWidth';
    backdropMaxWidthInput.min = 1;

    const backdropMaxWidthDesc = document.createElement('div');
    backdropMaxWidthDesc.className = 'description-text';
    backdropMaxWidthDesc.textContent = labels.backdropMaxWidthLabel ||
        'Arkaplan olarak atanacak görsel girilen değer boyutunda ölçeklenir.("Slide Arkaplanı Değiştir" aktif ise çalışmaz. Görsel, belirlenen değerden küçük ise ölçeklendirmez)';

    backdropMaxWidthDiv.append(backdropMaxWidthLabel, backdropMaxWidthInput, backdropMaxWidthDesc);
    sliderDiv.appendChild(backdropMaxWidthDiv);

    const minPixelDiv = document.createElement('div');
    minPixelDiv.className = 'fsetting-item min-quality-container';
    const minPixelLabel = document.createElement('label');
    minPixelLabel.textContent = labels.minPixelCountInput || 'Minimum Piksel Sayısı:';

    const minPixelInput = document.createElement('input');
    minPixelInput.type = 'number';
    minPixelInput.value = config.minPixelCount || (1920 * 1080);
    minPixelInput.name = 'minPixelCount';
    minPixelInput.min = 1;

    const minPixelDesc = document.createElement('div');
    minPixelDesc.className = 'description-text';
    minPixelDesc.textContent = labels.minPixelCountDescription ||
    'Genişlik × yükseklik sonucudur. Bu değerden küçük görseller düşük kaliteli sayılır. Örn: 1920×1080 = 2073600';

    minPixelDiv.append(minPixelLabel, minPixelInput, minPixelDesc);
    sliderDiv.appendChild(minPixelDiv);

    const sizeFilterToggleDiv = document.createElement('div');
    sizeFilterToggleDiv.className = 'fsetting-item min-quality-container';

    const sizeFilterLabel = document.createElement('label');
    sizeFilterLabel.textContent = labels.enableImageSizeFilter || 'Görsel Boyut Filtrelemesini Etkinleştir';
    sizeFilterLabel.htmlFor = 'enableImageSizeFilter';

    const sizeFilterCheckbox = document.createElement('input');
    sizeFilterCheckbox.type = 'checkbox';
    sizeFilterCheckbox.id = 'enableImageSizeFilter';
    sizeFilterCheckbox.name = 'enableImageSizeFilter';
    sizeFilterCheckbox.checked = config.enableImageSizeFilter ?? false;

    sizeFilterLabel.prepend(sizeFilterCheckbox);
    sizeFilterToggleDiv.appendChild(sizeFilterLabel);
    sliderDiv.appendChild(sizeFilterToggleDiv);

    const minSizeDiv = document.createElement('div');
    minSizeDiv.className = 'fsetting-item min-quality-container';
    const minSizeLabel = document.createElement('label');
    minSizeLabel.textContent = labels.minImageSizeKB || 'Minimum Görsel Boyutu (KB):';

    const minSizeInput = document.createElement('input');
    minSizeInput.type = 'number';
    minSizeInput.value = config.minImageSizeKB || 800;
    minSizeInput.name = 'minImageSizeKB';
    minSizeInput.min = 1;

    const minSizeDesc = document.createElement('div');
    minSizeDesc.className = 'description-text';
    minSizeDesc.textContent = labels.minImageSizeDescription || 'Seçilecek görselin minimum dosya boyutunu KB cinsinden belirtir.';

    minSizeDiv.append(minSizeLabel, minSizeInput, minSizeDesc);
    sliderDiv.appendChild(minSizeDiv);

    const maxSizeDiv = document.createElement('div');
    maxSizeDiv.className = 'fsetting-item min-quality-container';
    const maxSizeLabel = document.createElement('label');
    maxSizeLabel.textContent = labels.maxImageSizeKB || 'Maksimum Görsel Boyutu (KB):';

    const maxSizeInput = document.createElement('input');
    maxSizeInput.type = 'number';
    maxSizeInput.value = config.maxImageSizeKB || 1500;
    maxSizeInput.name = 'maxImageSizeKB';
    maxSizeInput.min = 1;

    const maxSizeDesc = document.createElement('div');
    maxSizeDesc.className = 'description-text';
    maxSizeDesc.textContent = labels.maxImageSizeDescription || 'Seçilecek görselin maksimum dosya boyutunu KB cinsinden belirtir.';

    maxSizeDiv.append(maxSizeLabel, maxSizeInput, maxSizeDesc);
    sliderDiv.appendChild(maxSizeDiv);

    bindTersCheckboxKontrol('#manualBackdropSelection', '.min-quality-container', 0.6, [minPixelInput, minSizeInput, maxSizeInput, backdropMaxWidthInput]);
    bindCheckboxKontrol('#enableImageSizeFilter', '.min-quality-container', 0.6, [minSizeInput, maxSizeInput]);

    const dotNavCheckbox = createCheckbox(
        'showDotNavigation',
        labels.showDotNavigation || 'Dot Navigasyonu Göster',
        config.showDotNavigation
    );
        sliderDiv.appendChild(dotNavCheckbox);

        const posterDotsCheckbox = createCheckbox(
        'dotPosterMode',
        labels.dotPosterMode || 'Poster Boyutlu Dot Navigasyonu',
        config.dotPosterMode
    );
    sliderDiv.appendChild(posterDotsCheckbox);

    const previewModalCheckbox = createCheckbox(
        'previewModal',
        labels.previewModal || 'Netflix Tarzı Önizleme Modalı',
        config.previewModal
    );
    sliderDiv.appendChild(previewModalCheckbox);

    const posterDotsDesc = document.createElement('div');
    posterDotsDesc.className = 'description-text';
    posterDotsDesc.textContent = labels.posterDotsDescription || 'Dot navigasyonu poster boyutuna getirir ( Slider Alanınıda konumlandırma gerektirir )';
    sliderDiv.appendChild(posterDotsDesc);

    const dotBgDiv = document.createElement('div');
    dotBgDiv.className = 'fsetting-item dot-bg-container';
    const dotBgLabel = document.createElement('label');
    dotBgLabel.textContent = labels.dotBackgroundImageType || 'Dot Arka Plan Görsel Türü:';
    const dotBgSelect = createImageTypeSelect(
        'dotBackgroundImageType',
        config.dotBackgroundImageType || 'useSlideBackground',
        true,
        true
    );
        dotBgDiv.append(dotBgLabel, dotBgSelect);
        sliderDiv.appendChild(dotBgDiv);

    bindCheckboxKontrol('#showDotNavigation', '.dot-bg-container', 0.6, [dotBgSelect, dotBgLabel]);

    const dotblurDiv = document.createElement('div');
    dotblurDiv.className = 'setting-item';

    const dotblurLabel = document.createElement('label');
    dotblurLabel.textContent = labels.backgroundBlur || 'Arka plan bulanıklığı:';
    dotblurLabel.htmlFor = 'dotBackgroundBlur';

    const dotblurInput = document.createElement('input');
    dotblurInput.type = 'range';
    dotblurInput.min = '0';
    dotblurInput.max = '20';
    dotblurInput.step = '1';
    dotblurInput.value = config.dotBackgroundBlur ?? 10;
    dotblurInput.name = 'dotBackgroundBlur';
    dotblurInput.id = 'dotBackgroundBlur';

    const dotblurValue = document.createElement('span');
    dotblurValue.className = 'range-value';
    dotblurValue.textContent = dotblurInput.value + 'px';

    dotblurInput.addEventListener('input', () => {
    dotblurValue.textContent = dotblurInput.value + 'px';
    });

    dotblurDiv.append(dotblurLabel, dotblurInput, dotblurValue);
    sliderDiv.appendChild(dotblurDiv);

    const dotopacityDiv = document.createElement('div');
    dotopacityDiv.className = 'setting-item';

    const dotopacityLabel = document.createElement('label');
    dotopacityLabel.textContent = labels.backgroundOpacity || 'Arka plan şeffaflığı:';
    dotopacityLabel.htmlFor = 'dotBackgroundOpacity';

    const dotopacityInput = document.createElement('input');
    dotopacityInput.type = 'range';
    dotopacityInput.min = '0';
    dotopacityInput.max = '1';
    dotopacityInput.step = '0.1';
    dotopacityInput.value = config.dotBackgroundOpacity ?? 0.5;
    dotopacityInput.name = 'dotBackgroundOpacity';
    dotopacityInput.id = 'dotBackgroundOpacity';

    const dotopacityValue = document.createElement('span');
    dotopacityValue.className = 'range-value';
    dotopacityValue.textContent = dotopacityInput.value;

    dotopacityInput.addEventListener('input', () => {
    dotopacityValue.textContent = dotopacityInput.value;
    });

    dotopacityDiv.append(dotopacityLabel, dotopacityInput, dotopacityValue);
    sliderDiv.appendChild(dotopacityDiv);

    panel.append(
        languageDiv,
        cssDiv,
        sliderDiv,
    );
    requestAnimationFrame(() => {
    updateTrailerRelatedFields();
});
    return panel;
}

function updateTrailerRelatedFields() {
    const trailerChecked = document.querySelector('#enableTrailerPlayback')?.checked;
    const videoChecked = document.querySelector('#enableVideoPlayback')?.checked;
    const isEnabled = trailerChecked || videoChecked;

    const trailerDelayContainer = document.querySelector('.trailer-delay-container');
    const gradientOverlayContainer = document.querySelector('.gradient-overlay-container');
    const hlsCheckbox = document.querySelector('#enableHls')?.parentElement;

    if (trailerDelayContainer && gradientOverlayContainer) {
        trailerDelayContainer.style.opacity = isEnabled ? 1 : 0.6;
        gradientOverlayContainer.style.opacity = isEnabled ? 1 : 0.6;

        trailerDelayContainer.querySelectorAll('input, select').forEach(el => el.disabled = !isEnabled);
        gradientOverlayContainer.querySelectorAll('input, select').forEach(el => el.disabled = !isEnabled);
    }

    if (hlsCheckbox) {
        hlsCheckbox.style.display = videoChecked ? 'block' : 'none';
        hlsCheckbox.querySelector('input').disabled = !videoChecked;
    }
}

document.addEventListener('DOMContentLoaded', updateTrailerRelatedFields);
