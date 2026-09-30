// Test 1, the mechanism: every case of mantra_arkod CoreTest.kt that tests the modules ported here
// (Parcels, ParcelStyle, ParcelCache, MarkFile, OwnerBook, Finding, Outline), case by case, with the
// same fixtures. The Kotlin test's name is kept as each test's name, so the two can be read side by side.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Parcels from '../public/js/core/parcels.js';
import * as Style from '../public/js/core/style.js';
import * as Cache from '../public/js/core/cache.js';
import * as MarkFile from '../public/js/core/markfile.js';
import * as OwnerBook from '../public/js/core/ownerbook.js';
import * as Finding from '../public/js/core/finding.js';
import * as Outline from '../public/js/core/outline.js';
import * as Geo from '../public/js/core/geo.js';

const near = (a, b, d, msg) => assert.ok(Math.abs(a - b) <= d, msg ?? `${a} is not within ${d} of ${b}`);

const twoParcels = `
{"type":"FeatureCollection","features":[
 {"type":"Feature","id":"CP.6438470","geometry":{"type":"Polygon","coordinates":[[[15.0,44.0],[15.001,44.0],[15.001,44.001],[15.0,44.001],[15.0,44.0]]]},
  "properties":{"areaValue":{"value":12401,"@uom":"m2"},"inspireId":{"localId":"CP.6438470","namespace":"HR.DGU.CP"},"label":"2450","nationalCadastralReference":"334723-2450"}},
 {"type":"Feature","id":"CP.10480898","geometry":{"type":"MultiPolygon","coordinates":[[[[15.001,44.0],[15.002,44.0],[15.002,44.001],[15.001,44.001],[15.001,44.0]]]]},
  "properties":{"inspireId":{"localId":"CP.10480898"},"label":"154/1","nationalCadastralReference":"334723-154/1"}}
]}`;

const infoText = `Results for FeatureType 'http://cp_wms:CP.CadastralParcel':
--------------------------------------------
ID = 6438471
GEOMETRY = [GEOMETRY (Polygon) with 6 points]
BROJ_CESTICE = 2451
MATICNI_BROJ_KO = 334723
--------------------------------------------`;

const folio1500 = `[{"lrUnitId":1,"lrUnitNumber":"1500","mainBookId":32218,"mainBookName":"DRENOVA",
    "institutionName":"Zemljišnoknjižni odjel Rijeka","lrUnitTypeName":"VLASNIČKI","lastDiaryNumber":"Z-8817/2024",
    "activePlumbs":[],
    "ownershipSheetB":{"lrUnitShares":[
      {"description":"2. Suvlasnički dio: 1/3","lrOwners":[{"name":"LIVAJA DRAGICA ","address":"Brune Francetića 17, Rijeka",
        "lrEntry":{"description":"Zaprimljeno 20.03.2024.g. pod brojem Z-7547/2024<br><br>UKNJIŽBA, PRAVO VLASNIŠTVA","orderNumber":"2.2"}}],
       "subSharesAndEntries":[{"description":"ZABILJEŽBA, DOŽIVOTNO UZDRŽAVANJE","orderNumber":"2.3"}],"orderNumber":"2"},
      {"description":"3. Suvlasnički dio: 1/3","lrOwners":[{"name":"LIVAJA ZORAN"}],"subSharesAndEntries":[],"orderNumber":"3"}],
      "lrEntries":[]},
    "possessionSheetA1":{"lrParcels":[{"parcelNumber":"115","address":"ORANICA","areaInHvat":"44"},
      {"parcelNumber":"1170/4","address":"CESTE","area":"26"}]},
    "encumbranceSheetC":{"lrEntryGroups":[{"description":"1. ","lrEntries":[{"description":
      "<span class='lr-entry-black' >Primljeno, 25. lipnja 1974. Z-1754/74<br><br>služnost prolaza</span>","orderNumber":"1.1"}]}]}}]`;

const entry = (name, reference, role = OwnerBook.Role.POSJEDNIK, detail = 'p.l. 1984') =>
  OwnerBook.entry(name, role, detail, 7, reference, reference.slice(reference.indexOf('-') + 1), 'KUKLJICA');

const square = [[44.0, 15.0], [44.0, 15.001], [44.001, 15.001], [44.001, 15.0]];
const ring = square;

const cacheOf = (...items) => ({
  info: Cache.info({ id: 'c1', name: 'Kukljica 30.9.2026', createdMs: 1, box: Cache.box(43.99, 14.99, 44.01, 15.01), zoom: 16 }),
  items,
});

const baka = Cache.item({
  id: 11, number: '2450', reference: '334723-2450', areaM2: 501, rings: [square],
  label: [44.0005, 15.0005], municipalityName: 'KUKLJICA', address: 'DRAGE', uses: ['maslinik'],
  holders: [
    Cache.holder('JAŠA ANICA POK. JOSE', OwnerBook.Role.POSJEDNIK, 'p.l. 657'),
    Cache.holder('JAŠA ANICA', OwnerBook.Role.VLASNIK, 'z.k.ul. 182 · 1/2'),
  ],
  read: true,
});

const M = Parcels.mark;

// --- Parcels -------------------------------------------------------------------------------------

test('cadastreTileBoxIsTheWholeWorldAtZoomZero', () => {
  const b = Parcels.tileBox(0, 0, 0);
  near(b[0], -20037508.34, 0.01); near(b[1], -20037508.34, 0.01); near(b[2], 20037508.34, 0.01); near(b[3], 20037508.34, 0.01);
});

test('cadastreTileBoxMatchesTheOneMeasuredOverKukljica', () => {
  const b = Parcels.tileBox(17, 71086, 47645);
  near(b[0], 1696902.03, 0.05); near(b[1], 5469833.74, 0.05); near(b[2], 1697207.78, 0.05); near(b[3], 5470139.49, 0.05);
});

test('cadastreTilePathBecomesAWmsRequestAndNothingElseIsTouched', () => {
  const asked = Parcels.resolve(Parcels.WMS + '/17/71086/47645');
  assert.ok(asked.startsWith(Parcels.WMS + '?SERVICE=WMS'));
  assert.ok(asked.includes('REQUEST=GetMap'));
  assert.ok(asked.includes('STYLES=&'));
  assert.ok(asked.includes('CRS=EPSG:3857'));
  assert.ok(asked.includes('BBOX=1696902.0'));
  const other = 'https://tile.example/1/2/3.png';
  assert.equal(Parcels.resolve(other), other);
  assert.equal(Parcels.resolve(Parcels.WMS + '/a/b/c'), Parcels.WMS + '/a/b/c');
});

test('parcelNumbersAreReadOutOfWhatHeTyped', () => {
  assert.deepEqual(Parcels.numbers('2450, 2449/3  2451;2450'), ['2450', '2449/3', '2451']);
  assert.deepEqual(Parcels.numbers('Kukljica, abc, /3, 12/'), []);
});

