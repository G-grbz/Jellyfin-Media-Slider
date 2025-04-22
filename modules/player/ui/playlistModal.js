import { musicPlayerState } from "../core/state.js";
import { getConfig } from "../../config.js";
import { playTrack } from "../player/playback.js";
import { saveCurrentPlaylistToJellyfin } from "../core/playlist.js";

const config = getConfig();

export function createPlaylistModal() {
  const modal = document.createElement("div");
  modal.id = "playlist-modal";
  const container = document.createElement("div");
  container.className = "playlist-container";

  const header = document.createElement("div");
  header.className = "playlist-header";

  const title = document.createElement("h3");
  title.className = "playlist-title";
  title.textContent = config.languageLabels.playlist;

  const closeBtn = document.createElement("div");
  closeBtn.className = "playlist-close";
  closeBtn.innerHTML = '<i class="fas fa-times"></i>';
  closeBtn.onclick = togglePlaylistModal;

  const saveBtn = document.createElement("div");
  saveBtn.className = "playlist-save";
  saveBtn.innerHTML = '<i class="fas fa-save"></i>';
  saveBtn.title = config.languageLabels.savePlaylist;
  saveBtn.onclick = async () => {
    const playlistName = prompt(
  config.languageLabels.enterPlaylistName,
  `GMMP Oynatma Listesi ${new Date().toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })}`
);
    if (playlistName) {
      try {
        await saveCurrentPlaylistToJellyfin(playlistName);
      } catch (err) {
        console.error("Playlist kaydedilemedi:", err);
      }
    }
  };

  const searchContainer = document.createElement("div");
  searchContainer.className = "playlist-search-container";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = config.languageLabels.searchTracks;
  searchInput.className = "playlist-search-input";

  searchInput.addEventListener("input", (e) => {
    filterPlaylistItems(e.target.value.toLowerCase());
  });

  searchContainer.appendChild(searchInput);
  container.appendChild(searchContainer);

  const headerButtons = document.createElement("div");
  headerButtons.className = "playlist-header-buttons";
  headerButtons.appendChild(saveBtn);
  headerButtons.appendChild(closeBtn);

  const itemsContainer = document.createElement("div");
  itemsContainer.className = "playlist-items";

  header.appendChild(title);
  header.appendChild(headerButtons);
  container.appendChild(header);
  container.appendChild(itemsContainer);
  modal.appendChild(container);
  document.body.appendChild(modal);

  musicPlayerState.playlistModal = modal;
  musicPlayerState.playlistItemsContainer = itemsContainer;
  musicPlayerState.playlistSearchInput = searchInput;
}

let outsideClickListener = null;

export function togglePlaylistModal(e) {
  const modal = musicPlayerState.playlistModal;

  if (modal.style.display === "flex") {
    modal.style.display = "none";
    removeOutsideClickListener();
  } else {
    updatePlaylistModal();
    modal.style.display = "flex";

    if (e) {
      const x = e.clientX;
      const y = e.clientY;
      const modalWidth = 300;
      const modalHeight = 400;
      const left = Math.min(x, window.innerWidth - modalWidth - 20);
      const top = Math.min(y, window.innerHeight - modalHeight - 20);
      modal.style.left = `${left}px`;
      modal.style.top = `${top}px`;
    } else {
      modal.style.left = "";
      modal.style.top = "";
    }

  setTimeout(() => {
      const activeItem = musicPlayerState.playlistItemsContainer.querySelector(".playlist-item.active");
      if (activeItem) {
        activeItem.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 0);

    addOutsideClickListener();
  }
}

function addOutsideClickListener() {
  if (outsideClickListener) return;

  outsideClickListener = (event) => {
    const modal = musicPlayerState.playlistModal;
    if (!modal.contains(event.target)) {
      modal.style.display = "none";
      removeOutsideClickListener();
    }
  };

  setTimeout(() => {
    document.addEventListener("click", outsideClickListener);
  }, 0);
}


function removeOutsideClickListener() {
  if (!outsideClickListener) return;

  document.removeEventListener("click", outsideClickListener);
  outsideClickListener = null;
}


export function updatePlaylistModal() {
  const itemsContainer = musicPlayerState.playlistItemsContainer;
  itemsContainer.innerHTML = "";

  musicPlayerState.playlist.forEach((track, index) => {
    const item = document.createElement("div");
    item.className = `playlist-item ${index === musicPlayerState.currentIndex ? "active" : ""}`;
    item.onclick = () => playTrack(index);

    const img = document.createElement("div");
    img.className = "playlist-item-img";
    const imageTag = track.AlbumPrimaryImageTag || track.PrimaryImageTag;
    if (imageTag) {
      const imageId = track.AlbumId || track.Id;
      img.style.backgroundImage = `url('${window.location.origin}/Items/${imageId}/Images/Primary?fillHeight=100&fillWidth=100&quality=80&tag=${imageTag}')`;
    }

    const info = document.createElement("div");
    info.className = "playlist-item-info";

    const title = document.createElement("div");
    title.className = "playlist-item-title";
    title.textContent = `${index + 1}. ${track.Name || config.languageLabels.unknownTrack}`;

    const artist = document.createElement("div");
    artist.className = "playlist-item-artist";
    artist.textContent = track.Artists?.join(", ") || config.languageLabels.unknownArtist;

    info.appendChild(title);
    info.appendChild(artist);
    item.appendChild(img);
    item.appendChild(info);
    itemsContainer.appendChild(item);
  });

  const activeItem = itemsContainer.querySelector(".playlist-item.active");
  if (activeItem) {
    activeItem.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}


function filterPlaylistItems(searchTerm) {
  const items = musicPlayerState.playlistItemsContainer.querySelectorAll(".playlist-item");

  items.forEach(item => {
    const title = item.querySelector(".playlist-item-title").textContent.toLowerCase();
    const artist = item.querySelector(".playlist-item-artist").textContent.toLowerCase();

    if (title.includes(searchTerm) || artist.includes(searchTerm)) {
      item.style.display = "flex";
    } else {
      item.style.display = "none";
    }
  });
}
