// The proxies: the state is asked as an app asks (no Origin), and the answer comes back with CORS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forward, TARGETS, cacheSeconds, OSS_TRIES, refusedByAddress } from '../functions/_proxy.js';
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

test('OSS refusing the address is asked again, and the answer that comes is passed on', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push(init);
    return calls.length < 3
      ? new Response(APACHE_403, { status: 403, headers: { 'Content-Type': 'text/html; charset=iso-8859-1' } })
      : new Response('{"parcelId":6436001}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const res = await forward(new Request('https://x/api/oss/cad/parcel-info?parcelId=6436001'), 'oss', TARGETS.oss + 'cad/parcel-info?parcelId=6436001', fetcher);
  assert.equal(calls.length, 3);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('X-State-Tries'), '3');
  assert.equal(await res.text(), '{"parcelId":6436001}');
});

test('the POSTed search is sent again with its body when OSS refuses the address', async () => {
  const bodies = [];
  const fetcher = async (url, init) => {
    bodies.push(init.body);
    return bodies.length === 1
      ? new Response(APACHE_403, { status: 403, headers: { 'Content-Type': 'text/html' } })
      : new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const body = '{"cadMunicipalityId":1354,"parcelNumber":"1358/3"}';
  const res = await forward(new Request('https://x/api/oss/cad/search-parcels', { method: 'POST', body }), 'oss', TARGETS.oss + 'cad/search-parcels', fetcher);
  assert.equal(res.status, 200);
  assert.deepEqual(bodies, [body, body]);
});

test('the asking stops at OSS_TRIES; a 403 that is not the refusal page, and other services, are not asked again', async () => {
  let n = 0;
  const always = async () => { n += 1; return new Response(APACHE_403, { status: 403, headers: { 'Content-Type': 'text/html' } }); };
  const res = await forward(new Request('https://x/api/oss/cad/parcel-info?parcelId=1'), 'oss', TARGETS.oss + 'cad/parcel-info?parcelId=1', always);
  assert.equal(n, OSS_TRIES);
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('X-State-Tries'), String(OSS_TRIES));
  n = 0;
  const json403 = async () => { n += 1; return new Response('{"status":"FORBIDDEN"}', { status: 403, headers: { 'Content-Type': 'application/json' } }); };
  await forward(new Request('https://x/api/oss/x'), 'oss', TARGETS.oss + 'x', json403);
  assert.equal(n, 1);
  n = 0;
  await forward(new Request('https://x/api/wfs?x'), 'wfs', TARGETS.wfs + '?x', always);
  assert.equal(n, 1);
  assert.equal(await refusedByAddress(new Response(APACHE_403, { status: 403, headers: { 'Content-Type': 'text/html' } })), true);
  assert.equal(await refusedByAddress(new Response('x', { status: 500, headers: { 'Content-Type': 'text/html' } })), false);
});