test('parcelsAreParsedWithTheirIdNumberAreaAndLatitudeFirstRings', () => {
  const parcels = Parcels.parseParcels(twoParcels);
  assert.equal(parcels.length, 2);
  const first = parcels[0];
  assert.equal(first.id, 6438470);
  assert.equal(first.number, '2450');
  assert.equal(Parcels.municipalityOf(first.reference), '334723');
  assert.equal(first.areaM2, 12401);
  near(first.rings[0][0][0], 44.0, 1e-9);
  near(first.rings[0][0][1], 15.0, 1e-9);
  assert.equal(parcels[1].id, 10480898);
  assert.equal(parcels[1].areaM2, null);
  assert.equal(parcels[1].rings.length, 1);
});

test('theTapFindsTheParcelItLandedInAndNotItsNeighbour', () => {
  const parcels = Parcels.parseParcels(twoParcels);
  assert.equal(Parcels.containing(parcels, 44.0005, 15.0005)?.number, '2450');
  assert.equal(Parcels.containing(parcels, 44.0005, 15.0015)?.number, '154/1');
  assert.equal(Parcels.containing(parcels, 44.0005, 15.0030), null);
});

test('theTapReadsIdNumberAndMunicipalityFromThePlainText', () => {
  const p = Parcels.parcelFromInfo(infoText);
  assert.ok(p);
  assert.equal(p.id, 6438471);
  assert.equal(p.number, '2451');
  assert.equal(p.reference, '334723-2451');
  assert.equal(Parcels.municipalityOf(p.reference), '334723');
  assert.equal(p.rings.length, 0);
});

test('aTapInTheSeaFindsNothing', () => {
  assert.equal(Parcels.parcelFromInfo('no features were found\n'), null);
  assert.equal(Parcels.parseInfo(''), null);
});

test('theMunicipalityIsReadFromTheZoningLayer', () => {
  const text = "Results for FeatureType 'http://cp_wms:CP.CadastralZoning':\n" +
    '--------------------------------------------\nID = 1354\n' +
    'GEOMETRY = [GEOMETRY (MultiPolygon) with 1124 points]\nLABEL = 334723-KUKLJICA\n' +
    '--------------------------------------------\n';
  assert.deepEqual(Parcels.zoningFromInfo(text), ['334723', 'KUKLJICA']);
});

test('theTapAsksTheMiddlePixelOfASmallBoxInPlainText', () => {
  const url = Parcels.infoUrl(44.0368, 15.2279);
  assert.ok(url.includes('REQUEST=GetFeatureInfo'));
  assert.ok(url.includes('INFO_FORMAT=text/plain'));
  assert.ok(url.includes('I=50&J=50'));
  assert.ok(url.includes('STYLES=&'));
});

test('searchTakesTheExactNumberAndNotOneThatBeginsWithIt', () => {
  const json = '[{"key1":"111","value1":"24510"},{"key1":"6438471","value1":"2451"}]';
  assert.equal(Parcels.parseSearchId(json, '2451'), 6438471);
  assert.equal(Parcels.parseSearchId('[]', '2451'), null);
  assert.ok(Parcels.searchUrl('2449/3', '334723').endsWith('search=2449%2F3&municipalityRegNum=334723'));
});

test('aShapeThatArrivesLaterGoesIntoItsOwnMarkOnly', () => {
  const parcels = Parcels.parseParcels(twoParcels);
  const waiting = M('334723-2450', '2450', 0xFFEF4444, [], 6438470);
  const other = M('334723-9', '9', 0xFF34D399, [], 9);
  const marks = Parcels.withShapes([waiting, other], parcels);
  assert.equal(marks[0].rings[0].length, 5);
  assert.equal(marks[0].colour, 0xFFEF4444);
  assert.equal(marks[1].rings.length, 0);
  assert.deepEqual(Parcels.shapeless(marks), [other]);
});

test('aMarkWithoutItsShapeYetSurvivesBeingWrittenAndRead', () => {
  const m = M('334723-2451', '2451', 0xFFE8A64B, [], 6438471);
  const back = Parcels.decode(Parcels.encode([m]));
  assert.equal(back.length, 1);
  assert.equal(back[0].number, '2451');
  assert.equal(back[0].rings.length, 0);
});

test('theRecordCarriesEveryPossessorWithShareAndAddress', () => {
  const json = `{"parcelId":1,"parcelNumber":"154/1","cadMunicipalityName":"KUKLJICA","cadMunicipalityRegNum":"334723",
     "address":"DONJE POLJE","area":"501",
     "parcelParts":[{"name":"ORANICA","area":"101","possessionSheetNumber":"376"},{"name":"VOĆNJAK","area":"400","possessionSheetNumber":"365"}],
     "possessionSheets":[
       {"possessionSheetNumber":"376","possessors":[{"name":"Ana Primjer ","ownership":"1/3","address":"Kukljica 1"},{"name":"Ivo Primjer","ownership":"2/3","address":""}]},
       {"possessionSheetNumber":"365","possessors":[{"name":"Mare Uzorak","ownership":"1/1","address":"Zadar"}]}]}`;
  const r = Parcels.parseRecord(json);
  assert.equal(r.number, '154/1');
  assert.equal(r.municipality, 'KUKLJICA');
  assert.equal(r.uses.length, 2);
  assert.equal(r.uses[1].name, 'VOĆNJAK');
  assert.equal(r.sheets.length, 2);
  assert.equal(r.sheets[0].owners[0].name, 'Ana Primjer');
  assert.equal(r.sheets[0].owners[1].share, '2/3');
  assert.equal(r.sheets[1].owners[0].name, 'Mare Uzorak');
  assert.equal(r.landBooks.length, 0);
});

test('theRecordNamesTheLandRegistryUnit', () => {
  const json = `{"parcelNumber":"2451","lrUnitsFromParcelLinks":[{"lrUnitNumber":"37","mainBookName":"KUKLJICA",
    "institutionName":"Zemljišnoknjižni odjel Zadar","lrUnitTypeName":"VLASNIČKI"}]}`;
  const books = Parcels.parseRecord(json).landBooks;
  assert.equal(books.length, 1);
  assert.equal(books[0].unit, '37');
  assert.equal(books[0].book, 'KUKLJICA');
  assert.equal(books[0].office, 'Zemljišnoknjižni odjel Zadar');
});

test('aRecordWithNoSheetsIsEmptyNotAnError', () => {
  const r = Parcels.parseRecord('{"parcelNumber":"9"}');
  assert.equal(r.sheets.length, 0);
  assert.equal(r.uses.length, 0);
});

test('highlightedParcelsSurviveBeingWrittenAndRead', () => {
  const parcels = Parcels.parseParcels(twoParcels);
  const marks = [Parcels.markOf(parcels[0], 0xFFE8A64B), Parcels.markOf(parcels[1], 0xFF34D399)];
  const back = Parcels.decode(Parcels.encode(marks));
  assert.equal(back.length, 2);
  assert.equal(back[0].reference, '334723-2450');
  assert.equal(back[1].number, '154/1');
  assert.equal(back[0].colour, 0xFFE8A64B);
  assert.equal(back[0].id, 6438470);
  assert.equal(back[0].rings[0].length, 5);
  near(back[0].rings[0][2][0], 44.001, 1e-6);
  assert.deepEqual(Parcels.decode(''), []);
  assert.deepEqual(Parcels.decode('garbage|line'), []);
});

