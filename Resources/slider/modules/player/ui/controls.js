import { musicPlayerState, saveUserSettings } from "../core/state.js";
import { getConfig } from "../../config.js";
import { showNotification } from "./notification.js";
import { shuffleArray } from "../utils/domUtils.js";
import { updatePlaylistModal } from "./playlistModal.js";
import { playNext, playPrevious, togglePlayPause } from '../player/playback.js';
import { updateNextTracks } from "./playerUI.js";
import { togglePlayerVisibility } from "../utils/mainIndex.js";

const config = getConfig();

let keyboardControlsActive = false;
let keyboardHandler = null;
let controlsAbort = null;
let volumeAbort = null;
let volumeNotifyLast = 0;
const VOLUME_NOTIFY_INTERVAL = 150;

function areVolumeControlsReady() {
  return (
    musicPlayerState.audio &&
    musicPlayerState.volumeBtn &&
    musicPlayerState.volumeSlider
  );
}

export function enableKeyboardControls() {
  if (keyboardControlsActive) return;

  controlsAbort = new AbortController();
  keyboardHandler = (e) => handleKeyPress(e);
  document.addEventListener('keydown', keyboardHandler, { signal: controlsAbort.signal });
  keyboardControlsActive = true;
}

export function disableKeyboardControls() {
  if (!keyboardControlsActive) return;
  try { controlsAbort?.abort(); } catch {}
  controlsAbort = null;
  keyboardHandler = null;
  keyboardControlsActive = false;
}

export function updateVolumeIcon(volume) {
  if (!musicPlayerState.volumeBtn || !musicPlayerState.audio) return;

  let icon;
  if (volume === 0 || musicPlayerState.audio.muted) {
    icon = '<i class="fas fa-volume-mute"></i>';
  } else if (volume < 0.5) {
    icon = '<i class="fas fa-volume-down"></i>';
  } else {
    icon = '<i class="fas fa-volume-up"></i>';
  }
  musicPlayerState.volumeBtn.innerHTML = icon;
}

function notifyVolumeThrottled(volume, isMuted = false) {
  const now = performance.now();
  if (now - volumeNotifyLast < VOLUME_NOTIFY_INTERVAL) return;
  volumeNotifyLast = now;

  let icon = '<i class="fas fa-volume-up"></i>';
  if (volume === 0 || musicPlayerState.audio?.muted || isMuted) icon = '<i class="fas fa-volume-mute"></i>';
  else if (volume < 0.5) icon = '<i class="fas fa-volume-down"></i>';

  showNotification(
    `${icon} ${config.languageLabels.volume || 'Ses seviyesi'}: ${Math.round(volume * 100)}%`,
    2000,
    'kontrol'
  );
}

function updateVolumeUI(volume, isMuted = false) {
  if (!areVolumeControlsReady()) {
    console.warn('Ses kontrolleri güncelleme için hazır değil');
    return;
  }

  updateVolumeIcon(volume);
  musicPlayerState.volumeSlider.value = volume;
  notifyVolumeThrottled(volume, isMuted);
}

export function toggleMute() {
  const { audio, volumeBtn, volumeSlider } = musicPlayerState;

  if (!audio || !volumeBtn || !volumeSlider) {
    console.error('Ses kontrolleri başlatılamadı');
    showNotification('<i class="fas fa-volume-mute crossed-icon"></i> Ses kontrolleri yüklenemedi', 2000, 'error');
    return;
  }

  audio.muted = !audio.muted;

  if (audio.muted) {
    volumeSlider.dataset.lastVolume = volumeSlider.value;
    volumeBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
    showNotification(
      `<i class="fas fa-volume-mute"></i> ${config.languageLabels.volOff || 'Ses kapatıldı'}`,
      2000,
      'kontrol'
    );
  } else {
    const newVolume = parseFloat(volumeSlider.dataset.lastVolume) || 0.7;
    audio.volume = newVolume;
    volumeSlider.value = newVolume;
    updateVolumeUI(newVolume);
  }

  saveUserSettings();
}

export function changeVolume(delta) {
  if (!areVolumeControlsReady()) {
    console.error('Ses kontrolleri başlatılamadı');
    return;
  }

  const { audio, volumeSlider } = musicPlayerState;
  const currentVolume = audio.volume;
  const newVolume = Math.min(1, Math.max(0, currentVolume + delta));

  if (Math.abs(newVolume - currentVolume) < 0.001 && !audio.muted) return;

  audio.volume = newVolume;
  musicPlayerState.userSettings.volume = newVolume;

  if (newVolume > 0 && audio.muted) {
    audio.muted = false;
  }

  volumeSlider.value = newVolume;
  updateVolumeUI(newVolume);
  saveUserSettings();
}

