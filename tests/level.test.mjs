// The Android app's v11 to v16 cases (CoreTest.kt), ported: the parcel field wherever the map is, the
// sniffer and its keywords, every kept parcel in three words, the service lights and their log,
// fly-through scanning.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as Q from '../public/js/core/query.js';
import * as Sn from '../public/js/core/sniff.js';
import * as Sv from '../public/js/core/services.js';
import * as P from '../public/js/core/parcels.js';
import { hit, Source } from '../public/js/core/finding.js';

const kukljica = Q.ko('334723', 'KUKLJICA', '3347');
const centar = Q.ko('335266', 'CENTAR NOVI', '9');
const house = P.mark('334723-1358/3', '1358/3', 0xFFE8A64B, [], 6436001, 'DASHED', 'kuća');

test('a number alone or with its k.o. is read either way round', () => {
  assert.deepEqual(Q.parse('1358/3'), { number: '1358/3', place: null });
  assert.deepEqual(Q.parse('1358/3 kukljica'), { number: '1358/3', place: 'kukljica' });
  assert.deepEqual(Q.parse('k.o. Kukljica, 1358/3'), { number: '1358/3', place: 'Kukljica' });
  assert.deepEqual(Q.parse(' *27 '), { number: '*27', place: null });
  assert.equal(Q.parse('jaša anica'), null);
  assert.equal(Q.parse('2450 2451'), null);
});

test('the k.o. is found by its name without diacritics, its start or its number', () => {
  const known = [centar, kukljica, Q.ko('334740', 'KALI')];
  assert.equal(Q.resolve('kuklj', known), kukljica);
  assert.equal(Q.resolve('334723', known), kukljica);
  assert.equal(Q.resolve('kali', known).name, 'KALI');
  assert.equal(Q.resolve('k', known), null);
  assert.equal(Q.resolve('split', known), null);
});

test('the known k.o. come from the map, Imenik, caches and Moje čestice, each once, named where any source names it', () => {
  const book = [{ name: 'BOŠKO IVANA', reference: '334723-1358/3', municipalityName: 'KUKLJICA' }];
  const known = Q.known([centar], [house], [], book);
  assert.deepEqual(known.map((k) => k.reg), ['335266', '334723']);
  assert.equal(known[1].name, 'KUKLJICA');
  assert.equal(Q.label(Q.known([], [house], [], [])[0]), '334723');
});

test('Moje čestice are found by number in every k.o. wherever the map is', () => {
  const other = P.mark('334723-1358/31', '1358/31', 0xFFE8A64B, [], 5);
  const hits = Q.mine([other, house], '1358/3', [kukljica]);
  assert.deepEqual(hits.map((h) => h.title), ['1358/3', '1358/31']);
  assert.equal(hits[0].ref, '334723-1358/3');
  assert.equal(hits[0].under, 'Moje čestice · kuća · k.o. KUKLJICA');
  assert.equal(Q.mine([house], '1358/3', [kukljica], centar).length, 0);
});

test('Search opens the one exact number and leaves a choice when two k.o. have it', () => {
  const h = (ref) => hit(ref, ref.split('-')[1], '', null, { source: Source.PARCEL, ref });
  assert.equal(Q.best([h('334723-1358/3'), h('334723-1358/31')], '1358/3').ref, '334723-1358/3');
  assert.equal(Q.best([h('334723-1358/3'), h('335266-1358/3')], '1358/3'), null);
  assert.equal(Q.best([h('334723-1358/31')], '1358/3').ref, '334723-1358/31');
  assert.equal(Q.best([], '1358/3'), null);
  assert.ok(Q.hasExact([h('334723-1358/3')], '1358/3'));
  assert.ok(!Q.hasExact([h('335266-1358/31')], '1358/3'));
  assert.deepEqual(Q.withSeen(Q.withSeen([kukljica], centar), kukljica).map((k) => k.reg), ['334723', '335266']);
});

const sheet1225 = {
  number: '1358/3', municipality: 'KUKLJICA', municipalityNumber: '334723', address: 'TESNO MALO', areaM2: '516',
  uses: [{ name: 'ŠUMA', areaM2: '516', sheet: '1225' }],
  sheets: [{ number: '1225', owners: [{ name: 'BOŠKO DENIS, POK. ANTE', share: '1/2', address: '' }, { name: 'Marinko  Boško', share: '1/8', address: '' }] }],
  landBooks: [],
};