test('aParcelIsHighlightedOnceAndANewColourReplacesTheOld', () => {
  const p = Parcels.parseParcels(twoParcels)[0];
  let marks = Parcels.withMark([], Parcels.markOf(p, 0xFFE8A64B));
  marks = Parcels.withMark(marks, Parcels.markOf(p, 0xFFEF4444));
  assert.equal(marks.length, 1);
  assert.equal(marks[0].colour, 0xFFEF4444);
  assert.equal(Parcels.without(marks, p.reference).length, 0);
});

test('theStatesBlackBecomesOurInkAndClearStaysClear', () => {
  assert.equal(Parcels.recolour(0x00000000, Parcels.INK_LIGHT), 0);
  const c = Parcels.recolour(0xFF000000, Parcels.INK_LIGHT);
  assert.equal(c & 0xFFFFFF, 0xF2DDB4);
  assert.equal((c >>> 24) & 0xFF, Math.trunc(255 * Parcels.INK_ALPHA));
});

test('searchAsksForEveryNumberInOneEncodedFilter', () => {
  const url = Parcels.byReferenceUrl(['334723-2450', '334723-2449/3']);
  assert.ok(url.includes('CQL_FILTER=nationalCadastralReference%20IN%20%28%27334723-2450%27%2C%27334723-2449%2F3%27%29'), url);
  assert.ok(!url.includes(' '));
});

test('areaIsWrittenTheWayASurveyorWritesIt', () => {
  assert.equal(Parcels.areaLabel(12401), '12 401 m²');
  assert.equal(Parcels.areaLabel(501), '501 m²');
  assert.equal(Parcels.areaLabel(null), 'površina nepoznata');
});

test('theTextFileCarriesTheWholeSheetAndTheOutline', () => {
  const parcel = Parcels.parseParcels(twoParcels)[0];
  const record = Parcels.parseRecord(`{"parcelNumber":"2450","cadMunicipalityName":"KUKLJICA","cadMunicipalityRegNum":"334723","address":"DRAGE","area":"12401",
     "parcelParts":[{"name":"ŠUMA","area":"6200","possessionSheetNumber":"657"}],
     "possessionSheets":[{"possessionSheetNumber":"657","possessors":[{"name":"Ana Primjer","ownership":"1/1","address":"Kukljica 1"}]}],
     "lrUnitsFromParcelLinks":[{"lrUnitNumber":"1817","mainBookName":"KUKLJICA","institutionName":"Zemljišnoknjižni odjel Zadar","lrUnitTypeName":"VLASNIČKI"}]}`);
  const text = Parcels.toText(parcel, record, '27.9.2026 10:00');
  assert.ok(text.startsWith('ČESTICA 2450'));
  assert.ok(text.includes('KUKLJICA (334723)'));
  assert.ok(text.includes('12 401 m²'));
  assert.ok(text.includes('ŠUMA, 6200 m², posjedovni list 657'));
  assert.ok(text.includes('Ana Primjer  1/1'));
  assert.ok(text.includes('z.k. uložak 1817'));
  assert.ok(text.includes('OBRIS'));
  assert.ok(text.includes('44.000000, 15.000000'));
  assert.equal(Parcels.textFileName(Parcels.parseParcels(twoParcels)[1]), 'cestica 334723-154_1.txt');
});

test('aTextFileWithoutTheRecordSaysSo', () => {
  const text = Parcels.toText(Parcels.parseParcels(twoParcels)[1], null, 'now');
  assert.ok(text.includes('nije mogao pročitati'));
});

test('theSelectionIsNoneOfTheFiveHighlightColours', () => {
  const five = [0xFF34D399, 0xFFE8A64B, 0xFFEF4444, 0xFF60A5FA, 0xFFF2DDB4];
  assert.ok(!five.includes(Parcels.SELECTION));
});

test('theSheetFilterKeepsOnlyTheMatchingOwners', () => {
  const record = Parcels.parseRecord(`{"parcelNumber":"3700/11","parcelParts":[{"name":"DVORIŠTE","area":"500","possessionSheetNumber":"12"}],
     "possessionSheets":[{"possessionSheetNumber":"12","possessors":[
       {"name":"Ana Primjer","ownership":"1/50","address":"Kučički put 1"},
       {"name":"Ivo Uzorak","ownership":"1/50","address":"Goranska 1a"}]}]}`);
  const rows = Parcels.sheetRows(record);
  assert.equal(rows.length, 3);
  assert.deepEqual(Parcels.filterRows(rows, 'kucicki').map((r) => r.main), ['Ana Primjer']);
  assert.equal(Parcels.filterRows(rows, 'posjedovni').length, 2);
  assert.equal(Parcels.filterRows(rows, '').length, 3);
});

test('theCadastresOwnSearchIsReadIntoHits', () => {
  const json = `[{"parcelId":6438471,"parcelNumber":"2451","cadMunicipalityRegNum":"334723","cadMunicipalityName":"KUKLJICA",
    "address":"DRAGE","area":"1412","possessionSheet":{"possessors":[{"name":"ANA PRIMJER"}]}}]`;
  const hits = Parcels.parseSearch(json);
  assert.equal(hits.length, 1);
  const hit = hits[0];
  assert.equal(hit.id, '6438471');
  assert.equal(hit.ref, '334723-2451');
  assert.equal(hit.source, Finding.Source.PARCEL);
  assert.ok(hit.title.startsWith('2451'));
  assert.ok(hit.under.includes('ANA PRIMJER'));
});

test('theSearchBodyIsWhatTheCadastresOwnPagePosts', () => {
  const one = JSON.parse(Parcels.searchBody('1354', '2451'));
  assert.equal(one.cadMunicipalityId, 1354);
  assert.equal(one.parcelNumber, '2451');
  assert.ok(!('possessionSheetNumber' in one));
  const two = JSON.parse(Parcels.searchBody('1354', null, '657'));
  assert.equal(two.possessionSheetNumber, '657');
  assert.ok(!('parcelNumber' in two));
});

test('theZoningLayerGivesTheMunicipalitysInternalId', () => {
  const text = "Results for FeatureType 'http://cp_wms:CP.CadastralZoning':\n" +
    '--------------------------------------------\nID = 1354\nLABEL = 334723-KUKLJICA\n' +
    '--------------------------------------------\n';
  assert.equal(Parcels.zoningIdFromInfo(text), '1354');
});

