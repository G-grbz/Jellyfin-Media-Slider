import { getConfig } from "../config.js";
import { createCheckbox, createSection, createNumberInput } from "../settings.js";
import { applySettings } from "./applySettings.js";
import { getAuthHeader } from "../api.js";

const cfg = getConfig();

const DEFAULT_ORDER = [
  "Marvel Studios","Pixar","Walt Disney Pictures","Disney+","DC",
  "Warner Bros. Pictures","Lucasfilm Ltd.","Columbia Pictures",
  "Paramount Pictures","Netflix","DreamWorks Animation"
];

const ALIASES = {
  "Marvel Studios": ["marvel studios","marvel","marvel entertainment","marvel studios llc"],
  "Pixar": ["pixar","pixar animation studios","disney pixar"],
  "Walt Disney Pictures": ["walt disney","walt disney pictures"],
  "Disney+": ["disney+","disney plus","disney+ originals","disney plus originals","disney+ studio"],
  "DC": ["dc entertainment","dc"],
  "Warner Bros. Pictures": ["warner bros","warner bros.","warner bros pictures","warner bros. pictures","warner brothers"],
  "Lucasfilm Ltd.": ["lucasfilm","lucasfilm ltd","lucasfilm ltd."],
  "Columbia Pictures": ["columbia","columbia pictures","columbia pictures industries"],
  "Paramount Pictures": ["paramount","paramount pictures","paramount pictures corporation"],
  "Netflix": ["netflix"],
  "DreamWorks Animation": ["dreamworks","dreamworks animation","dreamworks pictures"]
};

const JUNK_WORDS = [
  "ltd","ltd.","llc","inc","inc.","company","co.","corp","corp.","the",
  "pictures","studios","animation","film","films","pictures.","studios."
];

