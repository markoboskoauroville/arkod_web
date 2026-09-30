// THE ARKOD LAYER ON THE MAP: the state's WMS picture, 512 px to a tile at 180 dpi so the numbers
// are the size the portal draws them on a phone, restyled on a canvas exactly as ParcelStyle.restyle
// does it (colour, transparency, weight). Inside a parcel cache the state's pixels are cleared and
// the cache's own parcels and numbers are drawn in its colour, line and weight (Android v5).
//
// Needs Leaflet's global L.

import { tileUrl, MIN_ZOOM, MAX_ZOOM, TILE_PX, cssColour } from './core/parcels.js';
import { restyleRGBA } from './core/style.js';
import { tileBox, boxIntersects, pixel, itemBox, itemMiddle } from './core/cache.js';
import { API } from './net.js';

export function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** The dash pattern of a line style at a weight, in canvas pixels. */
export function dashOf(style, width) {
  if (style === 'DASHED') return [width * 4, width * 2.5];
  if (style === 'DOTTED') return [width * 0.8, width * 2.2];
  return [];
}

export const WIDTHS = { FINE: 1.5, NORMAL: 2.5, BOLD: 4 };

/**
 * The layer. [state] is read at draw time: {lines, ink(), caches(), ownLines}. Calling
 * layer.redraw() after a style change draws every tile again from the pictures the browser and the
 * service worker already hold, so nothing is asked of the state twice.
 */
export function arkodLayer(state) {
  const Layer = L.GridLayer.extend({
    createTile(coords, done) {
      const tile = canvasOf(TILE_PX, TILE_PX);
      tile.setAttribute('data-z', coords.z);
      if (coords.z < MIN_ZOOM) { setTimeout(() => done(null, tile), 0); return tile; }
      draw(tile, coords, state).then(() => done(null, tile), (e) => { tile.dataset.error = e.message; done(null, tile); });
      return tile;
    },
  });
  return new Layer({ tileSize: 256, minZoom: 0, maxZoom: 22, maxNativeZoom: MAX_ZOOM, pane: 'arkod', updateWhenZooming: false, keepBuffer: 2 });
}

async function draw(tile, { x, y, z }, state) {
  const g = tile.getContext('2d');
  const caches = state.ownLines() ? state.caches().filter((c) => c.info.visible) : [];
  const tb = tileBox(z, x, y);
  const inside = caches.filter((c) => boxIntersects(c.info.box, tb));
  if (state.stateLines()) {
    const r = await fetch(tileUrl(z, x, y, API.wms));
    if (!r.ok) throw new Error(`WMS ${r.status}`);
    const bmp = await createImageBitmap(await r.blob());
    g.drawImage(bmp, 0, 0, TILE_PX, TILE_PX);
    bmp.close?.();
    const img = g.getImageData(0, 0, TILE_PX, TILE_PX);
    restyleRGBA(img.data, TILE_PX, TILE_PX, state.ink(), state.lines());
    g.putImageData(img, 0, 0);
    tile.dataset.drawn = 'state';
  }
  for (const c of inside) drawCache(g, c, z, x, y);
}

/** One cache inside one tile: the state's pixels cleared in its box, its own parcels drawn. */
export function drawCache(g, cache, z, x, y) {
  const b = cache.info.box;
  const [x0, y0] = pixel(b.north, b.west, z, x, y, TILE_PX);
  const [x1, y1] = pixel(b.south, b.east, z, x, y, TILE_PX);
  g.clearRect(Math.floor(x0), Math.floor(y0), Math.ceil(x1 - x0) + 1, Math.ceil(y1 - y0) + 1);
  const tb = tileBox(z, x, y);
  const width = WIDTHS[cache.info.weight] ?? 2.5;
  g.strokeStyle = cssColour(cache.info.colour);
  g.lineWidth = width;
  g.setLineDash(dashOf(cache.info.style, width));
  g.lineJoin = 'round';
  const items = cache.items.filter((it) => it.rings.length && boxIntersects(itemBox(it), tb));
  for (const it of items) {
    for (const ring of it.rings) {
      g.beginPath();
      ring.forEach(([la, lo], i) => { const [px, py] = pixel(la, lo, z, x, y, TILE_PX); if (i) g.lineTo(px, py); else g.moveTo(px, py); });
      g.closePath();
      g.stroke();
    }
  }
  if (z >= 16) {
    g.setLineDash([]);
    g.font = `${z >= 18 ? 22 : 18}px ui-monospace, Menlo, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = cssColour(cache.info.colour);
    for (const it of items) {
      const [la, lo] = itemMiddle(it);
      const [px, py] = pixel(la, lo, z, x, y, TILE_PX);
      g.fillText(it.number, px, py);
    }
  }
  g.canvas.dataset.cache = cache.info.id;
}
