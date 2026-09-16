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
const path = require("path");

const oosIds = require("./out-of-state-ids");
const oos = require("./out-of-state");
const oosPdf = require("./out-of-state-pdf");
const registry = require("./registry");

const ROOT = path.join(__dirname, "..");

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
    assert.ok(county.candidateUrls.length, county.id + " needs probe targets");
    for (const row of county.candidateUrls) {
      assert.ok(/^https:\/\//.test(row.url), "candidate URLs must be https: " + row.url);
    }
  }
  const ids = extra.counties.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "out-of-state ids must be unique");
});

test("Arizona assessor parcel numbers extract with amounts and no owner text", () => {
  const line = [
    "APN 101-01-001  GRAND CANYON      $1,204.55",
    "APN 301-25-123A TUSAYAN           $842.10",
    "APN 400-12-345.002 WILLIAMS       $77.00",
  ].join("\n");
  const got = oosIds.extractIds(line, "AZ");
  assert.deepEqual(got.ids.sort(), ["101-01-001", "301-25-123A", "400-12-345.002"].sort());
  assert.equal(got.amounts["101-01-001"], 1204.55);
  assert.equal(got.amounts["301-25-123A"], 842.1);
  assert.equal(got.kinds["400-12-345.002"], "az-apn-split");
});

test("a split-parcel Arizona APN is not truncated to its base parcel", () => {
  const got = oosIds.extractIds("Parcel 205-14-118.003 is delinquent $310.00", "AZ");
  assert.deepEqual(got.ids, ["205-14-118.003"]);
});

test("North Carolina grid PINs extract and ISO dates do not", () => {
  const text = [
    "Advertised 2026-03-15 under G.S. 105-369.",
    "PIN 8626-27-9056   $3,110.24",
    "PIN 8617-42-2856.001  $412.00",
  ].join("\n");
  const got = oosIds.extractIds(text, "NC");
  assert.ok(got.ids.includes("8626-27-9056"));
  assert.ok(got.ids.includes("8617-42-2856.001"));
  assert.ok(!got.ids.includes("2026-03-15"), "an ISO date must not be read as a parcel PIN");
  assert.equal(got.amounts["8626-27-9056"], 3110.24);
});

test("state selection keeps the two regimes from cross-matching", () => {
  const az = oosIds.extractIds("APN 101-01-001", "NC");
  assert.equal(az.count, 0, "an Arizona APN must not be read as a North Carolina PIN");
  const nc = oosIds.extractIds("PIN 8626-27-9056", "AZ");
  assert.equal(nc.count, 0, "a North Carolina PIN must not be read as an Arizona APN");
});

test("shape census reports the identifier format actually present", () => {
  const census = oosIds.shapeCensus("101-01-001 102-03-004 103-05-006 8626-27-9056");
  assert.equal(census[0].shape, "NNN-NN-NNN");
  assert.equal(census[0].count, 3);
  assert.ok(census.some((row) => row.shape === "NNNN-NN-NNNN"));
});

test("pairing counts a parcel only when the same identifier is on both windows", () => {
  const recentYear = oos.RECENT_YEARS[0];
  const historicYear = oos.HISTORIC_YEARS[0];
  const cs = {
    lists: [
      {
        url: "https://example.gov/recent",
        year: recentYear,
        idCount: 10,
        ids: ["101-01-001", "101-01-002", "101-01-003", "101-01-004", "101-01-005", "101-01-006", "101-01-007", "101-01-008", "101-01-009", "101-01-010"],
        amounts: { "101-01-001": 100, "101-01-002": 200 },
      },
      {
        url: "https://example.gov/historic",
        year: historicYear,
        idCount: 9,
        ids: ["101-01-002", "101-01-003", "201-01-001", "201-01-002", "201-01-003", "201-01-004", "201-01-005", "201-01-006", "201-01-007"],
        amounts: { "101-01-002": 55 },
      },
    ],
  };
  const pair = oos.pairCounty(cs);
  assert.equal(pair.bothCount, 2);
  assert.deepEqual(pair.both.map((row) => row.tms).sort(), ["101-01-002", "101-01-003"]);
  assert.equal(pair.both.find((row) => row.tms === "101-01-002").amountHistoric, 55);
});

