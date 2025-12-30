import { getConfig } from "./config.js";
import { applySettings, applyRawConfig } from "./settings/applySettings.js";

const config = getConfig();

export function downloadConfigBackup() {
  const config = getConfig();
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'JMS-backup.json';
  a.style.display = 'none';

  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

export function uploadAndApplyConfig(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const configData = JSON.parse(e.target.result);
      applyRawConfig(configData);
      alert(config.languageLabels.ayarlarBasariylaYuklendi || 'Ayarlar başarıyla yüklendi.');
    } catch (err) {
      console.error('Yedek dosyası okunamadı:', err);
      alert(config.languageLabels.gecersizYedekDosyasi || 'Geçersiz yedek dosyası.');
    }
  };
  reader.readAsText(file);
}

export function createBackupRestoreButtons() {
  const config = getConfig();
  const labels = config.languageLabels || {};

  const container = document.createElement('div');
  container.className = 'backup-container';

  const header = document.createElement('h3');
  header.textContent = labels.backupRestore || 'Yedekleme ve Geri Yükleme';
  container.appendChild(header);

  const backupBtn = document.createElement('button');
  backupBtn.className = 'backup-button';
  backupBtn.textContent = labels.ayarlariYedekle || 'Ayarları Yedekle';
  backupBtn.addEventListener('click', (e) => {
    e.preventDefault();
    downloadConfigBackup();
  });

  const restoreLabel = document.createElement('label');
  restoreLabel.className = 'restore-label';
  restoreLabel.textContent = labels.restoreDatabase || 'Yedek Dosyası Yükle:';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      uploadAndApplyConfig(e.target.files[0]);
    }
  });

  restoreLabel.appendChild(fileInput);
  container.append(backupBtn, restoreLabel);
  return container;
}
