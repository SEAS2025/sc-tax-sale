"use strict";

/**
 * Tests for the out-of-state tracks (Haywood NC, Coconino/Mohave AZ).
 *
 * Kept in its own file so engine/test.js — which asserts exactly 46 South
 * Carolina counties — is untouched.
 *
 *   node --test engine/test-out-of-state.js
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tbl = require("./out-of-state-tables");
const oosIds = require("./out-of-state-ids");
const oos = require("./out-of-state");
const oosPdf = require("./out-of-state-pdf");
const registry = require("./registry");

const ROOT = path.join(__dirname, "..");

/**
 * Owner names that really do appear in the cached Haywood advertisements.
 * No artifact this repo generates may contain any of them.
 *
 * The column *heading* "LIABLE OWNER" is deliberately not in this list: the
 * findings document and the PDF both name the heading to explain that the
 * column is dropped. What must never appear is a heading or name sitting next
 * to a parcel, which is asserted separately.
 */
const CACHED_OWNER_STRINGS = [
  "LEMING",
  "1 WORLD INVESTMENTS",
  "2325 ASHFORD CT INVESTMENT LLC",
  "WARREN, CAROLYN ELAINE",
  "WHITNER",
  "DARCHE",
  "JANICE ROGERS",
];

/** A faithful miniature of the Haywood table: pseudo-header, header, owner col. */
function haywoodFixture() {
  return `
  <table class="table-asset">
    <thead><tr><th>Field 1</th><th>Field 2</th><th>Field 3</th></tr></thead>
    <tbody>
      <tr><th>LIABLE OWNER</th><td>PARCEL</td><td>AMOUNT</td></tr>
      <tr><th>1 WORLD INVESTMENTS</th><td>7697862224</td><td>$311.31 </td></tr>
      <tr><th>2325 ASHFORD CT INVESTMENT LLC</th><td>8614733009</td><td>$3,539.14 </td></tr>
      <tr><th>LEMING, JANICE ROGERS/EXR</th><td>8710321562</td><td>$275.35 </td></tr>
      <tr><th>SOME HEIRS ETAL</th><td>8657707563</td><td>$1,387.13 </td></tr>
    </tbody>
  </table>`;
}

/** A faithful miniature of the 2017 advertisement PDF text layout. */
function advertisementFixture() {
  return [
    "  Liable Owner               Parcel       Amount       Liable Owner                     Parcel       Amount",
    "  WARREN, CAROLYN ELAINE     8644976730   $817.92      WHITNER, WILLIE FRANK            7694779627   $261.38",
    "  WARREN, CHARLENE G         8634612289   $889.10      WHITTEN, MISTI F                 8654171925   $158.38",
    "  DARCHE, TODD R             7688979377 (subd.)   $301.62   WILSON, T W                 8657608249   $662.76",
  ].join("\n");
}

test("out-of-state registry is separate from the 46 South Carolina counties", () => {
  const sc = registry.loadSc();
  assert.equal(sc.counties.length, 46, "South Carolina registry must stay at 46 counties");

  const extra = JSON.parse(fs.readFileSync(path.join(ROOT, "counties", "out-of-state.json"), "utf8"));
  const scIds = new Set(sc.counties.map((c) => c.id));
  const scFips = new Set(sc.counties.map((c) => c.fips));
  for (const county of extra.counties) {
    assert.ok(!scIds.has(county.id), county.id + " must not collide with an SC county id");
    assert.ok(!scFips.has(county.fips), county.fips + " must not collide with an SC FIPS code");
    assert.equal(county.inScPricing, false, county.id + " must be excluded from SC pricing");
    assert.ok(["NC", "AZ"].includes(county.state));
    for (const row of county.candidateUrls) {
      assert.ok(/^https:\/\//.test(row.url), "candidate URLs must be https: " + row.url);
    }
  }
  const ids = extra.counties.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "out-of-state ids must be unique");
});

/* ------------------------------------------------- structural table reading */

test("the HTML reader finds the real header under the Field 1/2/3 pseudo-header", () => {
  const rows = tbl.parseTables(haywoodFixture())[0];
  const header = tbl.findHeaderRow(rows);
  assert.equal(header.index, 1, "the real header is the row below the pseudo-header");
  assert.deepEqual(header.cells, ["LIABLE OWNER", "PARCEL", "AMOUNT"]);
  assert.equal(header.map.parcel, 1);
  assert.equal(header.map.amount, 2);
  assert.equal(header.map.owner, 0, "the owner column is located so it can be dropped");
});