test("pairing reports a plain reason instead of inventing a pair", () => {
  const pair = oos.pairCounty({ lists: [] });
  assert.equal(pair.bothCount, 0);
  assert.match(pair.reason, /no recent list/);
});

test("the out-of-state PDF sorts acres smallest first, highlights 1-6, and writes no owner fields", () => {
  const snapshot = {
    season: 2026,
    generatedAt: "2026-09-16T00:00:00.000Z",
    source: "test",
    counties: [{
      id: "coconino-az",
      name: "Coconino",
      stateCode: "AZ",
      fips: "04005",
      recent: { year: 2026, url: "https://example.gov/recent", idCount: 3 },
      historic: { year: 2021, url: "https://example.gov/historic", idCount: 3 },
      bothCount: 3,
      both: [
        { tms: "101-01-001", amountRecent: 900, amountHistoric: 400 },
        { tms: "101-01-002", amountRecent: 800, amountHistoric: 300 },
        { tms: "101-01-003", amountRecent: 700, amountHistoric: 200 },
      ],
      _specsRecent: new Map([
        ["101-01-001", { acres: 40, taxYears: "", district: "", class: "", item: "", situs: "", legal: "", amount: null }],
        ["101-01-002", { acres: 2.5, taxYears: "", district: "", class: "", item: "", situs: "", legal: "", amount: null }],
      ]),
      _specsHistoric: new Map(),
    }],
  };
  const rows = oosPdf.buildRows(snapshot);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row) => !Object.keys(row).some((key) => /owner/i.test(key))));

  const html = oosPdf.renderHtml(snapshot, rows, { counties: {} });
  const first = html.indexOf("101-01-002");
  const second = html.indexOf("101-01-001");
  const last = html.indexOf("101-01-003");
  assert.ok(first < second, "2.5 acres must print before 40 acres");
  assert.ok(second < last, "unknown acreage must print last");
  assert.match(html, /row-target/, "a 1-6 acre row must carry the gold highlight class");
  assert.match(html, /Grand Canyon/);
  assert.ok(!/EXAMPLE OWNER|owner_name/i.test(html));
});

test("the PDF names itself distinctly so it never overwrites the South Carolina report", () => {
  assert.equal(oosPdf.FILENAME, "Out-of-state-5-year-delinquent.pdf");
  assert.ok(oosPdf.defaultDest().endsWith("inbox/repeat/Out-of-state-5-year-delinquent.pdf"));
  const scPdf = require("./export-repeat-pdf");
  assert.notEqual(path.basename(scPdf.defaultDest()), oosPdf.FILENAME);
});

test("the findings document never claims a source that was not fetched", () => {
  const reg = oos.loadRegistry();
  const state = {
    phases: {},
    land: [],
    counties: {
      "haywood-nc": {
        id: "haywood-nc",
        name: "Haywood",
        verified: [{ url: "https://www.haywoodcountync.gov/274/Tax-Collections", role: "office", status: 200, bytes: 130030, via: "fetch" }],
        unreachable: [{ url: "https://example.invalid/never", role: "listing", status: 0, error: "dns" }],
        lists: [],
        pair: { bothCount: 0, reason: "no recent list with usable identifiers", recent: null, historic: null },
      },
    },
  };
  const tmp = path.join(require("os").tmpdir(), "oos-doc-test-" + process.pid);
  fs.mkdirSync(tmp, { recursive: true });
  const docPath = oos.writeDoc(reg, state, path.join(tmp, "OUT_OF_STATE.md"));
  const text = fs.readFileSync(docPath, "utf8");
  assert.match(text, /Haywood County, NC/);
  assert.match(text, /0 paired parcels/);
  assert.match(text, /no obituaries|No obituaries/i);
  assert.match(text, /federal \(National Park Service, U\.S\. Forest Service\) or tribal/);
  assert.ok(!/EXAMPLE OWNER|owner_name/i.test(text));
});
