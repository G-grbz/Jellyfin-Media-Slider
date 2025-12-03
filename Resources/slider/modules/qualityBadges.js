import { getCachedQuality, setCachedQuality, clearQualityCache, getQualitySnapshot } from './cacheManager.js';
import { fetchItemDetails } from './api.js';
import { getVideoQualityText } from "./containerUtils.js";
import { getConfig } from "./config.js";

const config = getConfig();
const QB_VER = '3';
const STICKY_MODE = true;
const BATCH_SIZE = 24;
const MAX_CONCURRENCY = 3;
const MUTATION_DEBOUNCE_MS = 80;
const OBSERVER_ROOT_MARGIN = '300px';
const MEMORY_HINTS_MAX = 1000;

let snapshotMap = null;
let processingQueue = [];
let isDraining = false;
let active = 0;
let io = null;
let mo = null;

const observedCards = new WeakSet();
const queuedCards = new WeakSet();
const memoryQualityHints = new Map();

export function primeQualityFromItems(items = []) {
  for (const it of items) {
    try {
      if (!it || !it.Id) continue;
      if (!['Movie','Episode'].includes(it.Type)) continue;
      const vs = it.MediaStreams?.find(s => s.Type === 'Video');
      if (!vs) continue;
      const q = getVideoQualityText(vs);
      if (!q) continue;
      memoryQualityHints.set(it.Id, q);
      setCachedQuality(it.Id, q, it.Type);
      if (memoryQualityHints.size > MEMORY_HINTS_MAX) {
        const firstKey = memoryQualityHints.keys().next().value;
        memoryQualityHints.delete(firstKey);
      }
    } catch {}
  }
}

export function annotateDomWithQualityHints(root = document) {
  try {
    const nodes = root.querySelectorAll?.('.cardImageContainer, .cardOverlayContainer') || [];
    nodes.forEach(card => {
      const id = card.getAttribute('data-id') || card.closest?.('[data-id]')?.getAttribute('data-id');
      if (!id) return;
      const q = card.dataset.quality
            || memoryQualityHints.get(id)
            || snapshotMap?.get(id);
      if (q && !card.dataset.quality) {
        card.dataset.quality = q;
      }
    });
  } catch {}
}

export function addQualityBadge(card, itemId = null) {
  if (!card || !card.isConnected || !isValidItemType(card)) return;

  itemId = itemId || card.closest('[data-id]')?.getAttribute('data-id') || card.getAttribute('data-id');
  if (!itemId) return;
  if (card.querySelector('.quality-badge')) return;
  if (card.dataset.qbMounted === '1') return;
  card.dataset.qbMounted = '1';
  enqueueCard(card, itemId);
}

export function initializeQualityBadges() {
  if (config.enableQualityBadges && window.qualityBadgesInitialized) {
    cleanupQualityBadges();
  }
  ensureBadgeStyle();

  try { snapshotMap = getQualitySnapshot() || new Map(); } catch { snapshotMap = new Map(); }
  try { annotateDomWithQualityHints(document); } catch {}

  initObservers();

  window.qualityBadgesInitialized = true;
  return cleanupQualityBadges;
}

export function cleanupQualityBadges() {
  if (io) io.disconnect();
  if (mo) mo.disconnect();
  io = null;
  mo = null;

  processingQueue = [];
  active = 0;
  isDraining = false;

  window.qualityBadgesInitialized = false;
  snapshotMap = null;
}

export function removeAllQualityBadgesFromDOM() {
  if (STICKY_MODE) return;
  document.querySelectorAll('.quality-badge').forEach(el => el.remove());
}

export function rebuildQualityBadges() {
  cleanupQualityBadges();
  if (!STICKY_MODE) removeAllQualityBadgesFromDOM();
  initializeQualityBadges();
}

export function clearQualityBadgesCacheAndRefresh() {
  try {
    clearQualityCache();
  } finally {
    const nodes = document.querySelectorAll('.quality-badge');
    nodes.forEach(el => el.remove());
    rebuildQualityBadges();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.cardImageContainer, .cardOverlayContainer')) initializeQualityBadges();
  }, { once: true });
} else {
  if (document.querySelector('.cardImageContainer, .cardOverlayContainer')) initializeQualityBadges();
}

