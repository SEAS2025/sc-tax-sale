"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
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

test("status counts: all 46 counties live with a family adapter", () => {
  const { getAdapter } = require("./index");
  const counts = countByStatus();
  assert.equal(counts.live, 46);
  assert.equal(counts.researched, 0);
  assert.equal(counts.unknown, 0);
  assert.equal(getCounty("lexington").status, "live");
  assert.equal(getCounty("lexington").sourceFamily, "realad-pdf");
  assert.equal(getCounty("lexington").adapter, "lexington");
  assert.equal(getCounty("beaufort").status, "live");
  assert.equal(getCounty("beaufort").sourceFamily, "realad-pdf");
  assert.equal(getCounty("beaufort").adapter, "beaufort");
  assert.equal(getCounty("greenville").sourceFamily, "html-table");
  assert.equal(getCounty("greenville").adapter, "html-table");
  assert.equal(getCounty("charleston").sourceFamily, "county-pdf");
  assert.equal(getCounty("charleston").adapter, "county-pdf");
  assert.equal(getCounty("horry").sourceFamily, "xlsx");
  assert.equal(getCounty("horry").adapter, "xlsx");
  assert.equal(getCounty("richland").status, "live");
  assert.equal(getCounty("richland").adapter, "page-watch");
  assert.equal(getCounty("richland").treasurerUrl.includes("Tax-Sale"), true);
  assert.equal(getCounty("aiken").status, "live");
  assert.equal(getCounty("aiken").sourceFamily, "page-or-newspaper");
  assert.equal(getCounty("aiken").adapter, "page-watch");
  assert.equal(getCounty("aiken").treasurerUrl.includes("/309/Delinquent-Tax-Sale"), true);
  assert.equal(getCounty("georgetown").sourceFamily, "county-pdf");
  assert.equal(getCounty("georgetown").listingSampleUrl.includes("DocumentCenter/View/3625"), true);
  assert.equal(getCounty("york").gisUrl.includes("experience.arcgis.com"), true);
  assert.equal(getCounty("york").gisUrl.includes("MapServer"), false);
  assert.equal(getCounty("oconee").sourceFamily, "html-table");
  assert.equal(getCounty("saluda").treasurerUrl.includes("delinquent-tax-sale"), true);
  assert.equal(getCounty("colleton").sourceFamily, "county-pdf");
  assert.equal(getCounty("pickens").treasurerUrl.includes("co.pickens.sc.us"), true);
  assert.equal(getCounty("oconee").listingUrl.includes("sale-list"), true);
  assert.equal(getCounty("florence").sourceFamily, "county-pdf");
  assert.equal(getCounty("florence").listingSampleUrl.includes("florenceco.org"), true);
  assert.equal(getCounty("dillon").sourceFamily, "xlsx");
  assert.equal(getCounty("dillon").listingSampleUrl.includes("PAPER.XLS"), true);
  assert.equal(getCounty("edgefield").treasurerUrl.includes("tax-collector"), true);
  assert.equal(getCounty("chesterfield").status, "live");
  assert.equal(getCounty("mccormick").status, "live");
  assert.equal(getCounty("barnwell").status, "live");
  assert.equal(getCounty("allendale").status, "live");
  for (const county of listCounties()) {
    assert.equal(county.status, "live", county.id);
    assert.ok(county.adapter, county.id);
    assert.ok(getAdapter(county.id).adapter, county.id);
  }
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

test("family adapters ingest fixtures without emitting owner names", () => {
  const { families } = require("./index");
  const xlsx = require("./adapters/families/xlsx");
  const html = fs.readFileSync(path.join(__dirname, "fixtures", "html-table-sample.html"), "utf8");
  const pdfText = fs.readFileSync(path.join(__dirname, "fixtures", "county-pdf-sample.txt"), "utf8");
  const table = families.ingestFile(getCounty("greenville"), path.join(__dirname, "fixtures", "html-table-sample.html"));
  const pdf = families.ingestFile(getCounty("charleston"), path.join(__dirname, "fixtures", "county-pdf-sample.txt"));
  const xlsxPath = path.join(os.tmpdir(), "sc-tax-sale-xlsx-sample.xlsx");
  xlsx.writeFixture(xlsxPath, ["PIN", "Owner", "Amount Due"], [
    ["1000000001", "EXAMPLE OWNER A", "$100.00"],
    ["1000000002", "EXAMPLE OWNER B", "$40.50"],
    ["1000000003", "EXAMPLE OWNER C", "$9.00"],
  ]);
  const sheet = families.ingestFile(getCounty("horry"), xlsxPath);
  for (const summary of [table, pdf, sheet]) {
    const pub = JSON.stringify(families.publicSummary(summary));
    assert.equal(pub.includes("EXAMPLE OWNER"), false);
    assert.equal(summary.rowCount, 3);
    assert.equal(summary.rows.some((row) => row.owner), false);
  }
  assert.equal(table.rows[0].tms, "0136001300600");
  const oconee = families.ingestFile(
    { id: "oconee", sourceFamily: "html-table" },
    path.join(__dirname, "fixtures", "html-table-oconee.html")
  );
  assert.equal(oconee.rowCount, 3);
  assert.equal(oconee.rows[0].tms, "100-00-00-001.000");
  assert.equal(oconee.amountTotal, 149.5);
  assert.equal(JSON.stringify(families.publicSummary(oconee)).includes("EXAMPLE OWNER"), false);
  assert.equal(table.amountTotal, 360.5);
  assert.equal(pdf.rows[2].tms, "1000000003");
  const dashed = families.ingestFile(
    getCounty("georgetown"),
    path.join(__dirname, "fixtures", "county-pdf-dashed.txt")
  );
  assert.equal(dashed.rowCount, 4);
  assert.equal(dashed.rows[3].tms, "213-00-00-020.000");
  assert.equal(dashed.identifierFormat, "dotted-map");
  assert.equal(dashed.rows[0].tms, "01-0117-008-00-00");
  assert.equal(JSON.stringify(families.publicSummary(dashed)).includes("EXAMPLE OWNER"), false);
  assert.ok(Math.abs(pdf.amountTotal - 4224.56) < 0.001);
  assert.equal(sheet.amountTotal, 149.5);
  assert.equal(html.includes("EXAMPLE OWNER A"), true);
  assert.equal(pdfText.includes("EXAMPLE OWNER A"), true);

  const watch = families.watchHtml(
    fs.readFileSync(path.join(__dirname, "fixtures", "page-watch-sample.html"), "utf8"),
    "https://example.invalid/tax"
  );
  assert.equal(watch.listingLinks.length, 2);
  assert.equal(watch.suggestedCollapse, "xlsx");
  assert.equal(watch.mentionsNewspaper, true);
  const blocked = families.watchHtml(
    fs.readFileSync(path.join(__dirname, "fixtures", "page-watch-blocked.html"), "utf8"),
    "https://example.invalid/login"
  );
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.blockReason, "captcha");

  const seasonal = families.ingestFile(
    getCounty("bamberg"),
    path.join(__dirname, "fixtures", "page-watch-sample.html")
  );
  assert.equal(seasonal.family, "page-or-newspaper");
  assert.equal(seasonal.rowCount, 0);
  assert.equal(seasonal.listingLinkCount, 2);
  const collapsed = families.ingestFile(
    getCounty("anderson"),
    path.join(__dirname, "fixtures", "html-table-sample.html")
  );
  assert.equal(collapsed.rowCount, 3);
  assert.equal(JSON.stringify(families.publicSummary(seasonal)).includes("EXAMPLE OWNER"), false);
});

test("CLI families, ingest, and watch do not print owner names", () => {
  const familiesOut = execFileSync(process.execPath, [path.join(ROOT, "engine", "cli.js"), "families"], { cwd: ROOT, encoding: "utf8" });
  const parsed = JSON.parse(familiesOut);
  const ids = parsed.families.map((family) => family.id);
  assert.ok(ids.includes("html-table"));
  assert.ok(ids.includes("county-pdf"));
  assert.ok(ids.includes("xlsx"));
  assert.ok(ids.includes("page-or-newspaper"));
  assert.ok(parsed.families.find((family) => family.id === "html-table").counties.includes("greenville"));

  const ingest = execFileSync(process.execPath, [
    path.join(ROOT, "engine", "cli.js"),
    "ingest",
    "greenville",
    path.join(ROOT, "engine", "fixtures", "html-table-sample.html"),
  ], { cwd: ROOT, encoding: "utf8" });
  assert.equal(ingest.includes("EXAMPLE OWNER"), false);
  assert.equal(JSON.parse(ingest).rowCount, 3);

  const watch = execFileSync(process.execPath, [
    path.join(ROOT, "engine", "cli.js"),
    "watch",
    "bamberg",
    "--file",
    path.join(ROOT, "engine", "fixtures", "page-watch-sample.html"),
  ], { cwd: ROOT, encoding: "utf8" });
  const watched = JSON.parse(watch);
  assert.equal(watched.blocked, false);
  assert.equal(watched.suggestedCollapse, "xlsx");
  assert.equal(watch.includes("EXAMPLE OWNER"), false);
});

test("2026 ad calendar covers all 46 counties and scan never stores owner names", () => {
  const { ads, adsCalendar } = require("./index");
  const seeds = adsCalendar.listSeeds();
  assert.equal(seeds.length, 46);
  for (const county of listCounties()) {
    assert.ok(adsCalendar.getSeed(county.id), county.id);
  }
  assert.equal(adsCalendar.getSeed("aiken").saleDate, "2026-11-02");
  assert.equal(adsCalendar.getSeed("colleton").listStatus, "held");
  assert.equal(adsCalendar.getSeed("florence").listStatus, "posted");

  const html = fs.readFileSync(path.join(__dirname, "fixtures", "ads-scan-sample.html"), "utf8");
  const facts = ads.extractFacts(html, "https://example.invalid/tax-sale");
  assert.equal(facts.foundDates.includes("2026-10-19"), true);
  assert.equal(facts.foundDates.includes("2026-09-30"), true);
  assert.equal(facts.listingLinks.some((link) => /2026-Tax-Sale-Listing/.test(link.href)), true);
  assert.equal(JSON.stringify(facts).includes("EXAMPLE OWNER"), false);

  assert.equal(ads.isDue(adsCalendar.getSeed("anderson"), "2026-09-30"), true);
  assert.equal(ads.isDue(adsCalendar.getSeed("anderson"), "2026-09-16"), false);
  assert.equal(ads.isDue(adsCalendar.getSeed("anderson"), "2026-10-07"), true);
  assert.equal(ads.isDue(adsCalendar.getSeed("anderson"), "2026-10-08"), false);
  assert.equal(ads.isDue(adsCalendar.getSeed("aiken"), "2026-10-16"), true);
  assert.equal(ads.isDue(adsCalendar.getSeed("aiken"), "2026-10-23"), true);
  assert.equal(ads.isDue(adsCalendar.getSeed("aiken"), "2026-10-24"), false);
  assert.equal(ads.windowOpen(adsCalendar.getSeed("beaufort"), "2026-09-16"), true);
  assert.equal(ads.CATCH_DAYS, 7);

  const snapshot = ads.buildSnapshot(listCounties(), {
    anderson: { ...facts, at: "2026-09-16T18:00:00.000Z", url: "https://example.invalid/tax-sale", httpStatus: 200, heads: [] },
  }, new Date("2026-09-16T18:00:00.000Z"));
  assert.equal(snapshot.counties.length, 46);
  const anderson = snapshot.counties.find((row) => row.id === "anderson");
  assert.equal(anderson.listStatus, "posted");
  assert.equal(anderson.saleDate, "2026-10-19");
  assert.equal(anderson.catchDays, 7);
  assert.equal(anderson.catchUntil, "2026-10-07");
  assert.equal(JSON.stringify(snapshot).includes("EXAMPLE OWNER"), false);

  const cli = execFileSync(process.execPath, [
    path.join(ROOT, "engine", "cli.js"),
    "scan",
    "--county",
    "anderson",
    "--file",
    path.join(ROOT, "engine", "fixtures", "ads-scan-sample.html"),
  ], { cwd: ROOT, encoding: "utf8" });
  const scanned = JSON.parse(cli);
  assert.equal(scanned.county.listStatus, "posted");
  assert.equal(cli.includes("EXAMPLE OWNER"), false);
});

test("statewide 5-year file intersects identifiers only and covers all 46 counties", () => {
  const { extractIds, intersect } = require("./extract-ids");
  const { repeat, listingsCatalog } = require("./index");

  const recent = extractIds("004200-04-007 $100.00 EXAMPLE OWNER 006400-05-045 $50.00");
  const historic = extractIds("004200-04-007 $80.00 EXAMPLE OWNER");
  const both = intersect(recent, historic);
  assert.equal(both.length, 1);
  assert.equal(both[0].tms, "004200-04-007");
  assert.equal(both[0].amountRecent, 100);
  assert.equal(JSON.stringify(both).includes("EXAMPLE OWNER"), false);

  const horry = extractIds("PIN 39307010208 $120.00");
  assert.equal(horry.ids.includes("39307010208"), true);

  const windows = repeat.yearWindows(2026);
  assert.deepEqual(windows.recent, [2024, 2025, 2026]);
  assert.deepEqual(windows.historic, [2020, 2021, 2022]);
  assert.equal(listingsCatalog.looksLikeListing("https://example.invalid/2026-Tax-Sale-Listing.pdf"), true);
  assert.equal(listingsCatalog.looksLikeListing("https://example.invalid/Bidder-Instructions-2026.pdf"), false);
  assert.equal(repeat.guessExt("https://example.invalid/RP-Tax-Sale-Listing.pdf", "application/pdf"), ".pdf");
  assert.equal(repeat.guessExt("https://www.greenvillecounty.org/appsAS400/Taxsale/", "text/html"), ".html");

  const snapshot = repeat.buildSnapshot(listCounties(), {
    lexington: {
      id: "lexington",
      name: "Lexington",
      recent: { year: 2024, url: "https://example.invalid/2024.pdf", idCount: 2 },
      historic: { year: 2021, url: "https://example.invalid/2021.pdf", idCount: 1 },
      bothCount: 1,
      both: [{ tms: "004200-04-007", amountRecent: 100, amountHistoric: 80 }],
      changed: true,
      files: [],
    },
  }, new Date("2026-09-16T18:00:00.000Z"));
  assert.equal(snapshot.counties.length, 46);
  assert.equal(snapshot.bothCount, 1);
  assert.equal(snapshot.withBoth, 1);
  assert.equal(JSON.stringify(snapshot).includes("EXAMPLE OWNER"), false);
  const pub = repeat.publicSnapshot(snapshot);
  assert.equal(pub.both[0].id, "lexington");
  assert.equal(pub.bothCount, 1);
});

test("listing specs and 5-year workbook keep identifiers only", () => {
  const specs = require("./specs");
  const exportRepeat = require("./export-repeat");
  const xlsx = require("./adapters/families/xlsx");
  const { repeat } = require("./index");
  const ctx = "004200-04-007  2.50 AC  DIST 06  TAX YEARS 2018 2019 2020  $1,234.56  123 MAIN ST  EXAMPLE OWNER";
  const got = specs.specsFromContext(ctx);
  assert.equal(got.acres, 2.5);
  assert.equal(specs.parseAcres("AHRENS OLIVIA .80 ACRES 2 BLDG 02 11-026-131"), 0.8);
  assert.equal(specs.parseAcres("AUSTIN SAM B 052-00-02-014 1.1 0 $1,284.41"), 1.1);
  assert.equal(specs.parseAcres("$ 118,200.00          0.08   $39072.01"), 0.08);
  assert.equal(specs.parseAcres("2.50 ± AC"), 2.5);
  assert.equal(specs.parseAcres("3.2 H/A"), 3.2);
  assert.equal(specs.parseAcres("139 HIDDEN ACRES LN 1 005100-05-149"), null);
  assert.equal(got.district, "06");
  assert.match(got.taxYears, /2018/);
  assert.equal(got.situs.toUpperCase(), "123 MAIN ST");
  assert.equal(got.amount, 1234.56);
  assert.equal(JSON.stringify(got).includes("EXAMPLE OWNER"), false);
  assert.equal(specs.specsFromContext("049-00-01-015 $100.00 12 GETHERS LINDA MACK ST").situs, "");

  const book = path.join(os.tmpdir(), "sc-tax-sale-repeat-book.xlsx");
  xlsx.writeWorkbook(book, [
    { name: "Statewide", headers: ["County", "Identifier"], rows: [["Lexington", "004200-04-007"]] },
    { name: "Lexington", headers: ["County", "Identifier"], rows: [["Lexington", "004200-04-007"]] },
  ]);
  const names = execFileSync("unzip", ["-p", book, "xl/workbook.xml"], { encoding: "utf8" });
  assert.match(names, /Statewide/);
  assert.match(names, /Lexington/);
  assert.equal(xlsx.colRef(26), "AA");

  const snapshot = repeat.buildSnapshot(listCounties(), {
    lexington: {
      id: "lexington",
      name: "Lexington",
      recent: { year: 2024, url: "https://example.invalid/2024.pdf", idCount: 1 },
      historic: { year: 2021, url: "https://example.invalid/2021.pdf", idCount: 1 },
      bothCount: 1,
      both: [{ tms: "004200-04-007", amountRecent: 1234.56, amountHistoric: 80 }],
      changed: false,
    },
  }, new Date("2026-09-16T18:00:00.000Z"));
  const rows = exportRepeat.buildRows(snapshot);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].county, "Lexington");
  assert.equal(rows[0].tms, "004200-04-007");
  assert.equal(JSON.stringify(exportRepeat.buildSheets(snapshot, rows)).includes("EXAMPLE OWNER"), false);

  const exportPdf = require("./export-repeat-pdf");
  const html = exportPdf.renderHtml(snapshot, rows);
  assert.match(html, /Lexington/);
  assert.match(html, /004200-04-007/);
  assert.equal(html.includes("EXAMPLE OWNER"), false);

  assert.equal(exportPdf.isTargetAcreage(2), true);
  assert.equal(exportPdf.isTargetAcreage(6), true);
  assert.equal(exportPdf.isTargetAcreage(0.5), false);
  assert.equal(exportPdf.isTargetAcreage(7), false);
  const sorted = exportPdf.sortCountyRows([
    { tms: "C", acres: null, amountRecent: 1 },
    { tms: "B", acres: 12, amountRecent: 1 },
    { tms: "A", acres: 2, amountRecent: 1 },
  ]);
  assert.deepEqual(sorted.map((row) => row.tms), ["A", "B", "C"]);
  rows[0].acres = 2;
  const marked = exportPdf.renderHtml(snapshot, rows);
  assert.match(marked, /row-target/);
  assert.match(marked, /November 2, 2026/);
  assert.match(marked, /785-8345/);
  assert.match(marked, /Acres/);
});

