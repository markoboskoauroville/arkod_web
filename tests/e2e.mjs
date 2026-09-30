// THE BROWSER TEST: ARKOD Layer in Chromium at 390 x 844 (an iPhone's portrait screen), against a
// fake state (tests/fake-state.mjs) so it runs anywhere and never asks the real one. Every step
// prints what it checked; screenshots go to tests/screens/. Run: npm run e2e
//
// Leaflet comes from node_modules (the page asks cdnjs; the test answers from the same file).

// Routes must also answer the service worker's own requests (Chromium, Playwright 1.56).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const { chromium } = await import('playwright');
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Fake from './fake-state.mjs';

const ROOT = fileURLToPath(new URL('../public/', import.meta.url));
const SCREENS = fileURLToPath(new URL('./screens/', import.meta.url));
const SAMPLE = fileURLToPath(new URL('./fixtures/Obitelj.arkod.json', import.meta.url));
const LEAFLET = fileURLToPath(new URL('../node_modules/leaflet/dist/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try { const body = await readFile(file); res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body); } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const SITE = `http://127.0.0.1:${server.address().port}`;
await mkdir(SCREENS, { recursive: true });

let failures = 0;
let step = 0;
function check(ok, what) {
  step += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${String(step).padStart(2)} ${what}`);
  if (!ok) failures += 1;
}
const asked = { wms: 0, info: 0, wfs: 0, oss: 0, google: 0 };

async function wire(context) {
  await context.route('https://cdnjs.cloudflare.com/**', async (route) => {
    const name = route.request().url().split('/').pop();
    route.fulfill({ body: await readFile(join(LEAFLET, name)), contentType: name.endsWith('.css') ? 'text/css' : 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await context.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ body: Fake.osmTile, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' } }));
  await context.route(/googleapis\.com/, (route) => { asked.google += 1; route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }) }); });
  await context.route(`${SITE}/api/**`, async (route) => {
    const u = new URL(route.request().url());
    const q = u.searchParams;
    if (u.pathname === '/api/wms') {
      if (q.get('REQUEST') === 'GetFeatureInfo') { asked.info += 1; return route.fulfill({ body: Fake.info(q), contentType: 'text/plain' }); }
      asked.wms += 1;
      return route.fulfill({ body: Fake.wmsPicture(q.get('BBOX').split(',').map(Number), Number(q.get('WIDTH')), Number(q.get('HEIGHT'))), contentType: 'image/png' });
    }
    if (u.pathname === '/api/wfs') { asked.wfs += 1; return route.fulfill({ body: Fake.wfs(q), contentType: 'application/json' }); }
    if (u.pathname.startsWith('/api/oss/')) {
      asked.oss += 1;
      const body = Fake.oss(u.pathname.slice('/api/oss/'.length), q, route.request().postData());
      return body == null ? route.fulfill({ status: 404, body: 'no' }) : route.fulfill({ body, contentType: 'application/json' });
    }
    route.fulfill({ status: 404, body: 'no' });
  });
}

const browser = await chromium.launch();
const errors = [];
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'hr-HR' });
await wire(context);
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = (name) => page.screenshot({ path: join(SCREENS, name + '.png') });
const mid = { x: 195, y: 422 };

try {
  // 1. Kukljica at z17, the layer on
  await page.goto(`${SITE}/?lat=${Fake.KUKLJICA[0]}&lon=${Fake.KUKLJICA[1]}&z=17`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('.leaflet-pane canvas[data-drawn="state"]').length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(600);
  const drawn = await page.locator('canvas[data-drawn="state"]').count();
  check(drawn > 0 && asked.wms > 0, `the ARKOD layer is drawn at Kukljica z17: ${drawn} canvas tiles from ${asked.wms} WMS pictures`);
  check(await page.locator('#k-arkod.lit').count() === 1, 'the Show/hide ARKOD layer key is lit (layer on)');
  const ink = await page.evaluate(() => {
    const c = document.querySelector('canvas[data-drawn="state"]');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let lines = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lines += 1;
    return lines;
  });
  check(ink > 1000, `the tile has the state's lines restyled on it (${ink} ink pixels)`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll at 390 px');
  check((await page.textContent('#top')).includes('N 44'), `the top line shows where the middle is: "${(await page.textContent('#top')).trim()}"`);
  await shot('01-map-kukljica-z17');

  // 2. a tap selects the parcel under the finger
  await page.touchscreen.tap(mid.x, mid.y);
  await page.waitForFunction(() => document.querySelector('#note')?.textContent.includes('2449/2'), null, { timeout: 10000 });
  check(true, `a tap selects 2449/2: "${(await page.textContent('#note')).trim()}"`);
  await page.waitForFunction(() => document.querySelectorAll('.leaflet-mine-pane path').length > 0, null, { timeout: 10000 }).catch(() => {});
  const outline = await page.locator('.leaflet-mine-pane path').count();
  check(outline > 0, `its outline is traced off the state's picture and drawn (${outline} path)`);
  await shot('02-parcel-selected');

  // 3. a second tap opens its sheet with three tabs
  await page.touchscreen.tap(mid.x, mid.y);
  await page.waitForSelector('#sheet', { timeout: 10000 });
  await page.waitForFunction(() => document.querySelector('#sheet-rows')?.textContent.length > 20, null, { timeout: 10000 });
  const num = (await page.textContent('#sheet .num')).trim();
  check(num.startsWith('2449/2'), `the second tap opens the sheet of ${num}`);
  const tabs = await page.locator('#sheet-tabs .part').allTextContents();
  check(tabs.length === 3, `it has 3 tabs: ${tabs.map((t) => t.trim()).join(' | ')}`);
  const seen = [];
  await page.locator('#sheet-tabs .part').nth(0).click();
  await page.waitForTimeout(300);
  await shot('03-sheet-tab1');
  for (let i = 0; i < 3; i++) {
    await page.locator('#sheet-tabs .part').nth(i).click();
    await page.waitForTimeout(300);
    seen.push(await page.textContent('#sheet-rows'));
    if (i) await shot(`0${3 + i}-sheet-tab${i + 1}`);
  }
  check(seen[0].includes('MASLINIK'), 'the uporaba tab lists the land uses (MASLINIK)');
  check(seen[1].includes('PRIMJER ANA'), 'the posjedovni tab lists the possessors (PRIMJER ANA)');
  await page.waitForFunction(() => document.querySelector('#sheet-rows')?.textContent.includes('Suvlasnički'), null, { timeout: 10000 }).catch(() => {});
  const owners = await page.textContent('#sheet-rows');
  check(owners.includes('UZORAK IVO') && owners.includes('182'), 'the vlasnički tab shows z.k. uložak 182 and its owners');
  const link = page.locator('#sheet-rows button.link', { hasText: '2450' });
  check(await link.count() > 0, 'the other parcel on the folio (2450) is a link to its place on the map');
  await page.fill('#sheet-filter', 'uzorak');
  await page.waitForTimeout(200);
  const counted = await page.locator('#sheet-tabs .part').allTextContents();
  check(counted.some((t) => /\d/.test(t)), `the filter counts matches per tab: ${counted.map((t) => t.trim()).join(' | ')}`);
  await shot('06-sheet-filter');
  await page.fill('#sheet-filter', '');
  await page.click('#sheet-keep');
  await page.waitForSelector('footer.mine .choice.swatches', { timeout: 3000 });
  check((await page.textContent('#sheet-keep')).includes('Moja čestica'), '"Dodaj u Moje čestice" keeps 2449/2, and its colour and line appear');
  await shot('06b-sheet-kept');
  await page.click('#sheet-close');

  // 4. import a .arkod.json into Moje čestice, and style its group
  await page.click('#k-settings');
  await page.waitForSelector('#settings');
  const version = (await page.textContent('#set-version')).trim();
  check(/ARKOD Layer · version 1/.test(version), `Settings show "${version.split('katastar')[0].trim()}"`);
  check(await page.locator('#set-install').count() === 1, 'Settings link to the install page');
  await shot('07-settings');
  await page.click('#set-mine');
  await page.setInputFiles('#import-file', SAMPLE);
  await page.waitForSelector('.mgroup[data-group="Obitelj"]', { timeout: 5000 });
  const rows = await page.locator('.mgroup[data-group="Obitelj"] .mrow').count();
  check(rows === 2 && await page.locator('.mgroup').count() === 2, `Obitelj.arkod.json imports as the group "Obitelj" with ${rows} čestice, beside the ungrouped 2449/2`);
  await shot('08-moje-cestice-imported');
  const before = await page.locator('.mgroup[data-group="Obitelj"] .sample line').getAttribute('stroke');
  await page.click('.mgroup[data-group="Obitelj"] .gname');
  await page.waitForSelector('#group-look');
  await page.locator('#group-colour .part').nth(4).click();
  await page.locator('#group-style .part').nth(1).click();
  await page.locator('#group-weight .part').nth(2).click();
  await page.waitForFunction(() => document.querySelector('#group-look .sample line')?.getAttribute('stroke-width') === '4', null, { timeout: 3000 }).catch(() => {});
  const sample = page.locator('#group-look .sample line');
  const after = { stroke: await sample.getAttribute('stroke'), dash: await sample.getAttribute('stroke-dasharray'), width: await sample.getAttribute('stroke-width') };
  check(after.stroke !== before && after.dash === 'none' && after.width === '4', `the group is restyled: ${before} dashed → ${after.stroke}, solid, bold`);
  await shot('09-group-style');
  await page.click('#group-done');
  await page.click('#moje-close');
  await page.waitForTimeout(400);
  const stored = await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('arkod-layer');
    r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('marks'); g.onsuccess = () => res(String(g.result ?? '')); };
  }));
  check(stored.includes('334723-2531') && stored.includes('334723-2532'), 'both čestice are kept in IndexedDB');
  const mine = await page.locator('.leaflet-mine-pane path').count();
  check(mine >= 2, `Moje čestice are drawn on the map (${mine} paths in the mine pane)`);
  await shot('10-map-with-moje-cestice');

  // 5. the parcel field: numbers as he types, from OSS
  await page.fill('#parcel-field', '2449');
  await page.waitForSelector('#parcel-results .hit', { timeout: 8000 });
  const hits = await page.locator('#parcel-results .hit .title').allTextContents();
  check(hits.includes('2449/2'), `the parcel field offers ${hits.slice(0, 4).join(', ')}`);
  await shot('11-parcel-search');
  await page.fill('#parcel-field', '');
  await page.locator('#parcel-field').blur();

  // 6. long press on the Show/hide ARKOD layer key opens Parcel view; a cache of the view
  const k = await page.locator('#k-arkod').boundingBox();
  await page.mouse.move(k.x + k.width / 2, k.y + k.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await page.waitForSelector('#parcel-view', { timeout: 3000 });
  check(true, 'a long press on the ARKOD key opens Parcel view');
  await shot('12-parcel-view');
  await page.click('#pv-cache');
  await page.waitForSelector('.veil .field');
  await page.click('.veil .act:not(.quiet)');
  await page.waitForFunction(() => /done:|stopped/.test(document.querySelector('#status-line')?.textContent ?? ''), null, { timeout: 30000 });
  const line = (await page.textContent('#status-line')).trim();
  check(line.includes('done:'), `the cache job fills the view: "${line}"`);
  await shot('13-cache-done');

  // 7. the layer key hides the layer; GOO without a key shows the key's help
  await page.click('#k-arkod');
  check(await page.locator('#k-arkod.lit').count() === 0, 'a tap on the ARKOD key hides the layer');
  await page.click('#k-arkod');
  await page.click('#k-goo');
  await page.waitForSelector('#googlehelp', { timeout: 5000 });
  check((await page.textContent('#googlehelp')).includes('Map Tiles API') && await page.locator('#key-file').count() === 1, 'GOO without a key shows how to make one, a paste box and a file picker');
  await shot('14-google-help');
  await page.fill('#google-key', 'AIzaSyTESTTESTTESTTESTTESTTESTTESTTEST00');
  await page.click('#google-add');
  await page.waitForFunction(() => document.querySelector('#note')?.textContent.includes('Google'), null, { timeout: 5000 });
  check(asked.google > 0, `a pasted key is tested at once; Google's own words are shown: "${(await page.textContent('#note')).trim()}"`);
  await page.click('#k-osm');

  // 8. the install page shows each phone its own way first
  for (const [ua, first] of [['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'iphone'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36', 'android']]) {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, userAgent: ua });
    const p = await c.newPage();
    await p.goto(`${SITE}/install/`);
    const got = await p.evaluate(() => document.querySelector('#ways > section').id);
    check(got === first, `the install page shows ${first} first (${got})`);
    if (first === 'android') check((await p.getAttribute('#apk', 'href')).endsWith('mantra_arkod/releases/latest'), 'Android gets the APK link');
    if (first === 'iphone') check(await p.locator('#iphone svg').count() === 3, 'iPhone gets three pictures');
    await p.screenshot({ path: join(SCREENS, `15-install-${first}.png`), fullPage: true });
    await c.close();
  }

  // 9. a desktop
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${SITE}/?lat=${Fake.KUKLJICA[0]}&lon=${Fake.KUKLJICA[1]}&z=17&open=mine`);
  await page.waitForSelector('#moje');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'a desktop gets the map with a side panel, no sideways scroll');
  await page.screenshot({ path: join(SCREENS, '16-desktop.png') });
} catch (e) {
  failures += 1;
  console.log(`FAIL stopped at step ${step + 1}: ${e.message.split('\n')[0]}`);
  await shot('failure').catch(() => {});
}

// 10. the service worker: it installs, and keeps the app
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await wire(c);
  const p = await c.newPage();
  try {
    await p.goto(`${SITE}/?nosw`);
    await p.goto(`${SITE}/`);
    const kept = await p.evaluate(async () => {
      await navigator.serviceWorker.ready;
      const names = await caches.keys();
      const app = names.find((n) => n.startsWith('arkod-app-'));
      return { names, index: app ? !!(await (await caches.open(app)).match('index.html')) : false };
    });
    check(kept.index, `the service worker keeps the app for no signal (${kept.names.join(', ')})`);
    await p.goto(`${SITE}/?lat=${Fake.KUKLJICA[0]}&lon=${Fake.KUKLJICA[1]}&z=16`);
    await p.waitForSelector('body[data-ready="1"]');
    await p.waitForTimeout(9000);
    const wms = await p.evaluate(async () => (await (await caches.open('arkod-wms')).keys()).length);
    check(wms > 50, `where the map rests, the ARKOD layer around it is kept on the device (${wms} WMS tiles in the service worker's store)`);
    await c.setOffline(true);
    await p.reload();
    check((await p.title()) === 'ARKOD Layer', 'with no signal the app still opens from the device');
  } catch (e) {
    failures += 1;
    console.log(`FAIL service worker: ${e.message.split('\n')[0]}`);
  }
  await c.close();
}

const real = errors.filter((e) => !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED/.test(e));
check(real.length === 0, `no errors in the page${real.length ? ': ' + real.slice(0, 3).join(' | ') : ''}`);
console.log(`\nasked the fake state: ${asked.wms} WMS pictures, ${asked.info} GetFeatureInfo, ${asked.wfs} WFS, ${asked.oss} OSS; Google ${asked.google}`);
console.log(failures ? `\n${failures} FAILED` : `\nall ${step} checks passed; screenshots in tests/screens/`);
await browser.close();
server.close();
process.exit(failures ? 1 : 0);