test("the unhyphenated 10-digit Haywood PIN is read from the PARCEL column with its amount", () => {
  const got = tbl.readParcelTables(haywoodFixture(), "NC");
  assert.equal(got.rowCount, 4);
  assert.deepEqual(got.ids, ["7697862224", "8614733009", "8710321562", "8657707563"]);
  assert.equal(got.amounts["7697862224"], 311.31);
  assert.equal(got.amounts["8614733009"], 3539.14);
  assert.equal(got.droppedOwnerColumn, true);
});

test("no owner value survives the table reader", () => {
  const got = tbl.readParcelTables(haywoodFixture(), "NC");
  const blob = JSON.stringify(got).toUpperCase();
  for (const owner of CACHED_OWNER_STRINGS) {
    if (owner === "LIABLE OWNER") continue; // header text is allowed in the headers echo
    assert.ok(!blob.includes(owner.toUpperCase()), owner + " must not survive extraction");
  }
  for (const row of got.rows) {
    assert.deepEqual(Object.keys(row).sort(), ["amount", "parcel"]);
  }
});

test("the reader refuses a column that is not actually parcels", () => {
  const html = `<table>
    <tbody>
      <tr><th>NAME</th><td>PARCEL</td><td>AMOUNT</td></tr>
      <tr><th>A</th><td>call 828-452-6629</td><td>$10.00</td></tr>
      <tr><th>B</th><td>n/a</td><td>$11.00</td></tr>
      <tr><th>C</th><td>see notice</td><td>$12.00</td></tr>
      <tr><th>D</th><td>none</td><td>$13.00</td></tr>
    </tbody></table>`;
  assert.equal(tbl.readParcelTables(html, "NC").rowCount, 0);
});

test("a bid notice with no PARCEL column yields nothing instead of guessing", () => {
  const html = "<table><tbody><tr><td>Bid Title:</td><td>Tax Foreclosure Sale September 17 2026</td></tr>"
    + "<tr><td>Closing Date/Time:</td><td>9/17/2026 10:15 AM</td></tr></tbody></table>";
  assert.equal(tbl.readParcelTables(html, "NC").rowCount, 0);
});

test("a date-like 10-digit run is not accepted as an NC grid PIN", () => {
  assert.equal(tbl.normalizeParcel("2026031500", "NC"), null);
  assert.equal(tbl.normalizeParcel("8614733009", "NC"), "8614733009");
});

test("a hyphenated PIN and a stripped PIN normalize to the same canonical key", () => {
  assert.equal(tbl.normalizeParcel("8614-73-3009", "NC"), "8614733009");
  assert.equal(tbl.normalizeParcel("8614733009", "NC"), "8614733009");
  assert.equal(tbl.normalizeParcel(" 8614 73 3009 ", "NC"), "8614733009");
});

test("Arizona APNs normalize with and without hyphens", () => {
  assert.equal(tbl.normalizeParcel("101-01-001", "AZ"), "10101001");
  assert.equal(tbl.normalizeParcel("30125123A", "AZ"), "30125123A");
  assert.equal(tbl.normalizeParcel("400-12-345.002", "AZ"), "40012345.002");
  assert.equal(tbl.normalizeParcel("8614733009", "AZ"), null, "an NC PIN is not an AZ APN");
});

/* ------------------------------------------- columnar advertisement reading */

test("the newspaper-column reader takes parcel and amount from each column group", () => {
  const got = tbl.readColumnarText(advertisementFixture(), "NC");
  assert.equal(got.groups, 2);
  assert.equal(got.droppedOwnerColumn, true);
  assert.ok(got.ids.includes("8644976730"));
  assert.ok(got.ids.includes("7694779627"));
  assert.ok(got.ids.includes("7688979377"), "a (subd.) parcel is still read");
  assert.equal(got.amounts["8644976730"], 817.92);
  assert.equal(got.amounts["7688979377"], 301.62);
});

test("the columnar reader returns no owner text", () => {
  const got = tbl.readColumnarText(advertisementFixture(), "NC");
  const blob = JSON.stringify(got).toUpperCase();
  for (const owner of ["WARREN", "WHITNER", "DARCHE", "MISTI"]) {
    assert.ok(!blob.includes(owner), owner + " must not survive the columnar reader");
  }
});

test("prose about tax liens yields no parcels without a column header", () => {
  const prose = "I am hereby advertising tax liens for the year 2017 upon real estate described below. "
    + "Call 8284526629 for the amount 1234567890 total.";
  assert.equal(tbl.readColumnarText(prose, "NC").rowCount, 0);
});

/* ---------------------------------------------------- year sets and spans */

