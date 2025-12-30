import {
  getLanguageLabels,
  getDefaultLanguage,
  getStoredLanguagePreference,
  setLanguagePreference,
  getEffectiveLanguage
} from './index.js';

let translations = getLanguageLabels(getDefaultLanguage());

function applyTranslations() {
  document.querySelectorAll('[data-translate]').forEach(el => {
    const path = el.getAttribute('data-translate');
    if (!path) return;
    const keys = path.split('.');
    let t = translations;
    for (const k of keys) {
      t = t && t[k] != null ? t[k] : null;
      if (t == null) break;
    }
    if (t != null) el.textContent = t;
  });
}

function wireSelectOnce() {
  const sel = document.getElementById('defaultLanguageSelect')
        || document.querySelector('select[name="defaultLanguage"]');
  if (!sel) return false;

  const uiPref = getStoredLanguagePreference() || 'auto';
  if ([...sel.options].some(o => o.value === uiPref)) sel.value = uiPref;

  sel.addEventListener('change', (e) => {
    const selected = e.target.value;
    setLanguagePreference(selected);
    const effective = getEffectiveLanguage();
    translations = getLanguageLabels(effective);
    applyTranslations();
  });

  return true;
}

document.addEventListener('DOMContentLoaded', () => {
  applyTranslations();
  if (!wireSelectOnce()) requestAnimationFrame(wireSelectOnce);
});