function isValidItemType(card) {
  const attrType =
    card.getAttribute?.('data-type') ||
    card.closest?.('[data-type]')?.getAttribute('data-type') ||
    card.dataset?.type;
  if (attrType) {
    const t = String(attrType).toLowerCase();
    if (t.includes('movie') || t.includes('episode') || t.includes('film') || t.includes('bölüm')) return true;
  }
  const raw = card.querySelector?.('.itemTypeIndicator')?.textContent || '';
  const txt = String(raw).toLowerCase().trim();
  if (txt) {
    if (/movie|episode|film|bölüm/.test(txt)) return true;
  }
  return true;
}

function ensureBadgeStyle() {
  if (document.getElementById('quality-badge-style')) return;
  const style = document.createElement('style');
  style.id = 'quality-badge-style';
  style.textContent = `
    .quality-badge {
      position: absolute;
      top: 0;
      left: 0;
      color: white;
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      z-index: 10;
      pointer-events: none;
      font-weight: 600;
      text-shadow: 0 1px 2px rgba(0,0,0,.6);
    }
    .quality-badge .quality-text {
    border-radius: 6px;
    padding: 3px 6px;
    line-height: 1;
    font-size: 12px;
    letter-spacing: .2px;
    gap: 2px;
    display: flex;
    flex-direction: row;
}
    .quality-badge img.quality-icon,
    .quality-badge img.range-icon,
    .quality-badge img.codec-icon {
      width: 24px !important;
      height: 18px !important;
      background: rgba(28,28,46,.9);
      border-radius: 4px;
      padding: 1px;
      display: inline-block;
      margin-top: 2px;
    }
  `;
  document.head.appendChild(style);
}

function decodeEntities(str = '') {
  const txt = document.createElement('textarea');
  txt.innerHTML = str;
  return txt.value;
}

function injectQualityMarkupSafely(container, html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const imgs = tmp.querySelectorAll('img');
  imgs.forEach(img => {
    const src = String(img.getAttribute('src') || '');
    const cls = String(img.getAttribute('class') || '');
    const classOk = /(quality-icon|range-icon|codec-icon)/.test(cls);
    const srcOk =
      src.startsWith('/slider/src/images/quality/');
    if (classOk && srcOk) {
      const safeImg = document.createElement('img');
      safeImg.className = cls;
      safeImg.alt = img.getAttribute('alt') || '';
      safeImg.src = src;
      container.appendChild(safeImg);
    }
  });
  if (!container.childNodes.length) {
    container.textContent = html.replace(/<[^>]+>/g, '');
  }
}

function createBadge(card, qualityText) {
  if (!card?.isConnected || !isValidItemType(card)) return;
  if (card.querySelector('.quality-badge')) return;
  if (!card.dataset.quality && qualityText) card.dataset.quality = qualityText;

  const badge = document.createElement('div');
  badge.className = 'quality-badge';
  const span = document.createElement('span');
  span.className = 'quality-text';

  const hasImgMarkup = /<\s*img/i.test(qualityText) || /&lt;\s*img/i.test(qualityText);
  if (hasImgMarkup) {
    const decoded = decodeEntities(qualityText);
    injectQualityMarkupSafely(span, decoded);
  } else {
    span.textContent = qualityText;
  }
  badge.appendChild(span);

  card.dataset.qbVer = QB_VER;
  if (STICKY_MODE) card.dataset.qbSticky = '1';

  card.appendChild(badge);
}

async function fetchAndCacheQuality(itemId) {
  try {
    const itemDetails = await fetchItemDetails(itemId);
    if (itemDetails && (itemDetails.Type === 'Movie' || itemDetails.Type === 'Episode')) {
      const videoStream = itemDetails.MediaStreams?.find(s => s.Type === "Video");
      if (videoStream) {
        const quality = getVideoQualityText(videoStream);
        await setCachedQuality(itemId, quality, itemDetails.Type);
        return quality;
      }
    }
  } catch (error) {
    if (error?.name !== 'QuotaExceededError') {
      console.error('Kalite bilgisi alınırken hata oluştu:', error);
    }
    throw error;
  }
  return null;
}

