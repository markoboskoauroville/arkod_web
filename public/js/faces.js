// THE KEYS, THE FIELDS AND THE FACES of ARKOD Layer on the web: Parcel view, Moje čestice with their
// groups, parcel caches and the job that fills one, Imenik, the Google key's help, and the settings.
// Settings speak English; everything of the cadastre stays Croatian (Marko, 29.9.2026).

import {
  S, say, showLayer, applyVisibility, openSheet, goToParcel, select, showPin, whereAmI, remember, saveMarks, fillShapes,
  giveFile, drawMine, topLine, showFace, closeFace, loadState, bestKey, saveKeys, buildMap,
  fold, distanceLabel, results, searchBox, nameBox, face, group, opens, pick, toggle, choice, action, iconAction, h, db, net, P, Style, Cache, MarkFile, OwnerBook,
  openKept, showFound, addToImenik, retrySheet,
} from './app.js';
import { icon } from './icons.js';
import * as Q from './core/query.js';
import * as Sn from './core/sniff.js';
import * as Services from './core/services.js';
import { Sniffer, Flyer, lightCheck, checkAll, checkUntilBack } from './scan.js';

const $ = (sel) => document.querySelector(sel);
const RELEASES = 'https://github.com/markoboskoauroville/arkod_web/releases/latest';

// --- boot ----------------------------------------------------------------------------------------

export async function boot() {
  await loadState();
  document.addEventListener('arkod:googlehelp', (e) => googleHelp(e.detail));
  buildKeys();
  buildMap();
  buildFields();
  wireImport();
  wireFullScreen();
  wireBackground();
  if (S.marks.some((m) => !m.rings.length)) fillShapes();
  if ('serviceWorker' in navigator && !new URLSearchParams(location.search).has('nosw')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* the app works without it, only not offline */ });
  }
  const open = new URLSearchParams(location.search).get('open');
  if (open === 'mine') mojeCestice();
  if (open === 'settings') settings();
  document.body.dataset.ready = '1';
}

// --- what runs in the background, said at every step (web v3, Android v12 to v16) ---------------------

const hhmm = (t) => new Date(t).toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' });

function statusLine(id, text) {
  const el = $('#' + id);
  if (!el) return;
  el.hidden = !text;
  el.textContent = text ?? '';
}

/** The lights under the coordinates: a short name each, green, red or grey; a tap opens the settings. */
function drawLights() {
  const el = $('#lights');
  if (!el) return;
  el.replaceChildren(...Services.SERVICES.filter((s) => s.id !== 'GOOGLE' || S.keys.length).map((s) => {
    const l = Services.light(Services.health.get(s.id));
    return h('span.light', { dataset: { service: s.id, light: l }, title: `${s.title}: ${Services.said(Services.health.get(s.id), Date.now(), hhmm)}` },
      h('i.led.' + l.toLowerCase()), s.short);
  }));
}

function roundKey(id, iconName, label, on, onclick, onlong = null) {
  const b = key(id, iconName, label, onclick, { cls: '.round' + (on ? '.lit' : ''), onlong });
  return b;
}

function drawRoundKeys() {
  const row = $('#roundkeys');
  if (!row) return;
  row.replaceChildren(
    // FLY-THROUGH SCANNING (v3, Android v16): the small airplane.
    roundKey('k-fly', 'plane', Flyer.state.on ? 'Land (stop fly-through)' : 'Fly-through scanning', Flyer.state.on, () => {
      if (Flyer.state.on) { Flyer.stop(); say(`✈ landed · found ${S.found.length}`); drawRoundKeys(); } else askFly();
    }, askFly),
    // THE CACHE KEY (v3, Android v12): lit while the app caches in the background.
    roundKey('k-cache', 'sniff', S.cacheOn ? 'Cache on (tap: off)' : 'Cache off (tap: on)', S.cacheOn, () => setCache(!S.cacheOn), settings),
  );
}

function setCache(on) {
  S.cacheOn = on;
  db.setPref('cacheOn', on);
  if (on) Sniffer.start(); else Sniffer.stop();
  say(on ? 'cache on: reading ahead in the background' : 'cache off: only what you open is kept');
  drawRoundKeys();
}

async function askFly() {
  const q = await nameBox('✈ fly-through: what to look for (a name, a place, a land use; one per comma)', db.pref('flyQuery', '') || 'jaša');
  if (q == null) return;
  db.setPref('flyQuery', q);
  showFound([]);
  Flyer.start(q);
  drawRoundKeys();
  say(`✈ flying: "${q}" · scanning where the map rests`);
  Flyer.viewSettled(S.map.getBounds(), S.map.getZoom());
}

function wireBackground() {
  // The service lights and their log: every change said on the map and kept.
  Services.listeners.add((e) => {
    drawLights();
    if (!e) return;
    db.set('serviceLog', Services.log).catch(() => {});
    say(Services.eventLine(e, hhmm));
    // MAKE IT WORK (web v5): a service back, what waited for it is done at once.
    if (e.online) {
      if (e.service === 'WMS') { applyVisibility(); say(`${hhmm(e.at)} WMS back online · the ARKOD layer is drawn again`); }
      if (e.service === 'WFS') { say(`${hhmm(e.at)} WFS back online · missing outlines asked`); fillShapes(); }
      if ((e.service === 'OSS' || e.service === 'ZK') && retrySheet()) say(`${hhmm(e.at)} ${Services.shortOf(e.service)} back online · the sheet is read again`);
    }
    if (document.querySelector('#settings')) settings.refresh?.();
  });
  drawLights();
  $('#lights').addEventListener('click', () => settings());
  lightCheck();
  // The sniffer.
  Sniffer.criteria = Sn.criteria(S.cacheKeywords);
  Sniffer.onSheet = (p, rec, folios) => addToImenik(p, rec, folios);
  Sniffer.onChange = (t) => statusLine('sniffline', S.cacheOn && t.busy ? Sn.line(t, Sniffer.criteria) : null);
  if (S.cacheOn) Sniffer.start();
  // Fly-through.
  Flyer.onChange = (st) => statusLine('flyline', st.on ? Sn.flyLine(st) : null);
  Flyer.onFound = (p, why) => {
    showFound([...S.found.filter((x) => x.id !== p.id), p]);
    if (p.rings?.length) select(p);
    say(`✈ found ${p.number}: ${why} · selected${p.rings?.length ? '' : ' (outline not yet)'}`);
  };
  drawRoundKeys();
}

// --- full screen (web v2) ------------------------------------------------------------------------

/**
 * FULL SCREEN: the map alone, with one key to come back (Marko, 30.9.2026). The page's own controls
 * are hidden whatever the browser allows; where the browser has the Fullscreen API (Android Chrome,
 * desktops, iPad) its bars go too. An iPhone has no such API for a page: there the home-screen app
 * has no bars already, and full screen hides the rest.
 */