test('theOwnerSheetIsReadWithItsSharesOwnersAndBurdens', () => {
  const f = Parcels.parseFolio(folio1500);
  assert.equal(f.unit, '1500');
  assert.equal(f.bookId, '32218');
  assert.equal(f.book, 'DRENOVA');
  assert.equal(f.shares.length, 2);
  assert.equal(Parcels.shareOf(f.shares[0].title), '1/3');
  assert.equal(f.shares[0].owners[0].name, 'LIVAJA DRAGICA');
  assert.equal(f.shares[0].entries[0], '2.2  Zaprimljeno 20.03.2024.g. pod brojem Z-7547/2024 · UKNJIŽBA, PRAVO VLASNIŠTVA');
  assert.equal(f.shares[0].entries[1], '2.3  ZABILJEŽBA, DOŽIVOTNO UZDRŽAVANJE');
  assert.deepEqual(f.burdens, ['1.1  Primljeno, 25. lipnja 1974. Z-1754/74 · služnost prolaza']);
  assert.deepEqual(f.parcels, ['115  ORANICA  44 čhv', '1170/4  CESTE  26 m²']);
});

test('aFolioThatIsNotThereIsNullNotACrash', () => {
  assert.equal(Parcels.parseFolio('[]'), null);
  assert.equal(Parcels.parseFolio('{"status":"NOT_FOUND","statusCode":404}'), null);
  assert.deepEqual(Parcels.parseFolioNumbers('{"status":"NOT_FOUND"}'), []);
  assert.deepEqual(Parcels.parseFolioNumbers('[{"lrUnitNumber":"1243","mainBookId":32218}]'), ['1243']);
});

test('theLandBookIsTheOneNamedExactlyAsTheMunicipality', () => {
  const json = `[{"key1":"30036","value1":"SLATINSKI DRENOVAC","value2":"ORAHOVICA"},
    {"key1":"32218","value1":"DRENOVA","value2":"RIJEKA"}]`;
  assert.deepEqual(Parcels.parseBooks(json, 'Drenova'), [{ id: '32218', name: 'DRENOVA', office: 'RIJEKA' }]);
  assert.ok(Parcels.foliosByParcelUrl('32218', '370/1').includes('parcelNumber=370%2F1'));
  assert.ok(Parcels.folioUrl('32218', '1243').includes('lrUnitNumber=1243&mainBookId=32218'));
});

test('theOwnerSheetRowsGoToTheThirdTabAndTheFilterFindsThem', () => {
  const rows = Parcels.folioRows(Parcels.parseFolio(folio1500));
  assert.ok(rows.every((r) => Parcels.tabOf(r) === Parcels.Tab.OWNER));
  const owners = rows.filter((r) => r.main.startsWith('LIVAJA'));
  assert.deepEqual(owners.map((r) => r.side), ['1/3', '1/3']);
  assert.equal(Parcels.filterRows(rows, 'zoran').filter((r) => r.main === 'LIVAJA ZORAN').length, 1);
  assert.equal(Parcels.tabOf(Parcels.row('NAČIN UPORABE', 'x')), Parcels.Tab.USE);
  assert.equal(Parcels.tabOf(Parcels.row('POSJEDOVNI LIST 1615', 'x')), Parcels.Tab.POSSESSION);
  assert.equal(Parcels.tabOf(Parcels.row('ZEMLJIŠNA KNJIGA', 'x')), Parcels.Tab.OWNER);
});

test('aFolioFoundByHandIsKeptPerParcel', () => {
  const links = { '324523-3700/11': ['32218', '1243'] };
  assert.deepEqual(Parcels.decodeLinks(Parcels.encodeLinks(links)), links);
  assert.deepEqual(Parcels.decodeLinks(''), {});
});

test('theTextFileCarriesTheOwnerSheet', () => {
  const p = Parcels.parcel(1, '3700/11', '324523-3700/11', 3071, []);
  const text = Parcels.toText(p, null, '29.9.2026', [Parcels.parseFolio(folio1500)]);
  assert.ok(text.includes('VLASNIČKI LIST, z.k. uložak 1500, k.o. DRENOVA'));
  assert.ok(text.includes('LIVAJA ZORAN'));
});

test('myParcelKeepsItsStyleAndNameThroughTheStore', () => {
  const r = [[45.1, 15.1], [45.1, 15.2], [45.2, 15.2]];
  const mine = M('334723-2450', '2450', 0xFFEF4444, [r], 7, Parcels.LineStyle.DOTTED, 'vinograd');
  assert.deepEqual(Parcels.decode(Parcels.encode([mine])), [mine]);
});

test('aParcelKeptWithoutAStyleIsDashed', () => {
  const back = Parcels.decode('334723-2450|2450|ffef4444|7|45.100000,15.100000;45.100000,15.200000;45.200000,15.200000');
  assert.equal(back.length, 1);
  assert.equal(back[0].style, Parcels.LineStyle.DASHED);
  assert.equal(back[0].name, '');
});

test('aNameCannotBreakTheLineItIsKeptOn', () => {
  const mine = M('1-2', '2', 0xFF000000, [], 0, Parcels.LineStyle.DASHED, 'a|b\nc');
  const back = Parcels.decode(Parcels.encode([mine]));
  assert.equal(back.length, 1);
  assert.equal(back[0].name, 'a b c');
});

test('recolouringOneOfMyParcelsKeepsItsPlaceInTheList', () => {
  const a = M('1-1', '1', 1, []), b = M('1-2', '2', 1, []), c = M('1-3', '3', 1, []);
  const next = Parcels.withMark([a, b, c], { ...b, colour: 2 });
  assert.deepEqual(next.map((m) => m.number), ['1', '2', '3']);
  assert.equal(next[1].colour, 2);
  assert.equal(Parcels.withMark(next, M('1-4', '4', 1, [])).length, 4);
});

test('theMiddleOfMyParcelIsWhereTheMapGoes', () => {
  const mine = M('1-1', '1', 1, [[[45.0, 15.0], [45.0, 15.2], [45.2, 15.2], [45.2, 15.0]]]);
  const [lat, lon] = Parcels.markMiddle(mine);
  near(lat, 45.1, 1e-9);
  near(lon, 15.1, 1e-9);
  assert.equal(Parcels.markMiddle(M('1-1', '1', 1, [])), null);
  assert.equal(Parcels.municipalityOf(mine.reference), '1');
});

test('everyHueIsAnOpaqueColourAndTheWheelComesRound', () => {
  for (let h = 0; h <= 360; h += 15) assert.equal(Math.floor(Parcels.hue(h) / 2 ** 24), 0xFF);
  assert.equal(Parcels.hue(0), Parcels.hue(360));
  assert.equal(Parcels.hue(30), Parcels.hue(-330));
  const ch = (c, shift) => Math.floor(c / 2 ** shift) & 0xFF;
  assert.ok(ch(Parcels.hue(0), 16) > ch(Parcels.hue(0), 8));
  assert.ok(ch(Parcels.hue(120), 8) > ch(Parcels.hue(120), 16));
  assert.ok(ch(Parcels.hue(240), 0) > ch(Parcels.hue(240), 8));
});