test("5-year PDF sorts by acres, highlights 1-6, and prints county sale facts", () => {
  const specs = require("./specs");
  const exportRepeat = require("./export-repeat");
  const exportPdf = require("./export-repeat-pdf");
  const { repeat } = require("./index");
  const recent = new Map([
    ["004200-04-007", Object.assign(specs.emptySpecs(), { acres: 3 })],
    ["006400-05-045", Object.assign(specs.emptySpecs(), { acres: 10 })],
    ["004300-07-041", specs.emptySpecs()],
    ["002730-03-004", Object.assign(specs.emptySpecs(), { acres: 0.5 })],
  ]);
  const snapshot = repeat.buildSnapshot(listCounties(), {
    lexington: {
      id: "lexington",
      name: "Lexington",
      recent: { year: 2024, url: "https://example.invalid/2024.pdf", idCount: 4 },
      historic: { year: 2021, url: "https://example.invalid/2021.pdf", idCount: 4 },
      bothCount: 4,
      both: [
        { tms: "004200-04-007", amountRecent: 100, amountHistoric: 80 },
        { tms: "006400-05-045", amountRecent: 200, amountHistoric: 90 },
        { tms: "004300-07-041", amountRecent: 50, amountHistoric: 40 },
        { tms: "002730-03-004", amountRecent: 75, amountHistoric: 60 },
      ],
      changed: false,
      _specsRecent: recent,
    },
  }, new Date("2026-09-16T18:00:00.000Z"));
  const rows = exportRepeat.buildRows(snapshot);
  assert.deepEqual(rows.map((row) => row.tms), [
    "002730-03-004",
    "004200-04-007",
    "006400-05-045",
    "004300-07-041",
  ]);
  assert.equal(exportPdf.isTargetAcreage(3), true);
  assert.equal(exportPdf.isTargetAcreage(1), true);
  assert.equal(exportPdf.isTargetAcreage(6), true);
  assert.equal(exportPdf.isTargetAcreage(0.5), false);
  assert.equal(exportPdf.isTargetAcreage(10), false);
  assert.equal(exportPdf.rowClass({ acres: 3 }), "row-target");
  assert.equal(exportPdf.rowClass({ acres: 10 }), "");
  const html = exportPdf.renderHtml(snapshot, rows);
  assert.match(html, /row-target/);
  assert.match(html, /November 2, 2026/);
  assert.match(html, /Acres/);
  assert.match(html, /\(803\) 785-8345/);
  assert.equal(html.includes("EXAMPLE OWNER"), false);
  assert.equal(/\bowner_name\b/i.test(html), false);
});

