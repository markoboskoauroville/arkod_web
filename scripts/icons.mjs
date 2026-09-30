// Renders the PNG icons from the one SVG path (Chromium via Playwright): node scripts/icons.mjs
import { chromium } from 'playwright';
const out = new URL('../public/icons/', import.meta.url).pathname;
const svg = (size, pad, round) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512"><rect width="512" height="512" rx="${round}" fill="#0B0D10"/><g transform="translate(${pad} ${pad}) scale(${(512 - 2 * pad) / 24})" fill="none" stroke="#E8A64B" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z M4 11h8 M12 4v16 M12 15h8"/></g></svg>`;
const b = await chromium.launch();
const p = await b.newPage();
for (const [name, size, pad, round] of [['icon-192.png', 192, 96, 0], ['icon-512.png', 512, 96, 0], ['icon-512-maskable.png', 512, 136, 0], ['apple-touch-icon.png', 180, 96, 0]]) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<html><body style="margin:0;background:#0B0D10">${svg(size, pad, round)}</body></html>`);
  await p.screenshot({ path: out + name, clip: { x: 0, y: 0, width: size, height: size } });
}
await b.close();
