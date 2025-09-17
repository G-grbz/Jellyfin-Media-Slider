const QUALITY_CACHE_STORAGE_KEY = 'videoQualityCache';

let inMemoryOnly = false;
let pendingSave = null;

function storageAvailable() {
  try {
    const x = '__vq_test__';
    localStorage.setItem(x, '1');
    localStorage.removeItem(x);
    return true;
  } catch {
    return false;
  }
}

function now() { return Date.now(); }
function normalizeEntry(raw) {
  if (!raw) return null;
  if (typeof raw === 'object' && ('q' in raw || 't' in raw || 'ts' in raw)) {
    return { quality: raw.q, type: raw.t, timestamp: raw.ts };
  }
  if (typeof raw === 'object') {
    return { quality: raw.quality, type: raw.type, timestamp: raw.timestamp };
  }
  return null;
}

function denormalizeEntry(entry) {
  return { q: entry.quality, t: entry.type, ts: entry.timestamp };
}

function scheduleSave(saveFn) {
  if (inMemoryOnly) return;
  if (pendingSave) return;
  pendingSave = true;

  const run = () => {
    pendingSave = null;
    saveFn();
  };

  try {
    (window.requestIdleCallback || setTimeout)(run, 200);
  } catch {
    setTimeout(run, 200);
  }
}

function tryLocalStorageSet(key, value, evictBatch, getOldestKeys) {
  if (inMemoryOnly || !storageAvailable()) return false;

  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      let attempts = 0;
      while (attempts < 10) {
        attempts++;
        const toDelete = getOldestKeys(evictBatch);
        if (!toDelete.length) break;
        for (const k of toDelete) {
          videoQualityCache.data.delete(k);
        }
        try {
          const obj = {};
          for (const [k, v] of videoQualityCache.data.entries()) {
            obj[k] = denormalizeEntry(v);
          }
          const s = JSON.stringify(obj);
          localStorage.setItem(key, s);
          return true;
        } catch (e2) {
        }
      }
      console.warn('[qualityCache] QuotaExceeded: kalıcı depolama devre dışı bırakıldı (in-memory only).');
      inMemoryOnly = true;
      return false;
    }
    console.warn('[qualityCache] localStorage setItem hatası:', err);
    inMemoryOnly = true;
    return false;
  }
}

const videoQualityCache = {
  data: new Map(),
  maxSize: 300,
  softCeil: 260,

  load() {
    this.data.clear();
    if (!storageAvailable()) {
      inMemoryOnly = true;
      return;
    }
    const str = localStorage.getItem(QUALITY_CACHE_STORAGE_KEY);
    if (!str) return;
    try {
      const obj = JSON.parse(str);
      for (const [k, raw] of Object.entries(obj)) {
        const v = normalizeEntry(raw);
        if (!v) continue;
        if (v.type && (v.type === 'Movie' || v.type === 'Episode')) {
          this.data.set(k, v);
        }
      }
      if (this.data.size > this.maxSize) {
        const excess = this.data.size - this.maxSize;
        for (let i = 0; i < excess; i++) {
          const oldestKey = this.data.keys().next().value;
          this.data.delete(oldestKey);
        }
        this.save(true);
      }
    } catch (e) {
      console.warn('[qualityCache] Yükleme hatası, sıfırlanıyor:', e);
      this.data.clear();
    }
  },

  save(force = false) {
    if (inMemoryOnly) return;

    const doSave = () => {
      try {
        while (this.data.size > this.maxSize) {
          const oldestKey = this.data.keys().next().value;
          this.data.delete(oldestKey);
        }

        const obj = {};
        for (const [k, v] of this.data.entries()) {
          obj[k] = denormalizeEntry(v);
        }
        const s = JSON.stringify(obj);
        const ok = tryLocalStorageSet(
          QUALITY_CACHE_STORAGE_KEY,
          s,
          40,
          (n) => {
            const keys = [];
            const it = this.data.keys();
            for (let i = 0; i < n; i++) {
              const { value, done } = it.next();
              if (done) break;
              keys.push(value);
            }
            return keys;
          }
        );
        if (!ok) {
        }
      } catch (e) {
        console.warn('[qualityCache] Save hatası:', e);
        inMemoryOnly = true;
      }
    };

    if (force) {
      doSave();
    } else {
      scheduleSave(doSave);
    }
  },

  get(itemId) {
    return this.data.get(itemId) || null;
  },

  set(itemId, entry) {
    if (!entry?.type || (entry.type !== 'Movie' && entry.type !== 'Episode')) return;
    if (this.data.has(itemId)) this.data.delete(itemId);
    this.data.set(itemId, entry);
    if (this.data.size > this.softCeil) {
      while (this.data.size > this.softCeil) {
        const oldestKey = this.data.keys().next().value;
        this.data.delete(oldestKey);
      }
    }

    this.save(false);
  },

  clearAll() {
    this.data.clear();
    try {
      localStorage.removeItem(QUALITY_CACHE_STORAGE_KEY);
    } catch {}
    inMemoryOnly = false;
  }
};

videoQualityCache.load();

const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000;

export async function getCachedQuality(itemId) {
  const cached = videoQualityCache.get(itemId);
  if (!cached) return null;
  if (typeof cached !== 'object') return null;
  if ((now() - cached.timestamp) >= CACHE_EXPIRY) return null;
  if (cached.type !== 'Movie' && cached.type !== 'Episode') return null;
  return cached.quality || null;
}

export function getQualitySnapshot() {
  const out = new Map();
  const deadline = Date.now() - CACHE_EXPIRY;
  for (const [k, v] of videoQualityCache.data.entries()) {
    if (!v || typeof v !== 'object') continue;
    const ts = v.ts ?? v.timestamp;
    const t  = v.t  ?? v.type;
    const q  = v.q  ?? v.quality;
    if (!ts || ts < deadline) continue;
    if (!q) continue;
    if (t !== 'Movie' && t !== 'Episode') continue;
    out.set(k, q);
  }
  return out;
}

export function setCachedQuality(itemId, quality, type) {
  if (type !== 'Movie' && type !== 'Episode') return;
  if (!quality) return;
  videoQualityCache.set(itemId, {
    quality,
    type,
    timestamp: now()
  });
}

export function clearQualityCache() {
  try {
    videoQualityCache.clearAll();
  } catch (e) {
  }
}

try {
  window.addEventListener('pagehide', () => {
    try { videoQualityCache.save(true); } catch {}
  }, { once: true });
} catch {}
