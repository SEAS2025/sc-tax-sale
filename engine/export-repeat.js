"use strict";

/**
 * County-organized workbook of the statewide 5-year file.
 * Identifiers and listing specs only. Owner names are not written.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const catalog = require("./listings-catalog");
const repeat = require("./repeat");
const registry = require("./registry");
const xlsx = require("./adapters/families/xlsx");
const { emptySpecs, indexSpecs, mergeSpecs, sanitizeRow } = require("./specs");

const ROOT = path.join(__dirname, "..");
const FETCH_MS = 90000;
const HEADERS = [
  "County",
  "FIPS",
  "Identifier",
  "Recent year",
  "Historic year",
  "Amount (recent)",
  "Amount (historic)",
  "Tax years",
  "Acres",
  "District",
  "Class",
  "Item",
  "Situs",
  "Lot / legal",
  "Recent list",
  "Historic list",
];

function defaultDest() {
  return path.join(ROOT, "inbox", "repeat", "SC-5-year-delinquent-by-county.xlsx");
}

function downloadsDest() {
  const home = process.env.HOME || os.homedir();
  return path.join(home, "Downloads", "SC-5-year-delinquent-by-county.xlsx");
}

function cacheName(countyId, year, url, ext) {
  const hash = crypto.createHash("sha1").update(String(url || "")).digest("hex").slice(0, 10);
  return countyId + "-" + (year || "unk") + "-" + hash + ext;
}

async function fetchListing(url, fetchFn) {
  const fn = fetchFn || fetch;
  const response = await fn(catalog.encodeUrl(url), {
    method: "GET",
    redirect: "follow",
    headers: { "user-agent": repeat.USER_AGENT },
    signal: AbortSignal.timeout(FETCH_MS),
  });
  const contentType = response.headers.get("content-type") || "";
  const buf = response.ok ? Buffer.from(await response.arrayBuffer()) : Buffer.alloc(0);
  return {
    ok: response.ok,
    status: response.status,
    url: response.url || url,
    contentType,
    buf,
  };
}

async function loadListingText(side, countyId, inboxDir, fetchFn) {
  if (!side || !side.url) return "";
  if (String(side.url).startsWith("local:")) {
    const local = path.join(ROOT, "..", "beaufort-tax-pdfs", "full_2022_structured.json");
    if (!fs.existsSync(local)) return "";
    return repeat.textFromBuffer(local, "application/json", fs.readFileSync(local));
  }
  const extGuess = repeat.guessExt(side.url, "");
  const dest = path.join(inboxDir, cacheName(countyId, side.year, side.url, extGuess));
  let buf;
  let contentType = "";
  if (fs.existsSync(dest) && fs.statSync(dest).size > 400) {
    buf = fs.readFileSync(dest);
  } else {
    const got = await fetchListing(side.url, fetchFn);
    if (!got.ok || got.buf.length < 400) return "";
    const ext = repeat.guessExt(got.url, got.contentType);
    const finalDest = ext === extGuess ? dest : path.join(inboxDir, cacheName(countyId, side.year, side.url, ext));
    fs.mkdirSync(inboxDir, { recursive: true });
    fs.writeFileSync(finalDest, got.buf);
    buf = got.buf;
    contentType = got.contentType;
    return repeat.textFromBuffer(finalDest, contentType, buf);
  }
  return repeat.textFromBuffer(dest, contentType, buf);
}

function moneyCell(value) {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : "";
}

function acresCell(value) {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? n : "";
}

function rowCells(row) {
  return [
    row.county,
    row.fips,
    row.tms,
    row.recentYear || "",
    row.historicYear || "",
    moneyCell(row.amountRecent),
    moneyCell(row.amountHistoric),
    row.taxYears || "",
    acresCell(row.acres),
    row.district || "",
    row.class || "",
    row.item || "",
    row.situs || "",
    row.legal || "",
    row.recentUrl || "",
    row.historicUrl || "",
  ];
}

function buildRows(snapshot) {
  const rows = [];
  for (const county of snapshot.counties || []) {
    if (!county.bothCount) continue;
    const reg = registry.getCounty(county.id) || {};
    const specsRecent = county._specsRecent || new Map();
    const specsHistoric = county._specsHistoric || new Map();
    for (const pair of county.both || []) {
      const specs = mergeSpecs(specsRecent.get(pair.tms), specsHistoric.get(pair.tms));
      rows.push(sanitizeRow({
        county: county.name,
        countyId: county.id,
        fips: reg.fips || "",
        tms: pair.tms,
        recentYear: county.recent && county.recent.year,
        historicYear: county.historic && county.historic.year,
        amountRecent: pair.amountRecent != null ? pair.amountRecent : specs.amount,
        amountHistoric: pair.amountHistoric,
        taxYears: specs.taxYears,
        acres: specs.acres,
        district: specs.district,
        class: specs.class,
        item: specs.item,
        situs: specs.situs,
        legal: specs.legal,
        recentUrl: county.recent && county.recent.url,
        historicUrl: county.historic && county.historic.url,
      }));
    }
  }
  rows.sort(compareRows);
  return rows;
}

function acresSortValue(acres) {
  const n = Number(acres);
  return acres == null || acres === "" || !Number.isFinite(n) ? Number.POSITIVE_INFINITY : n;
}

function compareRows(a, b) {
  return a.county.localeCompare(b.county)
    || acresSortValue(a.acres) - acresSortValue(b.acres)
    || String(a.tms).localeCompare(String(b.tms));
}

function coverRows(snapshot, rows) {
  const paired = (snapshot.counties || []).filter((c) => c.bothCount);
  const unpaired = (snapshot.counties || []).filter((c) => !c.bothCount).map((c) => c.name);
  const lines = [
    ["SC Tax Sale Atlas — 5-year delinquent file"],
    ["Parcel identifiers and listing specs only. Owner names are not stored."],
    ["S.C. Code Ann. § 30-2-50: this list is not for commercial solicitation."],
    ["Generated", snapshot.generatedAt || new Date().toISOString()],
    ["Season", snapshot.season || ""],
    ["Parcels on both newest and ~5-year lists", rows.length],
    ["Counties with a pair", paired.length],
    ["Recent years", (snapshot.recentYears || []).join(", ")],
    ["Historic years", (snapshot.historicYears || []).join(", ")],
    ["Source", snapshot.source || ""],
    [],
    ["County", "FIPS", "Matches", "Recent year", "Historic year", "Recent IDs", "Historic IDs"],
  ];
  for (const county of paired) {
    const reg = registry.getCounty(county.id) || {};
    lines.push([
      county.name,
      reg.fips || "",
      county.bothCount,
      county.recent && county.recent.year || "",
      county.historic && county.historic.year || "",
      county.recent && county.recent.idCount || "",
      county.historic && county.historic.idCount || "",
    ]);
  }
  lines.push([]);
  lines.push(["Counties without a hosted pair yet"]);
  unpaired.forEach((name) => lines.push([name]));
  return lines;
}

function buildSheets(snapshot, rows) {
  const cover = coverRows(snapshot, rows);
  const sheets = [
    { name: "Cover", headers: cover[0], rows: cover.slice(1) },
    { name: "Statewide", headers: HEADERS, rows: rows.map(rowCells) },
  ];
  const byCounty = new Map();
  for (const row of rows) {
    if (!byCounty.has(row.county)) byCounty.set(row.county, []);
    byCounty.get(row.county).push(row);
  }
  for (const [name, list] of byCounty) {
    sheets.push({ name, headers: HEADERS, rows: list.map(rowCells) });
  }
  return sheets;
}

function assertNoOwners(sheets) {
  const blob = JSON.stringify(sheets);
  if (/\bowner_name\b|\bowner_location\b|"owner":/i.test(blob)) {
    throw new Error("repeat workbook refused to write owner fields");
  }
  return sheets;
}

async function attachSpecs(snapshot, options) {
  const opts = options || {};
  const inboxDir = opts.inboxDir || path.join(ROOT, "inbox", "repeat");
  const counties = (snapshot.counties || []).filter((c) => c.bothCount && (!opts.countyId || c.id === opts.countyId));
  for (const county of counties) {
    const recentText = await loadListingText(county.recent, county.id, inboxDir, opts.fetchFn);
    const historicText = await loadListingText(county.historic, county.id, inboxDir, opts.fetchFn);
    county._specsRecent = recentText ? indexSpecs(recentText) : new Map();
    county._specsHistoric = historicText ? indexSpecs(historicText) : new Map();
  }
  return snapshot;
}

function writeWorkbookFile(dest, snapshot, rows) {
  const sheets = assertNoOwners(buildSheets(snapshot, rows));
  xlsx.writeWorkbook(dest, sheets);
  return dest;
}

async function writeFromSnapshot(snapshot, options) {
  const opts = options || {};
  const dest = opts.dest || defaultDest();
  await attachSpecs(snapshot, opts);
  const rows = buildRows(snapshot);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  writeWorkbookFile(dest, snapshot, rows);
  const extra = opts.copyTo === false ? null : (opts.copyTo || downloadsDest());
  if (extra && extra !== dest) {
    try {
      fs.mkdirSync(path.dirname(extra), { recursive: true });
      fs.copyFileSync(dest, extra);
    } catch (_err) {
      // Downloads may be missing in CI
    }
  }
  return { dest, copy: extra && fs.existsSync(extra) ? extra : null, rowCount: rows.length };
}

module.exports = {
  HEADERS,
  defaultDest,
  downloadsDest,
  buildRows,
  compareRows,
  acresSortValue,
  buildSheets,
  attachSpecs,
  writeFromSnapshot,
  writeWorkbookFile,
  emptySpecs,
};