export function setFullScreen(on) {
  document.body.classList.toggle('full', on);
  const b = $('#k-full');
  b.innerHTML = icon(on ? 'fullscreen_exit' : 'fullscreen', 24);
  b.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen');
  b.title = b.getAttribute('aria-label');
  b.setAttribute('aria-pressed', String(on));
  const el = document.documentElement;
  const request = el.requestFullscreen ?? el.webkitRequestFullscreen;
  const inBrowserFull = document.fullscreenElement ?? document.webkitFullscreenElement;
  try {
    if (on && request && !inBrowserFull) Promise.resolve(request.call(el)).catch(() => { /* the page's own full screen is enough */ });
    if (!on && inBrowserFull) Promise.resolve((document.exitFullscreen ?? document.webkitExitFullscreen).call(document)).catch(() => {});
  } catch { /* the page's own full screen is enough */ }
  setTimeout(() => S.map.invalidateSize(), 200);
}

function wireFullScreen() {
  $('#k-full').addEventListener('click', () => setFullScreen(!document.body.classList.contains('full')));
  // Esc or the system's back gesture leaves the browser's full screen: leave the page's too.
  for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) {
    document.addEventListener(ev, () => {
      if (!(document.fullscreenElement ?? document.webkitFullscreenElement) && document.body.classList.contains('full')) setFullScreen(false);
    });
  }
  setFullScreen(false);
}

// --- the key row ---------------------------------------------------------------------------------

function key(id, iconName, label, onclick, { word = null, cls = '', onlong = null } = {}) {
  const b = h(`button.key${cls}`, { id, type: 'button', 'aria-label': label, title: label },
    h('span.icw', { html: icon(iconName, word ? 22 : 26) }), word ? h('small', {}, word) : null);
  let timer = null;
  let longDone = false;
  if (onlong) {
    b.addEventListener('pointerdown', () => { longDone = false; timer = setTimeout(() => { longDone = true; onlong(); }, 550); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => clearTimeout(timer));
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!longDone) { longDone = true; onlong(); } });
  }
  b.addEventListener('click', (e) => { if (longDone) { longDone = false; e.preventDefault(); return; } onclick(); });
  return b;
}

/**
 * GOOGLE'S VIEWS, ON A LONG PRESS OF GOO (1.10.2026). Marko: "Long press on the action bar for Google Maps ...
 * It needs to open different options for different views for Google Maps. Just that, and then when I choose
 * the view it just closes." The same four as Settings → Google map; the one in use is marked. A choice shows
 * Google's map in that view and closes; a tap anywhere else, or Esc, closes it too.
 */
