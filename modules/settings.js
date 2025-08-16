import { getConfig } from "./config.js";
import { loadCSS } from "./player/main.js";
import { getLanguageLabels, getDefaultLanguage } from '../language/index.js';
import { showNotification } from "./player/ui/notification.js";
import { createPositionEditor } from './settings/positionPage.js';
import { updateSlidePosition } from './positionUtils.js';
import { createBackupRestoreButtons } from './configExporter.js';
import { applyRawConfig, applySettings } from './settings/applySettings.js';
import { createSliderPanel } from './settings/sliderPage.js';
import { createAnimationPanel } from './settings/animationsPage.js';
import { createMusicPanel } from './settings/musicPage.js';
import { createStatusRatingPanel, createActorPanel, createDirectorPanel, createInfoPanel, createLogoTitlePanel, createAboutPanel, createProviderPanel, createDescriptionPanel } from './settings/otherPage.js';
import { createQueryPanel } from './settings/apiPage.js';
import { createPausePanel } from './settings/pausePage.js';
import { createButtonsPanel } from './settings/buttonsPage.js';
import { createAvatarPanel } from './settings/avatarPage.js';
import { createNotificationsPanel } from './settings/notificationsPage.js';

let settingsModal = null;

export function createSettingsModal() {
    const existing = document.getElementById('settings-modal');
    if (existing) {
        existing.remove();
        settingsModal = null;
    }

    if (settingsModal) {
        return settingsModal;
    }

    const config = getConfig();
    const currentLang = config.defaultLanguage || getDefaultLanguage();
    const labels = getLanguageLabels(currentLang) || {};

    const modal = document.createElement('div');
    modal.id = 'settings-modal';
    modal.className = 'settings-modal';

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    const modalContent = document.createElement('div');
    modalContent.className = 'settings-modal-content';

    modalContent.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    const closeBtn = document.createElement('span');
    closeBtn.className = 'settings-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => modal.style.display = 'none';

    const title = document.createElement('h2');
    title.textContent = labels.sliderSettings || 'Slider Ayarları';

    const tabContainer = document.createElement('div');
    tabContainer.className = 'settings-tabs';

    const tabContent = document.createElement('div');
    tabContent.className = 'settings-tab-content';

    const sliderTab = createTab('slider', labels.sliderSettings || 'Slider Ayarları', true);
    const animationTab = createTab('animation', labels.animationSettings || 'Animasyon Ayarları', true);
    const musicTab = createTab('music', labels.gmmpSettings || 'GMMP Ayarları', true);
    const pauseTab = createTab('pause', labels.pauseSettings || 'Durdurma Ekranı', true);
    const positionTab = createTab('position', labels.positionSettings || 'Konumlardıma Ayarları', true);
    const queryTab = createTab('query', labels.queryStringInput || 'API Sorgu Parametresi', true);
    const avatarTab = createTab('avatar', labels.avatarCreateInput || 'Avatar Ayarları', true);
    const notificationsTab = createTab('notifications', labels.notificationsSettings || 'Bildirim Ayarları', true);
    const logoTitleTab = createTab('logo-title', labels.logoOrTitleHeader || 'Logo/Başlık', true);
    const statusRatingTab = createTab('status-rating', labels.statusRatingInfo || 'Durum ve Puan Bilgileri', true);
    const actorTab = createTab('actor', labels.actorInfo || 'Artist Bilgileri', true);
    const directorTab = createTab('director', labels.directorWriter || 'Yönetmen ve Yazar', true);
    const languageTab = createTab('language', labels.languageInfoHeader || 'Ses ve Altyazı', true);
    const descriptionTab = createTab('description', labels.descriptionsHeader || 'Açıklamalar', true);
    const providerTab = createTab('provider', labels.providerHeader || 'Dış Bağlantılar', true);
    const buttonsTab = createTab('buttons', labels.buttons || 'Butonlar', true);
    const infoTab = createTab('info', labels.infoHeader || 'Tür, Yıl ve Ülke', true);
    const exporterTab = createTab('exporter', labels.backupRestore || 'Yedekle - Geri Yükle', true);
    const aboutTab = createTab('about', labels.aboutHeader || 'Hakkında', true);

    tabContainer.append(
        sliderTab, animationTab, musicTab, pauseTab, positionTab,
        queryTab, avatarTab, notificationsTab, statusRatingTab, actorTab, directorTab,
        languageTab, logoTitleTab, descriptionTab, providerTab,
        buttonsTab, infoTab, exporterTab, aboutTab
    );

    const sliderPanel = createSliderPanel(config, labels);
    const animationPanel = createAnimationPanel(config, labels);
    const musicPanel = createMusicPanel(config, labels);
    const pausePanel = createPausePanel(config, labels);
    const positionPanel = createPositionPanel(config, labels);
    const queryPanel = createQueryPanel(config, labels);
    const avatarPanel = createAvatarPanel(config, labels);
    const statusRatingPanel = createStatusRatingPanel(config, labels);
    const actorPanel = createActorPanel(config, labels);
    const directorPanel = createDirectorPanel(config, labels);
    const languagePanel = createLanguagePanel(config, labels);
    const logoTitlePanel = createLogoTitlePanel(config, labels);
    const descriptionPanel = createDescriptionPanel(config, labels);
    const providerPanel = createProviderPanel(config, labels);
    const buttonsPanel = createButtonsPanel(config, labels);
    const infoPanel = createInfoPanel(config, labels);
    const exporterPanel = createExporterPanel(config, labels);
    const aboutPanel = createAboutPanel(labels);
    const notificationsPanel = createNotificationsPanel(config, labels);

    [
        sliderPanel, animationPanel, musicPanel, positionPanel, queryPanel,
        avatarPanel, notificationsPanel, statusRatingPanel,
        actorPanel, directorPanel, languagePanel, logoTitlePanel,
        descriptionPanel, providerPanel, buttonsPanel, infoPanel,
        pausePanel, exporterPanel, aboutPanel
    ].forEach(panel => {
        panel.style.display = 'none';
    });
    sliderPanel.style.display = 'block';

    tabContent.append(
        sliderPanel, animationPanel, musicPanel, statusRatingPanel, actorPanel,
        directorPanel, queryPanel, avatarPanel, languagePanel, logoTitlePanel,
        descriptionPanel, providerPanel, buttonsPanel, infoPanel,
        pausePanel, positionPanel, aboutPanel, exporterPanel, notificationsPanel
    );

    [
        sliderTab, animationTab, musicTab, queryTab,
        avatarTab, notificationsTab, statusRatingTab,
        actorTab, directorTab, languageTab, logoTitleTab,
        descriptionTab, providerTab, buttonsTab, infoTab,
        positionTab, pauseTab, aboutTab, exporterTab
    ].forEach(tab => {
        tab.addEventListener('click', () => {
            [
                sliderTab, animationTab, musicTab, queryTab, avatarTab, notificationsTab, statusRatingTab,
                actorTab, directorTab, languageTab, logoTitleTab,
                descriptionTab, providerTab, buttonsTab, infoTab,
                positionTab, pauseTab, aboutTab, exporterTab,
            ].forEach(t => {
                t.classList.remove('active');
            });
            [
                sliderPanel, animationPanel, statusRatingPanel, actorPanel, directorPanel,
                musicPanel, queryPanel, avatarPanel, languagePanel, logoTitlePanel,
                descriptionPanel, providerPanel, buttonsPanel, infoPanel,
                positionPanel, aboutPanel, exporterPanel, pausePanel, notificationsPanel
            ].forEach(panel => {
                panel.style.display = 'none';
            });

            tab.classList.add('active');
            const panelId = tab.getAttribute('data-tab');
            document.getElementById(`${panelId}-panel`).style.display = 'block';

            setTimeout(() => {
                tab.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                    inline: 'center'
                });
            }, 10);
        });
    });

    const form = document.createElement('form');
    form.append(tabContainer, tabContent);

    const btnDiv = document.createElement('div');
    btnDiv.className = 'btn-item';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.textContent = labels.saveSettings || 'Kaydet';

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.textContent = labels.uygula || 'Uygula';
    applyBtn.style.marginLeft = '10px';

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.textContent = labels.resetToDefaults || 'Sıfırla';
    resetBtn.style.marginLeft = '10px';
    resetBtn.className = 'reset-btn';
    resetBtn.onclick = () => {
        createConfirmationModal(
            labels.resetConfirm || 'Tüm ayarları varsayılan değerlere sıfırlamak istediğinize emin misiniz?',
            resetAllSettings,
            labels
        );
    };

    form.onsubmit = (e) => {
        e.preventDefault();
        applySettings(true);
    };

    applyBtn.onclick = () => {
        applySettings(false);
        showNotification(
            `<i class="fas fa-floppy-disk" style="margin-right: 8px;"></i> ${config.languageLabels.settingsSavedModal || "Ayarlar kaydedildi. Değişikliklerin aktif olması için slider sayfasını yenileyin."}`,
            3000,
            'info'
        );
    };

    btnDiv.append(saveBtn, applyBtn, resetBtn, );
    form.appendChild(btnDiv);

    const themeToggleBtn = document.createElement('button');
    themeToggleBtn.type = 'button';
    themeToggleBtn.className = 'theme-toggle-btn';
    themeToggleBtn.style.marginLeft = '10px';

