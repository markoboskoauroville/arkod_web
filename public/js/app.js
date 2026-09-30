// ARKOD LAYER, THE WEB APP (arkod_web v1, 30.9.2026). The same app as mantra_arkod's, for the
// iPhone and any browser: the map is the app, the state's parcels are on it, a tap selects one and a
// second tap opens its sheet. Every feature is a row of mantra_arkod/FEATURES.md.

import * as P from './core/parcels.js';
import * as Style from './core/style.js';
import * as Cache from './core/cache.js';
import * as MarkFile from './core/markfile.js';
import * as OwnerBook from './core/ownerbook.js';
import { distanceLabel, fold } from './core/finding.js';
import { formatLat, formatLon, distance } from './core/geo.js';
import * as db from './db.js';
import * as net from './net.js';
import { arkodLayer, dashOf, WIDTHS } from './layer.js';
import { h, action, toggle, choice, opens, pick, iconAction, group, face, results, searchBox, nameBox, iconEl } from './ui.js';
import { icon } from './icons.js';
import * as Services from './core/services.js';
import { Sniffer, Flyer } from './scan.js';

// --- state ---------------------------------------------------------------------------------------

const HOME = [44.50, 16.10, 7];
const params = new URLSearchParams(location.search);

export const S = {
  map: null,
  layerId: db.pref('layer', 'osm'),
  googleView: db.pref('googleView', 'roadmap'),
  cadastreOn: db.pref('cadastreOn', true),
  onlyMine: db.pref('onlyMine', false),
  parcelSearchOn: db.pref('parcelSearchOn', true),
  ownLines: db.pref('ownLines', true),
  // THE CACHE KEY (v3, Android v12): tiles kept ahead and the sniffer; one switch.
  cacheOn: db.pref('cacheOn', true),
  cacheKeywords: db.pref('cacheKeywords', ''),
  seenKo: [],
  found: [],
  cacheOwners: db.pref('cacheOwners', true),
  lines: Style.lines(),
  marks: [],
  groups: [],
  caches: [],
  imenik: [],
  history: {},
  keys: [],
  folioLinks: {},
  selected: null,
  fix: null,
  atFix: false,
  version: null,
};

const $ = (sel) => document.querySelector(sel);

let base = null;
let arkod = null;
let minePane = null;
let selectionLayer = null;
let pinMarker = null;
let fixMarker = null;
let fixCircle = null;
const muniCache = new Map();

// --- saving --------------------------------------------------------------------------------------

async function saveMarks() {
  await db.set('marks', P.encode(S.marks));
  await db.set('groups', MarkFile.encodeGroups(S.groups));
  drawMine();
}
const saveHistory = () => db.set('history', S.history);

function remember(box, text) {
  const t = String(text ?? '').trim();
  if (!t) return;
  const list = (S.history[box] ?? []).filter((x) => x !== t);
  S.history[box] = [t, ...list].slice(0, 12);
  saveHistory();
}

// --- the note line -------------------------------------------------------------------------------

let noteTimer = null;
export function say(text, { keep = false } = {}) {
  const n = $('#note');
  if (!text) { n.hidden = true; n.textContent = ''; return; }
  n.hidden = false;
  n.textContent = text;
  clearTimeout(noteTimer);
  if (!keep) noteTimer = setTimeout(() => { n.hidden = true; }, 7000);
}

// --- the layer kept ahead where the map rests (FEATURES row 23) ---------------------------------

let keepTimer = null;
let restTimer = null;
let foundLayer = null;
let keptAround = null;
/**
 * When the map has rested four seconds, the state's tiles round its middle (3 km at z14 down to
 * 500 m at z18) are asked quietly, three at a time; the service worker keeps them for no signal.
 * Only with a service worker, a signal, the layer on, and once per kilometre moved.
 */
async function keepAround() {
  if (!S.cacheOn || !navigator.serviceWorker?.controller || !navigator.onLine || !S.cadastreOn || S.map.getZoom() < P.MIN_ZOOM - 1) return;
  const c = S.map.getCenter();
  if (keptAround && distance(keptAround[0], keptAround[1], c.lat, c.lng) < 1000) return;
  keptAround = [c.lat, c.lng];
  const tiles = P.prefetchTiles(c.lat, c.lng);
  let i = 0;
  const mine = keptAround;
  await Promise.all([0, 1, 2].map(async () => {
    while (i < tiles.length && keptAround === mine) {
      const [z, x, y] = tiles[i++];
      try { await fetch(P.tileUrl(z, x, y, net.API.wms)); } catch { return; }
    }
  }));
}