export const GOOGLE_VIEWS = [['roadmap', 'map'], ['satellite', 'satellite'], ['terrain', 'terrain'], ['hybrid', 'hybrid']];
let closeGoogleViews = null;
function googleViews() {
  closeGoogleViews?.();
  const close = () => {
    panel.remove();
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', esc);
    if (closeGoogleViews === close) closeGoogleViews = null;
  };
  closeGoogleViews = close;
  const outside = (e) => { if (!panel.contains(e.target) && e.target.closest?.('#k-goo') == null) close(); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const panel = h('div.gooviews', { id: 'goo-views', role: 'dialog', 'aria-label': 'Google map view' },
    choice(GOOGLE_VIEWS.map(([, w]) => ({ word: w })), GOOGLE_VIEWS.findIndex(([v]) => v === S.googleView), (i) => {
      S.googleView = GOOGLE_VIEWS[i][0];
      db.setPref('googleView', S.googleView);
      close();
      showLayer('google');
    }));
  const keys = $('#keys')?.getBoundingClientRect();
  if (keys) panel.style.bottom = `${Math.round(window.innerHeight - keys.top + 8)}px`;
  $('#app').append(panel);
  setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', esc); }, 0);
}

function buildKeys() {
  const row = $('#keys');
  row.replaceChildren(
    key('k-minus', 'minus', 'Zoom out', () => S.map.zoomOut()),
    key('k-where', 'locate', 'Where am I', whereAmI),
    key('k-off', 'mountain', 'Offline map: tiles already seen', () => showLayer('off'), { word: 'OFF', cls: '.mapkey' }),
    // GOO: a tap shows Google's map; a long press chooses its view (1.10.2026)
    key('k-goo', 'google', 'Google map (long press: its view)', () => showLayer('google'), { word: 'GOO', cls: '.mapkey', onlong: googleViews }),
    key('k-osm', 'globe', 'OpenStreetMap', () => showLayer('osm'), { word: 'OSM', cls: '.mapkey' }),
    // THE SHOW/HIDE ARKOD LAYER KEY: a tap hides or shows the state's parcels, and always brings
    // them back from "Only Moje čestice"; a long press opens Parcel view (Android v5).
    key('k-arkod', 'parcels', 'Show/hide ARKOD layer (long press: Parcel view)', () => {
      if (S.onlyMine) { S.onlyMine = false; db.setPref('onlyMine', false); S.cadastreOn = true; }
      else S.cadastreOn = !S.cadastreOn;
      db.setPref('cadastreOn', S.cadastreOn);
      applyVisibility();
      say(S.cadastreOn ? 'ARKOD layer shown' : 'ARKOD layer hidden · long press: Parcel view');
    }, { onlong: parcelView }),
    key('k-settings', 'settings', 'Settings', settings),
    key('k-plus', 'plus', 'Zoom in', () => S.map.zoomIn()),
  );
  row.querySelector('#k-off').dataset.map = 'off';
  row.querySelector('#k-goo').dataset.map = 'google';
  row.querySelector('#k-osm').dataset.map = 'osm';
}

// --- the two fields on the map -------------------------------------------------------------------

let googleSession = crypto.randomUUID?.() ?? String(Math.random());

function buildFields() {
  const box = $('#fields');
  box.replaceChildren();
  // GOOGLE'S FIELD, on every map, when there is a key (v3).
  if (bestKey()) {
    const out = h('div.fieldresults');
    let timer = null;
    const find = async (text, full) => {
      const key = bestKey();
      if (!key || text.trim().length < 3) { out.replaceChildren(); return; }
      const c = S.map.getCenter();
      const { hits, problem } = await net.googleFind(text.trim(), [c.lat, c.lng], key.value, googleSession, full);
      out.replaceChildren(problem ? h('div.dim.pad', {}, problem) : results(hits, async (x) => {
        remember('google', text);
        const there = await net.googleLocate(x, key.value, googleSession);
        googleSession = crypto.randomUUID?.() ?? String(Math.random());
        out.replaceChildren();
        if (!there) { say('Google did not say where that is'); return; }
        showPin(there.lat, there.lon);
        S.map.setView([there.lat, there.lon], 18);
      }, distanceLabel));
    };
    const { wrap } = searchBox({
      id: 'google-field', placeholder: 'Google: mjesto, ulica…', history: () => S.history.google ?? [],
      oninput: (t) => { clearTimeout(timer); timer = setTimeout(() => find(t, false), 400); },
      onsubmit: (t) => { remember('google', t); find(t, true); },
      onpickPast: (t) => find(t, true),
    });
    box.append(h('div.fieldwrap', {}, wrap, out));
  }
  // THE PARCEL FIELD (v3): a number as he types, "pl 1984", or a name (Imenik and the caches).
  if (S.parcelSearchOn) {
    const out = h('div.fieldresults', { id: 'parcel-results' });
    let timer = null;
    let asked = 0;
    const line = h('div.fieldline', { id: 'parcel-line', hidden: true });
    const find = async (text, full) => {
      const my = ++asked;
      const { hits, said } = await parcelSearch(text.trim(), full);
      if (my !== asked) return;
      line.hidden = !said; line.textContent = said ?? '';
      // SEARCH OPENS IT (v3, Android v11): the one exact number goes to the map and its sheet.
      const q = full ? Q.parse(text) : null;
      const one = q ? Q.best(hits, q.number) : null;
      if (one) { remember('parcel', text); out.replaceChildren(); line.hidden = true; openHit(one); return; }
      out.replaceChildren(hits.length ? results(hits, (x) => { remember('parcel', text); out.replaceChildren(); openHit(x); }, distanceLabel)
        : (text.trim().length >= 1 && full ? h('div.dim.pad', {}, 'ništa nije pronađeno') : ''));
    };
    const { wrap } = searchBox({
      id: 'parcel-field', placeholder: 'čestica (i k.o.): 1358/3 kukljica, pl 1984, ime', history: () => S.history.parcel ?? [],
      oninput: (t) => { clearTimeout(timer); timer = setTimeout(() => find(t, false), 250); },
      onsubmit: (t) => { remember('parcel', t); municipalityHere.cache?.clear(); find(t, true); },
      onpickPast: (t) => find(t, true),
    });
    box.append(h('div.fieldwrap', {}, wrap, line, out));
  }
}

async function municipalityHere() {
  const c = S.map.getCenter();
  const k = `${c.lat.toFixed(3)},${c.lng.toFixed(3)}`;
  if (!municipalityHere.cache) municipalityHere.cache = new Map();
  if (municipalityHere.cache.has(k)) return municipalityHere.cache.get(k);
  const m = await net.municipalityAt(c.lat, c.lng).catch(() => null);
  municipalityHere.cache.set(k, m);
  // Every k.o. the map stood over is remembered (v3, Android v11): a number is found there from anywhere.
  if (m) { S.seenKo = Q.withSeen(S.seenKo, Q.ko(m.reg, m.name, m.id ?? '')); db.set('seenKo', S.seenKo).catch(() => {}); }
  return m;
}

/**
 * WHAT THE PARCEL FIELD FINDS (v3, Android v11): Moje čestice in every k.o., the caches and Imenik on
 * the device, then OSS: in the k.o. he named ("1358/3 kukljica"), else the one under the map, and when
 * that has no such number, every k.o. already known on the device. {hits, said}: said is the line.
 */
async function parcelSearch(text, full) {
  if (!text) return { hits: [], said: null };
  const cached = [...Cache.search(S.caches, text, 12)];
  const sheet = /^p\.?\s*l\.?\s*(\d+)$/.exec(fold(text))?.[1];
  const q = sheet ? null : Q.parse(text);
  let mine = [];
  let remote = [];
  let said = null;
  const local = [...cached];
  if (!q && !sheet) local.push(...OwnerBook.search(S.imenik, text, 20).map(OwnerBook.hit));
  try {
    if (q) {
      const known = Q.known(S.seenKo, S.marks, S.caches, S.imenik);
      const named = q.place ? Q.resolve(q.place, known) : null;
      if (q.place && !named) {
        mine = Q.mine(S.marks, q.number, known);
        said = `k.o. "${q.place}" još nije poznata: pomaknite kartu iznad nje jednom`;
      } else {
        mine = Q.mine(S.marks, q.number, known, named);
        const m = named ?? await municipalityHere();
        const here = m ? Q.ko(m.reg, m.name, m.id ?? '') : null;
        const first = here ? await net.suggestions(q.number, { reg: here.reg, name: Q.label(here) }) : [];
        let others = [];
        if (!named && !Q.hasExact([...mine, ...first], q.number)) {
          const lists = await Promise.all(known.filter((k) => k.reg !== here?.reg).slice(0, 8)
            .map((k) => net.suggestions(q.number, { reg: k.reg, name: Q.label(k) }).catch(() => [])));
          others = lists.flat();
        }
        const elsewhere = [...new Set(others.map((h) => known.find((k) => k.reg === h.ref?.split('-')[0])).filter(Boolean).map(Q.label))];
        said = [cached.length ? `caches: ${cached.length}` : null, mine.length ? `Moje čestice: ${mine.length}` : null,
          here ? `k.o. ${Q.label(here)} · ${first.length}` : 'k.o. pod kartom nije poznata',
          elsewhere.length ? `i u k.o. ${elsewhere.join(', ')}` : null].filter(Boolean).join(' · ');
        remote = [...first, ...others];
      }
    } else if (sheet && full) {
      const m = await municipalityHere();
      if (m?.id) remote = await net.ossSearch(m.id, null, sheet);
    }
  } catch (e) { said = e.message; }
  const seen = new Set();
  const hits = [...mine, ...local, ...remote].filter((x) => { const k = x.ref ?? x.title; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 30);
  return { hits, said };
}

/** A parcel result: from a cache at once (no signal needed), else its sheet and its outline. */
async function openHit(x) {
  const fromCache = x.ref ? Cache.byReference(S.caches, x.ref) : null;
  if (fromCache) return goToParcel(Cache.itemParcel(fromCache), true);
  const mine = S.marks.find((m) => m.reference === x.ref && m.rings.length);
  if (mine) return goToParcel(P.parcel(mine.id, mine.number, mine.reference, null, mine.rings), true);
  const shape = x.ref ? await net.keptShape(x.ref) : null;
  if (shape?.rings?.length) return goToParcel(shape, true);
  const number = x.ref.slice(x.ref.indexOf('-') + 1);
  const parcel = P.parcel(Number(x.id) || 0, number, x.ref, null, []);
  openSheet(parcel);
  try {
    const shape = (await net.shapes([x.ref])).find((s) => s.reference === x.ref);
    if (shape?.rings.length) {
      select({ ...parcel, rings: shape.rings });
      const [la, lo] = P.middleOf(shape.rings);
      showPin(la, lo);
      S.map.setView([la, lo], 18);
    }
  } catch (e) { say(`${number}: državna usluga karte ne odgovara (${e.message}); list je otvoren`); }
}

// --- Parcel view (the long press) -----------------------------------------------------------------

export function parcelView() {
  const body = h('div');
  const render = () => {
    body.replaceChildren(
      group('On the map',
        toggle('ARKOD layer', 'parcels', S.cadastreOn, (on) => { S.cadastreOn = on; db.setPref('cadastreOn', on); applyVisibility(); render(); }, { id: 'pv-layer' }),
        toggle('Only Moje čestice', 'pin', S.onlyMine, (on) => { S.onlyMine = on; db.setPref('onlyMine', on); applyVisibility(); render(); }, { id: 'pv-only' }),
        toggle('Parcel search', 'search', S.parcelSearchOn, (on) => { S.parcelSearchOn = on; db.setPref('parcelSearchOn', on); buildFields(); render(); }, { id: 'pv-search' })),
      group('Lines', linesEditor()),
      group('Parcel caches',
        action('Cache this view', 'save', cacheThisView, { id: 'pv-cache' }),
        toggle('Own lines in caches', 'layers', S.ownLines, (on) => { S.ownLines = on; db.setPref('ownLines', on); applyVisibility(); render(); }),
        opens('Parcel caches', 'save', S.caches.length ? `${S.caches.length} kept` : 'none yet', caches)),
      group('Moje čestice', opens('Moje čestice', 'parcels', `${S.marks.length} kept`, mojeCestice)),
      group('Imenik', opens('Imenik', 'search', `${new Set(S.imenik.map((e) => fold(e.name))).size} names`, imenik)),
    );
  };
  render();
  showFace(face('layers', 'Parcel view', closeFace, body, { id: 'parcel-view' }));
}

/** Colour (auto + six), transparency, thickness: the state's lines, restyled on the device. */
function linesEditor() {
  const el = h('div.pad');
  const render = () => {
    const l = S.lines;
    const set = async (next) => { S.lines = next; await db.set('lines', Style.encode(next)); applyVisibility(); render(); };
    const colours = [null, ...Style.LINE_COLOURS];
    el.replaceChildren(
      h('div.dim', {}, 'colour'),
      choice(colours.map((c) => (c == null ? { word: 'auto' } : { colour: P.cssColour(c), title: P.cssColour(c) })),
        colours.indexOf(l.colour), (i) => set({ ...l, colour: colours[i] }), { swatches: true, id: 'lines-colour' }),
      h('div.dim', {}, 'transparency'),
      choice(Style.OPACITIES.map((o) => ({ word: `${o}%` })), Style.OPACITIES.indexOf(l.opacity), (i) => set({ ...l, opacity: Style.OPACITIES[i] }), { id: 'lines-opacity' }),
      h('div.dim', {}, 'thickness'),
      choice(Style.WEIGHTS.map((w) => ({ word: Style.WEIGHT_WORDS[w] })), Style.WEIGHTS.indexOf(l.weight), (i) => set({ ...l, weight: Style.WEIGHTS[i] }), { id: 'lines-weight' }),
    );
  };
  render();
  return el;
}

// --- Moje čestice, in groups ---------------------------------------------------------------------

export function mojeCestice() {
  const body = h('div');
  const render = () => {
    body.replaceChildren();
    body.append(h('div.two', {},
      action('Import a file', 'folder', () => $('#import-file').click(), { quiet: true, id: 'mine-import' }),
      h('div.dim.small', {}, 'or drop a .arkod.json here')));
    if (!S.marks.length) body.append(h('div.dim.pad', {}, 'Još nijedna. Dodirnite česticu, dodirnite je ponovno za list i uključite "Dodaj u Moje čestice".'));
    for (const g of MarkFile.groupsIn(S.marks, S.groups)) {
      const own = !g.name.trim();
      const members = S.marks.filter((m) => m.group === g.name);
      const gEl = h('section.mgroup', { dataset: { group: g.name } },
        h('div.ghead', {},
          h('span.sample', { html: sampleSvg(g.colour, g.style, g.weight) }),
          h('button.gname', { type: 'button', onclick: () => groupLook(g) }, own ? 'Moje čestice' : g.name, h('small', {}, ` ${members.length}`)),
          iconAction(g.visible ? 'eye' : 'eye_off', null, async () => {
            S.groups = [...S.groups.filter((x) => x.name !== g.name), { ...g, visible: !g.visible }];
            await saveMarks(); render();
          }, { title: g.visible ? 'Hide group' : 'Show group' }),
          iconAction('share', null, async () => {
            const how = await giveFile(MarkFile.fileName(own ? 'Moje čestice' : g.name), MarkFile.encode(g, members), 'application/json');
            if (how !== 'cancelled') say(how === 'shared' ? 'poslano' : 'spremljeno u Preuzimanja');
          }, { title: 'Export the group' })),
        members.map((m) => h('div.mrow', {},
          h('button.mopen', { type: 'button', onclick: () => { closeFace(); goToParcel(P.parcel(m.id, m.number, m.reference, null, m.rings), true); } },
            h('span.title', {}, m.number + (m.name ? ` · ${m.name}` : '')),
            h('span.under', {}, `k.o. ${P.municipalityOf(m.reference)}${m.rings.length ? '' : ' · obris stiže'}`)),
          iconAction('edit', null, async () => {
            const name = await nameBox('ime čestice', m.name || m.number);
            if (name == null) return;
            S.marks = P.withMark(S.marks, { ...m, name }); await saveMarks(); render();
          }, { title: 'Name' }),
          iconAction('trash', null, async (e) => {
            const b = e.currentTarget;
            if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.querySelector('.nm')?.remove(); b.append(h('span.nm', {}, 'sigurno?')); return; }
            S.marks = P.without(S.marks, m.reference); await saveMarks(); render();
          }, { danger: true, title: 'Delete' }))));
      body.append(gEl);
    }
  };
  render();
  mojeCestice.render = render;
  showFace(face('parcels', 'Moje čestice', closeFace, body, { id: 'moje' }));
}

function sampleSvg(colour, lineStyle, weight) {
  const w = { FINE: 1.5, NORMAL: 2.5, BOLD: 4 }[weight] ?? 2.5;
  const dash = lineStyle === 'DASHED' ? `${w * 4} ${w * 2.5}` : lineStyle === 'DOTTED' ? `${w * 0.8} ${w * 2.2}` : 'none';
  return `<svg width="44" height="12"><line x1="2" y1="6" x2="42" y2="6" stroke="${P.cssColour(colour)}" stroke-width="${w}" stroke-dasharray="${dash}"/></svg>`;
}

/** A group's look: its colour, line and thickness, for every one of its parcels. */
function groupLook(g) {
  const body = h('div');
  let cur = { ...g };
  const render = () => {
    const set = async (next) => {
      cur = next;
      S.groups = [...S.groups.filter((x) => x.name !== cur.name), cur];
      S.marks = MarkFile.restyle(S.marks, cur);
      await saveMarks();
      render();
    };
    body.replaceChildren(
      h('div.pad', {},
        h('span.sample.big', { html: sampleSvg(cur.colour, cur.style, cur.weight) }),
        h('div.dim', {}, 'colour'),
        choice(P.SWATCHES.map((c) => ({ colour: P.cssColour(c), title: P.cssColour(c) })), P.SWATCHES.indexOf(cur.colour), (i) => set({ ...cur, colour: P.SWATCHES[i] }), { swatches: true, id: 'group-colour' }),
        h('div.hue', { onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); set({ ...cur, colour: P.hue(360 * (e.clientX - r.left) / r.width) }); } }),
        h('div.dim', {}, 'line'),
        choice(P.LINE_STYLES.map((s) => ({ word: P.LINE_WORDS[s] })), P.LINE_STYLES.indexOf(cur.style), (i) => set({ ...cur, style: P.LINE_STYLES[i] }), { id: 'group-style' }),
        h('div.dim', {}, 'thickness'),
        choice(Style.WEIGHTS.map((w) => ({ word: Style.WEIGHT_WORDS[w] })), Style.WEIGHTS.indexOf(cur.weight), (i) => set({ ...cur, weight: Style.WEIGHTS[i] }), { id: 'group-weight' }),
        toggle('Shown', 'eye', cur.visible, (on) => set({ ...cur, visible: on }))),
      action('Done', 'check', mojeCestice, { id: 'group-done' }));
  };
  render();
  showFace(face('parcels', g.name.trim() ? g.name : 'Moje čestice', mojeCestice, body, { id: 'group-look' }));
}