function haywoodLikeState() {
  const mk = (n, start) => Array.from({ length: n }, (_v, i) => String(8600000000 + start + i));
  const y2017 = mk(60, 0);
  const y2022 = mk(50, 0).concat(mk(10, 900));
  const y2025 = mk(30, 0).concat(mk(10, 5000));
  return {
    lists: [
      { taxYear: 2017, advertisedYear: 2018, rowCount: 60, idCount: 60, ids: y2017, amounts: { [y2017[0]]: 817.92 }, url: "https://example.gov/2017a", reader: "pdf-columns" },
      { taxYear: 2017, advertisedYear: 2018, rowCount: 30, idCount: 30, ids: mk(30, 0), amounts: {}, url: "https://example.gov/2017b", reader: "pdf-columns" },
      { taxYear: 2022, advertisedYear: 2023, rowCount: 60, idCount: 60, ids: y2022, amounts: { [y2022[0]]: 59.6 }, url: "https://example.gov/2022", reader: "html-table" },
      { taxYear: 2025, advertisedYear: 2026, rowCount: 40, idCount: 40, ids: y2025, amounts: {}, url: "https://example.gov/2025", reader: "html-table" },
    ],
  };
}

test("files from the same tax year are unioned, not paired against each other", () => {
  const years = oos.buildYearSets(haywoodLikeState());
  assert.deepEqual(Object.keys(years).map(Number).sort(), [2017, 2022, 2025]);
  assert.equal(years[2017].files.length, 2, "both 2017 pages belong to one tax year");
  assert.equal(years[2017].idCount, 60, "the second 2017 page adds no new parcels");
  assert.equal(years[2017].rowCount, 90);
});

test("every intersection is labelled with its true year span", () => {
  const years = oos.buildYearSets(haywoodLikeState());
  const rows = oos.intersectYears(years);
  const byPair = Object.fromEntries(rows.map((r) => [r.from + "x" + r.to, r]));
  assert.equal(byPair["2022x2025"].span, 3, "2022 against 2025 is three tax years, not five");
  assert.equal(byPair["2017x2022"].span, 5);
  assert.equal(byPair["2017x2025"].span, 8);
  assert.equal(byPair["2017x2022"].count, 50);
  assert.equal(byPair["2022x2025"].count, 30);
});

test("the headline prefers a true five-year span and says so", () => {
  const years = oos.buildYearSets(haywoodLikeState());
  const headline = oos.pickHeadline(oos.intersectYears(years));
  assert.equal(headline.span, 5);
  assert.equal(headline.from, 2017);
  assert.equal(headline.to, 2022);
  assert.equal(headline.isFiveYear, true);
  assert.match(headline.label, /five-year/);
});

test("a three-year gap is never labelled five-year", () => {
  const state = { lists: haywoodLikeState().lists.filter((row) => row.taxYear !== 2017) };
  const headline = oos.pickHeadline(oos.intersectYears(oos.buildYearSets(state)));
  assert.equal(headline.span, 3);
  assert.equal(headline.isFiveYear, false);
  assert.match(headline.label, /3-year repeat-delinquent/);
  assert.ok(!/five/i.test(headline.label));
});

test("pairing reports a plain reason instead of inventing a pair", () => {
  assert.match(oos.pairCounty({ lists: [] }).reason, /no list with a readable parcel column/);
  const single = { lists: [haywoodLikeState().lists[2]] };
  assert.match(oos.pairCounty(single).reason, /only one tax year/);
});

test("span wording never overstates the gap", () => {
  assert.equal(oos.spanLabel(1), "one tax year apart");
  assert.equal(oos.spanLabel(3), "3 tax years apart");
  assert.equal(oos.spanLabel(5), "5 tax years apart");
});

/* ------------------------------------------------------------------- PDF */

function pdfSnapshot(span) {
  const from = span === 5 ? 2017 : 2022;
  return {
    season: 2026,
    generatedAt: "2026-09-16T00:00:00.000Z",
    span,
    isFiveYear: span === 5,
    source: "Official G.S. 105-369 tax-lien advertisements for Haywood County, North Carolina.",
    counties: [{
      id: "haywood-nc",
      name: "Haywood",
      stateCode: "NC",
      fips: "37087",
      noAcreage: true,
      span,
      isFiveYear: span === 5,
      readableYears: [2017, 2022, 2023, 2025],
      allYears: { years: [2017, 2022, 2023, 2025], count: 1 },
      recent: { year: 2022, url: "https://example.gov/2022", idCount: 60 },
      historic: { year: from, url: "https://example.gov/" + from, idCount: 60 },
      bothCount: 3,
      both: [
        { tms: "8644976730", amountRecent: 900, amountHistoric: 817.92, advertisedYears: [2017, 2022] },
        { tms: "8614733009", amountRecent: 3539.14, amountHistoric: 200, advertisedYears: [2017, 2022, 2023, 2025] },
        { tms: "8710321562", amountRecent: 275.35, amountHistoric: 100, advertisedYears: [2017, 2022, 2023] },
      ],
    }],
  };
}

