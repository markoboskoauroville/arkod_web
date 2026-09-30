// A PARCEL'S OUTLINE, READ OFF THE STATE'S OWN PICTURE. Ported from mantra_arkod Outline.kt: the
// picture round the finger, a paint bucket filled until it meets the state's lines, the edge walked
// round and thinned to corners. Well under a second where the WFS takes fifteen. Pure.

const DX = [-1, -1, 0, 1, 1, 1, 0, -1];
const DY = [0, -1, -1, -1, 0, 1, 1, 1];

/** An open pixel near (x, y): a tap on a line or a letter still belongs to a parcel. */
export function nearestOpen(wall, w, h, x, y, radius = 8) {
  for (let r = 0; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const px = x + dx, py = y + dy;
      if (px >= 0 && px < w && py >= 0 && py < h && !wall[py * w + px]) return [px, py];
    }
  }
  return null;
}

/** The paint bucket, four-connected; null when it reached the edge of the picture. */
export function fill(wall, w, h, sx, sy) {
  if (sx < 0 || sx >= w || sy < 0 || sy >= h || wall[sy * w + sx]) return null;
  const inside = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let top = 0;
  stack[top++] = sy * w + sx;
  inside[sy * w + sx] = 1;
  while (top > 0) {
    const i = stack[--top];
    const x = i % w, y = (i / w) | 0;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return null;
    for (const n of [i - 1, i + 1, i - w, i + w]) {
      if (!inside[n] && !wall[n]) { inside[n] = 1; stack[top++] = n; }
    }
  }
  return inside;
}

/** Grown by r pixels, so the outline sits on the middle of the state's line. */
export function grow(mask, w, h, r) {
  const across = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    for (let d = -r; d <= r; d++) { const nx = x + d; if (nx >= 0 && nx < w) across[y * w + nx] = 1; }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!across[y * w + x]) continue;
    for (let d = -r; d <= r; d++) { const ny = y + d; if (ny >= 0 && ny < h) out[ny * w + x] = 1; }
  }
  return out;
}

/** The outer edge, walked clockwise by Moore's neighbour tracing from the topmost, leftmost pixel. */
export function trace(mask, w, h) {
  let first = -1;
  for (let i = 0; i < mask.length; i++) if (mask[i]) { first = i; break; }
  if (first < 0) return [];
  const on = (x, y) => x >= 0 && x < w && y >= 0 && y < h && !!mask[y * w + x];
  const sx = first % w, sy = (first / w) | 0;
  const path = [[sx, sy]];
  let px = sx, py = sy, back = 0;
  const limit = 4 * (w + h) * 8;
  let steps = 0;
  while (steps++ < limit) {
    let moved = false;
    for (let k = 1; k <= 8; k++) {
      const d = (back + k) % 8;
      const nx = px + DX[d], ny = py + DY[d];
      if (on(nx, ny)) {
        const prev = (d + 7) % 8;
        const bx = px + DX[prev], by = py + DY[prev];
        px = nx; py = ny;
        back = [0, 1, 2, 3, 4, 5, 6, 7].find((t) => px + DX[t] === bx && py + DY[t] === by);
        moved = true;
        break;
      }
    }
    if (!moved) return path;
    if (px === sx && py === sy) return path;
    path.push([px, py]);
  }
  return path;
}

const dist2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;

function offLine(p, a, b) {
  const len = Math.sqrt(dist2(a, b));
  if (len === 0) return Math.sqrt(dist2(p, a));
  return Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / len;
}

function dp(line, tol) {
  if (line.length < 3) return line;
  const a = line[0], b = line[line.length - 1];
  let worst = -1, at = 0;
  for (let i = 1; i < line.length - 1; i++) { const d = offLine(line[i], a, b); if (d > worst) { worst = d; at = i; } }
  if (worst <= tol) return [a, b];
  return [...dp(line.slice(0, at + 1), tol).slice(0, -1), ...dp(line.slice(at), tol)];
}

/** Douglas–Peucker on a closed ring: the corners. */
export function simplify(ring, tolerance) {
  if (ring.length < 4) return ring;
  const a = ring[0];
  let far = 0, best = -1;
  ring.forEach((p, i) => { const d = dist2(p, a); if (d > best) { best = d; far = i; } });
  const one = dp(ring.slice(0, far + 1), tolerance);
  const two = dp([...ring.slice(far), a], tolerance);
  return [...one.slice(0, -1), ...two.slice(0, -1)];
}

const HALF_WORLD = 20037508.342789244;
export const mercX = (lon) => lon * HALF_WORLD / 180;
export const mercY = (lat) => Math.log(Math.tan((90 + lat) * Math.PI / 360)) * HALF_WORLD / Math.PI;
export const lonOf = (x) => x / HALF_WORLD * 180;
export const latOf = (y) => (2 * Math.atan(Math.exp(y / HALF_WORLD * Math.PI)) - Math.PI / 2) * 180 / Math.PI;

/** A square picture round a point, side metres of ground: west, south, east, north in Web Mercator. */
export function box(lat, lon, side) {
  const half = side / 2 / Math.cos(lat * Math.PI / 180);
  const x = mercX(lon), y = mercY(lat);
  return [x - half, y - half, x + half, y + half];
}

/** From the picture's walls to the corners of the parcel in [lat, lon]; null when the fill escaped. */
export function parcelAt(wall, w, h, b, lat, lon) {
  const resX = (b[2] - b[0]) / w, resY = (b[3] - b[1]) / h;
  const tx = Math.trunc((mercX(lon) - b[0]) / resX);
  const ty = Math.trunc((b[3] - mercY(lat)) / resY);
  const start = nearestOpen(wall, w, h, tx, ty);
  if (!start) return null;
  const inside = fill(wall, w, h, start[0], start[1]);
  if (!inside) return null;
  const edge = trace(grow(inside, w, h, 1), w, h);
  if (edge.length < 4) return null;
  const corners = simplify(edge, 1.2);
  if (corners.length < 3) return null;
  return corners.map(([x, y]) => [latOf(b[3] - (y + 0.5) * resY), lonOf(b[0] + (x + 0.5) * resX)]);
}