function setSettingsThemeToggleVisuals() {
  const cfg = getConfig();
  const currentLang = cfg.defaultLanguage || getDefaultLanguage?.();
  const labels = (typeof getLanguageLabels === 'function' ? getLanguageLabels(currentLang) : {}) || cfg.languageLabels || {};

  themeToggleBtn.innerHTML = `<i class="fas fa-${cfg.playerTheme === 'light' ? 'moon' : 'sun'}"></i>`;
  themeToggleBtn.title = cfg.playerTheme === 'light'
    ? (labels.darkTheme || 'Karanlık Tema')
    : (labels.lightTheme || 'Aydınlık Tema');
}

themeToggleBtn.onclick = () => {
  const cfg = getConfig();
  const newTheme = cfg.playerTheme === 'light' ? 'dark' : 'light';

  updateConfig({ ...cfg, playerTheme: newTheme });
  loadCSS();

  const playerThemeBtn = document.querySelector('#modern-music-player .theme-toggle-btn');
  if (playerThemeBtn) {
    playerThemeBtn.innerHTML = `<i class="fas fa-${newTheme === 'light' ? 'moon' : 'sun'}"></i>`;
    const labels = cfg.languageLabels || {};
    playerThemeBtn.title = newTheme === 'light'
      ? (labels.darkTheme || 'Karanlık Tema')
      : (labels.lightTheme || 'Aydınlık Tema');
  }

  setSettingsThemeToggleVisuals();

  const labels = cfg.languageLabels || {};
  showNotification(
    `<i class="fas fa-${newTheme === 'light' ? 'sun' : 'moon'}"></i> ${
      newTheme === 'light'
        ? (labels.lightThemeEnabled || 'Aydınlık tema etkin')
        : (labels.darkThemeEnabled || 'Karanlık tema etkin')
    }`,
    2000,
    'info'
  );
};

    setSettingsThemeToggleVisuals();
    btnDiv.append(themeToggleBtn);

    modalContent.append(closeBtn, title, form);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);


    function resetAllSettings() {
        Object.keys(config).forEach(key => {
            localStorage.removeItem(key);
        });
        location.reload();
    }

     setTimeout(() => {
      setupMobileTextareaBehavior();
    }, 100);

    return modal;
}