// --- .arkod.json import: the picker, and a file dropped anywhere ---------------------------------

async function importFile(file) {
  const text = await file.text();
  const read = MarkFile.decode(text, file.name);
  if (!read) { say(`${file.name}: to nije datoteka Mojih čestica`); return; }
  const [marks, groups] = MarkFile.importInto(S.marks, S.groups, read);
  S.marks = marks;
  S.groups = groups;
  await saveMarks();
  say(`${read.group.name}: ${read.marks.length} čestica uvezeno`);
  mojeCestice();
  if (read.marks.some((m) => !m.rings.length)) fillShapes();
  const first = read.marks.find((m) => m.rings.length);
  if (first) { const [la, lo] = P.middleOf(first.rings); S.map.setView([la, lo], 17); }
}

function wireImport() {
  const input = $('#import-file');
  input.addEventListener('change', async () => {
    for (const f of input.files) await importFile(f);
    input.value = '';
  });
  window.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dropping'); });
  window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    document.body.classList.remove('dropping');
    for (const f of e.dataTransfer?.files ?? []) await importFile(f);
  });
  $('#key-file').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (f) addKeys(await f.text());
    e.target.value = '';
  });
}

// --- parcel caches -------------------------------------------------------------------------------

async function saveCache(cache) {
  await db.set('cache:' + cache.info.id, Cache.encodeItems(cache.items));
  S.caches = [...S.caches.filter((c) => c.info.id !== cache.info.id), cache].sort((a, b) => b.info.createdMs - a.info.createdMs);
  await db.set('caches', S.caches.map((c) => Cache.encodeInfo(c.info)));
  applyVisibility();
}

