// PARCEL STYLE: how the state's parcel lines are drawn, ported from mantra_arkod ParcelStyle.kt.
// The state sends pictures (black lines about four pixels wide on a 512 px tile), so the colour,
// the transparency and the weight are made on the device from each pixel's alpha. Pure.

export const Weight = Object.freeze({ FINE: 'FINE', NORMAL: 'NORMAL', BOLD: 'BOLD' });
export const WEIGHT_WORDS = { FINE: 'Fine', NORMAL: 'Normal', BOLD: 'Bold' };
export const WEIGHTS = [Weight.FINE, Weight.NORMAL, Weight.BOLD];

/** The transparencies offered, as the percentage of the state's ink kept. */
export const OPACITIES = [20, 35, 50, 62, 80, 100];

/** The line colours offered besides auto (auto follows the map). */
export const LINE_COLOURS = [0xFF111111, 0xFFF2DDB4, 0xFFFFFFFF, 0xFFEF4444, 0xFFFACC15, 0xFF60A5FA];

/** The state's lines: colour (null = auto), opacity %, weight. */
export const lines = (colour = null, opacity = 62, weight = Weight.NORMAL) => ({ colour, opacity, weight });

export const ink = (l, auto) => l.colour ?? auto;

/** The name a restyled tile is kept under: a new style is a new set of tiles. */
export const key = (inkColour, l) => Math.trunc(inkColour).toString(16) + '-' + l.opacity + '-' + l.weight.toLowerCase();

export const encode = (l) => [l.colour != null ? Math.trunc(l.colour).toString(16) : 'auto', String(l.opacity), l.weight].join('|');

export function decode(text) {
  const f = String(text ?? '').split('|');
  if (f.length < 3) return lines();
  const colour = f[0] !== 'auto' && /^[0-9a-fA-F]+$/.test(f[0]) ? parseInt(f[0], 16) : null;
  const op = /^-?\d+$/.test(f[1]) ? Math.min(100, Math.max(5, Number(f[1]))) : 62;
  return lines(colour, op, Object.values(Weight).includes(f[2]) ? f[2] : Weight.NORMAL);
}

/** The core stays; a pixel with an empty neighbour (up, down, left, right) keeps 35 %. */
export function fine(alpha, w, h) {
  const out = new Array(alpha.length);
  for (let i = 0; i < alpha.length; i++) {
    const a = alpha[i];
    if (a === 0) { out[i] = 0; continue; }
    const x = i % w, y = Math.trunc(i / w);
    const edge = (x > 0 && alpha[i - 1] === 0) || (x < w - 1 && alpha[i + 1] === 0) ||
      (y > 0 && alpha[i - w] === 0) || (y < h - 1 && alpha[i + w] === 0);
    out[i] = edge ? Math.trunc(a * 35 / 100) : a;
  }
  return out;
}

/** Each pixel takes the strongest alpha of the nine round it. */
export function bold(alpha, w, h) {
  const out = new Array(alpha.length);
  for (let i = 0; i < alpha.length; i++) {
    const x = i % w, y = Math.trunc(i / w);
    let best = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < w && yy >= 0 && yy < h) { const a = alpha[yy * w + xx]; if (a > best) best = a; }
    }
    out[i] = best;
  }
  return out;
}

/**
 * One tile of the state's picture, restyled, on ARGB integers (as ParcelStyle.restyle): every
 * pixel's alpha thinned or grown by the weight, scaled by the opacity, and put in the ink.
 */
export function restyle(pixels, w, h, inkColour, l) {
  const alpha = Array.from(pixels, (p) => (p >>> 24) & 0xFF);
  const shaped = l.weight === Weight.FINE ? fine(alpha, w, h) : l.weight === Weight.BOLD ? bold(alpha, w, h) : alpha;
  const rgb = inkColour & 0x00FFFFFF;
  return shaped.map((s) => {
    const a = Math.min(255, Math.max(0, Math.trunc(s * l.opacity / 100)));
    return a === 0 ? 0 : ((a << 24) | rgb) >>> 0;
  });
}

/**
 * The same, on a canvas's RGBA bytes in place (what the browser draws): the alpha channel is
 * shaped exactly as [restyle] shapes it, and every visible pixel takes the ink.
 */
export function restyleRGBA(data, w, h, inkColour, l) {
  const n = w * h;
  const alpha = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) alpha[i] = data[i * 4 + 3];
  let shaped = alpha;
  if (l.weight === Weight.FINE) shaped = Uint8ClampedArray.from(fine(alpha, w, h));
  else if (l.weight === Weight.BOLD) shaped = Uint8ClampedArray.from(bold(alpha, w, h));
  const r = (inkColour >>> 16) & 0xFF, g = (inkColour >>> 8) & 0xFF, b = inkColour & 0xFF;
  for (let i = 0; i < n; i++) {
    const a = Math.min(255, Math.trunc(shaped[i] * l.opacity / 100));
    const j = i * 4;
    if (a === 0) { data[j] = data[j + 1] = data[j + 2] = data[j + 3] = 0; continue; }
    data[j] = r; data[j + 1] = g; data[j + 2] = b; data[j + 3] = a;
  }
  return data;
}