function createConfirmationModal(message, callback, labels) {
        const modal = document.createElement('div');
        modal.className = 'confirmation-modal';
        modal.style.display = 'block';

        const modalContent = document.createElement('div');
        modalContent.className = 'confirmation-modal-content';

        const messageEl = document.createElement('p');
        messageEl.textContent = message;

        const btnContainer = document.createElement('div');
        btnContainer.className = 'confirmation-btn-container';

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'confirm-btn';
        confirmBtn.textContent = labels.yes || 'Evet';
        confirmBtn.onclick = () => {
            callback();
            modal.remove();
        };

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'cancel-btn';
        cancelBtn.textContent = labels.no || 'Hayır';
        cancelBtn.onclick = () => modal.remove();

        btnContainer.append(confirmBtn, cancelBtn);
        modalContent.append(messageEl, btnContainer);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        return modal;
    }

function createSliderPage(config, labels) {
  const panel = document.createElement('div');
  panel.id = 'slider-panel';
  panel.className = 'slider-panel';

  const section = createSection();
  const sliderPanel = createSliderPanel(config, labels);
  sliderPanel.render();

  panel.appendChild(section);
  return panel;
}

function createPositionPage(config, labels) {
  const panel = document.createElement('div');
  panel.id = 'animation-panel';
  panel.className = 'animation-panel';

  const section = createSection();
  const positionPage = createAnimationPanel(config, labels);
  positionPage.render();

  panel.appendChild(section);
  return panel;
}

