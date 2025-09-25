import { musicPlayerState } from "../core/state.js";
import { handleSongEnd } from "./playback.js";
import { updateSyncedLyrics } from "../lyrics/lyrics.js";

let uiEvtCtrl = null;
let mediaCtrl = null;
let positionUpdateInterval = null;
let isDragging = false;
let isClick = false;
let dragStartX = 0;
let dragStartTime = 0;
let lastUpdateTime = 0;

function resetUiEvtCtrl() {
  if (uiEvtCtrl) {
    try { uiEvtCtrl.abort(); } catch {}
  }
  uiEvtCtrl = new AbortController();
  return uiEvtCtrl.signal;
}
function resetMediaCtrl() {
  if (mediaCtrl) {
    try { mediaCtrl.abort(); } catch {}
  }
  mediaCtrl = new AbortController();
  return mediaCtrl.signal;
}

export function formatTime(seconds) {
  if (!isFinite(seconds)) return "0:00";
  const minutes = Math.floor(Math.min(seconds, 5999) / 60);
  const secs = Math.floor(Math.min(seconds, 5999) % 60);
  return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
}

function getEffectiveDuration() {
  const { audio } = musicPlayerState;

  if (audio && isFinite(audio.duration) && audio.duration > 0) {
    return audio.duration;
  }
  if (isFinite(musicPlayerState.currentTrackDuration)) {
    return musicPlayerState.currentTrackDuration;
  }
  return 30;
}

function updateMediaPositionState() {
  if ("mediaSession" in navigator && musicPlayerState.audio) {
    try {
      navigator.mediaSession.setPositionState({
        duration: getEffectiveDuration(),
        playbackRate: musicPlayerState.audio.playbackRate,
        position: musicPlayerState.audio.currentTime
      });
    } catch (e) {
      console.warn("MediaSession konum durumu güncellemesi başarısız:", e);
    }
  }
}

export function initMediaSessionHandlers() {
  const signal = resetMediaCtrl();

  if (!("mediaSession" in navigator)) return;

  try {
    const audio = musicPlayerState.audio;
    if (!audio) return;

    navigator.mediaSession.setActionHandler("play", () => {
      audio.play().catch(e => console.error("Oynatma hatası:", e));
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      audio.pause();
    });
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime != null) {
        audio.currentTime = details.seekTime;
        updateProgress();
        updateMediaPositionState();
      }
    });
    navigator.mediaSession.setActionHandler("seekforward", () => {
      audio.currentTime = Math.min(getEffectiveDuration(), audio.currentTime + 10);
      updateProgress();
      updateMediaPositionState();
    });
    navigator.mediaSession.setActionHandler("seekbackward", () => {
      audio.currentTime = Math.max(0, audio.currentTime - 10);
      updateProgress();
      updateMediaPositionState();
    });

    if (/Android/i.test(navigator.userAgent)) {
      if (positionUpdateInterval) clearInterval(positionUpdateInterval);
      positionUpdateInterval = setInterval(updateMediaPositionState, 1000);
    }

    signal.addEventListener("abort", () => {
      if (positionUpdateInterval) {
        clearInterval(positionUpdateInterval);
        positionUpdateInterval = null;
      }
      try {
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
        navigator.mediaSession.setActionHandler("seekto", null);
        navigator.mediaSession.setActionHandler("seekforward", null);
        navigator.mediaSession.setActionHandler("seekbackward", null);
        navigator.mediaSession.playbackState = "none";
      } catch {}
    });

  } catch (error) {
    console.warn("MediaSession eylem işleyicisi desteklenmiyor:", error);
  }
}

export function setupAudioListeners() {
  if (musicPlayerState.__audioCtrl && !musicPlayerState.__audioCtrl.signal.aborted) {
    try { musicPlayerState.__audioCtrl.abort(); } catch {}
  }
  const ctrl = new AbortController();
  musicPlayerState.__audioCtrl = ctrl;
  const signal = ctrl.signal;

  const { audio } = musicPlayerState;
  if (!audio) return;

  const timeupdateCombined = () => {
    updateProgress();
    updateMediaPositionState();
  };

  audio.addEventListener("timeupdate", timeupdateCombined, { signal });
  audio.addEventListener("timeupdate", updateSyncedLyrics, { signal });
  const onEnded = () => {
    try {
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "none";
    } catch {}
    handleSongEnd();
  };
  audio.addEventListener("ended", onEnded, { signal, once: true });

  audio.addEventListener("loadedmetadata", () => {
    updateDuration();
    updateMediaPositionState();
  }, { signal });

  initMediaSessionHandlers();
}

export function setupProgressControls() {
  const { progressBar, progressHandle } = musicPlayerState;
  if (!progressBar || !progressHandle) return;
  const signal = resetUiEvtCtrl();

  progressBar.addEventListener("mousedown", handleMouseDown, { signal });
  progressBar.addEventListener("touchstart", handleTouchStart, { signal, passive: false });
  progressBar.addEventListener("click", handleClick, { signal });
  progressHandle.addEventListener("mousedown", handleMouseDown, { signal });
  progressHandle.addEventListener("touchstart", handleTouchStart, { signal, passive: false });

  document.addEventListener("mousemove", handleMouseMove, { signal });
  document.addEventListener("mouseup", handleMouseUp, { signal });
  document.addEventListener("touchmove", handleTouchMove, { signal, passive: false });
  document.addEventListener("touchend", handleTouchEnd, { signal });

  progressBar.addEventListener("wheel", handleWheel, { signal, passive: false });
  signal.addEventListener("abort", () => {
    isDragging = false;
    isClick = false;
  });

  updateProgress();
}

