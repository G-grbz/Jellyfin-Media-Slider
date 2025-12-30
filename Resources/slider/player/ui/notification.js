import { getConfig } from "../../config.js";

const config = getConfig();

let notificationQueue = [];
let isShowing = false;
let containerEl = null;
let currentEl = null;
let currentType = null;
let hideTimer = null;
let removeFallbackTimer = null;

const timers = new Set();
function setSafeTimeout(fn, ms) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
}
function clearAllTimers() {
  for (const id of timers) clearTimeout(id);
  timers.clear();
}

const MAX_QUEUE = 20;

function getNotificationClass(type) {
  const typeMap = {
    success: 'success',
    error: 'error',
    warning: 'warning',
    info: 'info',
    tur: 'info',
    kontrol: 'info',
    addlist: 'addlist',
    db: 'db',
    default: ''
  };
  return typeMap[type] || typeMap.default;
}

function ensureContainer() {
  if (containerEl && document.body.contains(containerEl)) return containerEl;

  const el = document.createElement('div');
  el.className = 'notifications-container';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  document.body.appendChild(el);
  el.addEventListener('click', (e) => {
    if (!currentEl) return;
    if (e.target === currentEl || currentEl.contains(e.target)) {
      hideAndRemoveCurrent(120);
    }
  });

  containerEl = el;
  return el;
}

function clearCurrentTimers() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    timers.delete(hideTimer);
    hideTimer = null;
  }
  if (removeFallbackTimer) {
    clearTimeout(removeFallbackTimer);
    timers.delete(removeFallbackTimer);
    removeFallbackTimer = null;
  }
}

function onTransitionEndOnce(node, cb, fallbackMs = 400) {
  let called = false;
  const handler = () => {
    if (called) return;
    called = true;
    try { node.removeEventListener('transitionend', handler); } catch {}
    cb();
  };
  node.addEventListener('transitionend', handler, { once: true });
  removeFallbackTimer = setSafeTimeout(handler, fallbackMs);
}

function hideAndRemoveCurrent(fadeMs = 300) {
  if (!currentEl) return;
  currentEl.style.transition = `transform ${fadeMs}ms ease, opacity ${fadeMs}ms ease`;
  currentEl.style.transform = 'translateY(20px)';
  currentEl.style.opacity = '0';

  clearCurrentTimers();

  onTransitionEndOnce(currentEl, () => {
    try { currentEl.remove(); } catch {}
    currentEl = null;
    currentType = null;
    if (containerEl && containerEl.children.length === 0) {
      try { containerEl.remove(); } catch {}
      containerEl = null;
    }
    processQueue();
  });
}

export function showNotification(message, duration = 2000, type = 'default') {
  if (config.notificationsEnabled === false) return;
  if (isShowing && type !== 'default' && type === currentType && currentEl) {
    currentEl.innerHTML = message;
    clearCurrentTimers();
    hideTimer = setSafeTimeout(() => hideAndRemoveCurrent(), duration);
    return;
  }

  if (type !== 'default') {
    notificationQueue = notificationQueue.filter(n => n.type !== type);
  }
  notificationQueue.push({ message, duration, type });
  if (notificationQueue.length > MAX_QUEUE) {
    notificationQueue.splice(0, notificationQueue.length - MAX_QUEUE);
  }

  if (!isShowing) {
    processQueue();
  }
}

function processQueue() {
  if (notificationQueue.length === 0) {
    isShowing = false;
    return;
  }

  isShowing = true;
  const { message, duration, type } = notificationQueue.shift();
  const container = ensureContainer();
  const notification = document.createElement('div');
  notification.className = `notification ${getNotificationClass(type)}`;
  notification.innerHTML = message;
  notification.style.transform = 'translateY(20px)';
  notification.style.opacity = '0';
  container.appendChild(notification);

  requestAnimationFrame(() => {
    notification.style.transform = 'translateY(0)';
    notification.style.opacity = '1';
  });

  currentEl = notification;
  currentType = type;
  clearCurrentTimers();
  hideTimer = setSafeTimeout(() => hideAndRemoveCurrent(), duration);
}

export function dismissAllNotifications() {
  clearCurrentTimers();
  clearAllTimers();
  notificationQueue = [];
  isShowing = false;

  if (currentEl) {
    try { currentEl.remove(); } catch {}
    currentEl = null;
    currentType = null;
  }

  if (containerEl) {
    try { containerEl.remove(); } catch {}
    containerEl = null;
  }
}

export function destroyNotificationSystem() {
  dismissAllNotifications();
}