function createStatusRatingPage(config, labels) {
  const panel = document.createElement('div');
  panel.id = 'status-panel';
  panel.className = 'status-panel';

  const section = createSection();
  const statusPage = createStatusRatingPanel(config, labels);
  statusPage.render();

  panel.appendChild(section);
  return panel;
}

function createActorPage(config, labels) {
  const panel = document.createElement('div');
  panel.id = 'actor-panel';
  panel.className = 'actor-panel';

  const section = createSection();
  const actorPage = createActorPanel(config, labels);
  actorPage.render();

  panel.appendChild(section);
  return panel;
}

function createDirectorPage(config, labels) {
  const panel = document.createElement('div');
  panel.id = 'director-panel';
  panel.className = 'director-panel';

  const section = createSection();
  const directorPage = createDirectorPanel(config, labels);
  directorPage.render();

  panel.appendChild(section);
  return panel;
}

function createMusicPage(config, labels) {
  const panel = document.createElement('div');
  panel.id = 'music-panel';
  panel.className = 'music-panel';

  const section = createSection();
  const musicPage = createMusicPanel(config, labels);
  musicPage.render();

  panel.appendChild(section);
  return panel;
}

function createNotificationsPage(config, labels) {
  const panel = document.createElement('div');
  panel.id = 'notifications-panel';
  panel.className = 'notifications-panel';

  const section = createSection();
  const musicPage = createNotificationsPanel(config, labels);
  notificationsPage.render();

  panel.appendChild(section);
  return panel;
}

function createQueryPage(config, labels) {
  const panel = document.createElement('div');
  panel.id = 'query-panel';
  panel.className = 'query-panel';

  const section = createSection();
  const queryPage = createQueryPanel(config, labels);
  queryPage.render();

  panel.appendChild(section);
  return panel;
}


function createLanguagePanel(config, labels) {
    const panel = document.createElement('div');
    panel.id = 'language-panel';
    panel.className = 'settings-panel';

    const section = createSection(labels.languageInfoHeader || 'Ses ve Altyazı Bilgileri');
    section.appendChild(createCheckbox('showLanguageInfo', labels.languageInfo || 'Ses ve Altyazı Bilgilerini Göster', config.showLanguageInfo));

    const description = document.createElement('div');
    description.className = 'description-text';
    description.textContent = labels.languageInfoDescription || 'Bu ayar aktifleştirildiğinde seçilen dile ait ses bilgileri içerikte mevcut ise yazdırılır. Dilinize ait ses bulunamazsa altyazı bilgileri aranır. Dilinize ait altyazı mevcut ise bilgi yazdırır.';
    section.appendChild(description);

    panel.appendChild(section);
    return panel;
}

function createAvatarPage(config, labels) {
  const panel = document.createElement('div');
  panel.id = 'avatar-panel';
  panel.className = 'avatar-panel';

  const section = createSection();
  const avatarPage = createAvatarPanel(config, labels);
  avatarPage.render();

  panel.appendChild(section);
  return panel;
}

function createLogoTitlePage(config, labels) {
  const panel = document.createElement('div');
  panel.id = 'logoTitle-panel';
  panel.className = 'logoTitle-panel';

  const section = createSection();
  const logoTitlePage = createLogoTitlePanel(config, labels);
  logoTitlePage.render();

  panel.appendChild(section);
  return panel;
}

function createDescriptionPage(config, labels) {
  const panel = document.createElement('div');
  panel.id = 'description-panel';
  panel.className = 'description-panel';

  const section = createSection();
  const descriptionPage = createDescriptionPanel(config, labels);
  descriptionPage.render();

  panel.appendChild(section);
  return panel;
}

function createProviderPage(config, labels) {
  const panel = document.createElement('div');
  panel.id = 'provider-panel';
  panel.className = 'provider-panel';

  const section = createSection();
  const providerPage = createProviderPanel(config, labels);
  providerPage.render();

  panel.appendChild(section);
  return panel;
}

function createAboutPage(config, labels) {
  const panel = document.createElement('div');
  panel.id = 'about-panel';
  panel.className = 'about-panel';

  const section = createSection();
  const aboutPage = createAboutPanel(labels);
  aboutPage.render();

  panel.appendChild(section);
  return panel;
}