test('noQuickPickIsTheSelectionsCyan', () => {
  assert.equal(Parcels.SWATCHES.length, 10);
  assert.ok(!Parcels.SWATCHES.includes(Parcels.SELECTION));
  assert.equal(new Set(Parcels.SWATCHES).size, Parcels.SWATCHES.length);
});

test('theTilesKeptAheadCoverTheCadastresZoomsNearestFirst', () => {
  const tiles = Parcels.prefetchTiles(45.8150, 15.9819);
  assert.deepEqual(new Set(tiles.map((t) => t[0])), new Set([14, 15, 16, 17, 18]));
  assert.equal(new Set(tiles.map((t) => t.join('/'))).size, tiles.length);
  assert.ok(tiles.length >= 150 && tiles.length <= 700, `${tiles.length}`);
  for (let z = Parcels.MIN_ZOOM; z <= 18; z++) {
    const first = tiles.find((t) => t[0] === z);
    assert.equal(first[1], Geo.tileX(15.9819, z));
    assert.equal(first[2], Geo.tileY(45.8150, z));
  }
  const zs = tiles.map((t) => t[0]);
  assert.deepEqual(zs, [...zs].sort((a, b) => a - b));
});

test('theInkIsLightOnGooglesPhotographsAndTheNightThemeAndDarkElsewhere', () => {
  assert.equal(Parcels.inkFor('google-sat', 'DEFAULT', 'satellite'), Parcels.INK_LIGHT);
  assert.equal(Parcels.inkFor('google', 'DEFAULT', 'roadmap'), Parcels.INK_DARK);
  assert.equal(Parcels.inkFor('osm', 'NEWTRON'), Parcels.INK_DARK);
  assert.equal(Parcels.inkFor('offline', 'NEWTRON'), Parcels.INK_LIGHT);
  assert.equal(Parcels.inkFor('offline', 'DEFAULT'), Parcels.INK_DARK);
});

test('theSheetSpeaksCroatian', () => {
  assert.deepEqual(Parcels.TABS.map((t) => Parcels.TAB_WORDS[t]), ['uporaba', 'posjedovni', 'vlasnički']);
  assert.deepEqual(Parcels.LINE_STYLES.map((s) => Parcels.LINE_WORDS[s]), ['isprekidana', 'puna', 'točkasta']);
});

test('theParcelsKeyHidesEverythingAndOnlyMineWinsOverIt', () => {
  assert.deepEqual(Parcels.visibility(true, false), [true, true]);
  assert.deepEqual(Parcels.visibility(false, false), [false, false]);
  assert.deepEqual(Parcels.visibility(true, true), [false, true]);
  assert.deepEqual(Parcels.visibility(false, true), [false, true]);
});

test('theNumbersOssOffersBecomeHitsWithStarredOnesLast', () => {
  const json = '[{"key1":"11","value1":"*245"},{"key1":"12","value1":"2450"},{"key1":"","value1":"2451"},{"key1":"13","value1":"2452/1"}]';
  const hits = Parcels.parseSuggestions(json, '334723', 'KUKLJICA');
  assert.deepEqual(hits.map((h) => h.title), ['2450', '2452/1', '*245']);
  assert.equal(hits[0].ref, '334723-2450');
  assert.equal(hits[0].id, '12');
  assert.equal(hits[0].under, 'k.o. KUKLJICA');
  assert.ok(hits.every((h) => h.source === Finding.Source.PARCEL));
  assert.equal(Parcels.parseSuggestions(json, '334723', 'KUKLJICA', 1).length, 1);
  assert.equal(Parcels.parseSuggestions('[]', '334723', 'KUKLJICA').length, 0);
});

test('theStatesReasonIsReadFromItsRefusal', () => {
  const oracle = `<ows:ExceptionReport><ows:Exception exceptionCode="NoApplicableCode"><ows:ExceptionText>java.lang.RuntimeException: java.io.IOException
java.io.IOExceptionORA-00604: error occurred at recursive SQL level 1
ORA-01000: maximum open cursors exceeded
</ows:ExceptionText></ows:Exception></ows:ExceptionReport>`;
  assert.equal(Parcels.stateReason(oracle), 'ORA-01000: maximum open cursors exceeded');
  assert.equal(Parcels.stateReason('<ServiceExceptionReport><ServiceException code="ForbiddenFormat">\n      Creating maps using KML is not allowed\nDetails:</ServiceException>'),
    'Creating maps using KML is not allowed');
  assert.equal(Parcels.stateReason(''), null);
});

test('aFoliosParcelNumberIsALinkAndNothingElseIs', () => {
  const H = Parcels.HEAD_FOLIO_PARCELS;
  assert.equal(Parcels.numberIn(Parcels.row(`${H} · uložak 182`, '2449/2  DRAGE  1324 m²')), '2449/2');
  assert.equal(Parcels.numberIn(Parcels.row(`${H} · uložak 869`, '*28  KUKLJICA  65 m²')), '*28');
  assert.equal(Parcels.numberIn(Parcels.row(`${H} · uložak 869`, '530')), '530');
  assert.equal(Parcels.numberIn(Parcels.row('VLASNIČKI LIST · z.k. uložak 182', '2449/2 is not a link here')), null);
  assert.equal(Parcels.numberIn(Parcels.row(`${H} · uložak 182`, 'DRAGE')), null);
});

// --- Finding -------------------------------------------------------------------------------------

test('resultsAreMergedOnceEachNearestFirst', () => {
  const H = Finding.hit;
  const a = [H('1', 'Trg Stjepana Radića 13C', 'Bjelovar', 68503), H('2', 'Ulica Stjepana Radića 13c', 'Mokrice', 20057)];
  const b = [H('2', 'Ulica Stjepana Radića 13c', 'Mokrice', 20057), H('3', 'Ulica Stjepana Radića 13', 'Mičevec', 10000), H('4', 'Ul. Stjepana Radića 13', 'Vrbovec', null)];
  assert.deepEqual(Finding.merge([a, b]).map((h) => h.id), ['3', '2', '1', '4']);
});

test('theHouseLetterIsDroppedForTheSecondQuestionOnly', () => {
  assert.equal(Finding.withoutHouseLetter('stjepana radića 13c'), 'stjepana radića 13');
  assert.equal(Finding.withoutHouseLetter('Ribnjak 6A'), 'Ribnjak 6');
  assert.equal(Finding.withoutHouseLetter('stjepana radića 13'), null);
  assert.equal(Finding.withoutHouseLetter('Kukljica'), null);
});

test('distancesReadAsGoogleWritesThem', () => {
  assert.equal(Finding.distanceLabel(850), '850 m');
  assert.equal(Finding.distanceLabel(1500), '1.5 km');
  assert.equal(Finding.distanceLabel(68503), '68 km');
  assert.equal(Finding.distanceLabel(null), '');
});