async function cacheThisView() {
  if (job) { say('a cache is being filled; stop it first'); return; }
  const b = S.map.getBounds();
  const box = Cache.box(b.getSouth(), b.getWest(), b.getNorth(), b.getEast());
  const m = await municipalityHere();
  const d = new Date();
  const name = await nameBox('name of the cache', Cache.defaultName(m?.name ?? '', `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`));
  if (name == null) return;
  closeFace();
  runJob(name, box, S.map.getZoom(), Cache.COLOURS[S.caches.length % Cache.COLOURS.length], S.cacheOwners);
}

let job = null;

function progress(p) {
  const el = $('#status');
  el.hidden = false;
  el.replaceChildren(h('span', { id: 'status-line' }, Cache.progressLine(p)),
    p.finished ? iconAction('close', null, () => { el.hidden = true; }, { title: 'Dismiss' })
      : iconAction('close', 'stop', () => job?.abort(), { title: 'Stop' }));
}

/**
 * FILL A CACHE WITH EVERYTHING IN THE BOX (ParcelCaches.start): the outlines from the WFS, 500 to a
 * page, waited out when the state's database fails (8 tries, about five minutes, its own reason
 * shown); then every possession sheet, six at once; then, if asked, every owner sheet once. Saved
 * after the outlines and every 300 sheets, so a stop keeps what was read.
 */
async function runJob(name, box, zoom, colour, owners) {
  const ctl = new AbortController();
  job = ctl;
  const signal = ctl.signal;
  const id = 'c' + Date.now();
  let info = Cache.info({ id, name, createdMs: Date.now(), box, zoom, colour });
  const kept = new Map();
  try {
    const found = [];
    const seen = new Set();
    let total = 0;
    let page = 0;
    const began = Date.now();
    while (!signal.aborted) {
      progress({ name, stage: page === 0 ? 'asking the state for the čestice in the view (≈15 s)' : 'outlines of čestice', done: found.length, total });
      let got = null;
      let last = null;
      for (let attempt = 1; attempt <= Cache.TRIES; attempt++) {
        try { got = await net.boxPage(box, found.length, signal); break; } catch (e) {
          last = e;
          if (signal.aborted || attempt === Cache.TRIES) break;
          const wait = Cache.waitBefore(attempt);
          progress({ name, stage: `the state's čestice service is failing; again in ${wait} s (try ${attempt + 1} of ${Cache.TRIES})`, done: found.length, total, problem: e.message });
          await net.sleep(wait * 1000, signal);
        }
      }
      if (!got) throw last ?? new Error('the state did not answer');
      if (page === 0) total = got.matched ?? got.features.length;
      for (const f of got.features) if (!seen.has(f[0].id)) { seen.add(f[0].id); found.push(f); }
      page += 1;
      if (got.features.length < Cache.PAGE || found.length >= total || found.length >= Cache.MAX_PARCELS) break;
    }
    total = found.length;
    if (!total) { progress({ name, stage: 'the state has no čestice in this view', finished: true }); return; }
    // Every outline a cache reads is kept one by one too (v3, Android v11): found from anywhere.
    await net.keepShapes(found.map(([p]) => p));
    let items = found.map(([p, label]) => Cache.item({ id: p.id, number: p.number, reference: p.reference, areaM2: p.areaM2, rings: p.rings, label }));
    info = { ...info, count: items.length };
    await saveCache({ info, items });
    const outlineSeconds = Math.round((Date.now() - began) / 1000);

    const records = new Map();
    let done = 0, failed = 0;
    const t0 = Date.now();
    const rate = (t) => done / Math.max(0.5, (Date.now() - t) / 1000);
    progress({ name, stage: `posjedovni listovi (outlines took ${outlineSeconds} s)`, done: 0, total });
    const pool = async (list, work) => {
      let i = 0;
      await Promise.all(Array.from({ length: 6 }, async () => {
        while (i < list.length && !signal.aborted) { const x = list[i++]; await work(x); }
      }));
    };
    for (let c = 0; c < items.length && !signal.aborted; c += 300) {
      const chunk = items.slice(c, c + 300);
      await pool(chunk, async (it) => {
        const url = P.recordUrl(it.id, net.API.oss);
        let t = null;
        try { t = await net.ossText(url); } catch { try { await net.sleep(1500, signal); t = await net.ossText(url); } catch { t = null; } }
        if (t) { kept.set(url, t); try { records.set(it.id, P.parseRecord(t)); } catch { /* unreadable, counted as read */ } } else failed += 1;
        done += 1;
        progress({ name, stage: 'posjedovni listovi', done, total, failed, perSecond: rate(t0) });
      });
      items = items.map((it) => (records.has(it.id) ? Cache.itemOf(Cache.itemParcel(it), it.label, records.get(it.id), []) : it));
      info = { ...info, read: items.filter((it) => it.read).length, places: Cache.places(items) };
      await saveCache({ info, items });
    }

    if (owners && !signal.aborted) {
      const wanted = [...new Map([...records.values()].flatMap((r) => r.landBooks.filter((b) => b.bookId && b.unit))
        .map((b) => [b.bookId + '|' + b.unit, b])).values()];
      const folios = new Map();
      done = 0; failed = 0;
      const t1 = Date.now();
      await pool(wanted, async (b) => {
        const f = await net.folio(b.bookId, b.unit);
        if (f) folios.set(b.bookId + '|' + b.unit, f); else failed += 1;
        done += 1;
        progress({ name, stage: 'vlasnički listovi', done, total: wanted.length, failed, perSecond: rate(t1) });
      });
      items = items.map((it) => {
        const r = records.get(it.id);
        if (!r) return it;
        return Cache.itemOf(Cache.itemParcel(it), it.label, r, r.landBooks.map((b) => folios.get(b.bookId + '|' + b.unit)).filter(Boolean));
      });
      info = { ...info, places: Cache.places(items) };
      await saveCache({ info, items });
    }
    const names = items.reduce((s, it) => s + it.holders.length, 0);
    progress({ name, stage: signal.aborted ? 'stopped; what was read is kept' : `done: ${items.length} čestica · ${items.filter((it) => it.read).length} listova · ${names} names`, finished: true });
  } catch (e) {
    progress({ name, stage: signal.aborted ? 'stopped; what was read is kept' : 'stopped', finished: true, problem: signal.aborted ? null : e.message });
  } finally {
    job = null;
  }
}