function createButtonsPage(config, labels) {
  const panel = document.createElement('div');
  panel.id = 'buttons-panel';
  panel.className = 'buttons-panel';

  const section = createSection();
  const buttonsPage = createButtonsPanel(config, labels);
  buttonsPage.render();

  panel.appendChild(section);
  return panel;
}

function createInfoPage(config, labels) {
  const panel = document.createElement('div');
  panel.id = 'info-panel';
  panel.className = 'info-panel';

  const section = createSection();
  const infoPage = createInfoPanel(config, labels);
  infoPage.render();

  panel.appendChild(section);
  return panel;
}

function createPositionPanel(config, labels) {
  const panel = document.createElement('div');
  panel.id = 'position-panel';
  panel.className = 'position-panel';

  const section = createSection();
  const positionEditor = createPositionEditor(config, labels, section);
  positionEditor.render();

  panel.appendChild(section);
  return panel;
}

function createPausePage(config, labels) {
  const panel = document.createElement('div');
  panel.id = 'pause-panel';
  panel.className = 'pause-panel';

  const section = createSection();
  const pausePage = createPausePanel(config, labels);
  pausePage.render();

  panel.appendChild(section);
  return panel;
}

function createExporterPanel(config, labels) {
  const panel = document.createElement('div');
  panel.id = 'exporter-panel';
  panel.className = 'exporter-panel';

  panel.appendChild(createBackupRestoreButtons());

  document.documentElement.style.setProperty(
    '--file-select-text',
    `"${config.languageLabels.yedekSec || 'Dosya Seç'}"`
  );

  return panel;
}

function createTab(id, label, isActive = false, isDisabled = false) {
    const tab = document.createElement('div');
    tab.className = `settings-tab ${isActive ? 'active' : ''} ${isDisabled ? 'disabled-tab' : ''}`;
    tab.setAttribute('data-tab', id);
    tab.textContent = label;

    if (isDisabled) {
        tab.style.opacity = '0.5';
        tab.style.pointerEvents = 'none';
        tab.style.cursor = 'not-allowed';
    }

    return tab;
}

export function createSection(title) {
    const section = document.createElement('div');
    section.className = 'settings-section';

    if (title) {
        const sectionTitle = document.createElement('h3');
        sectionTitle.textContent = title;
        section.appendChild(sectionTitle);
    }

    return section;
}

export function createCheckbox(name, label, isChecked) {
  const container = document.createElement('div');
  container.className = 'setting-item';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.name = name;
  checkbox.id = name;

  const storedValue = localStorage.getItem(name);

  if (storedValue !== null) {
    if (storedValue.trim().startsWith('{') && storedValue !== '[object Object]') {
      try {
        const obj = JSON.parse(storedValue);
        checkbox.checked = obj.enabled !== false;
      } catch {
        checkbox.checked = storedValue === 'true';
      }
    } else {
      checkbox.checked = storedValue === 'true';
    }
  } else {
    checkbox.checked = isChecked === true || isChecked === undefined;
  }

  const checkboxLabel = document.createElement('label');
  checkboxLabel.htmlFor = name;
  checkboxLabel.textContent = label;

  container.append(checkbox, checkboxLabel);
  return container;
}


export function createImageTypeSelect(name, selectedValue, includeExtended = false, includeUseSlide = false) {
    const select = document.createElement('select');
    select.name = name;

    const config = getConfig();
    const currentLang = config.defaultLanguage || getDefaultLanguage();
    const labels = getLanguageLabels(currentLang) || {};

    const options = [
        {
            value: 'none',
            label: labels.imageTypeNone || 'Hiçbiri'
        },
        {
            value: 'backdropUrl',
            label: labels.imageTypeBackdrop || 'Backdrop Görseli'
        },
        {
            value: 'landscapeUrl',
            label: labels.imageTypeLandscape || 'Landscape Görseli'
        },
        {
            value: 'primaryUrl',
            label: labels.imageTypePoster || 'Poster Görseli'
        },
        {
            value: 'logoUrl',
            label: labels.imageTypeLogo || 'Logo Görseli'
        },
        {
            value: 'bannerUrl',
            label: labels.imageTypeBanner || 'Banner Görseli'
        },
        {
            value: 'artUrl',
            label: labels.imageTypeArt || 'Art Görseli'
        },
        {
            value: 'discUrl',
            label: labels.imageTypeDisc || 'Disk Görseli'
        }
    ];

    const storedValue = localStorage.getItem(name);
    const finalSelectedValue = storedValue !== null ? storedValue : selectedValue;

    options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.label;
        if (option.value === finalSelectedValue) {
            optionElement.selected = true;
        }
        select.appendChild(optionElement);
    });

    return select;
}

