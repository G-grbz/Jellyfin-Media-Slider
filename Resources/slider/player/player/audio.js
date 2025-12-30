import { musicPlayerState } from "../core/state.js";
import { playNext } from "./playback.js";

let audioEvtCtrl = null;
let endedHandlerRef = null;

function resetAudioEvtCtrl() {
  if (audioEvtCtrl) {
    try { audioEvtCtrl.abort(); } catch {}
  }
  audioEvtCtrl = new AbortController();
  return audioEvtCtrl.signal;
}

export function handleSongEnd() {
  switch (musicPlayerState.userSettings.repeatMode) {
    case "one":
      musicPlayerState.audio.currentTime = 0;
      musicPlayerState.audio.play().catch(e => console.error("Oynatma hatası:", e));
      break;
    case "all":
      playNext();
      break;
    default:
      if (musicPlayerState.currentIndex < musicPlayerState.playlist.length - 1) {
        playNext();
      }
  }
}

export function cleanupAudioListeners() {
  if (audioEvtCtrl) {
    try { audioEvtCtrl.abort(); } catch {}
    audioEvtCtrl = null;
  }
  endedHandlerRef = null;
}