test('theFilterNeedsNoDiacritics', () => {
  assert.ok(Finding.matches('ČABRIJAN NIKOLA, SIN VLADIMIRA', 'cabri'));
  assert.ok(Finding.matches('Đurđević', 'durd'));
  assert.ok(Finding.matches('RIJEKA, KUČIČKI PUT 1/E', 'kucicki 1/e'));
  assert.ok(!Finding.matches('SAMSA ŠTEFICA', 'knez'));
});

// --- Imenik (OwnerBook) --------------------------------------------------------------------------

test('imenikTakesEveryHolderAndOwnerOfASheetAndDropsNamesWithoutLetters', () => {
  const parcel = Parcels.parcel(7, '1655/3', '334723-1655/3', 61, []);
  const record = {
    number: '1655/3', municipality: 'KUKLJICA', municipalityNumber: '334723', address: 'ŽAVRH', areaM2: '61', uses: [],
    sheets: [{ number: '1984', owners: [{ name: ' JAŠA ANICA ', share: '1/1', address: 'KUKLJICA' }, { name: '---', share: '', address: '' }] }],
    landBooks: [],
  };
  const folio = {
    unit: '182', book: 'KUKLJICA', office: 'Zadar', kind: 'glavna', lastDiary: '', pending: 0,
    shares: [{ title: '1. Suvlasnički dio: 1/2', owners: [{ name: 'JAŠA ANICA POK. JOSE', share: '1/2', address: '' }], entries: [] }],
    parcels: ['1655/3'], burdens: [], bookId: '',
  };
  const e = OwnerBook.entriesOf(parcel, record, [folio]);
  assert.deepEqual(e.map((x) => x.name), ['JAŠA ANICA', 'JAŠA ANICA POK. JOSE']);
  assert.deepEqual(e.map((x) => x.role), [OwnerBook.Role.POSJEDNIK, OwnerBook.Role.VLASNIK]);
  assert.equal(e[0].detail, 'p.l. 1984');
  assert.equal(e[1].detail, 'z.k.ul. 182 · 1/2');
  assert.ok(e.every((x) => x.reference === '334723-1655/3' && x.municipalityName === 'KUKLJICA'));
});

test('imenikReplacesWhatAParcelSaidBeforeSoASaleDropsTheSeller', () => {
  const before = [entry('SELLER IVO', '334723-1'), entry('OTHER ANA', '334723-2')];
  const after = OwnerBook.add(before, [entry('BUYER MARA', '334723-1'), entry('BUYER MARA', '334723-1')]);
  assert.deepEqual(after.map((e) => e.name), ['BUYER MARA', 'OTHER ANA']);
  assert.equal(OwnerBook.add(before, []).length, 2);
  assert.equal(OwnerBook.add(before, [entry('X', '334723-9')], 1).length, 1);
});

test('imenikFindsANameByAnyWordsWithoutDiacritics', () => {
  const book = [entry('JAŠA ANICA POK. JOSE', '334723-1'), entry('ANIĆ JOSIP', '334723-2'), entry('JAŠA ANICA POK. JOSE', '334723-1')];
  assert.deepEqual(OwnerBook.search(book, 'anica jasa').map((e) => e.name), ['JAŠA ANICA POK. JOSE']);
  assert.equal(OwnerBook.search(book, 'ani')[0].name, 'ANIĆ JOSIP');
  assert.equal(OwnerBook.search(book, 'ani').length, 2);
  assert.equal(OwnerBook.search(book, 'a').length, 0);
  assert.equal(OwnerBook.search(book, 'marko').length, 0);
});

test('imenikSurvivesThePhoneAndAHitOpensTheParcel', () => {
  const book = [entry('NAME | WITH BAR', '334723-1655/3', OwnerBook.Role.VLASNIK, 'z.k.ul. 182 · 1/2')];
  const back = OwnerBook.decode(OwnerBook.encode(book));
  assert.equal(back.length, 1);
  assert.equal(back[0].name, 'NAME / WITH BAR');
  assert.equal(back[0].role, OwnerBook.Role.VLASNIK);
  assert.equal(back[0].reference, '334723-1655/3');
  assert.equal(OwnerBook.decode('').length, 0);
  const hit = OwnerBook.hit(back[0]);
  assert.equal(hit.id, '7');
  assert.equal(hit.ref, '334723-1655/3');
  assert.equal(hit.under, '1655/3 · k.o. KUKLJICA · vlasnik · z.k.ul. 182 · 1/2');
});

// --- ParcelStyle ---------------------------------------------------------------------------------

test('theLinesKeepTheirOwnAlphaScaledAndTakeTheInk', () => {
  const px = [0x00000000, 0xFF000000, 0x80000000];
  const out = Style.restyle(px, 3, 1, 0xFFEF4444, Style.lines(null, 50));
  assert.equal(out[0], 0);
  assert.equal(out[1], ((127 << 24) | 0xEF4444) >>> 0);
  assert.equal(out[2], ((64 << 24) | 0xEF4444) >>> 0);
  assert.equal(Style.ink(Style.lines(), 0xFF15171A), 0xFF15171A);
  assert.equal(Style.ink(Style.lines(0xFFFFFFFF), 0xFF15171A), 0xFFFFFFFF);
});

test('fineKeepsTheCoreOfALineAndBoldGrowsIt', () => {
  const a = [0, 0, 255, 255, 255, 0, 0];
  assert.deepEqual(Style.fine(a, 7, 1), [0, 0, 89, 255, 89, 0, 0]);
  assert.deepEqual(Style.bold(a, 7, 1), [0, 255, 255, 255, 255, 255, 0]);
});

test('aStyleIsRememberedAndEveryStyleIsItsOwnSetOfTiles', () => {
  const l = Style.lines(0xFFFACC15, 35, Style.Weight.FINE);
  assert.deepEqual(Style.decode(Style.encode(l)), l);
  assert.deepEqual(Style.decode(null), Style.lines());
  assert.deepEqual(Style.decode(Style.encode(Style.lines())), Style.lines());
  const keys = [
    Style.key(0xFF15171A, Style.lines()),
    Style.key(0xFF15171A, Style.lines(null, 35)),
    Style.key(0xFF15171A, Style.lines(null, 62, Style.Weight.BOLD)),
    Style.key(0xFFF2DDB4, Style.lines()),
  ];
  assert.equal(new Set(keys).size, keys.length);
});

test('theCanvasRestyleIsThePixelRestyleOnRgbaBytes', () => {
  // Web only: the RGBA path the browser runs gives the same pixels as the ARGB reference.
  const px = [0x00000000, 0xFF000000, 0x80000000, 0xFF000000, 0x00000000];
  for (const w of [Style.Weight.FINE, Style.Weight.NORMAL, Style.Weight.BOLD]) {
    const l = Style.lines(null, 62, w);
    const ref = Style.restyle(px, 5, 1, 0xFFEF4444, l);
    const data = new Uint8ClampedArray(px.flatMap((p) => [0, 0, 0, (p >>> 24) & 0xFF]));
    Style.restyleRGBA(data, 5, 1, 0xFFEF4444, l);
    const got = [];
    for (let i = 0; i < 5; i++) {
      const a = data[i * 4 + 3];
      got.push(a === 0 ? 0 : (((a << 24) | (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2]) >>> 0));
    }
    assert.deepEqual(got, ref, w);
  }
});

