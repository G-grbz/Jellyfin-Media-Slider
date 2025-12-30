import { musicPlayerState } from "./state.js";

const DEFAULT_MAX_ENTRIES = 500;
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 7;

let store = new Map();
let LIMITS = { maxEntries: DEFAULT_MAX_ENTRIES, ttlMs: DEFAULT_TTL_MS };

let maintenanceTimer = null;
function ensureMaintenanceTimer() {
  if (maintenanceTimer) return;
  maintenanceTimer = setInterval(maintain, 60_000);
}

function maintain() {
  const now = Date.now();
  for (const [id, rec] of store) {
    if (LIMITS.ttlMs > 0 && now - (rec.at || 0) > LIMITS.ttlMs) {
      store.delete(id);
    }
  }
  while (store.size > LIMITS.maxEntries) {
    const oldestKey = store.keys().next().value;
    store.delete(oldestKey);
  }
}

function touch(id) {
  const rec = store.get(id);
  if (!rec) return;
  store.delete(id);
  rec.at = Date.now();
  store.set(id, rec);
}

function upsert(id) {
  let rec = store.get(id);
  if (!rec) {
    rec = { at: Date.now(), lyrics: undefined, artwork: undefined };
    store.set(id, rec);
  } else {
    rec.at = Date.now();
    store.delete(id);
    store.set(id, rec);
  }
  maintain();
  return rec;
}

export function setOfflineCacheLimits({ maxEntries, ttlMs } = {}) {
  if (Number.isFinite(maxEntries) && maxEntries > 0) LIMITS.maxEntries = maxEntries;
  if (Number.isFinite(ttlMs) && ttlMs >= 0) LIMITS.ttlMs = ttlMs;
  maintain();
}

export function purgeOfflineCache({ onlyExpired = false } = {}) {
  if (onlyExpired) {
    maintain();
    return;
  }
  store.clear();
}

function isCacheEnabled() {
  return !!(musicPlayerState?.offlineCache?.enabled);
}

export async function cacheForOffline(trackId, type, data) {
  if (!isCacheEnabled()) return;

  try {
    ensureMaintenanceTimer();
    if (typeof trackId !== "string" && typeof trackId !== "number") return;

    const id = String(trackId);
    const rec = upsert(id);

    if (type === "lyrics") {
      rec.lyrics = data;
    } else if (type === "artwork") {
      rec.artwork = data;
    }
    touch(id);
  } catch (err) {
    console.error("Önbellekleme hatası:", err);
  }
}

export async function getFromOfflineCache(trackId, type) {
  if (!isCacheEnabled()) return null;

  try {
    ensureMaintenanceTimer();
    const id = String(trackId);
    const rec = store.get(id);
    if (!rec) return null;

    if (LIMITS.ttlMs > 0 && Date.now() - (rec.at || 0) > LIMITS.ttlMs) {
      store.delete(id);
      return null;
    }

    touch(id);

    if (type === "lyrics" && rec.lyrics != null) return rec.lyrics;
    if (type === "artwork" && rec.artwork != null) return rec.artwork;
    return null;
  } catch (err) {
    console.error("Önbellekten okuma hatası:", err);
    return null;
  }
}

