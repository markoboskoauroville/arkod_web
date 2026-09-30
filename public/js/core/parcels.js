// PARCELS: the cadastre, ported from mantra_arkod Parcels.kt (the reference). Pure: no DOM.
//
// Three public services of the State Geodetic Administration, no key. The browser reaches them
// through the site's own proxies (/api/wms, /api/wfs, /api/oss), because OSS refuses a request that
// carries a browser's Origin, and the WMS sends no CORS header, so a tile could not be recoloured.
// Every URL builder takes the base it is sent to; the default is the state's own address, as in
// Parcels.kt, so the ported tests read the same.

import { fold, matches, Source, hit } from './finding.js';
import { tileX, tileY } from './geo.js';

export const WMS = 'https://api.uredjenazemlja.hr/services/inspire/cp_wms/wms';
export const WFS = 'https://api.uredjenazemlja.hr/services/inspire/cp/wfs';
export const OSS_BASE = 'https://oss.uredjenazemlja.hr/oss/public';
export const OSS = OSS_BASE + '/cad/parcel-info';
export const LR = OSS_BASE;
export const OSS_SEARCH = OSS_BASE + '/cad/search-parcels';

/** Below this the lines are a grey smear and the numbers are not drawn at all. */
export const MIN_ZOOM = 14;
/** A tap asks for a parcel only from here on. */
export const TAP_ZOOM = 15;
export const MAX_ZOOM = 21;
export const TILE_PX = 512;

const HALF_WORLD = 20037508.342789244;