// --- ParcelCache ---------------------------------------------------------------------------------

test('aCacheFindsHisGrandmotherByNameWithoutDiacritics', () => {
  const c = cacheOf(baka, { ...baka, id: 12, number: '2451', reference: '334723-2451', holders: [] });
  const hits = Cache.search([c], 'anica jasa');
  assert.deepEqual(hits.map((h) => h.title), ['JAŠA ANICA', 'JAŠA ANICA POK. JOSE']);
  assert.ok(hits.every((h) => h.ref === '334723-2450' && h.lat != null));
  assert.ok(hits[0].under.includes('k.o. KUKLJICA'));
  assert.ok(hits[0].under.endsWith('Kukljica 30.9.2026'));
  assert.equal(Cache.search([c], 'marko').length, 0);
});

test('aCacheFindsByNumberSheetAddressAndUse', () => {
  const c = cacheOf(baka, { ...baka, id: 12, number: '2451', reference: '334723-2451', holders: [], address: '', uses: [] });
  assert.deepEqual(Cache.search([c], '245').map((h) => h.title), ['2450', '2451']);
  assert.deepEqual(Cache.search([c], 'pl 657').map((h) => h.title), ['2450']);
  assert.deepEqual(Cache.search([c], 'maslinik').map((h) => h.title), ['2450']);
  assert.deepEqual(Cache.search([c], 'drage').map((h) => h.title), ['2450']);
});

test('aTapInsideACachedParcelFindsItAndAHiddenCacheIsNotTapped', () => {
  const c = cacheOf(baka);
  assert.equal(Cache.at([c], 44.0005, 15.0005)?.number, '2450');
  assert.equal(Cache.at([c], 44.002, 15.0005), null);
  assert.equal(Cache.at([{ ...c, info: { ...c.info, visible: false } }], 44.0005, 15.0005), null);
  assert.equal(Cache.byReference([c], '334723-2450')?.number, '2450');
});

test('aCacheSurvivesThePhone', () => {
  const c = cacheOf(baka);
  const inf = { ...c.info, colour: 0xFF34D399, style: Parcels.LineStyle.DOTTED, weight: 'BOLD', visible: false, count: 1, read: 1, places: 'KUKLJICA' };
  assert.deepEqual(Cache.decodeInfo(Cache.encodeInfo(inf)), inf);
  const back = Cache.decodeItems(Cache.encodeItems(c.items));
  assert.equal(back.length, 1);
  assert.deepEqual(back[0], baka);
  assert.equal(Cache.decodeInfo('not json'), null);
  assert.equal(Cache.decodeItems('not json').length, 0);
});

test('theWfsAnswerGivesParcelsWithTheirNumberPoints', () => {
  const json = `{"numberMatched":2224,"features":[{"id":"x","geometry":{"type":"Polygon","coordinates":[[[15.0,44.0],[15.001,44.0],[15.001,44.001],[15.0,44.0]]]},
    "properties":{"inspireId":{"localId":"CP.10480898"},"label":"154/1","nationalCadastralReference":"334723-154/1","areaValue":{"value":501},
    "referencePoint":{"type":"Point","coordinates":[15.24486571,44.03344363]}}}]}`;
  const all = Cache.parseFeatures(json);
  assert.equal(all.length, 1);
  const [p, point] = all[0];
  assert.equal(p.id, 10480898);
  assert.equal(p.number, '154/1');
  assert.deepEqual(point, [44.03344363, 15.24486571]);
  assert.equal(Cache.matched(json), 2224);
});

test('aTileIsWhereTheMapPutsItAndItsPixelsAgree', () => {
  const z = 18;
  const x = Geo.tileX(15.253, z), y = Geo.tileY(44.036, z);
  const b = Cache.tileBox(z, x, y);
  assert.ok(Cache.boxContains(b, 44.036, 15.253));
  const [px, py] = Cache.pixel(b.north, b.west, z, x, y, 512);
  near(px, 0, 0.01); near(py, 0, 0.01);
  const [qx, qy] = Cache.pixel(b.south, b.east, z, x, y, 512);
  near(qx, 512, 0.01); near(qy, 512, 0.01);
});

test('aCacheIsNamedAfterItsPlaceAndDay', () => {
  assert.equal(Cache.defaultName('KUKLJICA', '30.9.2026'), 'Kukljica 30.9.2026');
  assert.equal(Cache.defaultName('', '30.9.2026'), '30.9.2026');
  assert.equal(Cache.places([baka, baka, { ...baka, municipalityName: 'PREKO' }]), 'KUKLJICA, PREKO');
});

test('theJobsStatusLineSaysStageCountRateTimeLeftAndFailures', () => {
  // Web only: the line ParcelCaches.Progress writes, the same words.
  assert.equal(Cache.progressLine({ name: 'Punta', stage: 'posjedovni listovi', done: 30, total: 127, failed: 2, perSecond: 6, finished: false }),
    'cache "Punta": posjedovni listovi 30/127 · 6.0/s · ~16 s left · 2 failed');
  assert.equal(Cache.progressLine({ name: 'Punta', stage: 'x', done: 0, total: 3000, failed: 0, perSecond: 1, finished: false }),
    'cache "Punta": x 0/3000 · 1.0/s · ~50 min left');
  assert.equal(Cache.TRIES, 8);
  assert.ok(Cache.WAITS.reduce((a, b) => a + b, 0) >= 240, 'about five minutes of waiting');
});

// --- MarkFile ------------------------------------------------------------------------------------

test('aGroupGoesOutAsAFileAndComesBackUnderTheFilesName', () => {
  const g = MarkFile.group('Obitelj Boško', 0xFFE040FB, Parcels.LineStyle.DOTTED, 'BOLD');
  const marks = [
    M('334723-2449/2', '2449/2', 0, [ring], 99, Parcels.LineStyle.DASHED, 'baka Ivana', 'Obitelj Boško'),
    M('334723-529/4', '529/4', 0, [], 98, Parcels.LineStyle.DASHED, '', 'Obitelj Boško'),
  ];
  const text = MarkFile.encode(g, marks);
  const read = MarkFile.decode(text, 'Obitelj Boško (1).arkod.json');
  assert.equal(read.group.name, 'Obitelj Boško (1)');
  assert.equal(read.group.colour, 0xFFE040FB);
  assert.equal(read.group.style, Parcels.LineStyle.DOTTED);
  assert.equal(read.group.weight, 'BOLD');
  assert.deepEqual(read.marks.map((m) => m.number), ['2449/2', '529/4']);
  assert.ok(read.marks.every((m) => m.group === 'Obitelj Boško (1)' && m.colour === 0xFFE040FB && m.style === Parcels.LineStyle.DOTTED));
  assert.deepEqual(read.marks[0].rings, [ring]);
  assert.equal(read.marks[0].name, 'baka Ivana');
  assert.equal(MarkFile.decode(text, null).group.name, 'Obitelj Boško');
  assert.equal(MarkFile.decode('{"kind":"other"}', 'x.json'), null);
  assert.equal(MarkFile.decode('not json', 'x.json'), null);
  assert.equal(MarkFile.fileName('Obitelj Boško'), 'Obitelj Boško.arkod.json');
  assert.equal(MarkFile.fileName('a/b'), 'a b.arkod.json');
});