export function bindCheckboxKontrol(
    mainCheckboxSelector,
    subContainerSelector,
    disabledOpacity = 0.5,
    additionalElements = []
) {
    setTimeout(() => {
        const mainCheckbox = document.querySelector(mainCheckboxSelector);
        const subContainer = document.querySelector(subContainerSelector);

        if (!mainCheckbox) return;
        const allElements = [];
        if (subContainer) {
            allElements.push(
                ...subContainer.querySelectorAll('input'),
                ...subContainer.querySelectorAll('select'),
                ...subContainer.querySelectorAll('textarea'),
                ...subContainer.querySelectorAll('label')
            );
        }
        additionalElements.forEach(el => el && allElements.push(el));

        const updateElementsState = () => {
            const isMainChecked = mainCheckbox.checked;

            allElements.forEach(element => {
                if (element.tagName === 'LABEL') {
                    element.style.opacity = isMainChecked ? '1' : disabledOpacity;
                } else {
                    element.disabled = !isMainChecked;
                    element.style.opacity = isMainChecked ? '1' : disabledOpacity;
                }
            });
            if (subContainer) {
                subContainer.style.opacity = isMainChecked ? '1' : disabledOpacity;
                subContainer.classList.toggle('disabled', !isMainChecked);
            }
        };
        updateElementsState();
        mainCheckbox.addEventListener('change', updateElementsState);
    }, 50);
}

export function bindTersCheckboxKontrol(
    mainCheckboxSelector,
    targetContainerSelector,
    disabledOpacity = 0.6,
    targetElements = []
) {
    setTimeout(() => {
        const mainCheckbox = document.querySelector(mainCheckboxSelector);
        const targetContainer = document.querySelector(targetContainerSelector);

        if (!mainCheckbox) return;
        const allElements = targetElements.slice();
        if (targetContainer) {
            allElements.push(
                ...targetContainer.querySelectorAll('input'),
                ...targetContainer.querySelectorAll('select'),
                ...targetContainer.querySelectorAll('textarea')
            );
        }

        const updateElementsState = () => {
            const isMainChecked = mainCheckbox.checked;
            allElements.forEach(element => {
                element.disabled = isMainChecked;
                element.style.opacity = isMainChecked ? disabledOpacity : '1';
            });

            if (targetContainer) {
                targetContainer.style.opacity = isMainChecked ? disabledOpacity : '1';
                targetContainer.classList.toggle('disabled', isMainChecked);
            }
        };
        updateElementsState();
        mainCheckbox.addEventListener('change', updateElementsState);
    }, 50);
}

export function initSettings(defaultTab = 'slider') {
    const modal = createSettingsModal();

    return {
        open: (tab = defaultTab) => {
            const tabs = modal.querySelectorAll('.settings-tab');
            const panels = modal.querySelectorAll('.settings-panel');
            tabs.forEach(tab => tab.classList.remove('active'));
            panels.forEach(panel => panel.style.display = 'none');
            const targetTab = modal.querySelector(`.settings-tab[data-tab="${tab}"]`);
            const targetPanel = modal.querySelector(`#${tab}-panel`);

            if (targetTab && targetPanel) {
                targetTab.classList.add('active');
                targetPanel.style.display = 'block';
            } else {
                const sliderTab = modal.querySelector('.settings-tab[data-tab="slider"]');
                const sliderPanel = modal.querySelector('#slider-panel');
                sliderTab.classList.add('active');
                sliderPanel.style.display = 'block';
            }

            modal.style.display = 'block';
        },
        close: () => { modal.style.display = 'none'; }
    };
}

export function isLocalStorageAvailable() {
    try {
        const testKey = 'test';
        localStorage.setItem(testKey, testKey);
        localStorage.removeItem(testKey);
        return true;
    } catch (e) {
        return false;
    }
}