test("inquiry draft lists identifiers and amounts, not a fake payment link", () => {
  const text = fs.readFileSync(path.join(__dirname, "fixtures", "lexington-sample.csv"), "utf8");
  const draft = beaufort.draftInquiry(text, { count: 2, countyName: "Beaufort County", identifierLabel: "PIN" });
  assert.equal(draft.sampleSize, 2);
  assert.match(draft.text, /99-0001-0002/);
  assert.equal(draft.text.includes("stripe.com"), false);
  assert.equal(draft.text.includes("EXAMPLE OWNER"), false);
});

test("host limiter honours the newest profile instead of the one that created it", () => {
  const hunt = require("../scripts/hunt");
  hunt.LIMITS.delete("limiter.example");
  const slow = hunt.limiterFor("limiter.example", { concurrency: 2, minIntervalMs: 900 });
  assert.equal(slow.minIntervalMs, 900);
  assert.equal(slow.concurrency, 2);
  // A HEAD sweep asking for a faster pace used to be silently ignored,
  // which stretched a 7-minute document-center sweep past an hour.
  const fast = hunt.limiterFor("limiter.example", { concurrency: 8, minIntervalMs: 110 });
  assert.equal(fast.minIntervalMs, 110);
  assert.equal(fast.concurrency, 8);
  assert.equal(fast, slow, "same host must reuse one bucket");
});

