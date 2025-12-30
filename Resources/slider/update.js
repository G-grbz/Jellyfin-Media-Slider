import { getConfig } from "./config.js";

export function compareSemver(a = "0.0.0", b = "0.0.0") {
  const norm = v => String(v).trim().replace(/^v/i, "");
  const pa = norm(a).split("-");
  const pb = norm(b).split("-");
  const mainA = pa[0].split(".").map(n => parseInt(n || "0", 10));
  const mainB = pb[0].split(".").map(n => parseInt(n || "0", 10));
  for (let i = 0; i < 3; i++) {
    const da = mainA[i] || 0;
    const db = mainB[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  const preA = pa[1];
  const preB = pb[1];
  if (preA && !preB) return -1;
  if (!preA && preB) return 1;
  if (preA && preB) {
    if (preA > preB) return 1;
    if (preA < preB) return -1;
  }
  return 0;
}

export async function fetchLatestGitHubVersion(owner = "G-grbz", repo = "Jellyfin-MonWUI-Plugin") {
  try {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
      headers: { "Accept": "application/vnd.github+json" }
    });
    if (r.ok) {
      const data = await r.json();
      return {
        version: data.tag_name || data.name || "",
        html_url: data.html_url || `https://github.com/${owner}/${repo}/releases`
      };
    }
  } catch (_) {}

  try {
    const r2 = await fetch(`https://api.github.com/repos/${owner}/${repo}/tags`, {
      headers: { "Accept": "application/vnd.github+json" }
    });
    if (r2.ok) {
      const list = await r2.json();
      if (Array.isArray(list) && list.length) {
        const t = list[0];
        return {
          version: t.name || "",
          html_url: `https://github.com/${owner}/${repo}/tags`
        };
      }
    }
  } catch (_) {}

  return { version: "", html_url: `https://github.com/${owner}/${repo}` };
}

export function getCurrentVersionFromEnv() {
  try {
    const cfg = (typeof getConfig === "function") ? getConfig() : {};
    if (cfg?.extensionVersion) return String(cfg.extensionVersion);
    if (cfg?.version)          return String(cfg.version);
    if (typeof window !== "undefined" && window.JMS_VERSION) return String(window.JMS_VERSION);
    const meta = document.querySelector?.('meta[name="jms-version"]');
    if (meta?.content) return String(meta.content);
    const s = document.currentScript || document.querySelector?.('script[data-jms-version]');
    if (s?.dataset?.jmsVersion) return String(s.dataset.jmsVersion);
  } catch {}
  return "0.0.0";
}

function notifyUpdateViaNotifications(latest, url, remindMs) {
  if (typeof window !== "undefined" && typeof window.jfNotifyUpdateAvailable === "function") {
    window.jfNotifyUpdateAvailable({ latest, url, remindMs });
  }
}

export function startUpdatePolling(options = {}) {
  const {
    intervalMs = 60 * 60 * 1000,
    minGapMs   = 60 * 60 * 1000,
    owner = "G-grbz",
    repo  = "Jellyfin-MonWUI-Plugin",
    storagePrefix = "JMS_UPT_",
    enabled = true,
    dedupScope = "forever",
    remindEveryMs = 12 * 60 * 60 * 1000
  } = options;

  if (!enabled || typeof window === "undefined" || typeof document === "undefined") return;

  const KEY_LAST_CHECK       = storagePrefix + "LAST_CHECK";
  const KEY_LAST_SEEN_LATEST = storagePrefix + "LAST_SEEN_LATEST";
  const KEY_LAST_REMIND_AT   = storagePrefix + "LAST_REMIND_AT";
  const store = (dedupScope === "session") ? sessionStorage : localStorage;

  const now = () => Date.now();
  const shouldSkipByGap = () => {
    const last = parseInt(store.getItem(KEY_LAST_CHECK) || "0", 10);
    return last && (now() - last) < minGapMs;
  };
  const markChecked     = () => store.setItem(KEY_LAST_CHECK, String(now()));
  const seenLatest      = () => (store.getItem(KEY_LAST_SEEN_LATEST) || "");
  const markSeenLatest  = (v) => store.setItem(KEY_LAST_SEEN_LATEST, v);
  const getLastRemind   = () => parseInt(store.getItem(KEY_LAST_REMIND_AT) || "0", 10);
  const markRemind      = () => store.setItem(KEY_LAST_REMIND_AT, String(now()));

  const doCheck = async () => {
    if (shouldSkipByGap()) return;
    markChecked();

    try {
      const current = getCurrentVersionFromEnv();
      const { version: latest, html_url } = await fetchLatestGitHubVersion(owner, repo);
      if (!latest) return;

      const cmp = compareSemver(latest, current);
      if (cmp > 0) {
        const already = seenLatest() === latest;
        let allowNotify = false;
        if (dedupScope === "none") allowNotify = true;
        else if (!already)         allowNotify = true;
        else if (remindEveryMs != null) allowNotify = (now() - getLastRemind()) >= remindEveryMs;

        if (allowNotify) {
          notifyUpdateViaNotifications(latest, html_url, remindEveryMs);
          markSeenLatest(latest);
          markRemind();
        }
      }
    } catch (e) {
      console.warn("güncelleme denetim hatası", e);
    }
  };

  doCheck();
  const timer = setInterval(doCheck, intervalMs);
  const onVis = () => { if (!document.hidden) doCheck(); };
  document.addEventListener("visibilitychange", onVis);

  return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVis); };
}