function enqueueCard(card, itemId) {
  if (!observedCards.has(card)) {
    observedCards.add(card);
    if (io) io.observe(card);
  }

  if (card.dataset.qbQueued === '1') return;
  card.dataset.qbQueued = '1';

  processingQueue.push({ card, itemId });
  if (!isDraining) drainQueueSoon();
}

function drainQueueSoon() {
  isDraining = true;
  setTimeout(drainQueue, 0);
}

function drainQueue() {
  let allot = Math.min(BATCH_SIZE, processingQueue.length);
  while (allot-- > 0 && active < MAX_CONCURRENCY) {
    const job = processingQueue.shift();
    if (!job) break;
    active++;
    processCard(job.card, job.itemId)
      .catch(()=>{})
      .finally(() => {
        active--;
        if (job.card?.dataset) job.card.dataset.qbQueued = '0';
        if (processingQueue.length) {
          setTimeout(drainQueue, 10);
        } else {
          isDraining = false;
        }
      });
  }
  if (processingQueue.length && active < MAX_CONCURRENCY) {
    setTimeout(drainQueue, 10);
  } else {
    isDraining = false;
  }
}

async function processCard(card, itemId) {
  if (!card?.isConnected || !isValidItemType(card)) return;
  if (card.querySelector('.quality-badge')) return;
  const hinted = card.dataset?.quality || memoryQualityHints.get(itemId) || snapshotMap?.get(itemId);
  if (hinted) {
    createBadge(card, hinted);
    return;
  }

  const cachedQuality = await getCachedQuality(itemId);
  if (cachedQuality) {
    createBadge(card, cachedQuality);
    return;
  }

  try {
    const quality = await fetchAndCacheQuality(itemId);
    if (quality && card.isConnected) createBadge(card, quality);
  } catch (error) {
    if (error?.name !== 'QuotaExceededError') {
      console.error(`Kart işlenirken hata oluştu (${itemId}):`, error);
    }
  }
}

function initObservers() {
  if (io) io.disconnect();
  if (mo) mo.disconnect();
  io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const card = entry.target;
      if (!isValidItemType(card)) {
        io.unobserve(card);
        continue;
      }
      const itemId = card.getAttribute('data-id') || card.closest?.('[data-id]')?.getAttribute('data-id');
      if (itemId) {
        enqueueCard(card, itemId);
      }
      io.unobserve(card);
    }
  }, { rootMargin: OBSERVER_ROOT_MARGIN, threshold: 0 });

  const pending = new Set();

  const flushPending = () => {
    if (!pending.size) return;
    const toProcess = Array.from(pending);
    pending.clear();
    for (const node of toProcess) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      if (node.classList?.contains('cardImageContainer') || node.classList?.contains('cardOverlayContainer')) {
        handleCard(node);
      } else if (node.querySelectorAll) {
        node.querySelectorAll('.cardImageContainer, .cardOverlayContainer').forEach(handleCard);
      }
    }
  };

  const debouncedFlush = debounce(flushPending, MUTATION_DEBOUNCE_MS);

  mo = new MutationObserver((mutations) => {
    let hasAdd = false;
    for (const m of mutations) {
      if (m.type !== 'childList' || m.addedNodes.length === 0) continue;
      hasAdd = true;
      for (const n of m.addedNodes) pending.add(n);
    }
    if (hasAdd) debouncedFlush();
  });

  document.querySelectorAll('.cardImageContainer, .cardOverlayContainer').forEach(handleCard);

  mo.observe(document.body, { childList: true, subtree: true, attributes: false, characterData: false });
}

function handleCard(card) {
  if (!isValidItemType(card)) return;
  annotateDomWithQualityHints(card);

  if (!observedCards.has(card) && !card.querySelector('.quality-badge')) {
    observedCards.add(card);
    if (io) io.observe(card);
  }
}

function debounce(fn, wait = 50) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), wait);
  };
}