const nbase = s =>
  (s || "")
    .toLowerCase()
    .replace(/[().,™©®\-:_+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const strip = s => {
  let out = " " + nbase(s) + " ";
  for (const w of JUNK_WORDS) out = out.replace(new RegExp(`\\s${w}\\s`, "g"), " ");
  return out.trim();
};

const toks = s => strip(s).split(" ").filter(Boolean);

const CANONICALS = new Map(DEFAULT_ORDER.map(n => [n.toLowerCase(), n]));

const ALIAS_TO_CANON = (() => {
  const m = new Map();
  for (const [canon, aliases] of Object.entries(ALIASES)) {
    m.set(canon.toLowerCase(), canon);
    for (const a of aliases) m.set(String(a).toLowerCase(), canon);
  }
  return m;
})();

function toCanonicalStudioName(name) {
  if (!name) return null;
  const key = String(name).toLowerCase();
  return ALIAS_TO_CANON.get(key) || CANONICALS.get(key) || null;
}

function mergeOrder(defaults, custom) {
  const out = [];
  const seen = new Set();
  for (const n of (custom || [])) {
    const canon = toCanonicalStudioName(n) || n;
    const k = String(canon).toLowerCase();
    if (!seen.has(k)) { out.push(canon); seen.add(k); }
  }
  for (const n of defaults) {
    const k = n.toLowerCase();
    if (!seen.has(k)) { out.push(n); seen.add(k); }
  }
  return out;
}

function createHiddenInput(id, value) {
  const inp = document.createElement("input");
  inp.type = "hidden";
  inp.id = id;
  inp.name = id;
  inp.value = value;
  return inp;
}

function createDraggableList(id, items, labels) {
  const wrap = document.createElement("div");
  wrap.className = "setting-input setting-dnd";

  const lab = document.createElement("label");
  lab.textContent = labels?.studioHubsOrderLabel || "Sıralama (sürükle-bırak)";
  lab.style.display = "block";
  lab.style.marginBottom = "6px";

  const list = document.createElement("ul");
  list.id = id;
  list.className = "dnd-list";
  list.style.listStyle = "none";
  list.style.padding = "0";
  list.style.margin = "0";
  list.style.border = "1px solid var(--theme-text-color, #8882)";
  list.style.borderRadius = "8px";
  list.style.maxHeight = "320px";
  list.style.overflow = "auto";

  items.forEach(name => {
    list.appendChild(createDnDItem(name, labels));
  });

  let dragEl = null;

  list.addEventListener("dragstart", (e) => {
    const li = e.target.closest(".dnd-item");
    if (!li) return;
    dragEl = li;
    li.style.opacity = "0.6";
    e.dataTransfer?.setData?.("text/plain", li.dataset.name || "");
    e.dataTransfer.effectAllowed = "move";
  });

  list.addEventListener("dragend", (e) => {
    const li = e.target.closest(".dnd-item");
    if (!li) return;
    li.style.opacity = "";
    dragEl = null;
  });

  list.addEventListener("dragover", (e) => {
    e.preventDefault();
    const over = e.target.closest(".dnd-item");
    if (!dragEl || !over || over === dragEl) return;
    const rect = over.getBoundingClientRect();
    const before = (e.clientY - rect.top) < rect.height / 2;
    list.insertBefore(dragEl, before ? over : over.nextSibling);
  });

  list.addEventListener("click", (e) => {
    const btnUp = e.target.closest?.(".dnd-btn-up");
    const btnDown = e.target.closest?.(".dnd-btn-down");
    if (!btnUp && !btnDown) return;
    const li = e.target.closest(".dnd-item");
    if (!li) return;
    if (btnUp && li.previousElementSibling) {
      li.parentElement.insertBefore(li, li.previousElementSibling);
    } else if (btnDown && li.nextElementSibling) {
      li.parentElement.insertBefore(li.nextElementSibling, li);
    }
  });

  const wrapAll = document.createElement("div");
  wrapAll.appendChild(lab);
  wrapAll.appendChild(list);
  return { wrap: wrapAll, list };
}

function createDnDItem(name, labels) {
  const li = document.createElement("li");
  li.className = "dnd-item";
  li.draggable = true;
  li.dataset.name = name;
  li.style.display = "flex";
  li.style.alignItems = "center";
  li.style.gap = "8px";
  li.style.padding = "8px 10px";
  li.style.borderBottom = "1px solid #0002";
  li.style.background = "var(--theme-background, rgba(255,255,255,0.02))";

  const handle = document.createElement("span");
  handle.className = "dnd-handle";
  handle.textContent = "↕";
  handle.title = labels?.dragToReorder || "Sürükle-bırak";
  handle.style.cursor = "grab";
  handle.style.userSelect = "none";
  handle.style.fontWeight = "700";

  const txt = document.createElement("span");
  txt.textContent = name;
  txt.style.flex = "1";

  const btns = document.createElement("div");
  btns.style.display = "flex";
  btns.style.gap = "6px";

  const up = document.createElement("button");
  up.type = "button";
  up.className = "dnd-btn-up";
  up.textContent = "↑";
  up.title = labels?.moveUp || "Yukarı taşı";
  up.style.minWidth = "28px";

  const down = document.createElement("button");
  down.type = "button";
  down.className = "dnd-btn-down";
  down.textContent = "↓";
  down.title = labels?.moveDown || "Aşağı taşı";
  down.style.minWidth = "28px";

  btns.appendChild(up);
  btns.appendChild(down);

  li.appendChild(handle);
  li.appendChild(txt);
  li.appendChild(btns);
  return li;
}

export function createStudioHubsPanel(config, labels) {
  const panel = document.createElement('div');
  panel.id = 'studio-panel';
  panel.className = 'setting-item';

  const section = createSection(
    labels?.studioHubsSettings ||
    config.languageLabels.studioHubsSettings ||
    'Stüdyo Koleksiyonları Ayarları'
  );

  const enableCheckbox = createCheckbox(
    'enableStudioHubs',
    labels?.enableStudioHubs || config.languageLabels.enableStudioHubs || 'Stüdyo Koleksiyonlarını Etkinleştir',
    config.enableStudioHubs
  );
  section.appendChild(enableCheckbox);

  const enableForYouCheckbox = createCheckbox(
    'enablePersonalRecommendations',
    labels?.enableForYou || config.languageLabels.enableForYou || 'Sana Özel Koleksiyonları Etkinleştir',
    config.enablePersonalRecommendations
  );
  section.appendChild(enableForYouCheckbox);

  const enableHoverVideo = createCheckbox(
    'studioHubsHoverVideo',
    labels?.studioHubsHoverVideo || 'Hover’da video oynat',
    config.studioHubsHoverVideo
  );
  section.appendChild(enableHoverVideo);

  const countWrap = createNumberInput(
    'studioHubsCardCount',
    labels?.studioHubsCardCount || 'Gösterilecek kart sayısı (Ana ekran)',
    Number.isFinite(config.studioHubsCardCount) ? config.studioHubsCardCount : 10,
    1,
    48
  );
  section.appendChild(countWrap);

  const ratingWrap = createNumberInput(
   'studioHubsMinRating',
   labels?.studioHubsMinRating || 'Minimum Derecelendirme',
   Number.isFinite(config.studioHubsMinRating) ? config.studioHubsMinRating : 6.5,
   1,
   10,
   0.1
  );
  section.appendChild(ratingWrap);

  const defaultTtlMs = Number.isFinite(config.personalRecsCacheTtlMs)
    ? config.personalRecsCacheTtlMs
    : 6 * 60 * 60 * 1000;
  const defaultTtlMin = Math.max(1, Math.round(defaultTtlMs / 60000));

  const ttlWrap = createNumberInput(
    'personalRecsCacheTtlMinutes',
    labels?.personalRecsCacheTtlMinutes || 'Kişisel Öneri Önbellek Süresi (dakika)',
    defaultTtlMin,
    1,
    10080,
    1
  );
  section.appendChild(ttlWrap);

  const ttlHidden = createHiddenInput('personalRecsCacheTtlMs', String(defaultTtlMin * 60000));
  section.appendChild(ttlHidden);

  const ttlInputEl = ttlWrap.querySelector('#personalRecsCacheTtlMinutes')
    || document.getElementById('personalRecsCacheTtlMinutes');
  const syncTtlHidden = () => {
    const mins = Math.max(1, Number(ttlInputEl?.value || defaultTtlMin) || defaultTtlMin);
    ttlHidden.value = String(Math.round(mins * 60000));
  };
  if (ttlInputEl) {
    ttlInputEl.addEventListener('input', syncTtlHidden);
    ttlInputEl.addEventListener('change', syncTtlHidden);
  }

  const baseOrder = mergeOrder(
    DEFAULT_ORDER,
    Array.isArray(config.studioHubsOrder) && config.studioHubsOrder.length
      ? config.studioHubsOrder
      : []
  );

  const hidden = createHiddenInput('studioHubsOrder', JSON.stringify(baseOrder));
  const { wrap: dndWrap, list } = createDraggableList('studioHubsOrderList', baseOrder, labels);

  section.appendChild(dndWrap);
  section.appendChild(hidden);

  (async () => {
    try {
      const r = await fetch(
        `/Studios?Limit=300&Recursive=true&SortBy=SortName&SortOrder=Ascending`,
        { headers: { "Accept": "application/json", "Authorization": getAuthHeader() } }
      );
      if (!r.ok) throw new Error(`Studios fetch failed: ${r.status}`);
      const data = await r.json();
      const items = Array.isArray(data?.Items) ? data.Items : (Array.isArray(data) ? data : []);

      const existing = new Set(
        [...list.querySelectorAll(".dnd-item")].map(li => li.dataset.name.toLowerCase())
      );

      const toAdd = [];
      for (const s of items) {
        const canon = toCanonicalStudioName(s?.Name);
        if (!canon) continue;
        if (!existing.has(canon.toLowerCase())) {
          existing.add(canon.toLowerCase());
          toAdd.push(canon);
        }
      }

      if (toAdd.length) {
        const appendSorted = toAdd.sort(
          (a, b) => DEFAULT_ORDER.indexOf(a) - DEFAULT_ORDER.indexOf(b)
        );

        for (const name of appendSorted) {
          list.appendChild(createDnDItem(name, labels));
        }

        const names = [...list.querySelectorAll(".dnd-item")].map(li => li.dataset.name);
        hidden.value = JSON.stringify(names);
      }
    } catch (e) {
      console.warn("studioHubsPage: Studios genişletme başarısız:", e);
    }
  })();

  const refreshHidden = () => {
    const names = [...list.querySelectorAll(".dnd-item")].map(li => li.dataset.name);
    hidden.value = JSON.stringify(names);
  };
  list.addEventListener("dragend", refreshHidden);
  list.addEventListener("drop", refreshHidden);
  list.addEventListener("click", (e) => {
    if (e.target.closest(".dnd-btn-up") || e.target.closest(".dnd-btn-down")) refreshHidden();
  });

  const genreSection = createSection(
    labels?.genreHubsSettings ||
    config.languageLabels?.genreHubsSettings ||
    'Tür Bazlı Koleksiyonlar (Haftalık önbellek)'
  );

  const enableGenreHubs = createCheckbox(
    'enableGenreHubs',
    labels?.enableGenreHubs || 'Tür Bazlı Koleksiyonları Etkinleştir',
    !!config.enableGenreHubs
  );
  genreSection.appendChild(enableGenreHubs);

  const rowsCountWrap = createNumberInput(
    'studioHubsGenreRowsCount',
    labels?.studioHubsGenreRowsCount || 'Ekranda gösterilecek Tür sırası sayısı',
    Number.isFinite(config.studioHubsGenreRowsCount) ? config.studioHubsGenreRowsCount : 4,
    1,
    24
  );
  genreSection.appendChild(rowsCountWrap);

  const perRowCountWrap = createNumberInput(
    'studioHubsGenreCardCount',
    labels?.studioHubsGenreCardCount || 'Her Tür sırası için kart sayısı',
    Number.isFinite(config.studioHubsGenreCardCount) ? config.studioHubsGenreCardCount : 10,
    1,
    48
  );
  genreSection.appendChild(perRowCountWrap);

  const genreHidden = createHiddenInput('genreHubsOrder', JSON.stringify(Array.isArray(config.genreHubsOrder) ? config.genreHubsOrder : []));
  genreSection.appendChild(genreHidden);

  const { wrap: genreDndWrap, list: genreList } = createDraggableList('genreHubsOrderList', Array.isArray(config.genreHubsOrder) && config.genreHubsOrder.length ? config.genreHubsOrder : [], labels);
  genreSection.appendChild(genreDndWrap);

  (async () => {
    try {
      const genres = await fetchGenresWeeklyForSettings();
      const existing = new Set(
        [...genreList.querySelectorAll(".dnd-item")].map(li => li.dataset.name.toLowerCase())
      );
      let appended = 0;
      for (const g of genres) {
        const k = String(g).toLowerCase();
        if (!existing.has(k)) {
          existing.add(k);
          genreList.appendChild(createDnDItem(g, labels));
          appended++;
        }
      }
      if (appended > 0) {
        const names = [...genreList.querySelectorAll(".dnd-item")].map(li => li.dataset.name);
        genreHidden.value = JSON.stringify(names);
      }
    } catch (e) {
      console.warn("Tür listesi ayarlara eklenemedi:", e);
    }
  })();

  const refreshGenreHidden = () => {
    const names = [...genreList.querySelectorAll(".dnd-item")].map(li => li.dataset.name);
    genreHidden.value = JSON.stringify(names);
  };
  genreList.addEventListener("dragend", refreshGenreHidden);
  genreList.addEventListener("drop", refreshGenreHidden);
  genreList.addEventListener("click", (e) => {
    if (e.target.closest(".dnd-btn-up") || e.target.closest(".dnd-btn-down")) refreshGenreHidden();
  });

  panel.appendChild(section);
  panel.appendChild(genreSection);

  return panel;
}

const SETTINGS_GENRE_KEY = "settings_genre_list_v1";
const SETTINGS_GENRE_TTL = 7 * 24 * 60 * 60 * 1000;

async function fetchGenresWeeklyForSettings() {
  const cached = loadSettingsGenres();
  if (cached) return cached;

  try {
    let url = `/Genres?Recursive=true&SortBy=SortName&SortOrder=Ascending&IncludeItemTypes=Movie,Series`;
    const r = await fetch(url, { headers: { "Accept": "application/json", "Authorization": getAuthHeader() } });
    if (!r.ok) throw new Error(`Genres fetch failed: ${r.status}`);
    const data = await r.json();
    const items = Array.isArray(data?.Items) ? data.Items : (Array.isArray(data) ? data : []);
    const names = [];
    for (const it of items) {
      const name = (it?.Name || "").trim();
      if (name) names.push(name);
    }
    const uniq = uniqueCaseInsensitive(names);
    saveSettingsGenres(uniq);
    return uniq;
  } catch (e) {
    console.warn("fetchGenresWeeklyForSettings hatası:", e);
    return loadSettingsGenres() || [];
  }
}

function loadSettingsGenres() {
  try {
    const raw = localStorage.getItem(SETTINGS_GENRE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.timestamp || !Array.isArray(data.genres)) return null;
    if (Date.now() - data.timestamp > SETTINGS_GENRE_TTL) return null;
    return data.genres;
  } catch {
    return null;
  }
}

function saveSettingsGenres(genres) {
  try {
    const data = { genres, timestamp: Date.now() };
    localStorage.setItem(SETTINGS_GENRE_KEY, JSON.stringify(data));
  } catch {}
}

function uniqueCaseInsensitive(list) {
  const seen = new Set();
  const out = [];
  for (const g of list) {
    const k = String(g).toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(g); }
  }
  return out;
}