test('keywords are one per comma or line, each of its words folded', () => {
  assert.deepEqual(Sn.criteria('Boško Ivana, Gobić'), [['bosko', 'ivana'], ['gobic']]);
  assert.deepEqual(Sn.criteria('\n  maslinik ;; '), [['maslinik']]);
  assert.equal(Sn.criteria('  ').length, 0);
});

test('a sheet fits when every word of one criterion begins a word on it', () => {
  const w = Sn.wordsOf(sheet1225);
  assert.ok(Sn.fits(w, Sn.criteria('gobić, boško marinko')));
  assert.ok(Sn.fits(w, Sn.criteria('bosk')));
  assert.ok(Sn.fits(w, Sn.criteria('šuma')));
  assert.ok(Sn.fits(w, Sn.criteria('tesno')));
  assert.ok(!Sn.fits(w, Sn.criteria('boško ivana')));
  assert.ok(!Sn.fits(w, Sn.criteria('ante marinko')));
  assert.ok(!Sn.fits(w, Sn.criteria('arko')));
  assert.ok(Sn.fits(w, []));
  const folio = { shares: [{ title: '1/2', owners: [{ name: 'Boško Svetko' }], entries: [] }] };
  assert.ok(Sn.fits(Sn.wordsOf(null, [folio]), Sn.criteria('svetko')));
});

test('the grid asks the middle first and covers the box; the sniffer and the size read like a person', () => {
  const g = Sn.grid(44.0, 15.0, 44.01, 15.01, 5);
  assert.equal(g.length, 25);
  assert.ok(Math.abs(g[0][0] - 44.005) < 1e-9 && Math.abs(g[0][1] - 15.005) < 1e-9);
  assert.equal(Sn.line({ read: 40, kept: 12, skipped: 28, failed: 0, busy: false }, Sn.criteria('boško, gobić')), 'cache · 40 read · 12 kept · 28 not fitting · keywords: bosko, gobic');
  assert.equal(Sn.megabytes(512_000), '512 kB');
  assert.equal(Sn.megabytes(123_400_000), '123.4 MB');
  assert.equal(Sn.megabytes(400_000_000), '400 MB');
});

const rec = (number, place, ...names) => ({ number, municipality: 'KUKLJICA', municipalityNumber: '334723', address: place, areaM2: '100', uses: [], sheets: [{ number: '1', owners: names.map((n) => ({ name: n, share: '1/1', address: '' })) }], landBooks: [] });

test('the surname is the word the sheets use most, whichever way round the name is written', () => {
  const list = Sn.kept([rec('2449/2', 'DRAGE', 'Marinko  Boško'), rec('1358/3', 'TESNO MALO', 'BOŠKO DENIS, POK. ANTE', 'Ivana Boško'), rec('*28', 'KUKLJICA', 'Edison Boško'), rec('2926/22', 'PODFARČE', 'GOBIĆ MIROSLAVA, P. KRSTE')]);
  assert.deepEqual(list.map((k) => k.surname).sort(), ['Boško', 'Boško', 'Boško', 'Gobić']);
  assert.equal(Sn.keptWords(list.find((k) => k.number === '2449/2')), 'Boško · Drage · KUKLJICA');
});

test('kept parcels are in number order and narrowed by any of their words', () => {
  const list = Sn.kept([rec('2450', 'DRAGE', 'BOŠKO ANA'), rec('2449/10', 'DRAGE', 'BOŠKO ANA'), rec('2449/2', 'DRAGE', 'BOŠKO ANA'), rec('*27', 'KUKLJICA', 'BOŠKO ANA')]);
  assert.deepEqual(list.map((k) => k.number), ['*27', '2449/2', '2449/10', '2450']);
  assert.deepEqual(Sn.filterKept(list, '2449').map((k) => k.number), ['2449/2', '2449/10']);
  assert.equal(Sn.filterKept(list, 'drage').length, 3);
  assert.equal(Sn.filterKept(list, '').length, 4);
});