export function setupVolumeControls() {
  const slider = musicPlayerState.volumeSlider;
  if (!slider) {
    console.warn('Ses kaydırıcısı bulunamadı');
    return;
  }

  if (volumeAbort) {
    try { volumeAbort.abort(); } catch {}
  }
  volumeAbort = new AbortController();

  const onInput = (e) => {
    const volume = parseFloat(e.target.value);
    if (!musicPlayerState.audio) return;

    if (Math.abs(musicPlayerState.audio.volume - volume) < 0.001 && !musicPlayerState.audio.muted) return;

    musicPlayerState.audio.volume = volume;
    musicPlayerState.userSettings.volume = volume;
    musicPlayerState.audio.muted = false;

    updateVolumeUI(volume);
    saveUserSettings();
  };

  slider.addEventListener('input', onInput, { signal: volumeAbort.signal });
}

export function toggleRepeatMode() {
  const modes = ['none', 'one', 'all'];
  const currentIndex = modes.indexOf(musicPlayerState.userSettings.repeatMode);
  const nextIndex = (currentIndex + 1) % modes.length;
  musicPlayerState.userSettings.repeatMode = modes[nextIndex];

  const repeatBtn = document.querySelector('.player-btn .fa-repeat, .player-btn .fa-repeat-1')?.parentElement;
  if (!repeatBtn) {
    console.warn('Tekrar butonu bulunamadı');
    return;
  }

  const mode = musicPlayerState.userSettings.repeatMode;

  const titles = {
    'none': config.languageLabels?.repeatModOff || 'Tekrar kapalı',
    'one': config.languageLabels?.repeatModOne || 'Tek şarkı tekrarı',
    'all': config.languageLabels?.repeatModAll || 'Tüm liste tekrarı'
  };

  const iconClass = mode === 'one' ? 'fa-repeat-1' : 'fa-repeat';
  const isActive = mode !== 'none';

  repeatBtn.classList.remove('active', 'passive');
  repeatBtn.classList.add(isActive ? 'active' : 'passive');
  repeatBtn.title = titles[mode];
  repeatBtn.innerHTML = `<i class="fas ${iconClass}"></i>`;

  const notificationMessages = {
    'none': `<i class="fas fa-repeat crossed-icon"></i> ${config.languageLabels?.repeatMod || 'Tekrar modu'}: ${config.languageLabels?.repeatModOff || 'kapalı'}`,
    'one': `<i class="fas fa-repeat-1"></i> ${config.languageLabels?.repeatMod || 'Tekrar modu'}: ${config.languageLabels?.repeatModOne || 'tek şarkı'}`,
    'all': `<i class="fas fa-repeat"></i> ${config.languageLabels?.repeatMod || 'Tekrar modu'}: ${config.languageLabels?.repeatModAll || 'tüm liste'}`
  };

  showNotification(
    notificationMessages[mode],
    2000,
    'kontrol'
  );

  saveUserSettings();
}

export function toggleShuffle() {
  if (!musicPlayerState || !musicPlayerState.userSettings) {
    console.error('Müzik çalar durumu veya kullanıcı ayarları yüklenmedi');
    return;
  }

  const newShuffleState = !musicPlayerState.userSettings.shuffle;
  musicPlayerState.userSettings.shuffle = newShuffleState;

  const shuffleBtn = document.querySelector('.player-btn .fa-random')?.parentElement;
  if (!shuffleBtn) {
    console.warn('Karıştırma butonu bulunamadı');
    return;
  }

  const titles = {
    true: config.languageLabels?.shuffleOn || 'Karıştırma açık',
    false: config.languageLabels?.shuffleOff || 'Karıştırma kapalı'
  };

  const notificationMessages = {
    true: `${config.languageLabels?.shuffle || 'Karıştırma'}: ${config.languageLabels?.shuffleOn || 'açık'}`,
    false: `${config.languageLabels?.shuffle || 'Karıştırma'}: ${config.languageLabels?.shuffleOff || 'kapalı'}`
  };

  shuffleBtn.classList.remove('active', 'passive');
  shuffleBtn.classList.add(newShuffleState ? 'active' : 'passive');
  shuffleBtn.title = titles[newShuffleState];
  shuffleBtn.innerHTML = '<i class="fas fa-random"></i>';

  showNotification(
    newShuffleState
      ? `<i class="fas fa-random"></i> ${notificationMessages.true}`
      : `<i class="fas fa-random crossed-icon"></i> ${notificationMessages.false}`,
    1500,
    'kontrol'
  );

  updatePlaylistModal();
  saveUserSettings();
  updateNextTracks();
}

