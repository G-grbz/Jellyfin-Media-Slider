const JSON_PREFIX = "Stored JSON credentials:";
const WS_PREFIX = "opening web socket with url:";

export function saveCredentialsToSessionStorage(credentials) {
  try {
    sessionStorage.setItem("json-credentials", JSON.stringify(credentials));
    if (credentials?.Servers?.[0]?.LocalAddress) {
      window.serverConfig = window.serverConfig || {};
      window.serverConfig.address = credentials.Servers[0].LocalAddress;
    }
  } catch (err) {
    console.error("Kimlik bilgileri kaydedilirken hata:", err);
  }
}

export function saveApiKey(apiKey) {
  if (!apiKey) return;
  try {
    sessionStorage.setItem("api-key", apiKey);
  } catch (err) {
    console.error("API anahtarı kaydedilirken hata:", err);
  }
}

export function getAuthToken() {
  try {
    const ssApiKey = sessionStorage.getItem("api-key");
    if (ssApiKey) return ssApiKey;

    const ssAccess = sessionStorage.getItem("accessToken");
    if (ssAccess) return ssAccess;

    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get("api_key");
    if (fromQuery) return fromQuery;

    if (url.hash && url.hash.includes("api_key=")) {
      const hp = new URLSearchParams(url.hash.replace(/^#/, ""));
      const fromHash = hp.get("api_key");
      if (fromHash) return fromHash;
    }

    const apiClientToken = (window.ApiClient && window.ApiClient._authToken) || null;
    return apiClientToken || null;
  } catch {
    return null;
  }
}

let __consoleInterceptorInstalled = false;
let __originalConsoleLog = null;

export function installConsoleInterceptor() {
  if (__consoleInterceptorInstalled) return;
  __originalConsoleLog = console.log;

  console.log = function (...args) {
    try {
      for (const arg of args) {
        if (typeof arg !== "string") continue;

        if (arg.startsWith(JSON_PREFIX)) {
          const jsonStr = arg.slice(JSON_PREFIX.length).trim();
          try {
            const credentials = JSON.parse(jsonStr);
            saveCredentialsToSessionStorage(credentials);
          } catch (err) {
            console.warn?.("Kimlik bilgileri ayrıştırılırken hata:", err);
          }
        } else if (arg.startsWith(WS_PREFIX)) {
          const urlPart = arg.split("url:")[1]?.trim();
          if (urlPart) {
            try {
              const u = new URL(urlPart);
              const apiKey = u.searchParams.get("api_key");
              if (apiKey) saveApiKey(apiKey);
            } catch (err) {
              console.warn?.("API anahtarı çıkarılırken hata:", err);
            }
          }
        }
      }
    } catch {
    } finally {
      __originalConsoleLog.apply(console, args);
    }
  };

  __consoleInterceptorInstalled = true;
}

export function uninstallConsoleInterceptor() {
  if (!__consoleInterceptorInstalled) return;
  try {
    if (__originalConsoleLog) console.log = __originalConsoleLog;
  } finally {
    __consoleInterceptorInstalled = false;
    __originalConsoleLog = null;
  }
}

installConsoleInterceptor();
