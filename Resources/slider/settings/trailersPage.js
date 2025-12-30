import { createSection, createCheckbox, createTextInput } from '../settings.js';
import { showNotification } from "../player/ui/notification.js";

const LS_JOB_KEY = 'jmsf_trailer_job_running';
const SS_SECRETS_KEY = 'jmsf_trailer_secrets';

function setJobFlag(on) {
  try { on ? localStorage.setItem(LS_JOB_KEY, String(Date.now())) : localStorage.removeItem(LS_JOB_KEY); } catch {}
}
function getJobFlag() {
  try { return !!localStorage.getItem(LS_JOB_KEY); } catch { return false; }
}
function loadSecrets() {
  try { return JSON.parse(sessionStorage.getItem(SS_SECRETS_KEY) || '{}'); } catch { return {}; }
}
function saveSecrets(obj) {
  try { sessionStorage.setItem(SS_SECRETS_KEY, JSON.stringify(obj || {})); } catch {}
}

async function getAuthHeaders() {
  let token = null, userId = null;
  if (window.ApiClient) {
    try { token = window.ApiClient._serverInfo?.AccessToken || window.ApiClient.accessToken?.(); } catch {}
    try { const u = await window.ApiClient.getCurrentUser(); userId = u?.Id || null; } catch {}
  }
  const h = { 'Content-Type': 'application/json' };
  if (token)  h['X-Emby-Token']  = token;
  if (userId) h['X-Emby-UserId'] = userId;
  return h;
}

async function checkUserIsAdmin() {
  try {
    if (!window.ApiClient) return false;
    const user = await window.ApiClient.getCurrentUser();
    return !!(user && user.Policy && user.Policy.IsAdministrator);
  } catch (error) {
    console.error('Kullanıcı yetki kontrolü hatası:', error);
    return false;
  }
}

function mapEnumToWire(val) {
  if (!val) return 'skip';
  const s = String(val).toLowerCase();
  if (s.includes('replace')) return 'replace';
  if (s.includes('better'))  return 'if-better';
  return 'skip';
}
function mapWireToEnum(val) {
  const s = String(val || '').toLowerCase();
  if (s === 'replace')    return 'Replace';
  if (s === 'if-better')  return 'IfBetter';
  return 'Skip';
}
function parseIntSafe(x){ const n=Number(x); return Number.isFinite(n)?n:0; }

function fmtStr(str, params) {
  if (!params) return String(str ?? '');
  return String(str ?? '').replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ''));
}

function translateLogLine(line, L) {
  if (!line) return line;

  line = line
    .replace(/^\[INFO\]/,  L.logInfo)
    .replace(/^\[WARN\]/,  L.logWarn)
    .replace(/^\[HATA\]/,  L.logError)
    .replace(/^\[OK\]/,    L.logOk)
    .replace(/^\[ATLA\]/,  L.logSkip)
    .replace(/^\[INDIR\]/, L.logDownload)
    .replace(/^\[DEBUG\]/, L.logDebug);

  const rules = [
    { re: /Bu script bash gerektirir/i, out: L.shRequiresBash },
    { re: /WORK_DIR oluşturulamadı/i,   out: L.shWorkdirCreateFailed },
    { re: /Hata:\s*([A-Za-z0-9_\-.]+)\s+kurulu değil\./i, out: (m) => fmtStr(L.shDependencyMissing, { bin: m[1] }) },
    { re: /Uyarı:\s*ffprobe yok/i,      out: L.shFfprobeMissing },
    { re: /Hata:\s*JF_API_KEY ve TMDB_API_KEY ayarla/i, out: L.shSetApiKeys },
    { re: /OVERWRITE_POLICY geçersiz/i, out: L.shInvalidOverwrite },
    { re: /Kullanıcı bulunamadı/i,      out: L.shUserNotFound },
    { re: /\[DEBUG\]\s*İşleniyor:\s*(.+?)\s*\(IMDb:\s*(.*?),\s*TMDb:\s*(.*?),\s*Tür:\s*(.+?)\)/i,
      out: (m) => fmtStr(L.shProcessing, { name: m[1], imdb: m[2] || '-', tmdb: m[3] || '-', type: m[4] }) },
    { re: /Zaten var: .*theme\.mp4 kuruldu\/korundu/i, out: L.shAlreadyExistsThemeDone },
    { re: /Zaten var:/i,               out: L.shAlreadyExists },
    { re: /Üzerine yazılacak:/i,       out: L.shOverwriteReplace },
    { re: /if-better modu/i,           out: L.shIfBetterMode },
    { re: /TMDb ID yok/i,              out: L.shTmdbMissing },
    { re: /Series TMDb yok|Series TMDb/i, out: L.shSeriesTmdbMissing },
    { re: /Tür desteklenmiyor/i,       out: L.shUnsupportedType },
    { re: /Yol yok/i,                  out: L.shNoPath },
    { re: /Hedefte yetersiz boş alan/i, out: L.shInsufficientSpaceDest },
    { re: /Çalışma klasöründe yetersiz boş alan/i, out: L.shInsufficientSpaceWork },
    { re: /Denenen #(\d+):\s*([a-z]+):([A-Za-z0-9_\-]+)/i,
      out: (m) => fmtStr(L.shTryingCandidate, { n: m[1], site: m[2], key: m[3] }) },
    { re: /->\s*(.+?)\s*\[([a-z]+):([A-Za-z0-9_\-]+)\]\s*\(source quality\)/i,
      out: (m) => fmtStr(L.shDownloading, { name: '', year: '', out: m[1], site: m[2], key: m[3] }) },
    { re: /yt-dlp deneme #(\d+) başarısız/i,
      out: (m) => fmtStr(L.shYtDlpRetryFail, { n: m[1] }) },
    { re: /Diskte yer kalmamış/i, out: L.shNoSpaceLeft },
    { re: /Dosya çok küçük/i,          out: L.shFileTooSmall },
    { re: /Süre kısa/i,                out: L.shDurationShort },
    { re: /Yeni trailer daha iyi bulundu.*değiştiriliyor/i, out: L.shIfBetterNewIsBetter },
    { re: /Mevcut trailer daha iyi\/eşdeğer.*yenisi silindi/i, out: L.shIfBetterOldIsBetter },
    { re: /Eklendi ve yenilendi/i,     out: L.shMovedAddedRefreshed },
    { re: /Uygun indirilebilir trailer bulunamadı/i, out: L.shNoDownloadableFound },
    { re: /Geçici dosyalar temizleniyor/i, out: L.shCleaningTemps },
    { re: new RegExp('^' + L.rxFinishedProcessed + '$', 'i'), out: (m) => fmtStr(L.shFinishedCount, { n: m[1] }) },
    { re: new RegExp(L.rxSummaryOkFail, 'i'), out: (m) => fmtStr(L.shSummaryLine, { ok: m[1], fail: m[2], skip: '?' }) },
  ];

  for (const rule of rules) {
    const m = line.match(rule.re);
    if (m) return typeof rule.out === 'function' ? rule.out(m) : rule.out;
  }
  return line;
}