// --- the map -------------------------------------------------------------------------------------

function startView() {
  const lat = Number(params.get('lat')), lon = Number(params.get('lon')), z = Number(params.get('z'));
  if (params.has('lat') && Number.isFinite(lat) && Number.isFinite(lon)) return [lat, lon, Number.isFinite(z) && z > 0 ? z : 17];
  return db.pref('view', HOME);
}

function inkNow() {
  if (S.layerId === 'google') return P.inkFor('google', 'DEFAULT', S.googleView === 'satellite' || S.googleView === 'hybrid' ? 'satellite' : S.googleView);
  return P.inkFor(S.layerId, 'DEFAULT');
}

function buildMap() {
  const [lat, lon, z] = startView();
  const map = L.map('map', { zoomControl: false, attributionControl: true, maxZoom: 21, minZoom: 5, tap: true, worldCopyJump: false })
    .setView([lat, lon], z);
  map.attributionControl.setPrefix(false);
  map.createPane('arkod').style.zIndex = 350;
  map.createPane('mine').style.zIndex = 420;
  S.map = map;
  arkod = arkodLayer({
    lines: () => S.lines,
    ink: () => Style.ink(S.lines, inkNow()),
    caches: () => S.caches,
    ownLines: () => S.ownLines,
    stateLines: () => P.visibility(S.cadastreOn, S.onlyMine)[0],
  });
  arkod.addTo(map);
  minePane = L.layerGroup([], { pane: 'mine' }).addTo(map);
  foundLayer = L.layerGroup([], { pane: 'mine' }).addTo(map);
  selectionLayer = L.layerGroup([], { pane: 'mine' }).addTo(map);
  map.on('move', topLine);
  map.on('moveend', () => {
    const c = map.getCenter();
    db.setPref('view', [Number(c.lat.toFixed(6)), Number(c.lng.toFixed(6)), map.getZoom()]);
    topLine();
    clearTimeout(keepTimer);
    keepTimer = setTimeout(keepAround, 4000);
    // THE SNIFFER AND FLY-THROUGH (v3): where the map rests, read what is under it.
    clearTimeout(restTimer);
    restTimer = setTimeout(() => {
      if (S.cacheOn) Sniffer.viewSettled(map.getBounds(), map.getZoom());
      Flyer.viewSettled(map.getBounds(), map.getZoom());
    }, 800);
  });
  map.on('dragstart', () => { S.atFix = false; });
  keepTimer = setTimeout(keepAround, 4000);
  map.on('click', (e) => tapped(e.latlng.lat, e.latlng.lng));
  showLayer(S.layerId);
  applyVisibility();
  topLine();
}

