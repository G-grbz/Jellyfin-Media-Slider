import { getConfig } from "../../config.js";
import { getLanguageLabels, getDefaultLanguage } from '../../.././language/index.js';

export function createSettingsModal() {
    const config = getConfig();
    const currentLang = config.defaultLanguage || getDefaultLanguage();
    const labels = getLanguageLabels(currentLang) || {};
    const modal = document.createElement('div');
    modal.id = 'settings-modal';
    modal.className = 'settings-modal';
    const modalContent = document.createElement('div');
    modalContent.className = 'settings-modal-content';
    const closeBtn = document.createElement('span');
    closeBtn.className = 'settings-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => modal.style.display = 'none';
    const title = document.createElement('h2');
    title.textContent = labels.ayarlarBaslik || 'GP Oynatıcı Ayarları';
    const form = document.createElement('form');
    const languageDiv = document.createElement('div');
    languageDiv.className = 'setting-item';
    const languageLabel = document.createElement('label');
    languageLabel.textContent = labels.defaultLanguage || 'Dil:';
    const languageSelect = document.createElement('select');
    languageSelect.name = 'defaultLanguage';
    const languages = [
        { value: 'tur', label: '🇹🇷 Türkçe' },
        { value: 'eng', label: '🇬🇧 English' },
        { value: 'deu', label: '🇩🇪 Deutsch' },
        { value: 'fre', label: '🇫🇷 Français' },
        { value: 'rus', label: '🇷🇺 Русский' },
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

    const limitDiv = document.createElement('div');
    limitDiv.className = 'setting-item';

    const limitLabel = document.createElement('label');
    limitLabel.textContent = labels.muziklimit || 'Müzik Limiti:';

    const limitInput = document.createElement('input');
    limitInput.type = 'number';
    limitInput.value = config.muziklimit || 100;
    limitInput.name = 'muziklimit';

    limitDiv.append(limitLabel, limitInput);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.textContent = labels.kaydet || 'Kaydet';
    form.append(languageDiv, limitDiv, saveBtn);
    form.onsubmit = (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const updatedConfig = {
            ...config,
            defaultLanguage: formData.get('defaultLanguage'),
            muziklimit: parseInt(formData.get('muziklimit'))
        };
        updateConfig(updatedConfig);
        modal.style.display = 'none';
        location.reload();
    };
    modalContent.append(closeBtn, title, form);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    return modal;
}

export function initSettings() {
    const modal = createSettingsModal();

    return {
        open: () => { modal.style.display = 'block'; },
        close: () => { modal.style.display = 'none'; }
    };
}