test('aFileReplacesItsOwnGroupAndTakesItsParcelsFromOthers', () => {
  const mine = M('334723-1', '1', 1, []);
  const moving = M('334723-2', '2', 1, []);
  const old = M('334723-3', '3', 1, [], 0, Parcels.LineStyle.DASHED, '', 'Obitelj');
  const read = { group: MarkFile.group('Obitelj'), marks: [{ ...moving, group: 'Obitelj' }] };
  const [marks, groups] = MarkFile.importInto([mine, moving, old], [], read);
  assert.deepEqual(marks.map((m) => [m.reference, m.group]), [['334723-1', ''], ['334723-2', 'Obitelj']]);
  assert.deepEqual(groups.map((g) => g.name), ['Obitelj']);
});

test('aGroupsLookIsEveryOneOfItsParcelsAndSurvivesThePhone', () => {
  const g = MarkFile.group('Obitelj', 0xFF60A5FA, Parcels.LineStyle.SOLID, 'FINE', false);
  const m = [M('334723-1', '1', 1, [], 0, Parcels.LineStyle.DASHED, '', 'Obitelj'), M('334723-2', '2', 1, [])];
  const r = MarkFile.restyle(m, g);
  assert.equal(r[0].colour, 0xFF60A5FA);
  assert.equal(r[0].weight, 'FINE');
  assert.equal(r[1].colour, 1);
  assert.deepEqual(MarkFile.decodeGroups(MarkFile.encodeGroups([g])), [g]);
  assert.deepEqual(MarkFile.groupsIn(m, [g]).map((x) => x.name), ['', 'Obitelj']);
  const back = Parcels.decode(Parcels.encode(r))[0];
  assert.equal(back.group, 'Obitelj');
  assert.equal(back.weight, 'FINE');
});

test('aFileMadeOnAnAndroidPhoneOpensHere', () => {
  // Web only: the exact shape FEATURES.md gives, as MarkFile.kt writes it (JSONObject.toString(1)).
  const android = `{
 "kind": "arkod-moje-cestice",
 "version": 1,
 "app": "ARKOD Layer",
 "name": "Obitelj Boško",
 "colour": "ffe040fb",
 "style": "SOLID",
 "weight": "FINE",
 "parcels": [{
  "ref": "334723-2449/2",
  "number": "2449/2",
  "id": 6434350,
  "rings": [[44.036, 15.253, 44.036, 15.254, 44.037, 15.254]]
 }]
}`;
  const read = MarkFile.decode(android, 'Obitelj Boško.arkod.json');
  assert.equal(read.marks.length, 1);
  assert.equal(read.marks[0].id, 6434350);
  assert.deepEqual(read.marks[0].rings[0], [[44.036, 15.253], [44.036, 15.254], [44.037, 15.254]]);
  assert.equal(read.group.weight, 'FINE');
});

// --- Outline -------------------------------------------------------------------------------------

function framedPicture() {
  const w = 60, h = 40;
  const wall = new Uint8Array(w * h);
  for (let x = 10; x <= 50; x++) { wall[5 * w + x] = 1; wall[35 * w + x] = 1; }
  for (let y = 5; y <= 35; y++) { wall[y * w + 10] = 1; wall[y * w + 50] = 1; }
  for (let x = 28; x <= 32; x++) for (let y = 18; y <= 22; y++) wall[y * w + x] = 1;
  return [wall, w, h];
}

test('theFillStaysInsideTheLinesAndGoesRoundTheNumber', () => {
  const [wall, w, h] = framedPicture();
  const inside = Outline.fill(wall, w, h, 15, 10);
  assert.equal(inside.reduce((s, v) => s + v, 0), 39 * 29 - 25);
  assert.equal(inside[20 * w + 30], 0);
  assert.equal(inside[2 * w + 2], 0);
});

test('aFillThatReachesTheEdgeIsNotAParcel', () => {
  const [wall, w, h] = framedPicture();
  assert.equal(Outline.fill(wall, w, h, 2, 2), null);
  wall[5 * w + 30] = 0;
  assert.equal(Outline.fill(wall, w, h, 15, 10), null);
});

test('aTapOnTheLineStartsFromTheNearestOpenPixel', () => {
  const [wall, w, h] = framedPicture();
  const [x, y] = Outline.nearestOpen(wall, w, h, 30, 20);
  assert.equal(wall[y * w + x], 0);
});

test('theOutlineIsTheFourCornersOfTheFrame', () => {
  const [wall, w, h] = framedPicture();
  const inside = Outline.fill(wall, w, h, 15, 10);
  const edge = Outline.trace(Outline.grow(inside, w, h, 1), w, h);
  const corners = Outline.simplify(edge, 1.2);
  assert.equal(corners.length, 4);
  assert.ok(corners.every(([x, y]) => (x === 10 || x === 50) && (y === 5 || y === 35)));
});

test('aSlantedSideIsKeptAsOneStraightEdge', () => {
  const w = 50, h = 50;
  const wall = new Uint8Array(w * h);
  for (let i = 5; i <= 45; i++) { wall[45 * w + i] = 1; wall[i * w + 5] = 1; wall[i * w + i] = 1; }
  const inside = Outline.fill(wall, w, h, 10, 40);
  const corners = Outline.simplify(Outline.trace(Outline.grow(inside, w, h, 1), w, h), 1.5);
  assert.equal(corners.length, 3);
});

test('mercatorThereAndBackIsTheSamePlace', () => {
  near(Outline.latOf(Outline.mercY(44.0368)), 44.0368, 1e-9);
  near(Outline.lonOf(Outline.mercX(15.2279)), 15.2279, 1e-9);
});

test('theTracedCornersBecomeLatitudeAndLongitudeInsideTheBox', () => {
  const [wall, w, h] = framedPicture();
  const b = Outline.box(44.0368, 15.2279, 60.0);
  const lat = Outline.latOf(b[3] - 10.5 * (b[3] - b[1]) / h);
  const lon = Outline.lonOf(b[0] + 15.5 * (b[2] - b[0]) / w);
  const r = Outline.parcelAt(wall, w, h, b, lat, lon);
  assert.equal(r.length, 4);
  assert.ok(r.every(([a, o]) => a >= 44.0364 && a <= 44.0372 && o >= 15.2274 && o <= 15.2284));
  assert.ok(Parcels.contains(r, lat, lon));
});