/** The layer's visibility follows the key and "Only Moje čestice" (Parcels.visibility). */
function applyVisibility() {
  const [state] = P.visibility(S.cadastreOn, S.onlyMine);
  const cachesDrawn = S.ownLines && S.caches.some((c) => c.info.visible);
  const want = state || (cachesDrawn && !S.onlyMine);
  if (want && !S.map.hasLayer(arkod)) arkod.addTo(S.map);
  if (!want && S.map.hasLayer(arkod)) S.map.removeLayer(arkod);
  if (want) arkod.redraw();
  $('#k-arkod').classList.toggle('lit', state);
  drawMine();
}

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** One of the three maps. OFF is OpenStreetMap's tiles already seen, from the device only. */
async function showLayer(id) {
  S.layerId = id;
  db.setPref('layer', id);
  document.querySelectorAll('.mapkey').forEach((k) => k.classList.toggle('up', k.dataset.map === id));
  if (base) S.map.removeLayer(base);
  base = null;
  $('#googlehelp')?.remove();
  const credit = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · katastar: DGU';
  if (id === 'osm') {
    base = L.tileLayer(OSM_URL, { crossOrigin: true, maxNativeZoom: 19, maxZoom: 21, attribution: credit });
  } else if (id === 'off') {
    base = L.tileLayer(OSM_URL + '?offline=1', { crossOrigin: true, maxNativeZoom: 19, maxZoom: 21, attribution: credit + ' · offline: tiles already seen' });
  } else if (id === 'google') {
    const key = bestKey();
    if (!key) { showGoogleHelp(); topLine(); return; }
    try {
      const session = await net.googleSession(S.googleView, key.value);
      base = L.tileLayer(net.googleTileUrl(session, key.value), { maxNativeZoom: 21, maxZoom: 21, attribution: 'Google' });
      key.verdict = 'GOOD'; key.said = '';
    } catch (e) {
      key.verdict = 'REFUSED'; key.said = e.message;
      saveKeys();
      showGoogleHelp(e.message);
      topLine();
      return;
    }
    saveKeys();
  }
  // A LIGHT FOR EVERY SERVICE (v3): the map's own tiles report too (not the OFF map: a miss there is normal).
  if (id !== 'off') {
    const probe = id === 'google' ? 'https://tile.googleapis.com/' : 'https://tile.openstreetmap.org/';
    base.on('tileload', () => Services.ok(probe));
    base.on('tileerror', () => { if (navigator.onLine) Services.failed(probe, 'a map tile did not come'); else Services.failed(probe, 'no signal'); });
  }
  base.addTo(S.map);
  base.bringToBack();
  if (arkod) arkod.redraw();
  topLine();
}

const MAP_NAMES = { osm: 'OSM', off: 'Offline', google: 'Google' };

function topLine() {
  if (!S.map) return;
  const c = S.map.getCenter();
  const acc = S.atFix && S.fix ? ` ±${Math.round(S.fix.acc)}m` : '';
  $('#top').textContent = `${formatLat(c.lat)}  ${formatLon(c.lng)}${acc}  z${S.map.getZoom()}  ${MAP_NAMES[S.layerId] ?? ''}`;
}

// --- where am I ----------------------------------------------------------------------------------

function whereAmI() {
  if (!navigator.geolocation) { say('This browser gives no position.'); return; }
  say('Tražim položaj…', { keep: true });
  navigator.geolocation.getCurrentPosition((p) => {
    const { latitude: lat, longitude: lon, accuracy: acc } = p.coords;
    S.fix = { lat, lon, acc };
    if (!fixMarker) {
      fixCircle = L.circle([lat, lon], { radius: acc, color: '#3B82F6', weight: 1, fillOpacity: 0.08, pane: 'mine', interactive: false }).addTo(S.map);
      fixMarker = L.circleMarker([lat, lon], { radius: 7, color: '#0B0D10', weight: 2, fillColor: '#F2DDB4', fillOpacity: 1, pane: 'mine', interactive: false }).addTo(S.map);
    } else {
      fixMarker.setLatLng([lat, lon]); fixCircle.setLatLng([lat, lon]); fixCircle.setRadius(acc);
    }
    S.atFix = true;
    S.map.setView([lat, lon], Math.max(S.map.getZoom(), P.TAP_ZOOM + 2));
    say(`±${Math.round(acc)} m`);
    topLine();
  }, (e) => say(e.code === 1 ? 'Bez dopuštenja za lokaciju nema položaja.' : 'Položaj se nije mogao odrediti.'),
  { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 });
}

// --- the selection, my parcels -------------------------------------------------------------------

function style(colour, lineStyle, weight) {
  const w = WIDTHS[weight] ?? 2.5;
  const dash = dashOf(lineStyle, w);
  return { color: P.cssColour(colour), weight: w + 0.5, dashArray: dash.length ? dash.join(' ') : null, fill: false, pane: 'mine', interactive: false };
}

function drawMine() {
  if (!minePane) return;
  minePane.clearLayers();
  const [, mine] = P.visibility(S.cadastreOn, S.onlyMine);
  if (!mine) return;
  const hidden = new Set(S.groups.filter((g) => !g.visible).map((g) => g.name));
  for (const m of S.marks) {
    if (hidden.has(m.group) || !m.rings.length) continue;
    for (const r of m.rings) L.polygon(r, style(m.colour, m.style, m.weight)).addTo(minePane);
  }
}