function handleMouseDown(e) {
  if (!e.target.closest(".player-progress-bar, .player-progress-handle")) return;

  dragStartX = e.clientX;
  dragStartTime = Date.now();
  isClick = true;
  isDragging = true;
  e.preventDefault();
}
function handleTouchStart(e) {
  if (!e.target.closest(".player-progress-bar, .player-progress-handle")) return;

  dragStartX = e.touches[0].clientX;
  dragStartTime = Date.now();
  isClick = true;
  isDragging = true;
  e.preventDefault();
}
function handleClick(e) {
  if (!isClick || isDragging) return;
  seekToPosition(e.clientX);
}
function handleMouseMove(e) {
  if (!isDragging) return;

  const movedDistance = Math.abs(e.clientX - dragStartX);
  const elapsedTime = Date.now() - dragStartTime;

  if (isClick && (movedDistance > 5 || elapsedTime > 100)) {
    isClick = false;
  }
  seekToPosition(e.clientX);
}
function handleTouchMove(e) {
  if (!isDragging) return;

  const movedDistance = Math.abs(e.touches[0].clientX - dragStartX);
  const elapsedTime = Date.now() - dragStartTime;

  if (isClick && (movedDistance > 5 || elapsedTime > 100)) {
    isClick = false;
  }
  seekToPosition(e.touches[0].clientX);
  e.preventDefault();
}
function handleMouseUp() {
  if (isClick) seekToPosition(dragStartX);
  endDrag();
}
function handleTouchEnd() {
  if (isClick) seekToPosition(dragStartX);
  endDrag();
}
function endDrag() {
  isDragging = false;
  isClick = false;
}

function seekToPosition(clientX) {
  const { audio, progressBar, progressHandle, durationEl } = musicPlayerState;
  if (!audio || !progressBar) return;

  const rect = progressBar.getBoundingClientRect();
  const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
  const percent = (x / rect.width) * 100;
  const dur = getEffectiveDuration();
  const seekTime = (percent / 100) * dur;

  if (isFinite(seekTime)) {
    audio.currentTime = seekTime;
    if (progressHandle) progressHandle.style.left = `${percent}%`;
    updateProgress();
    updateMediaPositionState();

    const remaining = Math.max(0, dur - audio.currentTime);
    if (durationEl) durationEl.textContent = `-${formatTime(remaining)}`;
  }
}

export function updateProgress() {
  const now = Date.now();
  if (now - lastUpdateTime < 200 && !isDragging) return;
  lastUpdateTime = now;

  const { audio, progress, currentTimeEl, progressHandle, durationEl, showRemaining } = musicPlayerState;
  const dur = getEffectiveDuration();

  if (!progress || !currentTimeEl || !durationEl) return;

  if (!isFinite(dur) || dur <= 0) {
    progress.style.width = `0%`;
    if (progressHandle) progressHandle.style.left = `0%`;
    currentTimeEl.textContent = formatTime(audio?.currentTime || 0);
    durationEl.textContent = formatTime(dur);
    return;
  }

  const current = Math.min(dur, (audio?.currentTime || 0));
  const percent = Math.min(100, (current / dur) * 100);
  progress.style.width = `${percent}%`;
  if (progressHandle) progressHandle.style.left = `${percent}%`;

  currentTimeEl.textContent = formatTime(current);
  if (showRemaining) {
    const remaining = Math.max(0, dur - current);
    durationEl.textContent = `-${formatTime(remaining)}`;
  } else {
    durationEl.textContent = formatTime(dur);
  }
}

export function updateDuration() {
  const { durationEl } = musicPlayerState;
  if (!durationEl) return;
  const dur = getEffectiveDuration();
  durationEl.textContent = formatTime(dur);
}

export function cleanupMediaSession() {
  if (positionUpdateInterval) {
    clearInterval(positionUpdateInterval);
    positionUpdateInterval = null;
  }
  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("seekto", null);
      navigator.mediaSession.setActionHandler("seekforward", null);
      navigator.mediaSession.setActionHandler("seekbackward", null);
      navigator.mediaSession.playbackState = "none";
    } catch {}
  }

  if (mediaCtrl) {
    try { mediaCtrl.abort(); } catch {}
    mediaCtrl = null;
  }
}

export function cleanupProgressControls() {
  if (uiEvtCtrl) {
    try { uiEvtCtrl.abort(); } catch {}
    uiEvtCtrl = null;
  }
  isDragging = false;
  isClick = false;
}

function handleWheel(e) {
  e.preventDefault();
  const { audio } = musicPlayerState;
  if (!audio) return;

  const delta = e.deltaY > 0 ? -1 : 1;
  const seekAmount = 1;

  audio.currentTime = Math.max(0, Math.min(audio.currentTime + (delta * seekAmount), getEffectiveDuration()));

  updateProgress();
  updateMediaPositionState();

  const { progressHandle } = musicPlayerState;
  if (progressHandle) {
    setTimeout(() => {
      progressHandle.style.transform = "";
    }, 200);
  }
}