function createKeyboardHelpModal() {
  if (document.querySelector('#keyboardHelpModal')) return;

  const modal = document.createElement('div');
  modal.id = 'keyboardHelpModal';
  modal.style.display = 'none';

  modal.innerHTML = `
    <h3 style="margin-top:0;margin-bottom:10px;">🎹 Klavye Kısayolları</h3>
    <ul style="list-style:none;padding-left:0;">
      <li><b>G</b>: Oynatıcıyı göster/gizle</li>
      <li><b>↑</b> veya <b>+</b>: Sesi artır</li>
      <li><b>↓</b> veya <b>-</b>: Sesi azalt</li>
      <li><b>M</b>: Sesi aç/kapat</li>
      <li><b>S</b>: Karıştırma modunu değiştir</li>
      <li><b>R</b>: Tekrar modunu değiştir</li>
      <li><b>←</b>: Önceki parça</li>
      <li><b>→</b>: Sonraki parça</li>
      <li><b>?</b>: Yardımı aç/kapat</li>
      <li><b>Esc</b>: Yardımı kapat</li>
    </ul>
  `;
  document.body.appendChild(modal);
}

function toggleKeyboardHelpModal() {
  const modal = document.querySelector('#keyboardHelpModal');
  if (!modal) return;

  const isVisible = modal.style.display === 'block';
  modal.style.display = isVisible ? 'none' : 'block';
}

export function handleKeyPress(e) {
  if (!musicPlayerState.isPlayerVisible && e.key.toLowerCase() !== 'g') return;

  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.key.toLowerCase()) {
    case 'g':
      e.preventDefault();
      togglePlayerVisibility();
      break;

    case 'arrowup':
    case '+':
      e.preventDefault();
      changeVolume(0.05);
      break;

    case 'arrowdown':
    case '-':
      e.preventDefault();
      changeVolume(-0.05);
      break;

    case '?':
      e.preventDefault();
      toggleKeyboardHelpModal();
      break;

    case 'escape':
      e.preventDefault();
      const modal = document.querySelector('#keyboardHelpModal');
      if (modal) modal.style.display = 'none';
      break;

    case 'm':
      e.preventDefault();
      toggleMute();
      break;

    case 's':
      e.preventDefault();
      toggleShuffle();
      break;

    case 'r':
      e.preventDefault();
      toggleRepeatMode();
      break;

    case 'arrowright':
      e.preventDefault();
      playNext();
      break;

    case 'arrowleft':
      e.preventDefault();
      playPrevious();
      break;

    case ' ':
      e.preventDefault();
      togglePlayPause();
      break;

    default:
      break;
  }
}

createKeyboardHelpModal();

export function toggleRemoveOnPlayMode() {
  const setting = !musicPlayerState.userSettings.removeOnPlay;
  musicPlayerState.userSettings.removeOnPlay = setting;
  saveUserSettings();

  const btn = document.querySelector('.remove-on-play-btn');
  if (!btn) return;

  const onTitle  = config.languageLabels.removeOnPlayOn  || "Çaldıktan sonra sil: Açık";
  const offTitle = config.languageLabels.removeOnPlayOff || "Çaldıktan sonra sil: Kapalı";
  btn.title = setting ? onTitle : offTitle;
  btn.classList.remove('active', 'passive');
  btn.classList.add(setting ? 'active' : 'passive');

  btn.innerHTML = setting
    ? '<i class="fas fa-trash-list"></i>'
    : '<i class="fas fa-trash-list"></i>';

  const message = setting
    ? `<i class="fas fa-trash-list"></i> ${config.languageLabels.removeOnPlayOn || "Çaldıktan sonra sil modu açık"}`
    : `<i class="fas fa-trash-list crossed-icon"></i> ${config.languageLabels.removeOnPlayOff || "Çaldıktan sonra sil modu kapalı"}`;

  showNotification(message, 2000, 'kontrol');
}

export function initializeControlStates() {
  const repeatBtn = document.querySelector('.player-btn .fa-repeat, .player-btn .fa-repeat-1')?.parentElement;
  if (repeatBtn) {
    const isActive = musicPlayerState.userSettings.repeatMode !== 'none';
    repeatBtn.classList.remove('active', 'passive');
    repeatBtn.classList.add(isActive ? 'active' : 'passive');
  }

  const shuffleBtn = document.querySelector('.player-btn .fa-random')?.parentElement;
  if (shuffleBtn) {
    const isActive = musicPlayerState.userSettings.shuffle;
    shuffleBtn.classList.remove('active', 'passive');
    shuffleBtn.classList.add(isActive ? 'active' : 'passive');
  }

  const removeBtn = document.querySelector('.remove-on-play-btn');
  if (removeBtn) {
    const isActive = musicPlayerState.userSettings.removeOnPlay;
    removeBtn.classList.remove('active', 'passive');
    removeBtn.classList.add(isActive ? 'active' : 'passive');
  }
}

export function destroyControls() {
  try { disableKeyboardControls(); } catch {}
  try { volumeAbort?.abort(); } catch {}
  volumeAbort = null;
}
