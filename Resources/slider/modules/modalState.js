export const modalState = {
  videoModal: null,
  modalVideo: null,
  modalTitle: null,
  modalMeta: null,
  modalMatchInfo: null,
  modalGenres: null,
  modalPlayButton: null,
  modalFavoriteButton: null,
  modalEpisodeLine: null,
  modalButtonsContainer: null,
  modalMatchButton: null,
  _modalContext: null,
  modalHoverState: false,
  isMouseInModal: false,
  modalHideTimeout: null,
  _cacheMaintenanceStarted: false,
  _ytApiLoading: false,
  isMouseInItem: false,
  _ytApiReady: false,
  _isModalClosing: false,
  _modalClosingUntil: 0,
  _lastModalHideAt: 0,
  _soundOn: true,
  _modalContext: null,
  _hoverOpenTimer: null,
  itemHoverAbortController: null,
  _currentHoverItemId: null,
  _lastItemEnterAt: 0,
  __openLatchUntil: 0,
  __lastOpenedItem: null,
  __volTapGuardAt: 0,
  __suppressOpenUntil: 0,
  inFlight: 0,
  progressBarEl: null,
};

export const set = (key, value) => { modalState[key] = value; };
export const get = (key) => modalState[key];

export function resetModalRefs() {
  modalState.videoModal = null;
  modalState.modalVideo = null;
  modalState.modalTitle = null;
  modalState.modalMeta = null;
  modalState.modalMatchInfo = null;
  modalState.modalGenres = null;
  modalState.modalPlayButton = null;
  modalState.modalFavoriteButton = null;
  modalState.modalEpisodeLine = null;
  modalState.modalButtonsContainer = null;
  modalState.modalMatchButton = null;
  modalState.progressBarEl = null;
}

export function resetModalFlags() {
  modalState.isMouseInModal = false;
  modalState.isMouseInItem = false;
  modalState._isModalClosing = false;
  modalState._modalClosingUntil = 0;
  modalState._hoverOpenTimer = null;
  modalState.itemHoverAbortController = null;
}