function select(parcel) {
  S.selected = parcel;
  selectionLayer.clearLayers();
  if (parcel?.rings?.length) for (const r of parcel.rings) L.polygon(r, { ...style(P.SELECTION, 'SOLID', 'NORMAL'), weight: 3 }).addTo(selectionLayer);
}

/** WHAT FLY-THROUGH FOUND (v3, Android v16): drawn bold magenta, under the selection. */
export const FOUND_COLOUR = 0xFFE040FB;
function showFound(list) {
  S.found = list;
  foundLayer.clearLayers();
  for (const p of list) for (const r of p.rings ?? []) L.polygon(r, { ...style(FOUND_COLOUR, 'SOLID', 'BOLD'), className: 'found' }).addTo(foundLayer);
}

function showPin(lat, lon) {
  if (pinMarker) pinMarker.remove();
  pinMarker = L.marker([lat, lon], {
    pane: 'mine',
    icon: L.divIcon({ className: 'pinmark', html: icon('pin', 34), iconSize: [34, 34], iconAnchor: [17, 34] }),
    interactive: false,
  }).addTo(S.map);
}

/**
 * ONE TAP SELECTS, A TAP ON THE SELECTION OPENS THE SHEET (Android v5): a parcel he keeps or one in
 * a cache is selected from the device; anything else is asked of the state, and its outline read off
 * the state's own picture. A tap outlines even with the layer hidden.
 */
async function tapped(lat, lon) {
  const cur = S.selected;
  if (cur && cur.rings.some((r) => P.contains(r, lat, lon))) { say(null); openSheet(cur); return; }
  const hidden = new Set(S.groups.filter((g) => !g.visible).map((g) => g.name));
  const m = S.marks.find((x) => !hidden.has(x.group) && x.rings.some((r) => P.contains(r, lat, lon)));
  if (m) {
    select(P.parcel(m.id, m.number, m.reference, null, m.rings));
    say(`${m.number}${m.name ? ' · ' + m.name : ''} · dodirnite ponovno za list`);
    return;
  }
  const flown = S.found.find((p) => p.rings?.some((r) => P.contains(r, lat, lon)));
  if (flown) {
    select(flown);
    say(`${flown.number} · found by ✈ · dodirnite ponovno za list`);
    return;
  }
  const cached = Cache.at(S.caches, lat, lon);
  if (cached) {
    select(Cache.itemParcel(cached));
    say(`${cached.number} · dodirnite ponovno za list`);
    return;
  }
  if (S.map.getZoom() < P.TAP_ZOOM) { say('Približite kartu da odaberete česticu'); return; }
  let parcel;
  try { parcel = await net.parcelUnder(lat, lon); } catch (e) { say(`Katastar nije odgovorio: ${e.message}`); return; }
  if (!parcel) { say('Tu nema čestice'); return; }
  if (cur && cur.reference === parcel.reference) { openSheet(cur); return; }
  select(parcel);
  say(`${parcel.number} · dodirnite ponovno za list`);
  try {
    const rings = await net.outline(lat, lon);
    if (rings && S.selected?.reference === parcel.reference) select({ ...parcel, rings });
  } catch { /* the number is enough; the outline comes when the state answers */ }
}

async function goToParcel(p, open = false) {
  select(p);
  if (p.rings.length) { const [la, lo] = P.middleOf(p.rings); S.map.setView([la, lo], 18); }
  if (open) openSheet(p); else say(`${p.number} · dodirnite ponovno za list`);
}

/** A number on a sheet, tapped (v10): its outline from the device, else OSS and the WFS. */
async function goToNumber(muniReg, number) {
  const ref = `${muniReg}-${number}`;
  closeFace();
  const known = Cache.byReference(S.caches, ref);
  if (known) return goToParcel(Cache.itemParcel(known));
  const mine = S.marks.find((m) => m.reference === ref && m.rings.length);
  if (mine) return goToParcel(P.parcel(mine.id, mine.number, mine.reference, null, mine.rings));
  const shape = await net.keptShape(ref);
  if (shape?.rings?.length) return goToParcel(shape);
  say(`tražim ${number} na karti…`, { keep: true });
  let id;
  try { id = await net.idOf(number, muniReg); } catch (e) { say(e.message); return; }
  if (id == null) { say(`${number}: katastar ne zna tu česticu u k.o. ${muniReg}`); return; }
  try {
    const shape = (await net.shapes([ref], { onWait: (s, a, n, why) => say(`državna usluga karte ne odgovara (${why}); ponovno za ${s} s (${a}/${n})`, { keep: true }) }))
      .find((x) => x.reference === ref);
    if (!shape?.rings.length) { say(`${number}: državna usluga karte ne odgovara; obris kasnije`); return; }
    goToParcel({ ...shape, id });
  } catch (e) { say(`${number}: ${e.message}`); }
}

