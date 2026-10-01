// THE REAL STATE: ARKOD Layer in Chromium at 390 x 844, against the deployed site and the state's own
// services behind it (no fake). Kukljica (k.o. 334723): 1358/3 (id 6436001) and 2449/2. Run where the
// state can be reached: npm run real (SITE=https://... to test another deployment). Not part of CI: it
// asks the real services, which fail in spells (ORA-01000), so a red line here may be the state's.
//
// Every step prints what it saw; screenshots go to tests/screens/real-*.png.

const { chromium } = await import('playwright');
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = process.env.SITE ?? 'https://arkod-layer.pages.dev';
const SCREENS = fileURLToPath(new URL('./screens/', import.meta.url));
await mkdir(SCREENS, { recursive: true });

// Inside each parcel (the family site's label points, from the state's own outlines).
const P1358 = [44.01732073, 15.2494459];
const P2449 = [44.03625787, 15.22776414];

let failures = 0;
let step = 0;
function check(ok, what) {
  step += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${String(step).padStart(2)} ${what}`);
  if (!ok) failures += 1;
}
const asked = { wms: 0, info: 0, wfs: 0, oss: 0 };
const answers = [];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'hr-HR' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (r) => {
  const u = new URL(r.url());
  if (!u.pathname.startsWith('/api/')) return;
  const kind = u.pathname.startsWith('/api/wms') ? (u.searchParams.get('REQUEST') === 'GetFeatureInfo' ? 'info' : 'wms') : u.pathname.startsWith('/api/wfs') ? 'wfs' : 'oss';
  asked[kind] += 1;
  if (r.status() !== 200) answers.push(`${kind} ${r.status()} ${u.pathname}`);
});
const shot = (name) => page.screenshot({ path: join(SCREENS, `real-${name}.png`) });
const sheetText = () => page.textContent('#sheet-rows');
async function tab(i) {
  await page.locator('#sheet-tabs .part').nth(i).click();
  await page.waitForTimeout(300);
  return sheetText();
}

try {
  // 1. the map at 1358/3, the ARKOD layer from the real WMS
  await page.goto(`${SITE}/?lat=${P1358[0]}&lon=${P1358[1]}&z=18`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
  const version = await (await page.request.get(`${SITE}/version.json`)).json();
  check(version.version >= 5, `the deployed web app is version ${version.version}`);
  await page.waitForFunction(() => document.querySelectorAll('.leaflet-pane canvas[data-drawn="state"]').length > 0, null, { timeout: 45000 });
  const ink = await page.evaluate(() => [...document.querySelectorAll('canvas[data-drawn="state"]')].reduce((n, c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n += 1;
    return n;
  }, 0));
  check(ink > 1000, `the ARKOD layer is drawn at 1358/3 z18 from the real WMS: ${asked.wms} pictures, ${ink} ink pixels`);
  await shot('01-kukljica-1358-3');

  // 2. a tap in the middle selects the parcel under it (the real GetFeatureInfo)
  const box = await page.locator('#map').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => document.querySelector('#note')?.textContent.includes('1358/3'), null, { timeout: 30000 }).catch(() => {});
  const note = (await page.textContent('#note')).trim();
  check(note.includes('1358/3'), `a tap selects the parcel under it: "${note}"`);

  // 3. a second tap opens its sheet: posjedovni list from the cadastre, vlasnički list from the land registry
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector('#sheet', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#sheet-rows')?.textContent.length > 20, null, { timeout: 30000 });
  const num = (await page.textContent('#sheet .num')).trim();
  check(num.startsWith('1358/3'), `the second tap opens the sheet of ${num}`);
  const uses = await tab(0);
  check(/ŠUMA/.test(uses) && /516/.test(uses), `uporaba: ŠUMA, 516 m² (${uses.replace(/\s+/g, ' ').slice(0, 90)}…)`);
  const pl = await tab(1);
  check(/BOŠKO DENIS/.test(pl) && /Marinko/.test(pl) && /1225/.test(pl), 'posjedovni list 1225: Denis 1/2, Ivana, Marinko, Svetko, Tomislav 1/8');
  await shot('02-sheet-posjedovni');
  await page.locator('#sheet-tabs .part').nth(2).click();
  await page.waitForFunction(() => document.querySelector('#sheet-rows')?.textContent.includes('Suvlasnički'), null, { timeout: 30000 }).catch(() => {});
  const zk = await sheetText();
  check(/Suvlasnički/.test(zk) && /Marinko/i.test(zk) && /250/.test(zk), 'vlasnički list: z.k. uložak 250, the shares with Marinko, Svetko, Tomislav and Denis');
  check(!/Ivana/i.test(zk.replace(/Ivane/g, '')), 'the land registry no longer lists Ivana as an owner (her shares passed to her sons in 2017)');
  await shot('03-sheet-vlasnicki');
  await page.keyboard.press('Escape');
  await page.locator('#sheet-close').click().catch(() => {});

  // 4. the parcel field, wherever the map is: "2449/2 kukljica" opens 2449/2
  await page.fill('#parcel-field', '2449/2 kukljica');
  await page.press('#parcel-field', 'Enter');
  await page.waitForFunction(() => document.querySelector('#sheet .num')?.textContent.includes('2449/2'), null, { timeout: 45000 }).catch(() => {});
  const num2 = (await page.textContent('#sheet .num').catch(() => '')).trim();
  check(num2.startsWith('2449/2'), `"2449/2 kukljica" finds the parcel and opens its sheet: ${num2 || '(no sheet)'}`);
  if (num2) {
    const pl2 = await tab(1);
    check(/442/.test(pl2) && /GOBIĆ/.test(pl2), 'posjedovni list 442 of 2449/2: Martinović Šimica and Boško Ivana, r. Gobić');
    await shot('04-sheet-2449-2');
  }

  // 5. the service lights, as the real state answered
  const lights = await page.$$eval('#lights .light', (xs) => xs.map((x) => `${x.textContent}:${x.dataset.light}`));
  check(lights.some((l) => l === 'WMS:GREEN') && lights.some((l) => l === 'KAT:GREEN') && lights.some((l) => l === 'ZK:GREEN'), `the lights: ${lights.join(' ')}`);
  console.log(`      WFS (outlines only): ${lights.find((l) => l.startsWith('WFS')) ?? 'not shown'}`);
  check(errors.length === 0, `no errors in the page${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
} catch (e) {
  check(false, `stopped: ${e.message.split('\n')[0]}`);
  await shot('99-stopped').catch(() => {});
} finally {
  console.log(`\nasked the real state: ${asked.wms} WMS pictures, ${asked.info} GetFeatureInfo, ${asked.wfs} WFS, ${asked.oss} OSS`);
  if (answers.length) console.log(`not 200: ${[...new Set(answers)].slice(0, 8).join('; ')}`);
  await browser.close();
}
console.log(failures ? `\n${failures} of ${step} checks failed` : `\nall ${step} checks passed against the real state; screenshots in tests/screens/`);
process.exit(failures ? 1 : 0);