test("the PDF file name states the real span and never overstates it", () => {
  assert.equal(oosPdf.fileNameFor(pdfSnapshot(5)), "Haywood-NC-5-year-delinquent.pdf");
  assert.equal(oosPdf.fileNameFor(pdfSnapshot(3)), "Haywood-NC-3-year-repeat-delinquent.pdf");
  const scPdf = require("./export-repeat-pdf");
  assert.notEqual(path.basename(scPdf.defaultDest()), oosPdf.fileNameFor(pdfSnapshot(5)));
});

test("no acreage column or acreage claim appears when the source has no acreage", () => {
  const snapshot = pdfSnapshot(5);
  const rows = oosPdf.buildRows(snapshot);
  assert.equal(oosPdf.hasAcreage(rows), false);
  const cols = oosPdf.visibleColumns(rows, false);
  assert.ok(!cols.some((col) => col.id === "acres"), "no acres column without acreage in the source");
  const html = oosPdf.renderHtml(snapshot, rows, { counties: {} });
  assert.ok(!/1–6 ac/.test(html), "no 1-6 acre highlight legend without acreage");
  assert.match(html, /publishes no acreage/);
});

test("without acreage the highlight falls on the most persistent parcels", () => {
  const rows = oosPdf.buildRows(pdfSnapshot(5));
  const sorted = oosPdf.sortRows(rows, false);
  assert.equal(sorted[0].tms, "8614733009", "the parcel advertised every year sorts first");
  assert.equal(oosPdf.isHighlightRow(sorted[0], false), true);
  assert.equal(oosPdf.isHighlightRow(rows.find((r) => r.tms === "8644976730"), false), false);
});

test("the PDF cover states the true span", () => {
  const five = oosPdf.renderHtml(pdfSnapshot(5), oosPdf.buildRows(pdfSnapshot(5)), { counties: {} });
  assert.match(five, /Five-year delinquent file/);
  const three = oosPdf.renderHtml(pdfSnapshot(3), oosPdf.buildRows(pdfSnapshot(3)), { counties: {} });
  assert.match(three, /Three-year repeat-delinquent file/);
  assert.ok(!/Five-year/.test(three), "a three-year pair must not print as five-year");
});

test("the PDF renderer refuses owner-shaped text", () => {
  assert.throws(() => oosPdf.assertNoOwners("<td>WARREN, CAROLYN ELAINE</td><td>8644976730</td>"), /owner-shaped/);
  assert.throws(() => oosPdf.assertNoOwners('<td>{"owner":"x"}</td>'), /owner fields/);
  assert.throws(() => oosPdf.assertNoOwners("<td>ASHFORD CT INVESTMENT LLC 8614733009</td>"), /owner next to a parcel/);
});

/* ------------------------------------------------------- generated artifacts */