export function caches() {
  const body = h('div');
  const render = () => {
    body.replaceChildren(
      action('Cache this view', 'save', cacheThisView, { id: 'caches-new' }),
      toggle('Also vlasnički listovi', 'text', S.cacheOwners, (on) => { S.cacheOwners = on; db.setPref('cacheOwners', on); render(); }),
      ...(S.caches.length ? [] : [h('div.dim.pad', {}, 'None yet. A cache keeps every čestica in the view with its sheets, for search with no signal.')]),
      ...S.caches.map((c) => {
        const i = c.info;
        const setInfo = async (next) => { await saveCache({ ...c, info: next }); render(); };
        return h('section.mgroup', {},
          h('div.ghead', {},
            h('span.sample', { html: sampleSvg(i.colour, i.style, i.weight) }),
            h('button.gname', { type: 'button', onclick: () => { closeFace(); const [la, lo] = Cache.boxMiddle(i.box); S.map.setView([la, lo], i.zoom); } },
              i.name, h('small', {}, ` ${i.count} čestica · ${i.read} listova`)),
            iconAction(i.visible ? 'eye' : 'eye_off', null, () => setInfo({ ...i, visible: !i.visible }), { title: 'Show/hide' }),
            iconAction('edit', null, async () => { const n = await nameBox('name of the cache', i.name); if (n) setInfo({ ...i, name: n }); }, { title: 'Rename' }),
            iconAction('trash', null, async (e) => {
              const b = e.currentTarget;
              if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.append(h('span.nm', {}, 'sigurno?')); return; }
              S.caches = S.caches.filter((x) => x.info.id !== i.id);
              await db.del('cache:' + i.id);
              await db.set('caches', S.caches.map((x) => Cache.encodeInfo(x.info)));
              applyVisibility(); render();
            }, { danger: true, title: 'Delete' })),
          h('div.under.pad', {}, [i.places, new Date(i.createdMs).toLocaleDateString('hr-HR')].filter(Boolean).join(' · ')),
          choice(Cache.COLOURS.map((x) => ({ colour: P.cssColour(x) })), Cache.COLOURS.indexOf(i.colour), (k) => setInfo({ ...i, colour: Cache.COLOURS[k] }), { swatches: true }),
          choice(P.LINE_STYLES.map((s) => ({ word: P.LINE_WORDS[s] })), P.LINE_STYLES.indexOf(i.style), (k) => setInfo({ ...i, style: P.LINE_STYLES[k] })),
          choice(Style.WEIGHTS.map((w) => ({ word: Style.WEIGHT_WORDS[w] })), Style.WEIGHTS.indexOf(i.weight), (k) => setInfo({ ...i, weight: Style.WEIGHTS[k] })));
      }));
  };
  render();
  showFace(face('save', 'Parcel caches', closeFace, body, { id: 'caches' }));
}

// --- Imenik --------------------------------------------------------------------------------------

export function imenik() {
  const out = h('div');
  const { wrap, input } = searchBox({
    id: 'imenik-field', placeholder: 'ime i prezime', history: () => S.history.imenik ?? [],
    oninput: (t) => show(t), onsubmit: (t) => { remember('imenik', t); show(t); }, onpickPast: (t) => show(t),
  });
  const show = (t) => {
    const found = [...OwnerBook.search(S.imenik, t).map(OwnerBook.hit), ...Cache.search(S.caches, t, 20)];
    out.replaceChildren(found.length ? results(found, (x) => { remember('imenik', input.value); closeFace(); openHit(x); }, distanceLabel)
      : h('div.dim.pad', {}, t.trim().length < 2 ? `${new Set(S.imenik.map((e) => fold(e.name))).size} names from the sheets opened on this device, and every cache.` : 'ništa nije pronađeno'));
  };
  show('');
  showFace(face('search', 'Imenik', closeFace, h('div', {}, wrap, out), { id: 'imenik' }));
  setTimeout(() => input.focus(), 50);
}

// --- the Google key ------------------------------------------------------------------------------

const KEY_SHAPE = /AIza[A-Za-z0-9_-]{30,}|AQ\.[A-Za-z0-9_.-]{20,}/g;

/** Keys by shape from any text (a pasted key, a notes file); each tested against Google at once. */
async function addKeys(text) {
  const found = [...new Set(String(text).match(KEY_SHAPE) ?? [])];
  if (!found.length) { say('U tom tekstu nema Google ključa (počinje s AIza…)'); return; }
  for (const value of found) if (!S.keys.some((k) => k.value === value)) S.keys.push({ value, label: `key ${S.keys.length + 1}`, verdict: 'UNTRIED', said: '' });
  await saveKeys();
  for (const k of S.keys.filter((x) => x.verdict === 'UNTRIED')) await testKey(k);
  net.forgetGoogle();
  buildFields();
  if (S.layerId === 'google') showLayer('google');
}

async function testKey(k) {
  try { await net.googleSession('roadmap', k.value); k.verdict = 'GOOD'; k.said = 'works'; } catch (e) {
    k.verdict = /out of reach/.test(e.message) ? 'UNREACHABLE' : 'REFUSED'; k.said = e.message;
  }
  await saveKeys();
  say(`${k.label}: ${k.said}`);
}