function translateLogBlock(allText, L) {
  if (!allText) return '';
  return allText
    .split(/\r?\n/)
    .map((ln) => translateLogLine(ln, L))
    .join('\n');
}

export function createTrailersPanel(config, labels) {
  const L = {
    trailersHeader: labels?.trailersHeader || 'Fragman İndirme / NFO',
    enableTrailerDownloader: labels?.enableTrailerDownloader || 'Fragman indir (trailers.sh)',
    enableTrailerUrlNfo: labels?.enableTrailerUrlNfo || 'Sadece URLyi NFO ya yaz (trailersurl.sh)',
    jfBase: labels?.jfBase || 'Jellyfin URL (JF_BASE)',
    jfApiKey: labels?.jfApiKey || 'Jellyfin API Key (JF_API_KEY)',
    tmdbApiKey: labels?.tmdbApiKey || 'TMDb API Key (TMDB_API_KEY)',
    preferredLang: labels?.preferredLang || 'Tercih edilen dil (PREFERRED_LANG)',
    fallbackLang: labels?.fallbackLang || 'Yedek dil (FALLBACK_LANG)',
    overwritePolicy: labels?.overwritePolicy || 'Overwrite Policy (trailers.sh)',
    enableThemeLink: labels?.enableThemeLink || 'backdrops/theme.mp4 symlink/kopya oluştur (ENABLE_THEME_LINK)',
    themeLinkMode: labels?.themeLinkMode || 'THEME_LINK_MODE',
    saveSettings: labels?.saveSettings || 'Kaydet',
    runNow: labels?.runNow || 'Şimdi Çalıştır',
    saving: labels?.saving || 'Kaydediliyor...',
    running: labels?.running || 'Çalışıyor...',
    settingsSaved: labels?.settingsSaved || 'Ayarlar kaydedildi.',
    atLeastOneOption: labels?.atLeastOneOption || 'En az bir seçenek işaretlenmeli.',
    done: labels?.done || 'İşlem tamamlandı.',
    runError: labels?.runError || 'Çalıştırma hatası.',
    saveError: labels?.saveError || 'Ayarlar kaydedilemedi: ',
    summaryDownloaderTitle: labels?.summaryDownloaderTitle || 'İndirici (trailers.sh)',
    summaryUrlNfoTitle: labels?.summaryUrlNfoTitle || 'NFO (trailersurl.sh)',
    summarySuccess: labels?.summarySuccess || 'Başarılı',
    summaryFailed: labels?.summaryFailed || 'Başarısız',
    summaryTotal: labels?.summaryTotal || 'Toplam',
    overwriteSkip: labels?.overwriteSkip || 'Atla (skip)',
    overwriteReplace: labels?.overwriteReplace || 'Üzerine yaz (replace)',
    overwriteIfBetter: labels?.overwriteIfBetter || 'Daha iyiyse değiştir (if-better)',
    modeSymlink: labels?.modeSymlink || 'Sembolik bağ (symlink)',
    modeHardlink: labels?.modeHardlink || 'Sıkı bağ (hardlink)',
    modeCopy: labels?.modeCopy || 'Kopyala (copy)',
    settingsReadOnly: labels?.settingsReadOnly || 'Yönetici olmayan kullanıcılar ayarları değiştiremez',
    showSecret: labels?.showSecret || 'Göster',
    hideSecret: labels?.hideSecret || 'Gizle',
    confirmTitle: labels?.confirmTitle || 'Uzun Süreli İşlem',
    confirmBody: labels?.confirmBody || 'Bu işlem uzun sürebilir. Devam etmek istiyor musunuz?',
    confirmOk: labels?.confirmOk || 'Evet, Başlat',
    confirmCancel: labels?.confirmCancel || 'Vazgeç',
    confirm: labels?.confirm || 'Başlat',
    cancel: labels?.cancel || 'İptal Et',
    copy: labels?.copy || 'Kopyala',
    log: labels?.log || 'Canlı Log',
    clean: labels?.clean || 'Temizle',
    close: labels?.close || 'Kapat',
    adim: labels?.adim || 'Yürütülen',
    copied: labels?.copied || 'Panoya Kopyalandı',
    copyFailed: labels?.copyFailed || 'Kopyalanamadı',
    showLog: labels?.showLog || "Log'u Göster",
    hideLog: labels?.hideLog || "Log'u Gizle",
    noLogToCopy: labels?.noLogToCopy || 'Kopyalanacak log yok',
    progressTitle: labels?.progressTitle || 'Fragman Görevi Çalışıyor',
    stopButton: labels?.stopButton || 'Bitir',
    stopping: labels?.stopping || 'Durduruluyor...',
    cancelled: labels?.cancelled || 'İş iptal edildi.',
    alreadyRunning: labels?.alreadyRunning || 'Zaten çalışan bir iş var; ilerlemeye bağlanılıyor.',
    noteDescription: labels?.noteDescription || 'Sadece eklenti yöntemi ile yüklenerek çalışır ve gerekli araçların (curl, jq, trailers.sh için yt-dlp ve ffmpeg) kurulu olması gerekir',
    logInfo: labels?.logInfo || '[INFO]',
    logWarn: labels?.logWarn || '[WARN]',
    logError: labels?.logError || '[HATA]',
    logOk: labels?.logOk || '[OK]',
    logSkip: labels?.logSkip || '[ATLA]',
    logDownload: labels?.logDownload || '[INDIR]',
    logDebug: labels?.logDebug || '[DEBUG]',
    shRequiresBash: labels?.shRequiresBash || "Bu betik bash gerektirir. 'bash trailers.sh' ile çalıştırın.",
    shWorkdirCreateFailed: labels?.shWorkdirCreateFailed || 'Çalışma klasörü oluşturulamadı',
    shDependencyMissing: labels?.shDependencyMissing || 'Eksik bağımlılık: {bin}',
    shFfprobeMissing: labels?.shFfprobeMissing || 'ffprobe yok; süre/boyut kontrolü sınırlı',
    shSetApiKeys: labels?.shSetApiKeys || 'JF_API_KEY ve TMDB_API_KEY ayarlanmalı',
    shInvalidOverwrite: labels?.shInvalidOverwrite || 'OVERWRITE_POLICY geçersiz (skip|replace|if-better)',
    shUserNotFound: labels?.shUserNotFound || 'Kullanıcı bulunamadı',
    shProcessing: labels?.shProcessing || 'İşleniyor: {name} (IMDb: {imdb}, TMDb: {tmdb}, Tür: {type})',
    shAlreadyExistsThemeDone: labels?.shAlreadyExistsThemeDone || 'Zaten var, theme.mp4 kuruldu/korundu',
    shAlreadyExists: labels?.shAlreadyExists || 'Zaten var',
    shOverwriteReplace: labels?.shOverwriteReplace || 'Üzerine yazılacak',
    shIfBetterMode: labels?.shIfBetterMode || 'if-better modu: karşılaştırma için indirilecek',
    shTmdbMissing: labels?.shTmdbMissing || 'TMDb ID yok',
    shSeriesTmdbMissing: labels?.shSeriesTmdbMissing || 'Dizi TMDb ID yok',
    shUnsupportedType: labels?.shUnsupportedType || 'Tür desteklenmiyor',
    shNoPath: labels?.shNoPath || 'Yol yok',
    shInsufficientSpaceDest: labels?.shInsufficientSpaceDest || 'Hedefte yetersiz boş alan',
    shInsufficientSpaceWork: labels?.shInsufficientSpaceWork || 'Çalışma klasöründe yetersiz boş alan',
    shTryingCandidate: labels?.shTryingCandidate || 'Denenen aday #{n}: {site}:{key}',
    shDownloading: labels?.shDownloading || '{name} ({year}) indiriliyor → {out} [{site}:{key}]',
    shYtDlpRetryFail: labels?.shYtDlpRetryFail || 'yt-dlp denemesi başarısız (#{n})',
    shNoSpaceLeft: labels?.shNoSpaceLeft || 'Diskte yer kalmadı',
    shFileTooSmall: labels?.shFileTooSmall || 'Dosya çok küçük',
    shDurationShort: labels?.shDurationShort || 'Süre kısa',
    shIfBetterNewIsBetter: labels?.shIfBetterNewIsBetter || 'Yeni trailer daha iyi (if-better): değiştiriliyor',
    shIfBetterOldIsBetter: labels?.shIfBetterOldIsBetter || 'Mevcut trailer daha iyi/eşdeğer: yenisi silindi',
    shMovedAddedRefreshed: labels?.shMovedAddedRefreshed || 'Eklendi ve yenilendi',
    shNoDownloadableFound: labels?.shNoDownloadableFound || 'Uygun indirilebilir trailer bulunamadı',
    shCleaningTemps: labels?.shCleaningTemps || 'Geçici dosyalar temizleniyor',
    shFinishedCount: labels?.shFinishedCount || 'Bitti: işlenen={n}',
    shSummaryLine: labels?.shSummaryLine || 'ÖZET -> indirilen={ok}, başarısız={fail}, atlanan={skip}',
    rxFinishedProcessed: labels?.rxFinishedProcessed || 'BİTTİ:\\s*işlenen\\s*=\\s*(\\d+)',
    rxSummaryOkFail: labels?.rxSummaryOkFail || 'ÖZET\\s*->\\s*indirilen\\s*=\\s*(\\d+)\\s*,\\s*başarısız\\s*=\\s*(\\d+)',
    urlNfoTotal: labels?.urlNfoTotal || 'Toplam işlenen öğe',
    urlNfoOk: labels?.urlNfoOk || 'Başarılı (NFO eklendi)',
    urlNfoNotFound: labels?.urlNfoNotFound || 'Trailer bulunamadı',
    urlNfoFailWrite: labels?.urlNfoFailWrite || 'NFO yazma hatası',
    urlNfoFailRefresh: labels?.urlNfoFailRefresh || 'Refresh hatası',
    urlNfoNoTmdb: labels?.urlNfoNoTmdb || 'TMDb ID yok',
    urlNfoNoPath: labels?.urlNfoNoPath || 'Yol (Path) yok',
    urlNfoUnsupported: labels?.urlNfoUnsupported || 'Desteklenmeyen tür',
    urlNfoMisc: labels?.urlNfoMisc || 'Diğer/çeşitli',
  };
  function baseBtnCss() {
    return `appearance:none; border:1px solid rgba(255,255,255,.15); background: transparent; color:inherit; padding:8px 12px; border-radius:10px; cursor:pointer; transition:all .2s;`;
  }
  function primaryBtnCss() {
    return `appearance:none; border:1px solid rgba(34,197,94,.6); background: rgba(34,197,94,.1); color:#bbf7d0; padding:8px 12px; border-radius:10px; cursor:pointer; transition:all .2s;`;
  }
  function dangerBtnCss() {
    return `appearance:none; border:1px solid rgba(239,68,68,.6); background: rgba(239,68,68,.12); color:#fecaca; padding:8px 12px; border-radius:10px; cursor:pointer; transition:all .2s;`;
  }

  function createModal() {
    const overlay = document.createElement('div');
    overlay.className = 'jf-modal-overlay';
    overlay.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,.45); display: none; align-items: center; justify-content: center; z-index: 99999;`;

    const modal = document.createElement('div');
    modal.className = 'jf-modal';
    modal.style.cssText = `width: min(820px, 94vw); background: var(--theme-body-bg, #111827); color: var(--theme-body-text, #e5e7eb); border-radius: 16px; padding: 18px 18px 16px; box-shadow: 0 10px 40px rgba(0,0,0,.4); border: 1px solid rgba(255,255,255,.08); display:flex; flex-direction:column; max-height:90vh;`;

    const title = document.createElement('div');
    title.className = 'jf-modal-title';
    title.style.cssText = `font-weight:700; font-size:1.05rem; margin-bottom:6px;`;

    const body = document.createElement('div');
    body.className = 'jf-modal-body';
    body.style.cssText = `font-size:.95rem; opacity:.9; margin-bottom:12px; white-space:pre-wrap;`;

    const progressWrap = document.createElement('div');
    progressWrap.style.cssText = `margin:6px 0 8px 0; display:none;`;

    const progressBar = document.createElement('div');
    progressBar.style.cssText = `height: 10px; border-radius: 999px; background: rgba(255,255,255,.1); overflow: hidden;`;
    const progressInner = document.createElement('div');
    progressInner.style.cssText = `height:100%; width:0%; background: linear-gradient(90deg, #22c55e, #84cc16); transition: width .35s ease;`;
    progressBar.appendChild(progressInner);
    progressWrap.appendChild(progressBar);

    const sub = document.createElement('div');
    sub.className = 'jf-modal-sub';
    sub.style.cssText = `font-size:.82rem; opacity:.85; margin:6px 0;`;

    const logWrap = document.createElement('div');
    logWrap.style.cssText = `display:none; margin-top:6px; flex:1; min-height:140px; overflow-y: scroll; overflow-x: hidden; scrollbar-color: #e91e63 #20202000 !important; scrollbar-width: thin; padding: 5px;`;

    const logHeader = document.createElement('div');
    logHeader.style.cssText = `display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;`;
    const logTitle = document.createElement('span');
    logTitle.textContent = L.log;
    logTitle.style.cssText = 'opacity:.9;';
    const logBtns = document.createElement('div');
    logBtns.style.cssText = 'display:flex; gap:6px;';

    const btnCopyLog = document.createElement('button');
    btnCopyLog.textContent = L.copy;
    btnCopyLog.style.cssText = baseBtnCss();
    const btnClearLog = document.createElement('button');
    btnClearLog.textContent = L.clean;
    btnClearLog.style.cssText = baseBtnCss();

    logBtns.append(btnCopyLog, btnClearLog);
    logHeader.append(logTitle, logBtns);

    const log = document.createElement('pre');
    log.className = 'jf-modal-log';
    log.style.cssText = `background: rgba(255,255,255,.06); padding:10px; border-radius:12px; height:100%; overflow:auto; white-space:pre-wrap; font-size:.83rem; line-height:1.25;`;

    logWrap.append(logHeader, log);

    const row = document.createElement('div');
    row.style.cssText = `display:flex; gap:8px; justify-content:flex-end; margin-top:12px; flex-wrap:wrap;`;

    const btnToggleLog = document.createElement('button');
    btnToggleLog.textContent = L.showLog;
    btnToggleLog.className = 'btn-toggle-log';
    btnToggleLog.style.cssText = baseBtnCss();
    btnToggleLog.style.display = 'none';

    const btnCancel = document.createElement('button');
    btnCancel.textContent = L.cancel;
    btnCancel.className = 'btn-cancel';
    btnCancel.style.cssText = baseBtnCss();

    const btnOk = document.createElement('button');
    btnOk.textContent = L.confirm;
    btnOk.className = 'btn-ok';
    btnOk.style.cssText = primaryBtnCss();

    const btnStop = document.createElement('button');
    btnStop.textContent = L.stopButton;
    btnStop.className = 'btn-stop';
    btnStop.style.cssText = dangerBtnCss();
    btnStop.style.display = 'none';

    row.append(btnToggleLog, btnCancel, btnStop, btnOk);
    modal.append(title, body, progressWrap, sub, logWrap, row);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    btnCopyLog.onclick = async () => {
      const txt = log.textContent || '';
      if (!txt.trim()) {
        showNotification(L.noLogToCopy, 2200, 'warning');
        return;
      }
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(txt);
        } else {
          const ta = document.createElement('textarea');
          ta.value = txt;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          ta.style.pointerEvents = 'none';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        showNotification(L.copied, 2500, 'success');
      } catch (e) {
        showNotification(L.copyFailed, 2500, 'error');
      }
    };
    btnClearLog.onclick = () => { log.textContent = ''; };

    logWrap.dataset.forceHidden = '0';

    btnToggleLog.onclick = () => {
      const hidden = logWrap.style.display === 'none';
      if (hidden) {
        logWrap.style.display = '';
        btnToggleLog.textContent = L.hideLog;
        logWrap.dataset.forceHidden = '0';
      } else {
        logWrap.style.display = 'none';
        btnToggleLog.textContent = L.showLog;
        logWrap.dataset.forceHidden = '1';
      }
    };

    return { overlay, modal, title, body, progressWrap, progressBar, progressInner, sub, logWrap, log, btnCancel, btnOk, btnStop, btnToggleLog };
  }
  const panel = document.createElement('div');
  panel.id = 'trailers-panel';
  panel.className = 'settings-panel';

  const section = createSection(L.trailersHeader);
  panel.appendChild(section);

  let isAdminUser = false;
  const trailerDownloaderCheckbox = createCheckbox('EnableTrailerDownloader', L.enableTrailerDownloader, config?.EnableTrailerDownloader === true);
  const trailerUrlNfoCheckbox     = createCheckbox('EnableTrailerUrlNfo',     L.enableTrailerUrlNfo,     config?.EnableTrailerUrlNfo === true);

  function getChk(elOrId) {
    if (elOrId instanceof HTMLElement) return elOrId.querySelector('input[type="checkbox"]');
    const byId = document.getElementById(elOrId);
    if (byId && byId.tagName === 'INPUT') return byId;
    const wrap = byId || document.querySelector(`#${CSS.escape(elOrId)}`);
    return wrap?.querySelector?.('input[type="checkbox"]') || null;
  }
  function exclusifyRefs(aInput, bInput) {
    if (!aInput || !bInput) return;
    const tie = (src, dst) => src.addEventListener('change', () => { if (src.checked) dst.checked = false; });
    tie(aInput, bInput); tie(bInput, aInput);
  }

  section.appendChild(trailerDownloaderCheckbox);
  section.appendChild(trailerUrlNfoCheckbox);
  exclusifyRefs(getChk(trailerDownloaderCheckbox), getChk(trailerUrlNfoCheckbox));

  const nonAdminInfo = document.createElement('div');
  nonAdminInfo.className = 'admin-info-message';
  nonAdminInfo.style.display = 'none';
  nonAdminInfo.style.color = '#ff6b6b';
  nonAdminInfo.style.margin = '10px 0';
  nonAdminInfo.style.fontStyle = 'italic';
  nonAdminInfo.textContent = L.settingsReadOnly;
  section.appendChild(nonAdminInfo);

  const adminOnlyWrap = document.createElement('div');
  adminOnlyWrap.id = 'trailers-admin-fields';
  adminOnlyWrap.style.display = 'none';
  section.appendChild(adminOnlyWrap);

  const modal = createModal();
  let pollTimer = null;
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
  function startPolling() { stopPolling(); pollTimer = setInterval(() => pollStatus(), 2000); }

  async function connectIfRunning({ forceOpen = false } = {}) {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/JMSFusion/trailers/status', { method: 'GET', headers });
      const data = await res.json().catch(() => ({}));
      if (data && data.ok === true && data.running) {
        if (forceOpen || modal.overlay.style.display === 'none') openProgressUi();
        updateProgressUi(data);
        startPolling();
        return true;
      }
    } catch {}
    return false;
  }

  async function pollStatus() {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/JMSFusion/trailers/status', { method: 'GET', headers });
      const data = await res.json().catch(() => ({}));
      if (!data || data.ok !== true) return;

      if (data.running) {
        setJobFlag(true);
        updateProgressUi(data);
      } else {
        updateProgressUi(data);
        setJobFlag(false);
        stopPolling();
      }
    } catch {}
  }

  function openConfirmUi() {
    modal.title.textContent = L.confirmTitle;
    modal.body.textContent = L.confirmBody;
    modal.sub.textContent = '';
    modal.progressWrap.style.display = 'none';
    modal.logWrap.style.display = 'none';
    modal.btnToggleLog.style.display = 'none';
    modal.btnOk.textContent = L.confirmOk;
    modal.btnOk.style.display = '';
    modal.btnStop.style.display = 'none';
    modal.btnCancel.textContent = L.confirmCancel;
    modal.overlay.style.display = 'flex';
  }
  function openProgressUi() {
    modal.title.textContent = L.progressTitle;
    modal.progressWrap.style.display = '';
    if (modal.logWrap.dataset.forceHidden !== '1') {
      modal.logWrap.style.display = '';
    }
    modal.btnOk.style.display = 'none';
    modal.btnStop.style.display = '';
    modal.btnCancel.textContent = L.close;
    modal.btnToggleLog.style.display = '';
    modal.btnToggleLog.textContent = (modal.logWrap.style.display === 'none') ? L.showLog : L.hideLog;
    modal.overlay.style.display = 'flex';
  }

  function toPct(x) {
    let n = null;
    if (typeof x === 'number') n = x;
    else if (typeof x === 'string') {
      const f = parseFloat(x.replace('%','').trim());
      if (Number.isFinite(f)) n = f;
    }
    if (n == null) return null;
    if (n > 0 && n <= 1) n = n * 100;
    return Math.max(0, Math.min(100, n));
  }

  function parseDownloaderSummary(stdout) {
    let total=0, success=0, fail=0;
    try {
      const reFinished = new RegExp(L.rxFinishedProcessed, 'i');
      const reSummary  = new RegExp(L.rxSummaryOkFail, 'i');
      const mTotal = stdout.match(reFinished);
      if (mTotal) total = parseIntSafe(mTotal[1]);
      const mLine  = stdout.match(reSummary);
      if (mLine) { success = parseIntSafe(mLine[1]); fail = parseIntSafe(mLine[2]); }
    } catch {}
    return { success, failed: fail, total };
  }

  function parseUrlNfoSummary(stdout) {
    const pick = (label) => {
      const re = new RegExp(label + "\\s*:\\s*(\\d+)", 'i');
      const m = stdout.match(re);
      return m ? parseIntSafe(m[1]) : 0;
    };
    const total = pick(L.urlNfoTotal);
    const ok = pick(L.urlNfoOk);
    const notFound = pick(L.urlNfoNotFound);
    const failWrite = pick(L.urlNfoFailWrite);
    const failRefresh = pick(L.urlNfoFailRefresh);
    const noTmdb = pick(L.urlNfoNoTmdb);
    const noPath = pick(L.urlNfoNoPath);
    const unsupported = pick(L.urlNfoUnsupported);
    const misc = pick(L.urlNfoMisc);
    const failed = notFound + failWrite + failRefresh + noTmdb + noPath + unsupported + misc;
    return { success: ok, failed, total };
  }

  function updateProgressUi(status) {
    const pct = toPct(status?.progress);
    modal.progressInner.style.width = (pct == null ? (status?.running ? 5 : 100) : pct) + '%';

    const stepTxt = status?.currentStep ?? '';
    modal.sub.textContent = stepTxt ? `${L.adim}: ${stepTxt} ${pct != null ? `(${pct.toFixed(1)}%)` : ''}` : (status?.running ? L.running : L.done);

    if (Array.isArray(status?.log)) {
      if (modal.logWrap.dataset.forceHidden !== '1') {
        modal.logWrap.style.display = '';
        modal.btnToggleLog.textContent = L.hideLog;
      }
      const raw = status.log.join('\n');
      modal.log.textContent = translateLogBlock(raw, L);
      modal.log.scrollTop = modal.log.scrollHeight;
    }

    if (!status?.running) {
      modal.btnStop.style.display = 'none';
      modal.btnCancel.textContent = L.close;

      if (Array.isArray(status?.results) && status.results.length > 0) {
        const lines = [];
        for (const r of status.results) {
          const name = (r?.script || '').toString();
          const stdout = (r?.stdout || '').toString();
          if (/trailers\.sh/i.test(name) || new RegExp(L.rxFinishedProcessed, 'i').test(stdout)) {
            const s = parseDownloaderSummary(stdout);
            lines.push(`${L.summaryDownloaderTitle}: ${L.summarySuccess}: ${s.success}, ${L.summaryFailed}: ${s.failed}${s.total?`, ${L.summaryTotal}: ${s.total}`:''}`);
          } else if (/trailersurl\.sh/i.test(name) || /===== ÖZET =====/i.test(stdout)) {
            const s = parseUrlNfoSummary(stdout);
            lines.push(`${L.summaryUrlNfoTitle}: ${L.summarySuccess}: ${s.success}, ${L.summaryFailed}: ${s.failed}${s.total?`, ${L.summaryTotal}: ${s.total}`:''}`);
          }
        }
        if (lines.length) {
          if (modal.logWrap.dataset.forceHidden !== '1') {
            modal.logWrap.style.display = '';
            modal.btnToggleLog.textContent = L.hideLog;
          }
          const extra = translateLogBlock(lines.join('\n'), L);
          modal.log.textContent += (modal.log.textContent ? '\n' : '') + extra;
          modal.log.scrollTop = modal.log.scrollHeight;
        }
      }
      stopPolling();
      setJobFlag(false);
    }
  }

  modal.btnCancel.onclick = () => { modal.overlay.style.display = 'none'; };

  modal.btnOk.onclick = async () => {
    modal.btnOk.disabled = true;
    try {
      const already = await connectIfRunning({ forceOpen: true });
      if (already) { showNotification(L.alreadyRunning, 2200, 'warning'); return; }

      const body = collectRunBody();
      if (!body.runDownloader && !body.runUrlNfo) {
        showNotification(L.atLeastOneOption, 2500, 'warning');
        modal.overlay.style.display = 'none';
        return;
      }
      openProgressUi();
      updateProgressUi({ running: true, progress: 5, currentStep: 'Hazırlanıyor...' });

      const headers = await getAuthHeaders();
      const res = await fetch('/JMSFusion/trailers/run', { method: 'POST', headers, body: JSON.stringify(body) });
      const txt = await res.text();
      let data = {}; try { data = JSON.parse(txt); } catch {}

      startPolling();
      setJobFlag(true);

      if (res.status === 409) {
        showNotification(L.alreadyRunning, 2500, 'warning');
        await pollStatus();
        return;
      }
      if (!res.ok && res.status !== 202) {
        throw new Error(data?.error || data?.Message || `HTTP ${res.status}: ${txt}`);
      }
    } catch (err) {
      showNotification(L.runError + ' ' + (err?.message || err), 3200, 'error');
      modal.overlay.style.display = 'none';
    } finally {
      modal.btnOk.disabled = false;
    }
  };

  modal.btnStop.onclick = async () => {
    modal.btnStop.disabled = true;
    modal.btnStop.textContent = L.stopping;
    try {
      const headers = await getAuthHeaders();
      await fetch('/JMSFusion/trailers/cancel', { method: 'POST', headers });
      startPolling();
      setTimeout(() => pollStatus(), 300);
    } catch {}
    finally {
      setTimeout(() => {
        modal.btnStop.disabled = false;
        modal.btnStop.textContent = L.stopButton;
      }, 800);
    }
  };

  let out = null;

  function attachAdminFields() {
    function createSecretInput(id, labelText) {
      const wrap = document.createElement('div');
      wrap.className = 'input-container';

      const label = document.createElement('label');
      label.htmlFor = id; label.textContent = labelText;

      const box = document.createElement('div');
      box.style.cssText = 'display:flex; gap:6px; align-items:center;';

      const input = document.createElement('input');
      input.type = 'password'; input.id = id;
      input.placeholder = '••••••••';
      input.autocomplete = 'new-password';

      const toggle = document.createElement('button');
      toggle.type = 'button'; toggle.textContent = L.showSecret;
      toggle.style.cssText = baseBtnCss();
      toggle.addEventListener('click', () => {
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        toggle.textContent = isHidden ? L.hideSecret : L.showSecret;
      });

      box.append(input, toggle);
      wrap.append(label, box);
      return wrap;
    }

    out = document.createElement('pre');
    out.className = 'script-output';
    out.style.cssText = 'white-space:pre-wrap; max-height:280px; overflow:auto; margin-top:8px;';

    function renderAdminFields() {
      adminOnlyWrap.appendChild(createTextInput('JFBase', L.jfBase, config?.JFBase || 'http://localhost:8096'));
      adminOnlyWrap.appendChild(createSecretInput('JFApiKey', L.jfApiKey));
      adminOnlyWrap.appendChild(createSecretInput('TmdbApiKey', L.tmdbApiKey));
      adminOnlyWrap.appendChild(createTextInput('PreferredLang', L.preferredLang, config?.PreferredLang || 'tr-TR'));
      adminOnlyWrap.appendChild(createTextInput('FallbackLang', L.fallbackLang,  config?.FallbackLang  || 'en-US'));

      const overwriteWrap = document.createElement('div');
      overwriteWrap.className = 'input-container';
      {
        const l = document.createElement('label');
        l.textContent = L.overwritePolicy; l.htmlFor = 'OverwritePolicy';
        const sel = document.createElement('select'); sel.id = 'OverwritePolicy';
        [
          { value: 'skip',      label: L.overwriteSkip },
          { value: 'replace',   label: L.overwriteReplace },
          { value: 'if-better', label: L.overwriteIfBetter }
        ].forEach(opt => { const o = document.createElement('option'); o.value = opt.value; o.textContent = opt.label; sel.appendChild(o); });
        sel.value = mapEnumToWire(config?.OverwritePolicy || 'Skip');
        overwriteWrap.append(l, sel);
      }
      adminOnlyWrap.appendChild(overwriteWrap);
      adminOnlyWrap.appendChild(createCheckbox('EnableThemeLink', L.enableThemeLink, ((config?.EnableThemeLink | 0) === 1)));

      const modeWrap = document.createElement('div');
      modeWrap.className = 'input-container';
      {
        const l = document.createElement('label');
        l.textContent = L.themeLinkMode; l.htmlFor = 'ThemeLinkMode';
        const sel = document.createElement('select'); sel.id = 'ThemeLinkMode';
        [
          { value: 'symlink',  label: L.modeSymlink },
          { value: 'hardlink', label: L.modeHardlink },
          { value: 'copy',     label: L.modeCopy }
        ].forEach(opt => { const o = document.createElement('option'); o.value = opt.value; o.textContent = opt.label; sel.appendChild(o); });
        sel.value = (config?.ThemeLinkMode || 'symlink');
        sel.addEventListener('change', e => localStorage.setItem('ThemeLinkMode', e.target.value));
        modeWrap.append(l, sel);
      }
      adminOnlyWrap.appendChild(modeWrap);

      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap;';

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button'; saveBtn.textContent = L.saveSettings; saveBtn.style.cssText = primaryBtnCss();

      const runBtn = document.createElement('button');
      runBtn.type = 'button'; runBtn.textContent = L.runNow; runBtn.style.cssText = baseBtnCss();

      btnRow.append(saveBtn, runBtn);
      adminOnlyWrap.append(btnRow, out);

      (async () => {
        try {
          const headers = await getAuthHeaders();
          const res = await fetch('/JMSFusion/config', { method: 'GET', headers });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const latest = await res.json();
          const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
          const setTxt = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };

          setChk('EnableTrailerDownloader', latest.enableTrailerDownloader ?? latest.EnableTrailerDownloader);
          setChk('EnableTrailerUrlNfo',     latest.enableTrailerUrlNfo     ?? latest.EnableTrailerUrlNfo);
          setChk('EnableThemeLink',         (latest.enableThemeLink ?? latest.EnableThemeLink ?? 0) == 1);

          setTxt('JFBase',        latest.jfBase        ?? latest.JFBase);
          setTxt('PreferredLang', latest.preferredLang ?? latest.PreferredLang);
          setTxt('FallbackLang',  latest.fallbackLang  ?? latest.FallbackLang);

          const sec = loadSecrets();
          if (sec.jf)   { const el = document.getElementById('JFApiKey');   if (el) el.value = sec.jf; }
          if (sec.tmdb) { const el = document.getElementById('TmdbApiKey'); if (el) el.value = sec.tmdb; }

          const opSel = document.getElementById('OverwritePolicy');
          if (opSel) opSel.value = mapEnumToWire(latest.overwritePolicy ?? latest.OverwritePolicy ?? 'Skip');
          const modeSel = document.getElementById('ThemeLinkMode');
          if (modeSel && (latest.themeLinkMode ?? latest.ThemeLinkMode)) modeSel.value = latest.themeLinkMode ?? latest.ThemeLinkMode;

          exclusifyRefs(getChk(trailerDownloaderCheckbox), getChk(trailerUrlNfoCheckbox));
        } catch {}
      })();

      saveBtn.onclick = async () => {
        const oldText = saveBtn.textContent;
        saveBtn.disabled = true; saveBtn.textContent = L.saving;
        try {
          const a = getChk(trailerDownloaderCheckbox);
          const b = getChk(trailerUrlNfoCheckbox);
          if (a && b && a.checked && b.checked) b.checked = false;

          const payload = {};
          const pushIf = (k, v) => { if (v !== undefined && v !== null && v !== '') payload[k] = v; };

          pushIf('AllowScriptExecution', true);
          if (a) pushIf('EnableTrailerDownloader', !!a.checked);
          if (b) pushIf('EnableTrailerUrlNfo',     !!b.checked);

          pushIf('JFBase',        document.getElementById('JFBase')?.value?.trim());
          const jfVal   = document.getElementById('JFApiKey')?.value?.trim();
          const tmdbVal = document.getElementById('TmdbApiKey')?.value?.trim();
          pushIf('JFApiKey',   jfVal);
          pushIf('TmdbApiKey', tmdbVal);

          const sec = loadSecrets();
          if (jfVal)   sec.jf   = jfVal;
          if (tmdbVal) sec.tmdb = tmdbVal;
          saveSecrets(sec);

          pushIf('PreferredLang', document.getElementById('PreferredLang')?.value?.trim());
          pushIf('FallbackLang',  document.getElementById('FallbackLang')?.value?.trim());

          const opWire = document.getElementById('OverwritePolicy')?.value || 'skip';
          pushIf('OverwritePolicy', mapWireToEnum(opWire));
          pushIf('EnableThemeLink', document.getElementById('EnableThemeLink')?.checked ? 1 : 0);
          pushIf('ThemeLinkMode',   document.getElementById('ThemeLinkMode')?.value || 'symlink');

          const headers = await getAuthHeaders();
          const res = await fetch('/JMSFusion/config', { method: 'POST', headers, body: JSON.stringify(payload) });
          const txt = await res.text();
          let data = {}; try { data = JSON.parse(txt); } catch {}
          if (!res.ok) throw new Error(data?.error || data?.Message || `HTTP ${res.status}: ${txt}`);
          showNotification(L.settingsSaved, 2500, 'success');
        } catch (e) {
          showNotification(L.saveError + (e?.message || e), 3000, 'error');
        } finally {
          saveBtn.disabled = false; saveBtn.textContent = oldText;
        }
      };

      runBtn.onclick = async () => {
        const attached = await connectIfRunning({ forceOpen: true });
        if (attached) { showNotification(L.alreadyRunning, 2500, 'warning'); return; }
        const body = collectRunBody();
        if (!body.runDownloader && !body.runUrlNfo) {
          showNotification(L.atLeastOneOption, 2500, 'warning'); return;
        }
        openConfirmUi();
      };

      return out;
    }

    return renderAdminFields();
  }

  function collectRunBody() {
    const body = {
      runDownloader: getChk(trailerDownloaderCheckbox)?.checked || false,
      runUrlNfo:     getChk(trailerUrlNfoCheckbox)?.checked || false,
      jfBase:        document.getElementById('JFBase')?.value || config?.JFBase,
      jfApiKey:      document.getElementById('JFApiKey')?.value || undefined,
      tmdbApiKey:    document.getElementById('TmdbApiKey')?.value || undefined,
      preferredLang: document.getElementById('PreferredLang')?.value || config?.PreferredLang,
      fallbackLang:  document.getElementById('FallbackLang')?.value || config?.FallbackLang,
      overwritePolicy: document.getElementById('OverwritePolicy')?.value || 'skip',
      enableThemeLink: document.getElementById('EnableThemeLink')?.checked ? 1 : 0,
      themeLinkMode:   document.getElementById('ThemeLinkMode')?.value || 'symlink'
    };
    if (body.runDownloader && body.runUrlNfo) body.runUrlNfo = false;
    return body;
  }

  (async () => {
    try {
      isAdminUser = await checkUserIsAdmin();
      if (isAdminUser) {
        adminOnlyWrap.style.display = '';
        attachAdminFields();
        await connectIfRunning({ forceOpen: false });
        if (getJobFlag()) { openProgressUi(); startPolling(); }
      } else {
        nonAdminInfo.style.display = '';
        const a = document.getElementById('EnableTrailerDownloader');
        const b = document.getElementById('EnableTrailerUrlNfo');
        if (a) { a.disabled = true; a.title = L.settingsReadOnly; }
        if (b) { b.disabled = true; b.title = L.settingsReadOnly; }
      }
    } catch {
      nonAdminInfo.style.display = '';
      const a = document.getElementById('EnableTrailerDownloader');
      const b = document.getElementById('EnableTrailerUrlNfo');
      if (a) { a.disabled = true; a.title = L.settingsReadOnly; }
      if (b) { b.disabled = true; b.title = L.settingsReadOnly; }
    }
  })();

  const noteDesc = document.createElement('div');
  noteDesc.className = 'description-text';
  noteDesc.textContent = L.noteDescription;
  noteDesc.style.cssText = 'margin-top:10px; font-size:.9em; color:#888; font-style:italic;';
  panel.appendChild(noteDesc);

  return panel;
}