test("no cached owner string appears in any generated artifact", () => {
  const snapshot = pdfSnapshot(5);
  const html = oosPdf.renderHtml(snapshot, oosPdf.buildRows(snapshot), { counties: {} });

  const reg = oos.loadRegistry();
  const state = {
    phases: {},
    land: [],
    counties: {
      "haywood-nc": {
        id: "haywood-nc",
        name: "Haywood",
        stateCode: "NC",
        verified: [{ url: "https://www.haywoodcountync.gov/274/Tax-Collections", role: "office", status: 200, bytes: 130030, via: "fetch" }],
        unreachable: [],
        lists: haywoodLikeState().lists.map((row) => ({ ...row, source: "test", status: 200, via: "fetch", looseTokens: null })),
        wayback: { queried: [], errors: [{ key: "themountaineer.com|delinquent", error: "Internet Archive is temporarily offline (service-wide outage)" }] },
      },
      "coconino-az": {
        id: "coconino-az",
        name: "Coconino",
        stateCode: "AZ",
        verified: [],
        unreachable: [],
        lists: [{ taxYear: null, rowCount: 0, idCount: 0, looseTokens: 0, reader: "html-table", source: "registry:docs", status: 200, via: "playwright" }],
        wayback: { queried: [], errors: [] },
      },
    },
  };
  oos.pairAll(reg, state, null);
  const tmp = path.join(os.tmpdir(), "oos-artifact-test-" + process.pid);
  fs.mkdirSync(tmp, { recursive: true });
  const docPath = oos.writeDoc(reg, state, path.join(tmp, "OUT_OF_STATE.md"));
  const doc = fs.readFileSync(docPath, "utf8");
  const stateBlob = JSON.stringify(state);

  for (const [label, artifact] of [["pdf html", html], ["findings doc", doc], ["state json", stateBlob]]) {
    for (const owner of CACHED_OWNER_STRINGS) {
      assert.ok(
        !artifact.toUpperCase().includes(owner.toUpperCase()),
        "owner string " + JSON.stringify(owner) + " leaked into the " + label
      );
    }
    assert.ok(
      !/[A-Z]{3,}\s*,\s*[A-Z]{3,}[^\n]{0,40}\b\d{10}\b/.test(artifact),
      "an owner-shaped name sits next to a parcel in the " + label
    );
    assert.ok(
      !/\b(?:LLC|INC|HEIRS|ETAL|EXR)\b[^\n]{0,24}\b\d{10}\b/.test(artifact),
      "a company name sits next to a parcel in the " + label
    );
    assert.ok(
      !/LIABLE\s+OWNER[^\n]{0,24}\b\d{10}\b/i.test(artifact),
      "the dropped column heading appears as a data row in the " + label
    );
  }
  assert.ok(!/\|\s*[A-Z]{3,}\s*,\s*[A-Z]{3,}[^|\n]*\|/.test(doc), "the doc must never print an owner table cell");
  assert.ok(!/\b(?:LLC|INC|HEIRS|ETAL|EXR)\b[^\n]{0,24}\b\d{10}\b/.test(doc), "no company name may sit next to a parcel");
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("the findings document reports true spans, the AZ zero, and the archive outage", () => {
  const reg = oos.loadRegistry();
  const state = {
    phases: {},
    land: [],
    counties: {
      "haywood-nc": {
        id: "haywood-nc",
        name: "Haywood",
        stateCode: "NC",
        verified: [],
        unreachable: [],
        lists: haywoodLikeState().lists.map((row) => ({ ...row, source: "test", status: 200, via: "fetch" })),
        wayback: { queried: [], errors: [{ key: "themountaineer.com|delinquent", error: "Internet Archive is temporarily offline (service-wide outage)" }] },
      },
      "coconino-az": {
        id: "coconino-az",
        name: "Coconino",
        stateCode: "AZ",
        verified: [],
        unreachable: [],
        lists: [{ taxYear: null, rowCount: 0, idCount: 0, looseTokens: 0, reader: "html-table", source: "registry:docs", status: 200, via: "playwright" }],
        wayback: { queried: [], errors: [] },
      },
    },
  };
  oos.pairAll(reg, state, null);
  const tmp = path.join(os.tmpdir(), "oos-doc-test-" + process.pid);
  fs.mkdirSync(tmp, { recursive: true });
  const doc = fs.readFileSync(oos.writeDoc(reg, state, path.join(tmp, "OUT_OF_STATE.md")), "utf8");

  assert.match(doc, /2022 ∩ 2025 \| 3 tax years apart/, "the 3-year span must be stated as 3");
  assert.match(doc, /2017 ∩ 2022 \| 5 tax years apart/);
  assert.match(doc, /genuine five-year span/);
  assert.match(doc, /genuine zero, not a parsing failure/, "the AZ zero must be explained honestly");
  assert.match(doc, /Internet Archive is temporarily offline/);
  assert.match(doc, /No obituaries, death notices/);
  assert.match(doc, /federal \(National Park Service, U\.S\. Forest Service\) or tribal/);
  assert.match(doc, /read by column, not by pattern/);
  assert.match(doc, /Nothing was bypassed to read them/, "the access caveat must be stated");
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("asset PDF discovery finds the attached advertisement pages and skips theme assets", () => {
  const html = '<a href="https://bloximages.newyork1.vip.townnews.com/themountaineer.com/content/tncms/assets/v3/editorial/7/65/765652aa/5aa95af8c0ea9.pdf.pdf">Download PDF</a>'
    + '<link href="https://bloximages.newyork1.vip.townnews.com/themountaineer.com/shared-content/art/tncms/templates/libraries/flex/style.pdf">';
  const found = oos.assetPdfLinks(html, "https://www.themountaineer.com/news/x.html");
  assert.equal(found.length, 1);
  assert.match(found[0], /5aa95af8c0ea9\.pdf\.pdf$/);
});

test("identifier-shaped token counting backs up a claim of no data", () => {
  assert.equal(oosIds.extractIds("Document Center index with no parcels at all", "AZ").count, 0);
  assert.ok(oosIds.extractIds("APN 101-01-001 and 301-25-123A", "AZ").count >= 2);
});
