import { musicPlayerState } from "./state.js";
import { togglePlayPause, playPrevious, playNext } from "../player/playback.js";
import { getServerAddress } from "../../config.js";
import { makeCleanupBag, addEvent } from "../utils/cleanup.js";

const DEFAULT_ARTWORK_URL = "./slider/src/images/defaultArt.png";

let mediaBag = null;

export function initMediaSession() {
  if (!("mediaSession" in navigator)) {
    console.warn("MediaSession API desteklenmiyor");
    return;
  }

  cleanupMediaSession();

  mediaBag = makeCleanupBag(initMediaSession);

  try {
    const actionHandlers = {
      play: () => togglePlayPause(),
      pause: () => togglePlayPause(),
      previoustrack: () => playPrevious(),
      nexttrack: () => playNext(),
      seekbackward: (details) => handleSeekBackward(details),
      seekforward: (details) => handleSeekForward(details),
      seekto: (details) => handleSeekTo(details),
      stop: () => handleStopAction()
    };

    Object.entries(actionHandlers).forEach(([action, handler]) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (error) {
      }
      mediaBag.add(() => {
        try { navigator.mediaSession.setActionHandler(action, null); } catch {}
      });
    });
    setupHeadphoneControls();
    updatePlaybackState();

  } catch (error) {
    console.error("MediaSession initialization failed:", error);
  }
}

function setupHeadphoneControls() {
  if (!mediaBag) return;
  const onKey = (e) => {
    switch (e.key) {
      case "MediaPlayPause": togglePlayPause(); break;
      case "MediaTrackPrevious": playPrevious(); break;
      case "MediaTrackNext": playNext(); break;
    }
  };
  addEvent(mediaBag, document, "keydown", onKey);
  if ("bluetooth" in navigator) {
    const onAvail = (event) => {
      if (event?.value) {
      }
    };
    addEvent(mediaBag, navigator.bluetooth, "availabilitychanged", onAvail);
  }
}

function handleSeekBackward() {
  const a = musicPlayerState.audio;
  if (!a) return;
  a.currentTime = Math.max(0, a.currentTime - 10);
  updatePositionState();
}
function handleSeekForward() {
  const a = musicPlayerState.audio;
  if (!a) return;
  const dur = getEffectiveDuration();
  a.currentTime = Math.min(isFinite(dur) ? dur : a.duration || Infinity, a.currentTime + 10);
  updatePositionState();
}
function handleSeekTo(details) {
  const a = musicPlayerState.audio;
  if (!a) return;
  if (details?.seekTime != null) {
    a.currentTime = details.seekTime;
    updatePositionState();
  }
}
function handleStopAction() {
  const a = musicPlayerState.audio;
  if (!a) return;
  a.pause();
  a.currentTime = 0;
  updatePlaybackUI(false);
}

export function updatePositionState() {
  if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
  const a = musicPlayerState.audio;
  if (!a) return;

  const duration = getEffectiveDuration();
  if (!isFinite(duration) || duration <= 0) return;

  try {
    navigator.mediaSession.setPositionState({
      duration,
      playbackRate: a.playbackRate || 1,
      position: Math.min(a.currentTime ?? 0, Math.max(0, duration - 0.1))
    });
  } catch (error) {
  }
}

export async function updateMediaMetadata(track) {
  if (!("mediaSession" in navigator)) return;

  try {
    const metadata = {
      title: track?.Name || track?.title || "Unknown Track",
      artist:
        track?.Artists?.join(", ") ||
        track?.ArtistItems?.map((a) => a.Name).join(", ") ||
        track?.artist ||
        "Unknown Artist",
      album: track?.Album || "Unknown Album",
      artwork: await getTrackArtwork(track)
    };

    navigator.mediaSession.metadata = new MediaMetadata(metadata);
    updatePlaybackState();
  } catch (error) {
    console.error("[MediaSession] Metadata güncelleme başarısız:", error);
  }
}

async function getTrackArtwork(track) {
  if (track?.AlbumPrimaryImageTag || track?.PrimaryImageTag) {
    const imageId = track.AlbumId || track.Id;
    const serverAddress = getServerAddress();
    return [
      {
        src: `${serverAddress}/Items/${imageId}/Images/Primary?quality=90&tag=${track.AlbumPrimaryImageTag || track.PrimaryImageTag}`,
        sizes: "512x512",
        type: "image/jpeg"
      }
    ];
  }
  return [
    {
      src: DEFAULT_ARTWORK_URL,
      sizes: "512x512",
      type: "image/png"
    }
  ];
}

function updatePlaybackState() {
  const a = musicPlayerState.audio;
  if (!a || !("mediaSession" in navigator)) return;
  navigator.mediaSession.playbackState = a.paused ? "paused" : "playing";
}

function getEffectiveDuration() {
  const { audio, currentTrack } = musicPlayerState;

  if (audio && isFinite(audio.duration) && audio.duration > 0) {
    return audio.duration;
  }
  if (currentTrack?.RunTimeTicks) {
    return currentTrack.RunTimeTicks / 10_000_000;
  }
  if (isFinite(musicPlayerState.currentTrackDuration)) {
    return musicPlayerState.currentTrackDuration;
  }
  return 0;
}

export function cleanupMediaSession() {
  if (!mediaBag) return;
  try { mediaBag.run(); } catch {}
  mediaBag = null;
  if ("mediaSession" in navigator) {
    try { navigator.mediaSession.playbackState = "none"; } catch {}
    try { navigator.mediaSession.metadata = null; } catch {}
  }
}