const masked = (v) => (v.length > 12 ? v.slice(0, 8) + '…' + v.slice(-4) : '…');

/** GOOGLE'S MAP NEEDS THE USER'S OWN KEY, AND THE WAY TO MAKE ONE IS ON THE SCREEN. */
function googleHelp(problem) {
  $('#googlehelp')?.remove();
  if (S.layerId !== 'google') return;
  const site = location.origin;
  const steps = [
    ['Open Google Cloud Console and sign in with your Google account.', 'https://console.cloud.google.com/'],
    ['Create a project (top left: project picker → New project), for example "arkod-layer".', 'https://console.cloud.google.com/projectcreate'],
    ['Turn on billing for it. Google asks for a card and charges nothing within the monthly free quota.', 'https://console.cloud.google.com/billing'],
    ['In that project enable "Map Tiles API".', 'https://console.cloud.google.com/apis/library/tile.googleapis.com'],
    ['Optionally enable "Places API (New)" for the search field.', 'https://console.cloud.google.com/apis/library/places.googleapis.com'],
    [`APIs & Services → Credentials → Create credentials → API key. Restrict it to websites: ${site}/*`, 'https://console.cloud.google.com/apis/credentials'],
    ['Paste the key here, or pick the file it is in. It is tested at once.', null],
  ];
  const paste = h('input.field', { type: 'password', placeholder: 'paste the key (AIza…)', id: 'google-key', autocomplete: 'off' });
  const panel = h('div.centre', { id: 'googlehelp' },
    h('div.panel', {},
      h('h2', {}, h('span.icw', { html: icon('key', 22) }), ' Google map needs an API key'),
      problem ? h('div.red', {}, problem) : null,
      h('p.dim', {}, 'No key is built into ARKOD Layer: everyone uses their own. On EEA accounts Google refuses satellite tiles ("not available for your account and region"), so the road map is the default.'),
      h('ol.steps', {}, steps.map(([t, link]) => h('li', {}, t, link ? h('a', { href: link, target: '_blank', rel: 'noopener' }, link.replace('https://', '')) : null))),
      paste,
      action('Add key', 'check', () => { addKeys(paste.value); paste.value = ''; }, { id: 'google-add' }),
      action('Key from a file', 'folder', () => $('#key-file').click(), { quiet: true })));
  $('#app').append(panel);
}

// --- settings (English) --------------------------------------------------------------------------

