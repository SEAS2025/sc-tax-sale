"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
execFileSync(process.execPath, [path.join(ROOT, "scripts", "build-registry.js")], { cwd: ROOT });

const { listCounties, getCounty, countByStatus } = require("./registry");
const { geocodeLexingtonTms, parseLexingtonTms, TMS_SECTION_MAP } = require("./geocode/lexington-tms");
const lexington = require("./adapters/lexington");
const beaufort = require("./adapters/beaufort");

const OFFICIAL_FIPS = {
  abbeville: "001",
  aiken: "003",
  allendale: "005",
  anderson: "007",
  bamberg: "009",
  barnwell: "011",
  beaufort: "013",
  berkeley: "015",
  calhoun: "017",
  charleston: "019",
  cherokee: "021",
  chester: "023",
  chesterfield: "025",
  clarendon: "027",
  colleton: "029",
  darlington: "031",
  dillon: "033",
  dorchester: "035",
  edgefield: "037",
  fairfield: "039",
  florence: "041",
  georgetown: "043",
  greenville: "045",
  greenwood: "047",
  hampton: "049",
  horry: "051",
  jasper: "053",
  kershaw: "055",
  lancaster: "057",
  laurens: "059",
  lee: "061",
  lexington: "063",
  mccormick: "065",
  marion: "067",
  marlboro: "069",
  newberry: "071",
  oconee: "073",
  orangeburg: "075",
  pickens: "077",
  richland: "079",
  saluda: "081",
  spartanburg: "083",
  sumter: "085",
  union: "087",
  williamsburg: "089",
  york: "091",
};

test("registry has 46 unique official FIPS codes", () => {
  const counties = listCounties();
  assert.equal(counties.length, 46);
  const fips = counties.map((c) => c.fips);
  assert.equal(new Set(fips).size, 46);
  for (const county of counties) {
    assert.equal(county.fips, OFFICIAL_FIPS[county.id], county.id);
    assert.equal(county.geoid, "45" + county.fips);
    assert.equal(county.state, "SC");
  }
  assert.equal(getCounty("lexington").fips, "063");
  assert.equal(getCounty("kershaw").fips, "055");
  assert.notEqual(getCounty("kershaw").fips, getCounty("lexington").fips);
  assert.notEqual(getCounty("lee").fips, getCounty("marlboro").fips);
});

test("status counts: Lexington live, Beaufort researched, rest unknown", () => {
  const counts = countByStatus();
  assert.deepEqual(counts, { live: 1, researched: 1, unknown: 44 });
  assert.equal(getCounty("lexington").status, "live");
  assert.equal(getCounty("lexington").adapter, "lexington");
  assert.equal(getCounty("beaufort").status, "researched");
  assert.equal(getCounty("beaufort").adapter, "beaufort");
  assert.equal(getCounty("richland").status, "unknown");
  assert.equal(getCounty("richland").gisUrl, null);
  assert.equal(getCounty("richland").treasurerUrl, null);
});

test("registry does not republish the owner CSV or Base44 secrets", () => {
  const raw = fs.readFileSync(path.join(ROOT, "counties", "sc.json"), "utf8");
  assert.equal(raw.includes("media.base44.com"), false);
  assert.equal(raw.includes("VITE_BASE44"), false);
  assert.equal(raw.includes("base44"), false);
  assert.equal(getCounty("lexington").csvRedistributed, false);
});

test("Lexington TMS formats geocode onto the original section grid", () => {
  const dashed = geocodeLexingtonTms("06-1234-5678");
  assert.equal(dashed.ok, true);
  assert.equal(dashed.section, "06");
  assert.equal(dashed.knownSection, true);
  assert.equal(dashed.lat, TMS_SECTION_MAP["06"][0] + ((1234 % 10) - 5) * 0.003);
  assert.equal(dashed.lng, TMS_SECTION_MAP["06"][1] + ((5678 % 10) - 5) * 0.003);

  const card = parseLexingtonTms("000600-06-119");
  assert.equal(card.format, "mapblock-section-parcel");
  assert.equal(card.section, "06");
  const geo = geocodeLexingtonTms("000600-06-119");
  assert.equal(geo.section, "06");
  assert.equal(geo.knownSection, true);

  const unknown = geocodeLexingtonTms("99-0001-0002");
  assert.equal(unknown.knownSection, false);
  assert.equal(unknown.lat, 33.78 + ((1 % 10) - 5) * 0.003);
});

test("Lexington adapter reads the original CSV schema and does not emit owner names in the CLI summary shape", () => {
  const county = getCounty("lexington");
  const text = fs.readFileSync(path.join(__dirname, "fixtures", "lexington-sample.csv"), "utf8");
  const summary = lexington.parseFileText(text, county);
  assert.equal(summary.rowCount, 3);
  assert.deepEqual(summary.missingColumns, []);
  assert.equal(summary.recognizedTms, 3);
  assert.equal(summary.rows[0].links.propertyCard.includes("0612345678"), true);
  assert.equal(JSON.stringify(summary).includes("EXAMPLE OWNER"), false);
  assert.equal(summary.rows[0].hasOwner2025, true);
});

test("Beaufort adapter keeps PIN parsing, not Lexington TMS", () => {
  const pin = beaufort.normalizePin("r10020030040005001");
  assert.equal(pin, "R100 200 300 4000 5001");
  assert.equal(beaufort.normalizePin("06-1234-5678"), null);

  const list = beaufort.parseBeaufort2022Text(
    fs.readFileSync(path.join(__dirname, "fixtures", "beaufort-2022-snippet.txt"), "utf8")
  );
  assert.equal(list.rowCount, 2);
  assert.equal(list.rows[0].tms, "R100 200 300 4000 5001");
  assert.equal(list.rows[0].amountDue, "$1,200.00");

  const realad = beaufort.parseBeaufortRealadText(
    fs.readFileSync(path.join(__dirname, "fixtures", "beaufort-realad-snippet.txt"), "utf8")
  );
  assert.equal(realad.rowCount, 2);
  assert.equal(realad.rows[1].amountDue, "$50.00");
});

test("inquiry draft lists identifiers and amounts, not a fake payment link", () => {
  const text = fs.readFileSync(path.join(__dirname, "fixtures", "lexington-sample.csv"), "utf8");
  const draft = beaufort.draftInquiry(text, { count: 2, countyName: "Beaufort County", identifierLabel: "PIN" });
  assert.equal(draft.sampleSize, 2);
  assert.match(draft.text, /99-0001-0002/);
  assert.equal(draft.text.includes("stripe.com"), false);
  assert.equal(draft.text.includes("EXAMPLE OWNER"), false);
});
