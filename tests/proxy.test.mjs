// The proxies: the state is asked as an app asks (no Origin), and the answer comes back with CORS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forward, TARGETS, cacheSeconds, refusedByAddress } from '../functions/_proxy.js';
import { onRequest as oss, ossPath } from '../functions/api/oss/[[path]].js';
import { onRequest as wms } from '../functions/api/wms.js';

function recorder(status = 200, body = 'ok', type = 'application/json') {
  const calls = [];
  const fetcher = async (url, init) => { calls.push({ url, init }); return new Response(body, { status, headers: { 'Content-Type': type } }); };
  return { calls, fetcher };
}

test('OSS is asked without the browser Origin, and answers with CORS', async () => {
  const { calls, fetcher } = recorder();
  const req = new Request('https://arkod-layer.pages.dev/api/oss/cad/parcel-info?parcelId=6434350', { headers: { Origin: 'https://arkod-layer.pages.dev', Cookie: 'x=1' } });
  const res = await forward(req, 'oss', TARGETS.oss + 'cad/parcel-info?parcelId=6434350', fetcher);
  assert.equal(calls[0].url, 'https://oss.uredjenazemlja.hr/oss/public/cad/parcel-info?parcelId=6434350');
  const sent = Object.keys(calls[0].init.headers).map((k) => k.toLowerCase());
  assert.ok(!sent.includes('origin') && !sent.includes('referer') && !sent.includes('cookie'), sent.join(','));
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=3600');
});

test('the search is POSTed with its body; nothing else but GET is let through', async () => {
  const { calls, fetcher } = recorder();
  const body = '{"cadMunicipalityId":1354,"parcelNumber":"2449/2"}';
  const res = await forward(new Request('https://x/api/oss/cad/search-parcels', { method: 'POST', body }), 'oss', TARGETS.oss + 'cad/search-parcels', fetcher);
  assert.equal(res.status, 200);
  assert.equal(calls[0].init.body, body);
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  const put = await forward(new Request('https://x/api/wms', { method: 'PUT', body: 'x' }), 'wms', TARGETS.wms, fetcher);
  assert.equal(put.status, 405);
  const post = await forward(new Request('https://x/api/wms', { method: 'POST', body: 'x' }), 'wms', TARGETS.wms, fetcher);
  assert.equal(post.status, 405);
});

test('a WMS tile keeps its picture type and is kept a day; a refusal is never kept', async () => {
  const png = recorder(200, 'PNG', 'image/png');
  const res = await forward(new Request('https://x/api/wms?REQUEST=GetMap'), 'wms', TARGETS.wms + '?REQUEST=GetMap', png.fetcher);
  assert.equal(res.headers.get('Content-Type'), 'image/png');
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=86400');
  const bad = recorder(500, 'ORA-01000', 'text/xml');
  const r2 = await forward(new Request('https://x/api/wfs?x'), 'wfs', TARGETS.wfs + '?x', bad.fetcher);
  assert.equal(r2.status, 500);
  assert.equal(r2.headers.get('Cache-Control'), 'no-store');
  assert.equal(cacheSeconds('oss', 404), 0);
});

test('the state out of reach is a 502 that says so', async () => {
  const res = await forward(new Request('https://x/api/wfs?x'), 'wfs', TARGETS.wfs + '?x', async () => { throw new Error('timeout'); });
  assert.equal(res.status, 502);
  assert.match(await res.text(), /could not be reached: timeout/);
});

test('an OSS path is only what OSS paths are made of', async () => {
  assert.equal(ossPath({ path: ['cad', 'parcel-info'] }), 'cad/parcel-info');
  assert.equal(ossPath({ path: ['lr', '..', 'x'] }), null);
  assert.equal(ossPath({ path: ['a b'] }), null);
  const res = await oss({ request: new Request('https://x/api/oss/%2e%2e'), params: { path: ['..'] } });
  assert.equal(res.status, 400);
});

test('an OPTIONS preflight is answered without asking the state', async () => {
  let asked = false;
  const res = await forward(new Request('https://x/api/oss/x', { method: 'OPTIONS' }), 'oss', TARGETS.oss + 'x', async () => { asked = true; });
  assert.equal(res.status, 204);
  assert.equal(asked, false);
  assert.ok(typeof wms === 'function');
});

// 1.10.2026: OSS's Apache refuses some of Cloudflare's addresses with its own 403 page.
const APACHE_403 = '<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN">\n<html><head>\n<title>403 Forbidden</title>\n</head><body>\n<h1>Forbidden</h1>\n</body></html>\n';

test("OSS refusing the site's address is named, asked once, and passed on", async () => {
  let n = 0;
  const refused = async () => { n += 1; return new Response(APACHE_403, { status: 403, headers: { 'Content-Type': 'text/html; charset=iso-8859-1' } }); };
  const res = await forward(new Request('https://x/api/oss/cad/parcel-info?parcelId=6436001'), 'oss', TARGETS.oss + 'cad/parcel-info?parcelId=6436001', refused);
  assert.equal(n, 1);
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('X-State-Refused'), 'address');
  assert.match(res.headers.get('Access-Control-Expose-Headers'), /X-State-Refused/);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

test('a 403 that is not the refusal page, an answer, and other services are not called a refusal', async () => {
  const json403 = async () => new Response('{"status":"FORBIDDEN"}', { status: 403, headers: { 'Content-Type': 'application/json' } });
  assert.equal((await forward(new Request('https://x/api/oss/x'), 'oss', TARGETS.oss + 'x', json403)).headers.get('X-State-Refused'), null);
  const okay = async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  assert.equal((await forward(new Request('https://x/api/oss/x'), 'oss', TARGETS.oss + 'x', okay)).headers.get('X-State-Refused'), null);
  const html403 = async () => new Response(APACHE_403, { status: 403, headers: { 'Content-Type': 'text/html' } });
  assert.equal((await forward(new Request('https://x/api/wfs?x'), 'wfs', TARGETS.wfs + '?x', html403)).headers.get('X-State-Refused'), null);
  assert.equal(await refusedByAddress(new Response(APACHE_403, { status: 403, headers: { 'Content-Type': 'text/html' } })), true);
  assert.equal(await refusedByAddress(new Response('x', { status: 500, headers: { 'Content-Type': 'text/html' } })), false);
});