// --- the sheet -----------------------------------------------------------------------------------

let sheetState = null;

/** THE SHEET, THE WHOLE SCREEN: number, k.o., area, filter, three tabs, CPY / TXT / FILE, keep. */
async function openSheet(parcel) {
  sheetState = { parcel, record: null, problem: null, folios: null, folioProblem: null, keptAt: null, tab: P.Tab.POSSESSION, filter: '' };
  renderSheet();
  let rec;
  try {
    const r = await net.record(parcel.id);
    rec = r.record;
    if (sheetState?.parcel !== parcel) return;
    sheetState.record = rec;
    sheetState.keptAt = r.keptAt;
  } catch (e) {
    if (sheetState?.parcel !== parcel) return;
    sheetState.problem = `posjednici se nisu mogli pročitati: ${e.message}`;
    renderSheet();
    return;
  }
  renderSheet();
  let folios = [];
  try {
    folios = await net.ownerSheets(rec);
    if (!folios.length && S.folioLinks[parcel.reference]) {
      const [book, unit] = S.folioLinks[parcel.reference];
      const f = await net.folio(book, unit);
      if (f) folios = [f];
    }
  } catch (e) { sheetState.folioProblem = `zemljišna knjiga se nije mogla pročitati: ${e.message}`; }
  if (sheetState?.parcel !== parcel) return;
  sheetState.folios = folios;
  renderSheet();
  addToImenik(parcel, rec, folios);
  // THE SNIFFER FOLLOWS (v3, Android v12): the other parcels of this owner sheet.
  if (S.cacheOn) Sniffer.follow(rec, folios);
}

/** A kept parcel from the settings' list (v3, Android v13): from the device, sheet and all. */
async function openKept(muniReg, number) {
  const ref = `${muniReg}-${number}`;
  closeFace();
  const shape = await net.keptShape(ref);
  const mine = S.marks.find((m) => m.reference === ref && m.rings.length);
  const p = shape?.rings?.length ? shape : mine ? P.parcel(mine.id, mine.number, mine.reference, null, mine.rings) : null;
  if (!p || !p.id) return goToNumber(muniReg, number);
  return goToParcel(p, true);
}

async function addToImenik(parcel, rec, folios) {
  S.imenik = OwnerBook.add(S.imenik, OwnerBook.entriesOf(parcel, rec, folios));
  await db.set('imenik', OwnerBook.encode(S.imenik));
}

function sheetRows() {
  const st = sheetState;
  const base = st.record ? P.sheetRows(st.record) : [];
  const folios = st.folios ?? [];
  return [...(folios.length ? base.filter((r) => r.heading !== P.HEAD_REGISTRY) : base), ...folios.flatMap(P.folioRows)];
}