// Kotlin's URLEncoder.encode: application/x-www-form-urlencoded, spaces as "+".
export function urlEncode(s) {
  return encodeURIComponent(String(s)).replace(/%20/g, '+').replace(/[!'()~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/\*/g, '*');
}

// --- the picture ---------------------------------------------------------------------------------

/** One slippy tile as a Web Mercator box: west, south, east, north, in metres. */
export function tileBox(z, x, y) {
  const size = 2 * HALF_WORLD / 2 ** z;
  return [-HALF_WORLD + x * size, HALF_WORLD - (y + 1) * size, -HALF_WORLD + (x + 1) * size, HALF_WORLD - y * size];
}

export function tileUrl(z, x, y, base = WMS) {
  const b = tileBox(z, x, y);
  return `${base}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=cp:CP.CadastralParcel&STYLES=` +
    `&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=${TILE_PX}&HEIGHT=${TILE_PX}` +
    `&FORMAT_OPTIONS=dpi:180&BBOX=${b[0]},${b[1]},${b[2]},${b[3]}`;
}

/** "WMS/z/x/y" becomes the real GetMap; any other address passes through untouched. */
export function resolve(url, base = WMS) {
  if (!url.startsWith(base + '/')) return url;
  const parts = url.slice(base.length + 1).split('/');
  if (parts.length !== 3) return url;
  const [z, x, y] = parts.map((p) => (/^-?\d+$/.test(p) ? Number(p) : null));
  if (z == null || x == null || y == null) return url;
  return tileUrl(z, x, y, base);
}

export const isCadastre = (url, base = WMS) => url.startsWith(base);

/** The tiles kept ahead around a point, zoom by zoom, nearest first. */
export function prefetchTiles(lat, lon) {
  const reach = [[MIN_ZOOM, 3000], [15, 2500], [16, 1600], [17, 900], [18, 500]];
  const out = [];
  for (const [z, metres] of reach) {
    const dLat = metres / 111_320;
    const dLon = metres / (111_320 * Math.max(0.01, Math.cos(lat * Math.PI / 180)));
    const x0 = tileX(lon - dLon, z), x1 = tileX(lon + dLon, z);
    const y0 = tileY(lat + dLat, z), y1 = tileY(lat - dLat, z);
    const cx = tileX(lon, z), cy = tileY(lat, z);
    const ring = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) ring.push([z, x, y]);
    ring.sort((a, b) => ((a[1] - cx) ** 2 + (a[2] - cy) ** 2) - ((b[1] - cx) ** 2 + (b[2] - cy) ** 2));
    out.push(...ring);
  }
  return out;
}

// --- the ink -------------------------------------------------------------------------------------

export const INK_DARK = 0xFF15171A;
export const INK_LIGHT = 0xFFF2DDB4;
export const INK_ALPHA = 0.62;
/** The selection's colour: cyan, which none of the swatches are. */
export const SELECTION = 0xFF22D3EE;

/** Dark over the pale maps, sand over photographs. */
export function inkFor(layerId, theme, googleView = null) {
  if (googleView === 'satellite') return INK_LIGHT;
  if (layerId === 'osm') return INK_DARK;
  if (googleView != null) return INK_DARK;
  if (theme === 'NEWTRON' || theme === 'TRONRENDER') return INK_LIGHT;
  return INK_DARK;
}

/** One pixel of the state's tile, recoloured: its own alpha kept, scaled, in the ink. */
export function recolour(argb, ink) {
  const alpha = (argb >>> 24) & 0xFF;
  if (alpha === 0) return 0;
  const a = Math.min(255, Math.max(0, Math.trunc(alpha * INK_ALPHA)));
  return ((a << 24) | (ink & 0x00FFFFFF)) >>> 0;
}

/** Why the state refused, in one short line: its database's own error, or its exception's first line. */
export function stateReason(body) {
  const all = [...String(body ?? '').matchAll(/ORA-\d+: [^\n<]+/g)];
  if (all.length) return all[all.length - 1][0].trim();
  const m = /<(?:ows:ExceptionText|ServiceException)[^>]*>\s*([^<\n]+)/.exec(String(body ?? ''));
  const text = m ? m[1].trim() : null;
  return text ? text.slice(0, 120) || null : null;
}

// --- the questions -------------------------------------------------------------------------------

function wfs(typeName, base = WFS) {
  return `${base}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&OUTPUTFORMAT=application/json` +
    `&SRSNAME=urn:ogc:def:crs:EPSG::4326&TYPENAMES=${typeName}`;
}

/** What is under a point, asked of the picture: a small box, its middle pixel, in plain text. */
export function infoUrl(lat, lon, layer = 'cp:CP.CadastralParcel', base = WMS) {
  const d = 0.0002;
  return `${base}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=${layer}&QUERY_LAYERS=${layer}` +
    `&STYLES=&CRS=EPSG:4326&BBOX=${lat - d},${lon - d},${lat + d},${lon + d}` +
    `&WIDTH=101&HEIGHT=101&I=50&J=50&FEATURE_COUNT=1&INFO_FORMAT=text/plain`;
}

/** The first feature of a plain-text answer as KEY → value; null when nothing was there. */
export function parseInfo(text) {
  text = String(text ?? '');
  if (text.includes('no features were found')) return null;
  const block = text.split(/-{10,}/).slice(1)[0];
  if (block == null) return null;
  const pairs = {};
  for (const line of block.split('\n')) {
    const at = line.indexOf(' = ');
    if (at > 0) pairs[line.slice(0, at).trim()] = line.slice(at + 3).trim();
  }
  return Object.keys(pairs).length ? pairs : null;
}

/** A parcel: {id, number, reference, areaM2, rings}; rings are lists of [lat, lon]. */
export function parcel(id, number, reference, areaM2 = null, rings = []) {
  return { id: Number(id), number, reference, areaM2, rings };
}

export const municipalityOf = (reference) => (String(reference).includes('-') ? String(reference).split('-')[0] : '');

/** The middle of the outer ring's corners. */
export function middleOf(rings) {
  const ring = rings?.[0] ?? [];
  if (!ring.length) return [0, 0];
  return [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
}

/** The parcel a GetFeatureInfo found: id, number and municipality. */
export function parcelFromInfo(text) {
  const info = parseInfo(text);
  if (!info) return null;
  const id = Number(info.ID);
  if (!Number.isFinite(id) || info.ID == null || info.ID === '') return null;
  const number = info.BROJ_CESTICE;
  const ko = info.MATICNI_BROJ_KO;
  if (number == null || ko == null) return null;
  return parcel(id, number, `${ko}-${number}`, null, []);
}

/** ["334723", "KUKLJICA"] from the zoning layer's plain text. */
export function zoningFromInfo(text) {
  const label = parseInfo(text)?.LABEL;
  if (label == null || !label.includes('-')) return null;
  const i = label.indexOf('-');
  return [label.slice(0, i), label.slice(i + 1)];
}

export const zoningIdFromInfo = (text) => parseInfo(text)?.ID ?? null;

/** OSS's own search, a number inside a municipality. */
export function searchUrl(number, municipality, base = OSS_BASE) {
  return `${base}/search-cad-parcels/parcel-numbers?search=` + urlEncode(number) + '&municipalityRegNum=' + urlEncode(municipality);
}

/** The id of exactly that number; the search also offers numbers that begin with it. */
export function parseSearchId(json, number) {
  const a = JSON.parse(json);
  const o = (Array.isArray(a) ? a : []).find((x) => x && String(x.value1 ?? '') === number);
  if (!o) return null;
  const id = Number(o.key1);
  return Number.isFinite(id) && o.key1 !== '' ? id : null;
}

/** The numbers OSS offers for the start of one, as hits; starred ones after the plain ones. */
export function parseSuggestions(json, municipalityReg, municipalityName, limit = 12) {
  const a = JSON.parse(json);
  const hits = (Array.isArray(a) ? a : []).filter(Boolean).map((o) => {
    const number = String(o.value1 ?? '');
    const id = String(o.key1 ?? '');
    if (!number.trim() || !id.trim()) return null;
    return hit(id, number, `k.o. ${municipalityName}`, null, { source: Source.PARCEL, ref: `${municipalityReg}-${number}` });
  }).filter(Boolean);
  const plain = hits.filter((h) => !h.title.startsWith('*'));
  const starred = hits.filter((h) => h.title.startsWith('*'));
  return [...plain, ...starred].slice(0, limit);
}

/** Parcels by their full references, all in one encoded filter. */
export function byReferenceUrl(references, base = WFS) {
  const quoted = references.map((r) => "'" + String(r).replace(/'/g, '') + "'").join(',');
  const filter = `nationalCadastralReference IN (${quoted})`;
  return wfs('cp:CadastralParcel', base) + '&CQL_FILTER=' + urlEncode(filter).replace(/\+/g, '%20');
}

/** One page of every parcel in a box (south, west, north, east). */
export function boxPageUrl(box, start, count = 500, base = WFS) {
  return wfs('cp:CadastralParcel', base) + `&BBOX=${box.south},${box.west},${box.north},${box.east},urn:ogc:def:crs:EPSG::4326` +
    `&COUNT=${count}&STARTINDEX=${start}`;
}

export const recordUrl = (parcelId, base = OSS_BASE) => `${base}/cad/parcel-info?parcelId=${parcelId}`;

/** What he typed, as parcel numbers: "2450, 2449/3 2451" is three. */
export function numbers(text) {
  const out = [];
  for (const raw of String(text).split(/[,; \n\t]/)) {
    const t = raw.trim();
    if (/^\d{1,6}(\/\d{1,4})?$/.test(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

/** What is drawn: [state's layer, my parcels]. Only-mine wins over the key. */
export function visibility(cadastreOn, onlyMine) {
  if (onlyMine) return [false, true];
  if (cadastreOn) return [true, true];
  return [false, false];
}

// --- the answers ---------------------------------------------------------------------------------

function outerRings(geometry) {
  if (!geometry) return [];
  const c = geometry.coordinates;
  if (!Array.isArray(c)) return [];
  const ring = (a) => (Array.isArray(a) ? a.filter(Array.isArray).map((pt) => [Number(pt[1]), Number(pt[0])]) : null);
  if (geometry.type === 'Polygon') return c[0] ? [ring(c[0])].filter(Boolean) : [];
  if (geometry.type === 'MultiPolygon') return c.map((p) => (Array.isArray(p) && p[0] ? ring(p[0]) : null)).filter(Boolean);
  return [];
}

export function parseParcels(json) {
  const o = typeof json === 'string' ? JSON.parse(json) : json;
  const features = Array.isArray(o?.features) ? o.features : [];
  return features.map((f) => {
    const p = f?.properties;
    if (!p) return null;
    const localId = (p.inspireId?.localId ?? '') || (f.id ?? '');
    const tail = String(localId).split('.').pop();
    const id = /^-?\d+$/.test(tail) ? Number(tail) : null;
    if (id == null) return null;
    const area = p.areaValue && 'value' in p.areaValue ? Math.trunc(Number(p.areaValue.value)) : null;
    return parcel(id, String(p.label ?? ''), String(p.nationalCadastralReference ?? ''), area, outerRings(f.geometry));
  }).filter(Boolean);
}

/** Ray casting on the plane: at the size of a parcel the earth is flat enough. */
export function contains(ring, lat, lon) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const containing = (parcels, lat, lon) => parcels.find((p) => p.rings.some((r) => contains(r, lat, lon))) ?? null;

const s = (v) => (v == null ? '' : String(v));

export function parseRecord(json) {
  const o = typeof json === 'string' ? JSON.parse(json) : json;
  const books = Array.isArray(o.lrUnitsFromParcelLinks) ? o.lrUnitsFromParcelLinks : [];
  const parts = Array.isArray(o.parcelParts) ? o.parcelParts : [];
  const sheets = Array.isArray(o.possessionSheets) ? o.possessionSheets : [];
  return {
    number: s(o.parcelNumber),
    municipality: s(o.cadMunicipalityName),
    municipalityNumber: s(o.cadMunicipalityRegNum),
    address: s(o.address),
    areaM2: s(o.area),
    uses: parts.filter(Boolean).map((p) => ({ name: s(p.name), areaM2: s(p.area), sheet: s(p.possessionSheetNumber) })),
    sheets: sheets.filter(Boolean).map((sh) => ({
      number: s(sh.possessionSheetNumber),
      owners: (Array.isArray(sh.possessors) ? sh.possessors : []).filter(Boolean)
        .map((w) => ({ name: s(w.name).trim(), share: s(w.ownership), address: s(w.address).trim() })),
    })),
    landBooks: books.filter(Boolean).map((b) => ({
      unit: s(b.lrUnitNumber), book: s(b.mainBookName), office: s(b.institutionName), kind: s(b.lrUnitTypeName), bookId: s(b.mainBookId),
    })),
  };
}

// --- the land registry: the owner sheet (vlasnički list) ----------------------------------------

export function folioUrl(bookId, unit, base = LR) {
  return `${base}/lr/lr-unit?lrUnitNumber=` + urlEncode(unit) + '&mainBookId=' + urlEncode(bookId) + '&historicalOverview=false';
}

export function foliosByParcelUrl(bookId, number, base = LR) {
  return `${base}/lr-units/by-parcel-number?mainBookId=` + urlEncode(bookId) + '&parcelNumber=' + urlEncode(number) + '&lrUnitNumber=';
}

export const booksUrl = (name, base = LR) => `${base}/search-lr-parcels/main-books?search=` + urlEncode(name);

/** The books named exactly as the cadastral municipality. */
export function parseBooks(json, name) {
  const a = JSON.parse(json);
  return (Array.isArray(a) ? a : []).filter((o) => o && s(o.value1).toLowerCase() === String(name).trim().toLowerCase())
    .map((o) => ({ id: s(o.key1), name: s(o.value1), office: s(o.value2) }));
}

/** The folio numbers a land-book parcel number is entered in. */
export function parseFolioNumbers(json) {
  const t = String(json).trim();
  if (!t.startsWith('[')) return [];
  return JSON.parse(t).map((o) => s(o?.lrUnitNumber)).filter((n) => n.trim() !== '');
}

/** The land registry writes its entries as HTML; a line is enough on a phone. */
export function plain(html) {
  return String(html).replace(/<br\s*\/?>/gi, ' · ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/(\s*·\s*)+/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim().replace(/^·+|·+$/g, '').trim();
}

function entries(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(Boolean).map((e) => [s(e.orderNumber), plain(s(e.description))].filter((x) => x.trim() !== '').join('  '))
    .filter((x) => x.trim() !== '');
}

export function parseFolio(json) {
  const t = String(json).trim();
  let o = null;
  if (t.startsWith('[')) o = JSON.parse(t)[0] ?? null;
  else if (t.startsWith('{')) { const x = JSON.parse(t); o = 'lrUnitNumber' in x ? x : null; }
  if (!o || typeof o !== 'object') return null;
  const b = o.ownershipSheetB;
  const shares = Array.isArray(b?.lrUnitShares) ? b.lrUnitShares : [];
  const a1 = Array.isArray(o.possessionSheetA1?.lrParcels) ? o.possessionSheetA1.lrParcels : [];
  const groups = Array.isArray(o.encumbranceSheetC?.lrEntryGroups) ? o.encumbranceSheetC.lrEntryGroups : [];
  const last = s(o.lastDiaryNumber);
  const distinct = (xs) => [...new Set(xs)];
  return {
    bookId: s(o.mainBookId),
    unit: s(o.lrUnitNumber),
    book: s(o.mainBookName),
    office: s(o.institutionName),
    kind: s(o.lrUnitTypeName),
    lastDiary: last === 'null' ? '' : last,
    pending: Array.isArray(o.activePlumbs) ? o.activePlumbs.length : 0,
    shares: [
      ...shares.filter(Boolean).map((sh) => {
        const people = (Array.isArray(sh.lrOwners) ? sh.lrOwners : []).filter(Boolean);
        const owners = people.map((w) => ({ name: s(w.name).trim(), share: '', address: s(w.address).trim() }));
        const basis = people.map((w) => w.lrEntry).filter(Boolean)
          .map((e) => [s(e.orderNumber), plain(s(e.description))].filter((x) => x.trim() !== '').join('  '));
        return { title: plain(s(sh.description)), owners, entries: distinct([...basis, ...entries(sh.subSharesAndEntries)]) };
      }),
      ...entries(b?.lrEntries).map((e) => ({ title: '', owners: [], entries: [e] })),
    ],
    parcels: a1.filter(Boolean).map((p) => {
      const inHvat = s(p.areaInHvat);
      const area = s(p.area) || (inHvat.trim() ? `${inHvat} čhv` : '');
      return [s(p.parcelNumber), s(p.address), area.trim() && !area.endsWith('čhv') ? `${area} m²` : area]
        .filter((x) => x.trim() !== '').join('  ');
    }),
    burdens: groups.filter(Boolean).flatMap((g) => entries(g.lrEntries)),
  };
}

/** "1. Vlasnički dio: 1/1" → "1/1". */
export function shareOf(title) {
  const i = title.lastIndexOf(':');
  return i < 0 ? '' : title.slice(i + 1).trim();
}

export const HEAD_USE = 'NAČIN UPORABE';
export const HEAD_POSSESSION = 'POSJEDOVNI LIST';
export const HEAD_REGISTRY = 'ZEMLJIŠNA KNJIGA';
export const HEAD_FOLIO_PARCELS = 'ZK ČESTICE';

export const row = (heading, main, side = '', under = '') => ({ heading, main, side, under });

export function folioRows(f) {
  const out = [];
  const head = `VLASNIČKI LIST · z.k. uložak ${f.unit}`;
  out.push(row(head, `k.o. ${f.book} · ${f.kind.toLowerCase()}`, '', f.office + (f.lastDiary ? ` · zadnji upis ${f.lastDiary}` : '')));
  if (f.pending > 0) out.push(row(head, `⚠ ${f.pending} promjena u tijeku (plomba)`, ''));
  for (const sh of f.shares) {
    if (sh.owners.length === 0) for (const e of sh.entries) out.push(row(head, sh.title || 'upis', '', e));
    sh.owners.forEach((o, i) => {
      const under = [o.address, i === sh.owners.length - 1 ? sh.entries.join(' | ') : ''].filter((x) => x.trim() !== '').join(' · ');
      out.push(row(head, o.name, i === 0 ? shareOf(sh.title) : '', under));
    });
  }
  if (f.burdens.length) for (const b of f.burdens) out.push(row(`TERETI · uložak ${f.unit}`, b));
  else out.push(row(`TERETI · uložak ${f.unit}`, 'nema upisa', ''));
  for (const p of f.parcels) out.push(row(`${HEAD_FOLIO_PARCELS} · uložak ${f.unit}`, p));
  return out;
}

export function folioText(f) {
  const l = [];
  l.push(`VLASNIČKI LIST, z.k. uložak ${f.unit}, k.o. ${f.book}, ${f.kind}`);
  l.push(`  ${f.office}` + (f.lastDiary ? `, zadnji upis ${f.lastDiary}` : ''));
  if (f.pending > 0) l.push(`  ${f.pending} promjena u tijeku (plomba)`);
  for (const sh of f.shares) {
    if (sh.title) l.push(`  ${sh.title}`);
    for (const o of sh.owners) l.push(`    ${o.name}` + (o.address ? `, ${o.address}` : ''));
    for (const e of sh.entries) l.push(`      ${e}`);
  }
  l.push('TERETI (teretni list)');
  if (!f.burdens.length) l.push('  nema upisa');
  for (const b of f.burdens) l.push(`  ${b}`);
  l.push('ZK ČESTICE');
  for (const p of f.parcels) l.push(`  ${p}`);
  return l.join('\n') + '\n';
}

/** "12401" as "12 401 m²", the way a surveyor writes it. */
export function areaLabel(m2) {
  if (m2 == null || Number.isNaN(m2)) return 'površina nepoznata';
  const grouped = String(m2).split('').reverse().join('').match(/.{1,3}/g).join(' ').split('').reverse().join('');
  return `${grouped} m²`;
}

const intOrNull = (t) => (/^-?\d+$/.test(String(t).trim()) ? Number(t) : null);

/** The sheet as a text file: everything the card shows and the outline's corners. */
export function toText(p, record, madeAt, folios = []) {
  const l = [];
  l.push(`ČESTICA ${p.number}`);
  l.push(`katastarska oznaka: ${p.reference}`);
  if (record) {
    l.push(`katastarska općina: ${record.municipality} (${record.municipalityNumber})`);
    l.push(`površina: ${areaLabel(intOrNull(record.areaM2) ?? p.areaM2)}`);
    if (record.address) l.push(`adresa: ${record.address}`);
    l.push('');
    l.push('NAČIN UPORABE');
    for (const u of record.uses) l.push(`  ${u.name}, ${u.areaM2} m², posjedovni list ${u.sheet}`);
    for (const sh of record.sheets) {
      l.push('');
      l.push(`POSJEDOVNI LIST ${sh.number}`);
      for (const o of sh.owners) {
        l.push(`  ${o.name}  ${o.share}`);
        if (o.address) l.push(`    ${o.address}`);
      }
    }
    for (const b of record.landBooks) {
      l.push('');
      l.push('ZEMLJIŠNA KNJIGA');
      l.push(`  z.k. uložak ${b.unit}, k.o. ${b.book}, ${b.kind}`);
      l.push(`  ${b.office}`);
    }
  } else {
    l.push(`površina: ${areaLabel(p.areaM2)}`);
    l.push('(zapis se nije mogao pročitati kad je ovo spremljeno)');
  }
  let text = l.join('\n') + '\n';
  for (const f of folios) text += '\n' + folioText(f);
  const ring = p.rings?.[0] ?? [];
  const t = [];
  if (ring.length) {
    t.push('');
    t.push('OBRIS (geografska širina, dužina)');
    for (const [a, b] of ring) t.push(`  ${a.toFixed(6)}, ${b.toFixed(6)}`);
  }
  t.push('');
  t.push(`izvor: Državna geodetska uprava, oss.uredjenazemlja.hr; spremljeno ${madeAt}, ARKOD Layer`);
  return text + t.join('\n') + '\n';
}

/** The parcel number a row of a folio's parcels begins with; null elsewhere. */
export function numberIn(r) {
  if (!r.heading.startsWith(HEAD_FOLIO_PARCELS)) return null;
  const m = /^\*?\d+(\/\d+)?/.exec(r.main.trim());
  return m ? m[0] : null;
}

export function sheetRows(record) {
  const out = [];
  for (const u of record.uses) out.push(row(HEAD_USE, `${u.name}  ${u.areaM2} m²`, `p.l. ${u.sheet}`));
  for (const sh of record.sheets) for (const o of sh.owners) out.push(row(`${HEAD_POSSESSION} ${sh.number}`, o.name, o.share, o.address));
  for (const b of record.landBooks) out.push(row(HEAD_REGISTRY, `z.k. uložak ${b.unit} · k.o. ${b.book}`, '', `${b.kind.toLowerCase()} · ${b.office}`));
  return out;
}

/** The three tabs of the sheet. */
export const Tab = Object.freeze({ USE: 'USE', POSSESSION: 'POSSESSION', OWNER: 'OWNER' });
export const TAB_WORDS = { USE: 'uporaba', POSSESSION: 'posjedovni', OWNER: 'vlasnički' };
export const TABS = [Tab.USE, Tab.POSSESSION, Tab.OWNER];

export function tabOf(r) {
  if (r.heading.startsWith(HEAD_USE)) return Tab.USE;
  if (r.heading.startsWith(HEAD_POSSESSION)) return Tab.POSSESSION;
  return Tab.OWNER;
}

/** The rows a filter lets through; a heading's own words let its whole group through. */
export function filterRows(rows, query) {
  return rows.filter((r) => matches(r.heading, query) || matches(`${r.main} ${r.side} ${r.under}`, query));
}

// --- the cadastre's own search (OSS, public) -----------------------------------------------------

/** The body OSS's own public search posts. */
export function searchBody(municipalityId, number = null, sheet = null) {
  const o = { cadMunicipalityId: /^-?\d+$/.test(String(municipalityId)) ? Number(municipalityId) : municipalityId };
  if (number != null) o.parcelNumber = number;
  if (sheet != null) o.possessionSheetNumber = sheet;
  return JSON.stringify(o);
}

/** Each parcel OSS found, as a hit: number, address, area and the holders' names. */
export function parseSearch(json) {
  const a = JSON.parse(json);
  return (Array.isArray(a) ? a : []).filter(Boolean).map((p) => {
    const holders = p.possessionSheet?.possessors;
    const names = Array.isArray(holders)
      ? holders.slice(0, 3).map((x) => s(x?.name).trim()).join(', ') + (holders.length > 3 ? ' …' : '')
      : '';
    const area = s(p.area).trim() ? `${s(p.area)} m²` : null;
    return hit(String(Math.trunc(Number(p.parcelId ?? 0))), `${s(p.parcelNumber)} · k.o. ${s(p.cadMunicipalityName)}`,
      [s(p.address), area, names].filter((x) => x != null && String(x).trim() !== '').join(' · '),
      null, { source: Source.PARCEL, ref: `${s(p.cadMunicipalityRegNum)}-${s(p.parcelNumber)}` });
  });
}

/** "cestica 334723-2449_3.txt": the reference, with the stroke a file name cannot hold. */
export const textFileName = (p) => `cestica ${p.reference.replace(/\//g, '_')}.txt`;

/** A folio he found by hand, per parcel: "ref|bookId|unit" lines. */
export function encodeLinks(links) {
  return Object.entries(links).map(([k, [a, b]]) => `${k.replace(/\|/g, '')}|${a}|${b}`).join('\n');
}

export function decodeLinks(text) {
  const out = {};
  for (const line of String(text ?? '').split('\n')) {
    const f = line.split('|');
    if (f.length === 3 && f.every((x) => x.trim() !== '')) out[f[0]] = [f[1], f[2]];
  }
  return out;
}

// --- my parcels (Moje čestice) -------------------------------------------------------------------

export const LineStyle = Object.freeze({ DASHED: 'DASHED', SOLID: 'SOLID', DOTTED: 'DOTTED' });
export const LINE_WORDS = { DASHED: 'isprekidana', SOLID: 'puna', DOTTED: 'točkasta' };
export const LINE_STYLES = [LineStyle.DASHED, LineStyle.SOLID, LineStyle.DOTTED];

/** One of my parcels, with its shape. */
export function mark(reference, number, colour, rings = [], id = 0, style = LineStyle.DASHED, name = '', group = '', weight = 'NORMAL') {
  return { reference, number, colour, rings, id, style, name, group, weight };
}

export function markMiddle(m) {
  const ring = m.rings?.[0];
  if (!ring || !ring.length) return null;
  return middleOf(m.rings);
}

/** Kotlin's java.lang.Long.toHexString for the ARGB numbers used here (all 0 … 0xFFFFFFFF). */
export const hex = (n) => Math.trunc(Number(n)).toString(16);

/** One mark a line: reference|number|colour|id|rings|style|name|group|weight. */
export function encode(marks) {
  return marks.map((m) => {
    const rings = m.rings.map((ring) => ring.map(([a, b]) => `${a.toFixed(6)},${b.toFixed(6)}`).join(';')).join('#');
    return [m.reference.replace(/\|/g, ''), m.number.replace(/\|/g, ''), hex(m.colour), String(m.id), rings, m.style,
      m.name.replace(/\|/g, ' ').replace(/\n/g, ' '), m.group.replace(/\|/g, ' ').replace(/\n/g, ' '), m.weight].join('|');
  }).join('\n');
}

export function decode(text) {
  return String(text ?? '').split('\n').map((line) => {
    const f = line.split('|');
    if ((f.length !== 5 && f.length !== 7 && f.length !== 9) || f[0].trim() === '') return null;
    if (!/^[0-9a-fA-F]+$/.test(f[2])) return null;
    const colour = parseInt(f[2], 16);
    const rings = f[4].split('#').filter((r) => r.trim() !== '').map((ring) => ring.split(';').map((pt) => {
      const ll = pt.split(',');
      const a = Number(ll[0]), b = Number(ll[1]);
      return ll.length >= 2 && ll[0] !== '' && ll[1] !== '' && Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
    }).filter(Boolean)).filter((r) => r.length >= 3);
    const style = LINE_STYLES.includes(f[5]) ? f[5] : LineStyle.DASHED;
    const weight = ['FINE', 'NORMAL', 'BOLD'].includes(f[8]) ? f[8] : 'NORMAL';
    return mark(f[0], f[1], colour, rings, /^-?\d+$/.test(f[3]) ? Number(f[3]) : 0, style, f[6] ?? '', f[7] ?? '', weight);
  }).filter(Boolean);
}

/** Kept, re-coloured or re-styled: one parcel at most once, in its old place. */
export function withMark(marks, m) {
  const at = marks.findIndex((x) => x.reference === m.reference);
  if (at < 0) return [...marks, m];
  const next = [...marks];
  next[at] = m;
  return next;
}

export const without = (marks, reference) => marks.filter((m) => m.reference !== reference);

export const markOf = (p, colour, style = LineStyle.DASHED) => mark(p.reference, p.number, colour, p.rings, p.id, style);

export const shapeless = (marks) => marks.filter((m) => m.rings.length === 0);

/** Shapes that arrived, put into the marks they belong to. */
export function withShapes(marks, found) {
  return marks.map((m) => {
    const p = found.find((x) => x.reference === m.reference);
    return m.rings.length === 0 && p && p.rings.length ? { ...m, rings: p.rings, id: m.id === 0 ? p.id : m.id } : m;
  });
}

/** Any colour: a hue from 0 to 360 at strong saturation and value, as ARGB. */
export function hue(degrees) {
  const f = Math.fround;
  const h = f(f(f(f(degrees) % 360) + 360) % 360 / 60);
  const v = f(0.95), sat = f(0.85);
  const c = f(v * sat);
  const x = f(c * f(1 - Math.abs(f(h % 2) - 1)));
  const m = f(v - c);
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c]][Math.trunc(h)] ?? [c, 0, x];
  const byte = (q) => Math.min(255, Math.max(0, Math.trunc(f(f(q + m) * 255))));
  return (0xFF * 2 ** 24) + byte(r) * 65536 + byte(g) * 256 + byte(b);
}

/** The quick picks for my parcels: none of them is the selection's cyan. */
export const SWATCHES = [
  0xFFE8A64B, 0xFFEF4444, 0xFFF472B6, 0xFFA855F7, 0xFF60A5FA,
  0xFF34D399, 0xFFA3E635, 0xFFFACC15, 0xFFF2DDB4, 0xFF111111,
];

/** "#rrggbb" of an ARGB number, and its alpha 0..1. */
export const cssColour = (argb) => '#' + (Number(argb) & 0xFFFFFF).toString(16).padStart(6, '0');
export { fold };