export async function settings() {
  const body = h('div');
  let size = '…';
  let counts = { answers: 0, shapes: 0 };
  let keptOpen = false;
  let keptList = null;
  let keptFilter = '';
  let logOpen = false;
  let laterOpen = false, laterList = null, laterProblem = null;
  const checking = {};
  const render = () => {
    const views = GOOGLE_VIEWS;
    // Google refuses satellite and hybrid in the EU; the app then shows the aerial photograph (Esri) instead
    const paste = h('input.field', { type: 'password', placeholder: 'paste a key (AIza…)', autocomplete: 'off' });
    const words = h('textarea.field', { id: 'cache-keywords', rows: 2, placeholder: 'surnames, first names, anything: boško, gobić, maslinik' });
    words.value = S.cacheKeywords;
    words.addEventListener('input', () => {
      S.cacheKeywords = words.value; db.setPref('cacheKeywords', words.value); Sniffer.criteria = Sn.criteria(words.value);
    });
    const filter = h('input.field', { type: 'search', placeholder: 'broj, prezime ili mjesto', id: 'kept-filter', value: keptFilter });
    filter.addEventListener('input', () => { keptFilter = filter.value; drawKept(); });
    const keptRows = h('div', { id: 'kept-list' });
    const drawKept = () => {
      if (!keptList) { keptRows.replaceChildren(h('div.dim.pad', {}, 'reading what is kept…')); return; }
      const shown = Sn.filterKept(keptList, keptFilter);
      keptRows.replaceChildren(
        ...shown.slice(0, 200).map((k) => h('button.row.keptrow', { type: 'button', onclick: () => openKept(k.municipalityReg, k.number) },
          h('span.num', {}, k.number), h('span.under', {}, Sn.keptWords(k)))),
        shown.length > 200 ? h('div.dim.pad', {}, `and ${shown.length - 200} more: type to narrow`) : null,
        keptList.length ? null : h('div.dim.pad', {}, 'none yet: a sheet you open, or one the cache reads, is kept'));
    };
    drawKept();
    const now = Date.now();
    body.replaceChildren(
      // WHAT THE DEVICE KEEPS, ON TOP (v3, Android v12): the size, the Cache switch, the keywords.
      group('Kept on this phone',
        h('div.row', {}, h('span.col', {}, h('span.title', { id: 'kept-size' }, `${size} · ${counts.answers} sheets and answers · ${counts.shapes} outlines`),
          h('span.under', {}, 'ARKOD tiles and map tiles seen are kept by the browser too')),
        iconAction('trash', 'clear', async (e) => {
          const b = e.currentTarget;
          if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.querySelector('.nm').textContent = 'again'; return; }
          await db.clearPrefix('ans:'); await db.clearPrefix('shape:');
          for (const n of ('caches' in globalThis ? await caches.keys() : []).filter((x) => x.startsWith('arkod-') && !x.startsWith('arkod-app'))) await caches.delete(n);
          keptList = []; await measure(); render();
        }, { danger: true, id: 'kept-clear' })),
        opens('Kept čestice', 'parcels', keptList ? `${keptList.length}` : 'number, surname, place', async () => {
          keptOpen = !keptOpen;
          if (keptOpen && !keptList) { render(); keptList = Sn.kept(await net.keptRecords()); }
          render();
        }, { id: 'kept-open' }),
        keptOpen ? h('div', {}, h('div.pad', {}, filter), keptRows) : null,
        toggle('Cache', 'sniff', S.cacheOn, (on) => { setCache(on); render(); }, { id: 'set-cache' }),
        h('div.pad', {}, h('div.title', {}, 'Cache criteria (keywords)'), words,
          h('div.under', {}, 'One per comma. With keywords, a sheet read in the background is kept only when a name, place or land use on it fits one of them. Empty: everything is kept. What you open yourself is always kept.'))),
      // THE SERVICES (v3, Android v14 and v16): the lights, what each does, the log, and why.
      group('Services',
        ...Services.SERVICES.map((sv) => {
          const hh = Services.health.get(sv.id);
          const l = Services.light(hh);
          return h('div.row.service', { dataset: { service: sv.id, light: l } },
            h('i.led.big.' + l.toLowerCase()),
            h('span.col', {},
              h('span.title', {}, `${sv.short} · ${sv.title}`),
              h('span.under' + (l === 'RED' ? '.red' : ''), {}, sv.id === 'GOOGLE' && l === 'GREY' ? 'not asked yet (never checked on its own: every request is on your key)' : Services.said(hh, now, hhmm)),
              h('span.under', {}, sv.does),
              l === 'RED' ? h('span.under.sand', {}, `While it is down: ${sv.whenDown}`) : null,
              checking[sv.id] && !checking[sv.id].startsWith('checking') ? h('span.under.checking' + (checking[sv.id] === 'back online' ? '.back' : ''), { id: `checking-${sv.id}` }, checking[sv.id]) : null,
              // CHECK NOW, NEXT TO A SERVICE THAT IS DOWN (web v5): three tries, green the moment it answers.
              l !== 'GREEN' && sv.id !== 'GOOGLE' ? action(checking[sv.id]?.startsWith('checking') ? checking[sv.id] : 'Check now', 'play', async () => {
                if (checking[sv.id]?.startsWith('checking')) return;
                const back = await checkUntilBack(sv.id, (i) => { checking[sv.id] = Services.tryLine(i, Services.CHECK_WAITS.length); render(); });
                checking[sv.id] = Services.checkedLine(back, Services.health.get(sv.id));
                render();
              }, { quiet: true, id: `check-${sv.id}` }) : null,
              l === 'RED' && sv.id === 'GOOGLE' ? h('span.under', {}, 'Google is asked again when you open the GOO map (every request is on your key).') : null));
        }),
        action('Check now', 'play', async () => { await checkAll(); render(); }, { quiet: true, id: 'check-now' }),
        opens('Service log', 'text', Services.log.length ? `${Services.log.length} changes` : 'nothing yet', () => { logOpen = !logOpen; render(); }, { id: 'log-open' }),
        // FETCH WHEN AVAILABLE (version 8): what the background service is still asking the state for
        opens('Waiting for the state', 'save', laterList ? `${laterList.length} waiting` : 'fetch when available', async () => {
          laterOpen = !laterOpen;
          if (laterOpen) { laterList = null; laterProblem = null; render(); try { laterList = await net.wanted(); } catch (e) { laterProblem = e.message; laterList = []; } }
          render();
        }, { id: 'later-open' }),
        laterOpen ? h('div', { id: 'later-list' },
          laterProblem ? h('div.under.pad.red', {}, laterProblem) : null,
          !laterList ? h('div.under.pad', {}, 'asking the server…') : !laterList.length && !laterProblem ? h('div.under.pad', {}, 'nothing is waiting: everything asked for has been fetched') : null,
          ...(laterList ?? []).map((x) => h('div.logrow', {}, h('i.led.red'),
            h('span', {}, `${x.url.replace(/^https:\/\/[^/]+/, '').slice(0, 90)} · since ${new Date(x.since).toLocaleString('hr-HR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${x.tries} tries${x.last ? ' · ' + x.last.replace(/^\S+ /, '') : ''}`))),
          h('div.under.pad', {}, 'A request the state did not answer, handed to the server with "Fetch when available": it asks again every 10 minutes and keeps the answer in ARKOD_cache, for every device.')) : null,
        logOpen ? h('div', { id: 'service-log' }, Services.log.slice(0, 100).map((e) => h('div.logrow', {}, h('i.led.' + (e.online ? 'green' : 'red')),
          Services.eventLine(e, (t) => new Date(t).toLocaleString('hr-HR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }))))) : null,
        h('div.under.pad', {}, 'All four ARKOD services are the State Geodetic Administration\'s (DGU): the map (WMS) and the outlines (WFS) at api.uredjenazemlja.hr, the cadastre and the land registry at oss.uredjenazemlja.hr. ' +
          'They fail on their side: "ORA-01000: maximum open cursors exceeded" is their Oracle database running out of connections, which lasts until they restart it, and they are slow or down at some hours. Nothing on this device can fix that. ' +
          'What the app does: everything read is kept (tiles, sheets, outlines, searches) and used when a service is red; the cache key reads ahead while they answer; every change is in the log above, so the hours can be seen.')),
      group('Moje čestice',
        opens('Moje čestice', 'parcels', `${S.marks.length} kept`, mojeCestice, { id: 'set-mine' }),
        opens('Parcel view', 'layers', 'the Show/hide ARKOD layer key: lines, caches', parcelView),
        opens('Parcel caches', 'save', S.caches.length ? `${S.caches.length} kept` : 'none yet', caches),
        opens('Imenik', 'search', `${new Set(S.imenik.map((e) => fold(e.name))).size} names`, imenik)),
      group('Google map',
        h('div.pad', {}, choice(views.map(([, w]) => ({ word: w })), views.findIndex(([v]) => v === S.googleView), (i) => {
          S.googleView = views[i][0]; db.setPref('googleView', S.googleView); if (S.layerId === 'google') showLayer('google'); render();
        })),
        h('div.under.pad', {}, 'In the EU Google gives no satellite pictures (its rule since 2025, not an outage): satellite shows the aerial photograph (Esri) instead, and hybrid the same photograph with streets and place names over it. The map and terrain are Google\'s own.')),
      group('API keys',
        ...S.keys.map((k) => h('div.row', {},
          h('span.col', {}, h('span.title', {}, k.label), h('span.under', {}, `${masked(k.value)} · ${k.said || k.verdict.toLowerCase()}`)),
          iconAction('play', 'test', async () => { await testKey(k); render(); }),
          iconAction('trash', 'delete', async () => { S.keys = S.keys.filter((x) => x !== k); await saveKeys(); buildFields(); render(); }, { danger: true }))),
        h('div.row', {}, paste, iconAction('check', 'add', async () => { await addKeys(paste.value); render(); })),
        action('Key from a file', 'folder', () => $('#key-file').click(), { quiet: true })),
      // HELP (version 4): the same two pages as the Android app's, English and Croatian.
      group('Help',
        opens('Help', 'info', 'how it works and how to use it', () => { location.href = 'help/en.html'; }, { id: 'set-help-en' }),
        opens('Pomoć', 'info', 'kako radi i kako se koristi', () => { location.href = 'help/hr.html'; }, { id: 'set-help-hr' })),
      group('Install',
        opens('Add ARKOD Layer to the home screen', 'save', 'iPhone, Android', () => { location.href = 'install/'; }, { id: 'set-install' })),
      group('About',
        h('a.row', { href: RELEASES, target: '_blank', rel: 'noopener', id: 'set-version' }, h('span.icw', { html: icon('info', 22) }),
          h('span.col', {}, h('span.title', {}, `ARKOD Layer · version ${S.version ?? '?'}`),
            h('span.under', {}, 'katastar: Državna geodetska uprava (uredjenazemlja.hr) · © OpenStreetMap contributors · Leaflet · Google')))),
    );
  };
  const measure = async () => {
    try { const est = await navigator.storage?.estimate?.(); size = est ? Sn.megabytes(est.usage ?? 0) : 'size unknown'; } catch { size = 'size unknown'; }
    counts = { answers: (await db.keys('ans:')).length, shapes: (await db.keys('shape:')).length };
  };
  settings.refresh = render;
  render();
  showFace(face('settings', 'Settings', () => { settings.refresh = null; closeFace(); }, body, { id: 'settings' }));
  await measure();
  render();
}

export { drawMine, topLine };