export function updateConfig(updatedConfig) {
  const existingDicebearParams = localStorage.getItem('dicebearParams');

  const isPlainObject = (v) =>
    v !== null && typeof v === 'object' && !Array.isArray(v);

  Object.entries(updatedConfig).forEach(([key, value]) => {
    if (key === 'dicebearParams') return;

    try {
      if (typeof value === 'boolean') {
        localStorage.setItem(key, value ? 'true' : 'false');
      } else if (typeof value === 'number') {
        localStorage.setItem(key, String(value));
      } else if (Array.isArray(value)) {
        localStorage.setItem(key, JSON.stringify(value));
      } else if (isPlainObject(value)) {
        localStorage.setItem(key, JSON.stringify(value));
      } else if (value !== undefined && value !== null) {
        localStorage.setItem(key, String(value));
      } else {
        localStorage.removeItem(key);
      }
    } catch (e) {
      console.warn('Config yazılamadı:', key, e);
    }
  });

  if (existingDicebearParams) {
    localStorage.setItem('dicebearParams', existingDicebearParams);
  }

  if (updatedConfig.defaultLanguage !== undefined) {
    localStorage.setItem('defaultLanguage', updatedConfig.defaultLanguage);
  }

  if (updatedConfig.dateLocale !== undefined) {
    localStorage.setItem('dateLocale', updatedConfig.dateLocale);
  }

  if (!isLocalStorageAvailable()) return;

  const keysToSave = [
    'playerTheme',
    'playerStyle',
    'useAlbumArtAsBackground',
    'albumArtBackgroundBlur',
    'albumArtBackgroundOpacity',
    'buttonBackgroundBlur',
    'buttonBackgroundOpacity',
    'dotBackgroundBlur',
    'dotBackgroundOpacity',
    'nextTracksSource'
  ];

  keysToSave.forEach(key => {
    const value = updatedConfig[key];
    if (value !== undefined && value !== null) {
      localStorage.setItem(key, String(value));
    }
  });
}


function setupMobileTextareaBehavior() {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;

  const textareas = modal.querySelectorAll('textarea');

  textareas.forEach(textarea => {
    textarea.addEventListener('focus', function() {
      if (!isMobileDevice()) return;
      this.style.position = 'fixed';
      this.style.bottom = '50%';
      this.style.left = '0';
      this.style.right = '0';
      this.style.zIndex = '10000';
      this.style.height = '30vh';

      setTimeout(() => {
        this.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }, 300);
    });

    textarea.addEventListener('blur', function() {
      if (!isMobileDevice()) return;
      this.style.position = '';
      this.style.bottom = '';
      this.style.left = '';
      this.style.right = '';
      this.style.zIndex = '';
      this.style.height = '';
    });
  });
}

function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function createNumberInput(key, label, value, min = 0, max = 100) {
    const container = document.createElement('div');
    container.className = 'input-container';

    const labelElement = document.createElement('label');
    labelElement.textContent = label;
    labelElement.htmlFor = key;
    container.appendChild(labelElement);

    const input = document.createElement('input');
    input.type = 'number';
    input.id = key;
    input.name = key;
    input.value = value;
    input.min = min;
    input.max = max;
    input.addEventListener('change', (e) => {
        localStorage.setItem(key, e.target.value);
    });
    container.appendChild(input);

    return container;
}

export function createTextInput(key, label, value) {
    const container = document.createElement('div');
    container.className = 'input-container';

    const labelElement = document.createElement('label');
    labelElement.textContent = label;
    labelElement.htmlFor = key;
    container.appendChild(labelElement);

    const input = document.createElement('input');
    input.type = 'text';
    input.id = key;
    input.name = key;
    input.value = value;
    input.addEventListener('change', (e) => {
        localStorage.setItem(key, e.target.value);
    });
    container.appendChild(input);

    return container;
}

export function createSelect(key, label, options, selectedValue) {
    const container = document.createElement('div');
    container.className = 'input-container';

    const labelElement = document.createElement('label');
    labelElement.textContent = label;
    labelElement.htmlFor = key;
    container.appendChild(labelElement);

    const select = document.createElement('select');
    select.id = key;
    select.name = key;

    options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.text;
        if (option.value === selectedValue) {
            optionElement.selected = true;
        }
        select.appendChild(optionElement);
    });

    select.addEventListener('change', (e) => {
        localStorage.setItem(key, e.target.value);
    });
    container.appendChild(select);

    return container;
}