test("limiter releases its slot when a task rejects", async () => {
  const hunt = require("../scripts/hunt");
  hunt.LIMITS.delete("reject.example");
  const profile = { concurrency: 1, minIntervalMs: 0 };
  await assert.rejects(
    () => hunt.schedule("reject.example", profile, () => Promise.reject(new Error("boom"))),
    /boom/,
  );
  const lim = hunt.LIMITS.get("reject.example");
  assert.equal(lim.running, 0, "a rejected task must not leak its slot");
  // The next acquire must still be servable; a leaked slot would hang here.
  assert.equal(await hunt.schedule("reject.example", profile, () => "ok"), "ok");
  assert.equal(lim.running, 0);
});

test("phase watchdog abandons a phase that stops reporting progress", async () => {
  const hunt = require("../scripts/hunt");
  let stillRunning = true;
  const result = await hunt.runPhase("stalled-test", async (ctx) => {
    while (!ctx.expired) await new Promise((r) => setTimeout(r, 10));
    stillRunning = false;
    return ["never"];
  }, 60);
  assert.deepEqual(result, [], "an abandoned phase yields no finds");
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(stillRunning, false, "the phase must observe ctx.expired and stop");
});

test("phase watchdog lets a phase that keeps touching progress finish", async () => {
  const hunt = require("../scripts/hunt");
  const result = await hunt.runPhase("busy-test", async (ctx) => {
    for (let i = 0; i < 6; i += 1) {
      await new Promise((r) => setTimeout(r, 20));
      ctx.touch();
    }
    return ["found"];
  }, 80);
  assert.deepEqual(result, ["found"]);
});