function stamp() {
  const d = new Date();
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function sheetText() {
  const st = sheetState;
  const mine = S.marks.find((m) => m.reference === st.parcel.reference);
  const parcel = { ...st.parcel, rings: mine?.rings?.length ? mine.rings : st.parcel.rings };
  return { parcel, text: P.toText(parcel, st.record, stamp(), st.folios ?? []) };
}

/** A file handed to the person: the share sheet when the device has one, else a download. */
async function giveFile(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  const a = h('a', { href: URL.createObjectURL(file), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  return 'downloaded';
}

function renderSheet() {
  const st = sheetState;
  if (!st) return;
  const p = st.parcel;
  const rec = st.record;
  const mine = S.marks.find((m) => m.reference === p.reference);
  const rows = sheetRows();
  const inTab = rows.filter((r) => P.tabOf(r) === st.tab);
  const shown = P.filterRows(inTab, st.filter);
  const note = h('div.sheetnote');
  const say2 = (t) => { note.textContent = t; };

  const title = h('div.sheettitle', {},
    h('div.num', {}, p.number + (mine?.name ? ` · ${mine.name}` : '')),
    h('div.ko', {}, rec ? `k.o. ${rec.municipality} · ${rec.municipalityNumber}` : `k.o. ${P.municipalityOf(p.reference)}`));
  const tools = [
    iconAction('copy', 'CPY', async () => {
      const { parcel, text } = sheetText();
      try { await navigator.clipboard.writeText(text); say2(`čestica ${parcel.number} kopirana`); } catch { say2('kopiranje nije dopušteno u ovom pregledniku'); }
    }, { id: 'sheet-cpy' }),
    iconAction('text', 'TXT', async () => {
      const { parcel, text } = sheetText();
      const how = await giveFile(P.textFileName(parcel), text, 'text/plain');
      say2(how === 'cancelled' ? '' : `${P.textFileName(parcel)}: ${how === 'shared' ? 'poslano' : 'spremljeno u Preuzimanja'}`);
    }, { id: 'sheet-txt' }),
    iconAction('share', 'FILE', async () => {
      const m = mine ?? P.markOf(p, P.SWATCHES[0]);
      const g = MarkFile.group(`čestica ${p.number}`, m.colour, m.style, m.weight);
      const name = MarkFile.fileName(`čestica ${p.reference.replace(/\//g, '_')}`);
      const how = await giveFile(name, MarkFile.encode(g, [{ ...m, rings: m.rings.length ? m.rings : p.rings }]), 'application/json');
      say2(how === 'cancelled' ? '' : `${name}: ${how === 'shared' ? 'poslano' : 'spremljeno u Preuzimanja'}`);
    }, { id: 'sheet-file' }),
  ];
  const area = rec?.areaM2 && /^\d+$/.test(rec.areaM2) ? Number(rec.areaM2) : p.areaM2;
  const filter = h('input.field', { type: 'search', placeholder: 'vlasnik, adresa, bilo što', value: st.filter, id: 'sheet-filter' });
  filter.addEventListener('input', () => { st.filter = filter.value; renderBody(); });
  filter.addEventListener('change', () => remember('sheet', filter.value));
  const tabs = h('div');
  const body = h('div.rows', { id: 'sheet-rows' });

  function renderTabs() {
    tabs.replaceChildren(choice(P.TABS.map((t) => {
      const n = st.filter ? P.filterRows(rows.filter((r) => P.tabOf(r) === t), st.filter).length : null;
      return { word: P.TAB_WORDS[t] + (n != null ? ` ${n}` : '') };
    }), P.TABS.indexOf(st.tab), (i) => { st.tab = P.TABS[i]; renderSheet(); }, { id: 'sheet-tabs' }));
  }

  function renderBody() {
    const inTabNow = rows.filter((r) => P.tabOf(r) === st.tab);
    const shownNow = P.filterRows(inTabNow, st.filter);
    renderTabs();
    body.replaceChildren();
    if (!rec) {
      body.append(h('div.dim', {}, st.problem ?? 'pitam katastar za posjednike…'));
      return;
    }
    let heading = '';
    for (const r of shownNow) {
      if (r.heading !== heading) { heading = r.heading; body.append(h('div.head', {}, r.heading)); }
      const num = P.numberIn(r);
      const main = num
        ? h('span.main', {}, h('button.link', { type: 'button', onclick: () => goToNumber(rec.municipalityNumber || P.municipalityOf(p.reference), num) }, num), r.main.slice(r.main.indexOf(num) + num.length))
        : h('span.main', {}, r.main);
      body.append(h('div.r' + (st.tab === P.Tab.OWNER ? '.whole' : ''), {}, h('div.line', {}, main, r.side ? h('span.side', {}, r.side) : null), r.under ? h('div.under', {}, r.under) : null));
    }
    if (st.tab === P.Tab.OWNER) {
      if (st.folios == null) body.append(h('div.dim', {}, 'pitam zemljišnu knjigu za vlasnike…'));
      else if (!st.folios.length) body.append(folioFinder());
      else if (st.folioProblem) body.append(h('div.red', {}, st.folioProblem));
      if (st.folios?.length && !rec.landBooks.length) {
        body.append(action('drugi broj', 'search', () => {
          delete S.folioLinks[p.reference]; db.set('folioLinks', S.folioLinks); st.folios = []; renderSheet();
        }, { quiet: true }));
      }
    }
    if (!inTabNow.length && st.tab !== P.Tab.OWNER) body.append(h('div.dim', {}, 'ništa nije upisano'));
    else if (inTabNow.length && !shownNow.length) body.append(h('div.dim', {}, `na ovom listu ništa ne odgovara "${st.filter}"`));
  }

  function folioFinder() {
    let byFolio = false;
    const input = h('input.field', { inputmode: 'numeric', placeholder: '370/1' });
    const wrap = h('div.finder', {},
      h('div', {}, `Katastar čestici ${rec.number} ne povezuje nijedan zemljišnoknjižni uložak: zemljišna knjiga k.o. ${rec.municipality} vodi svoje, starije brojeve. Upišite jedan od njih.`),
      st.folioProblem ? h('div.red', {}, st.folioProblem) : null);
    const pickKind = () => choice([{ word: 'zk čestica' }, { word: 'z.k. uložak' }], byFolio ? 1 : 0, (i) => {
      byFolio = i === 1; input.placeholder = byFolio ? '1243' : '370/1'; kind.replaceWith(kind = pickKind());
    });
    let kind = pickKind();
    const go = async () => {
      const n = input.value.trim();
      if (!n) return;
      st.folios = null; st.folioProblem = null; renderSheet();
      try {
        const found = await net.findOwnerSheets(rec.municipality, n, byFolio);
        st.folios = found;
        if (!found.length) st.folioProblem = `zemljišna knjiga ${rec.municipality} nema ${byFolio ? 'uložak' : 'česticu'} ${n}`;
        else { S.folioLinks[p.reference] = [found[0].bookId, found[0].unit]; db.set('folioLinks', S.folioLinks); addToImenik(p, rec, found); }
      } catch (e) { st.folios = []; st.folioProblem = `zemljišna knjiga se nije mogla pročitati: ${e.message}`; }
      renderSheet();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    wrap.append(kind, input, action('pronađi vlasnike', 'search', go));
    return wrap;
  }

  const kept = st.keptAt ? h('div.amber', {}, `bez signala: prikazan zapis od ${new Date(st.keptAt).toLocaleDateString('hr-HR')}`) : null;
  const el = h('div.face.sheet', { id: 'sheet', role: 'dialog', 'aria-label': `čestica ${p.number}` },
    h('header.facehead', {}, title, ...tools, iconAction('close', null, closeFace, { title: 'Close', id: 'sheet-close' })),
    h('div.facebody', {},
      h('div.area', {}, P.areaLabel(area) + (rec?.address ? ` · ${rec.address}` : '')),
      kept, note,
      h('div.filterbox', {}, iconEl('filter', 18), filter),
      tabs, body),
    mineControls(p, mine));
  renderBody();
  showFace(el);
}

/** At the sheet's foot: keep the parcel among Moje čestice, in any colour and line. */
function mineControls(p, mine) {
  const colour = mine?.colour ?? db.pref('parcelColour', P.SWATCHES[0]);
  const lineStyle = mine?.style ?? db.pref('parcelStyle', 'DASHED');
  const keep = toggle(mine ? 'Moja čestica' : 'Dodaj u Moje čestice', 'parcels', !!mine, async (on) => {
    if (!on) { S.marks = P.without(S.marks, p.reference); say(`${p.number} više nije među mojim česticama`); }
    else {
      const made = { ...P.markOf(p, colour, lineStyle), rings: p.rings.length ? p.rings : (mine?.rings ?? []) };
      S.marks = P.withMark(S.marks, made);
      if (!made.rings.length) fillShapes();
    }
    await saveMarks();
    renderSheet();
  }, { id: 'sheet-keep' });
  const setColour = async (c) => {
    db.setPref('parcelColour', c);
    if (mine) { S.marks = P.withMark(S.marks, { ...mine, colour: c }); await saveMarks(); }
    renderSheet();
  };
  const hues = h('div.hue', { title: 'any colour', onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); setColour(P.hue(360 * (e.clientX - r.left) / r.width)); } });
  if (!mine) return h('footer.mine', {}, keep);
  return h('footer.mine', {}, keep,
    choice(P.SWATCHES.map((c) => ({ colour: P.cssColour(c), title: P.cssColour(c) })), P.SWATCHES.indexOf(colour), (i) => setColour(P.SWATCHES[i]), { swatches: true }),
    hues,
    choice(P.LINE_STYLES.map((s) => ({ word: P.LINE_WORDS[s] })), P.LINE_STYLES.indexOf(lineStyle), async (i) => {
      const s = P.LINE_STYLES[i];
      db.setPref('parcelStyle', s);
      if (mine) { S.marks = P.withMark(S.marks, { ...mine, style: s }); await saveMarks(); }
      renderSheet();
    }));
}

/** Parcels kept before their outline came: asked again of the WFS. */
let filling = false;
async function fillShapes() {
  if (filling) return;
  const missing = P.shapeless(S.marks);
  if (!missing.length) return;
  filling = true;
  try {
    const found = await net.shapes(missing.map((m) => m.reference));
    S.marks = P.withShapes(S.marks, found);
    await saveMarks();
  } catch (e) {
    say(`Obris čestice ${missing.map((m) => m.number).join(', ')} još nije stigao (${e.message}); pitat ću ponovno`);
  } finally { filling = false; }
}

// --- faces ---------------------------------------------------------------------------------------

export function showFace(el) {
  const holder = $('#faces');
  holder.replaceChildren(el);
  holder.hidden = false;
}

export function closeFace() {
  const holder = $('#faces');
  holder.replaceChildren();
  holder.hidden = true;
  if (sheetState) sheetState = null;
}

export {
  showLayer, applyVisibility, openSheet, goToParcel, goToNumber, openKept, showFound, addToImenik, select, showPin, whereAmI, remember, saveMarks, fillShapes,
  giveFile, drawMine, inkNow, topLine,
};

// The rest of the app (keys, fields, Moje čestice, caches, Imenik, settings, Google help) is in
// faces.js, which imports this module; boot() starts both.
import('./faces.js').then((f) => f.boot()).catch((e) => {
  document.body.append(h('pre.fatal', {}, `ARKOD Layer could not start: ${e?.message ?? e}`));
});

export async function loadState() {
  S.lines = Style.decode(await db.get('lines', null));
  S.marks = P.decode(await db.get('marks', ''));
  S.groups = MarkFile.decodeGroups(await db.get('groups', '[]'));
  S.imenik = OwnerBook.decode(await db.get('imenik', ''));
  S.history = (await db.get('history', {})) ?? {};
  S.keys = (await db.get('keys', [])) ?? [];
  S.folioLinks = (await db.get('folioLinks', {})) ?? {};
  S.seenKo = (await db.get('seenKo', [])) ?? [];
  Services.restore((await db.get('serviceLog', [])) ?? []);
  const infos = (await db.get('caches', [])) ?? [];
  S.caches = [];
  for (const t of infos) {
    const info = Cache.decodeInfo(t);
    if (!info) continue;
    S.caches.push({ info, items: Cache.decodeItems(await db.get('cache:' + info.id, '[]')) });
  }
  try { S.version = (await (await fetch('version.json', { cache: 'no-cache' })).json()).version; } catch { S.version = null; }
}

export function bestKey() {
  const order = { GOOD: 0, UNTRIED: 1, UNREACHABLE: 2, REFUSED: 3 };
  return [...S.keys].sort((a, b) => (order[a.verdict] ?? 1) - (order[b.verdict] ?? 1))[0] ?? null;
}

export const saveKeys = () => db.set('keys', S.keys);

export function showGoogleHelp(problem) {
  // faces.js draws it; this module only asks.
  document.dispatchEvent(new CustomEvent('arkod:googlehelp', { detail: problem ?? null }));
}

export { buildMap, fold, distanceLabel, results, searchBox, nameBox, face, group, opens, pick, toggle, choice, action, iconAction, h, db, net, P, Style, Cache, MarkFile, OwnerBook };