test('every request is the right service, through this site or straight', () => {
  assert.equal(Sv.of(P.infoUrl(44, 15, 'cp:CP.CadastralParcel', '/api/wms')), 'WMS');
  assert.equal(Sv.of(P.byReferenceUrl(['334723-1358/3'], '/api/wfs')), 'WFS');
  assert.equal(Sv.of(P.recordUrl(6436001, '/api/oss')), 'OSS');
  assert.equal(Sv.of(P.searchUrl('1358/3', '334723', '/api/oss')), 'OSS');
  assert.equal(Sv.of(P.folioUrl('21400', '250', '/api/oss')), 'ZK');
  assert.equal(Sv.of(P.booksUrl('KUKLJICA', '/api/oss')), 'ZK');
  assert.equal(Sv.of('https://tile.openstreetmap.org/17/1/2.png'), 'OSM');
  assert.equal(Sv.of('https://tile.googleapis.com/v1/2dtiles/1/2/3?session=x'), 'GOOGLE');
  assert.equal(Sv.of('https://example.com/'), null);
});

test('the light is what the service last did', () => {
  assert.equal(Sv.light(null), 'GREY');
  assert.equal(Sv.light({ okAt: 20, failAt: 10 }), 'GREEN');
  assert.equal(Sv.light({ okAt: 10, failAt: 20, reason: 'ORA-01000' }), 'RED');
  const clock = () => '16:20';
  assert.equal(Sv.said({ okAt: 10, failAt: 20, reason: 'ORA-01000' }, 30, clock), 'offline since 16:20 · ORA-01000');
  assert.equal(Sv.said({ okAt: 1000, failAt: 0 }, 13_000, clock), 'online · answered 12 s ago');
  assert.equal(Sv.said(null, 0, clock), 'not asked yet');
  assert.equal(Sv.ago(300_000), '5 min ago');
  assert.ok(Sv.due(null, 0, 180_000));
  assert.ok(!Sv.due({ okAt: 100_000, failAt: 0 }, 200_000, 180_000));
});

test('a service going down and coming back is logged once each, with its reason', () => {
  Sv.reset();
  const seen = [];
  const f = (e) => { if (e) seen.push(e); };
  Sv.listeners.add(f);
  const url = P.byReferenceUrl(['334723-1358/3'], '/api/wfs');
  Sv.ok(url, 1000); Sv.ok(url, 2000); Sv.failed(url, 'ORA-01000', 3000); Sv.failed(url, 'ORA-01000', 4000); Sv.ok(url, 5000);
  Sv.listeners.delete(f);
  // the first answer is not news; down, then back, are
  assert.deepEqual(seen.map((e) => e.online), [false, true]);
  assert.equal(seen[0].reason, 'ORA-01000');
  const clock = (t) => `t${t}`;
  assert.equal(Sv.eventLine(seen[0], clock), 't3000 WFS offline · ORA-01000');
  assert.equal(Sv.eventLine(seen[1], clock), 't5000 WFS back online');
  assert.equal(Sv.log.length, 2);
});

test('fly-through says what on the sheet fitted, and nothing without words', () => {
  const s = { ...sheet1225, sheets: [{ number: '1984', owners: [{ name: 'JAŠA ANICA', share: '1/2' }, { name: 'BOŠKO DENIS', share: '1/2' }] }], address: 'DRAGE' };
  assert.equal(Sn.why(s, [], Sn.criteria('jaša')), 'JAŠA ANICA');
  assert.equal(Sn.why(s, [], Sn.criteria('Jasa')), 'JAŠA ANICA');
  assert.equal(Sn.why(s, [], Sn.criteria('drage')), 'DRAGE');
  assert.equal(Sn.why(s, [], Sn.criteria('gobić')), null);
  assert.equal(Sn.why(s, [], []), null);
});

test('fly-through is verbose at every stage', () => {
  const s = Sn.flyState({ query: 'jaša', on: true });
  assert.equal(Sn.flyLine({ ...s, stage: 'ZOOM' }), '✈ "jaša": zoom to 16 or closer to scan');
  assert.equal(Sn.flyLine({ ...s, stage: 'SCANNING', asked: 14, total: 25, read: 9, found: [['2449/2', 'JAŠA ANICA']] }), '✈ "jaša": scanning 14/25 · 9 sheets read · found 1');
  assert.equal(Sn.flyLine({ ...s, stage: 'SCANNING', selecting: '2449/2', found: [['2449/2', 'JAŠA ANICA']] }), '✈ "jaša": found 2449/2 · selecting · found 1');
  assert.ok(Sn.flyLine({ ...s, stage: 'DONE', read: 25 }).includes('this view scanned · 25 sheets read'));
});