test("archived captures keep pages and revisits but drop assets", () => {
  const hunt = require("../scripts/hunt");
  // Colleton published the list as a page, and Wayback files repeat captures
  // as warc/revisit with no real mimetype.
  assert.equal(hunt.keepCapture({ original: "https://x.gov/2020-tax-sale-list", mimetype: "warc/revisit" }), true);
  assert.equal(hunt.keepCapture({ original: "https://x.gov/tax-sale", mimetype: "text/html" }), true);
  assert.equal(hunt.keepCapture({ original: "https://x.gov/list.pdf", mimetype: "application/pdf" }), true);
  assert.equal(hunt.keepCapture({ original: "https://x.gov/banner.jpg", mimetype: "image/jpeg" }), false);
  assert.equal(hunt.keepCapture({ original: "https://x.gov/site.css", mimetype: "text/css" }), false);
  // Size gating applies to documents only; pages and revisits run small.
  assert.equal(hunt.bigEnough({ original: "https://x.gov/list.pdf", length: 200 }), false);
  assert.equal(hunt.bigEnough({ original: "https://x.gov/2020-tax-sale-list", length: 200 }), true);
});

test("document-center filenames come from content-disposition", () => {
  const hunt = require("../scripts/hunt");
  const headers = new Map([["content-disposition", 'attachment; filename="2021-Delinquent-Tax-Sale.pdf"']]);
  const name = hunt.filenameFromHead({ headers: { get: (k) => headers.get(k) || null } });
  assert.equal(name, "2021-Delinquent-Tax-Sale.pdf");
  assert.equal(hunt.parentDir("https://x.gov/a/b/list.pdf"), "https://x.gov/a/b/");
});
