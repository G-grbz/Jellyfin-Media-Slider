import { initPlayer, togglePlayerVisibility, isPlayerInitialized } from "./utils/mainIndex.js";
import { refreshPlaylist } from "./core/playlist.js";
import { updateProgress, updateDuration } from "./player/progress.js";
import { checkForNewMusic } from "./ui/artistModal.js";
import { loadJSMediaTags } from "./lyrics/id3Reader.js";
import { getConfig } from "../config.js";
import { initializeControlStates } from "./ui/controls.js";

const config = getConfig();

let stylesInjected = false;
function ensurePointerStylesInjected() {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement("style");
  style.id = "gmmp-pointer-style";
  style.textContent = `
    html .skinHeader { pointer-events: all !important; }
    button#jellyfinPlayerToggle {
      display: block !important;
      opacity: 1 !important;
      pointer-events: all !important;
      background: none !important;
      text-shadow: rgb(255 255 255) 0 0 2px !important;
      cursor: pointer !important;
      border: none !important;
      transform: scale(1.2) !important;
    }
  `;
  document.head.appendChild(style);
}

function forceSkinHeaderPointerEvents() {
  ensurePointerStylesInjected();
}

function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const to = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Zaman aşımı bekleniyor ${selector}`));
    }, timeout);
    const cleanupResolve = (el) => {
      clearTimeout(to);
      return el;
    };
    resolve = ((orig) => (v) => orig(cleanupResolve(v)))(resolve);
  });
}

export function loadCSS() {
  const { playerTheme: theme = "dark", playerStyle = "player", fullscreenMode = false } = getConfig();
  document.querySelectorAll('link[data-jellyfin-player-css]').forEach(l => l.remove());

  const baseLink = document.createElement("link");
  baseLink.rel = "stylesheet";
  baseLink.setAttribute("data-jellyfin-player-css", "base");
  baseLink.href = `./slider/src/${playerStyle}-${theme}.css`;
  document.head.appendChild(baseLink);

  if (fullscreenMode && isMobileDevice()) {
    const fsLink = document.createElement("link");
    fsLink.rel = "stylesheet";
    fsLink.setAttribute("data-jellyfin-player-css", "fullscreen");
    fsLink.href = `./slider/src/fullscreen.css`;
    document.head.appendChild(fsLink);
  }
}

export function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function createPlayerButton() {
  const cfg = getConfig();
  if (typeof cfg !== "undefined" && cfg.enabledGmmp !== false) {
    const btn = document.createElement("button");
    btn.id = "jellyfinPlayerToggle";
    btn.type = "button";
    btn.className = "headerSyncButton syncButton headerButton headerButtonRight paper-icon-button-light";
    btn.setAttribute("is", "paper-icon-button-light");
    btn.setAttribute("aria-label", "GMMP Aç/Kapa");
    btn.title = "GMMP";
    btn.innerHTML = `<i class="material-icons gmmp" aria-hidden="true">play_arrow</i>`;
    return btn;
  }
  return null;
}

let initInProgress = false;

async function onToggleClick() {
  if (initInProgress) return;

  try {
    forceSkinHeaderPointerEvents();
    initializeControlStates();

    if (!isPlayerInitialized()) {
      initInProgress = true;

      await loadJSMediaTags();
      checkForNewMusic();

      await initPlayer();
      await new Promise(r => setTimeout(r, 250));

      togglePlayerVisibility();
      await refreshPlaylist();
      setTimeout(() => {
        try {
          updateDuration();
          updateProgress();
        } catch (e) {
          console.debug("Progress/duration update skipped:", e);
        }
      }, 500);

    } else {
      togglePlayerVisibility();
      checkForNewMusic();
    }
  } catch (err) {
    console.error("GMMP geçiş hatası:", err);
  } finally {
    initInProgress = false;
  }
}

export async function addPlayerButton() {
  try {
    forceSkinHeaderPointerEvents();
    loadCSS();

    const header = await waitForElement(".headerRight");
    if (document.getElementById("jellyfinPlayerToggle")) return;

    const btn = createPlayerButton();
    if (!btn) return;
    header.insertBefore(btn, header.firstChild);

    btn.addEventListener("click", onToggleClick, { passive: true });
  } catch (err) {
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    forceSkinHeaderPointerEvents();
    addPlayerButton();
  }, { once: true });
} else {
  forceSkinHeaderPointerEvents();
  addPlayerButton();
}
