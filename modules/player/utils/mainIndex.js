import { musicPlayerState, loadUserSettings } from "../core/state.js";
import { initMediaSession } from "../core/mediaSession.js";
import { refreshPlaylist } from "../core/playlist.js";
import { createModernPlayerUI } from "../ui/playerUI.js";
import { setupMobileTouchControls } from "./domUtils.js";
import { loadJSMediaTags } from "../lyrics/id3Reader.js";
import { setupAudioListeners } from "../player/progress.js";

export async function initPlayer() {
  try {
    await loadJSMediaTags();
    loadUserSettings();

    const playerElements = createModernPlayerUI();
    setupAudioListeners();


    if (/Android/i.test(navigator.userAgent)) {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          updateMediaMetadata(musicPlayerState.playlist[musicPlayerState.currentIndex]);
        }
      });

      window.addEventListener('beforeunload', () => {
        musicPlayerState.mediaSession.metadata = null;
      });
    }

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('autoplay') === 'true') {
      await refreshPlaylist();
    }

    return playerElements;
  } catch (err) {
    console.error("Oynatıcı başlatılırken hata:", err);
    throw err;
  }
}

export function togglePlayerVisibility() {
    musicPlayerState.isPlayerVisible = !musicPlayerState.isPlayerVisible;
    musicPlayerState.modernPlayer.classList.toggle("visible", musicPlayerState.isPlayerVisible);

    if (musicPlayerState.modernPlayer) {
        if (musicPlayerState.isPlayerVisible) {
            musicPlayerState.modernPlayer.removeAttribute('aria-hidden');
            musicPlayerState.modernPlayer.inert = false;
            setTimeout(() => musicPlayerState.playPauseBtn.focus(), 100);
        } else {
            document.activeElement.blur();
            musicPlayerState.modernPlayer.setAttribute('aria-hidden', 'true');
            musicPlayerState.modernPlayer.inert = true;
        }
    }
}

export function isPlayerInitialized() {
    return musicPlayerState.modernPlayer !== null;
}
