"use strict";

/**
 * Statewide 5-year delinquent file.
 * Newest hosted list vs a list from ~season-5. Identifiers and amounts only.
 * Rebuilds when a listing URL or Last-Modified changes.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const calendar = require("./ads-calendar");
const catalog = require("./listings-catalog");
const { extractIds, intersect } = require("./extract-ids");
const htmlTable = require("./adapters/families/html-table");
const xlsx = require("./adapters/families/xlsx");

const ROOT = path.join(__dirname, "..");
const USER_AGENT = "sc-tax-sale-watch/1.0 (public archive research; identifiers only)";
const MIN_IDS = 8;
const FETCH_MS = 28000;
const CONCURRENCY = 4;

function yearWindows(season) {
  const s = Number(season) || calendar.SEASON;
  return {
    recent: [s - 2, s - 1, s],
    historic: [s - 6, s - 5, s - 4],
  };
}

function mapLimit(items, limit, worker) {
  const out = new Array(items.length);
  let i = 0;
  async function next() {
    const idx = i++;
    if (idx >= items.length) return;
    out[idx] = await worker(items[idx], idx);
    return next();
  }
  return Promise.all(Array.from({ length: Math.min(limit, items.length) }, next)).then(() => out);
}

function localHistoricPath(id) {
  if (id !== "beaufort") return null;
  const file = path.join(ROOT, "..", "beaufort-tax-pdfs", "full_2022_structured.json");
  return fs.existsSync(file) ? file : null;
}

function textFromBuffer(file, contentType, buf) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".json") {
    const json = JSON.parse(buf.toString("utf8"));
    return (json.rows || []).map((row) => (row.tms || "") + " " + (row.amountDue || "")).join("\n");
  }
  if (ext === ".html" || /html/i.test(contentType)) {
    const html = buf.toString("utf8");
    const table = htmlTable.parseHtml(html, {});
    if (table.rowCount) {
      return table.rows.map((row) => (row.tms || "") + " $" + (row.amount || 0).toFixed(2)).join("\n");
    }
    return html.replace(/<[^>]+>/g, " ");
  }
  if (ext === ".xlsx" || /spreadsheetml/i.test(contentType)) {
    try {
      const parsed = xlsx.parseFile(file, {});
      if (parsed.rowCount) {
        return parsed.rows.map((row) => (row.tms || "") + " $" + (row.amount || 0).toFixed(2)).join("\n");
      }
    } catch (_err) {
      // fall through to shared strings
    }
    try {
      return execFileSync("unzip", ["-p", file, "xl/sharedStrings.xml"], {
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      }).replace(/<[^>]+>/g, " ");
    } catch (_err) {
      return buf.toString("utf8");
    }
  }
  if (ext === ".xls") {
    return buf.toString("latin1").replace(/[^\x09\x0a\x0d\x20-\x7e]/g, " ");
  }
  if (ext === ".pdf" || /pdf/i.test(contentType)) {
    fs.writeFileSync(file, buf);
    try {
      return execFileSync("pdftotext", ["-layout", file, "-"], {
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
      });
    } catch (_err) {
      return "";
    }
  }
  return buf.toString("utf8");
}

function guessExt(url, contentType) {
  const blob = String(contentType || "") + " " + String(url || "");
  if (/\.xlsx(\?|$)|spreadsheetml/i.test(blob)) return ".xlsx";
  if (/\.xls(\?|$)|application\/vnd\.ms-excel/i.test(blob)) return ".xls";
  if (/\.pdf(\?|$)|application\/pdf/i.test(blob)) return ".pdf";
  if (/\.html(\?|$)|text\/html/i.test(blob)) return ".html";
  if (/\/sale-list\/?$|\/taxsale\/?$/i.test(String(url || ""))) return ".html";
  if (/\.json(\?|$)/i.test(blob)) return ".json";
  return ".pdf";
}

async function fetchBuf(url, method, fetchFn) {
  const fn = fetchFn || fetch;
  const response = await fn(catalog.encodeUrl(url), {
    method: method || "GET",
    redirect: "follow",
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_MS),
  });
  const contentType = response.headers.get("content-type") || "";
  const lastModified = response.headers.get("last-modified");
  const etag = response.headers.get("etag");
  let buf = Buffer.alloc(0);
  if (method !== "HEAD" && response.ok) buf = Buffer.from(await response.arrayBuffer());
  return {
    ok: response.ok,
    status: response.status,
    url: response.url || url,
    contentType,
    lastModified,
    etag,
    buf,
  };
}

function previousFile(prevCounty, url) {
  if (!prevCounty || !prevCounty.files) return null;
  return prevCounty.files.find((row) => row.url === url) || null;
}

function collectCandidates(county, adsRow, extra) {
  const hints = catalog.yearHintMap(county.id);
  const seen = new Map();
  const add = (url, year) => {
    if (!url || seen.has(url)) return;
    if (!catalog.looksLikeListing(url) && !hints[url]) return;
    seen.set(url, { url, year: year || hints[url] || catalog.yearFrom(url) || null });
  };
  catalog.seedsFor(county.id).forEach((row) => add(row.url, row.year));
  if (county.listingSampleUrl) add(county.listingSampleUrl, catalog.yearFrom(county.listingSampleUrl));
  if (county.listingUrl) add(county.listingUrl, catalog.yearFrom(county.listingUrl));
  const seed = calendar.getSeed(county.id) || {};
  (seed.listingWatchUrls || []).forEach((url) => add(url, catalog.yearFrom(url)));
  (seed.extraUrls || []).forEach((url) => add(url, catalog.yearFrom(url)));
  const scan = adsRow && adsRow.lastScan;
  for (const link of (scan && scan.listingLinks) || []) {
    add(link.href, catalog.yearFrom(link.href, link.text));
  }
  for (const head of (scan && scan.heads) || []) {
    add(head.url, catalog.yearFrom(head.url, head.lastModified));
  }
  for (const row of extra || []) add(row.url, row.year);
  return [...seen.values()];
}

async function ingestUrl(county, candidate, prevCounty, inboxDir, fetchFn) {
  const cached = previousFile(prevCounty, candidate.url);
  let head = null;
  try {
    head = await fetchBuf(candidate.url, "HEAD", fetchFn);
  } catch (_err) {
    head = null;
  }
  const lastModified = (head && head.lastModified) || null;
  if (cached && cached.ids && cached.ids.length >= MIN_IDS && lastModified && cached.lastModified === lastModified) {
    return {
      url: cached.url,
      year: cached.year || candidate.year,
      lastModified,
      idCount: cached.ids.length,
      reused: true,
      extracted: {
        ids: cached.ids,
        amounts: cached.amounts || {},
        kinds: {},
        count: cached.ids.length,
      },
    };
  }
  let got;
  try {
    got = await fetchBuf(candidate.url, "GET", fetchFn);
  } catch (err) {
    return { skip: String(err.message || err).slice(0, 80), url: candidate.url };
  }
  if (!got.ok || got.buf.length < 400) {
    return { skip: "http-" + got.status + "-bytes-" + got.buf.length, url: candidate.url };
  }
  const year = candidate.year || catalog.yearFrom(got.url, got.lastModified) || catalog.yearFrom(candidate.url) || null;
  const ext = guessExt(got.url, got.contentType);
  const dest = path.join(inboxDir, county.id + "-" + (year || "unk") + "-" + Date.now() + ext);
  fs.mkdirSync(inboxDir, { recursive: true });
  fs.writeFileSync(dest, got.buf);
  const extracted = extractIds(textFromBuffer(dest, got.contentType, got.buf));
  if (extracted.count < MIN_IDS) {
    try { fs.unlinkSync(dest); } catch (_err) { /* keep going */ }
    return { skip: "ids-" + extracted.count + ext, url: candidate.url };
  }
  return {
    url: got.url,
    year,
    lastModified: got.lastModified,
    idCount: extracted.count,
    reused: false,
    extracted,
  };
}

function pairScore(recent, historic) {
  const both = intersect(recent.extracted, historic.extracted);
  const ratio = historic.idCount / Math.max(recent.idCount, 1);
  const penalty = ratio > 2.5 ? 0.35 : 1;
  return { both, score: both.length * penalty };
}

function pickSides(files, windows) {
  const recentSet = new Set(windows.recent);
  const historicSet = new Set(windows.historic);
  const recentCands = files.filter((f) => recentSet.has(f.year)).sort((a, b) => b.year - a.year || b.idCount - a.idCount);
  const historicCands = files.filter((f) => historicSet.has(f.year));
  const recent = recentCands[0] || null;
  if (!recent || !historicCands.length) {
    return { recent, historic: historicCands.sort((a, b) => a.year - b.year)[0] || null, both: [] };
  }
  let best = null;
  for (const historic of historicCands) {
    if (historic.url === recent.url) continue;
    const ranked = pairScore(recent, historic);
    if (!best || ranked.score > best.score) best = { historic, both: ranked.both, score: ranked.score };
  }
  return { recent, historic: best ? best.historic : null, both: best ? best.both : [] };
}

function publicFile(file) {
  if (!file) return null;
  return { year: file.year || null, url: file.url, idCount: file.idCount };
}

function buildCountyRow(county, files, windows, changed) {
  const sides = pickSides(files, windows);
  return {
    id: county.id,
    name: county.name,
    recent: publicFile(sides.recent),
    historic: publicFile(sides.historic),
    bothCount: sides.both.length,
    both: sides.both,
    changed: Boolean(changed),
    files: files.map((file) => ({
      url: file.url,
      year: file.year || null,
      lastModified: file.lastModified || null,
      idCount: file.idCount,
      ids: file.extracted.ids,
      amounts: file.extracted.amounts,
    })),
  };
}

function buildSnapshot(counties, rows, now, windows) {
  const season = calendar.SEASON;
  const win = windows || yearWindows(season);
  const list = counties.map((county) => (
    rows[county.id] || {
      id: county.id,
      name: county.name,
      recent: null,
      historic: null,
      bothCount: 0,
      both: [],
      changed: false,
      files: [],
    }
  ));
  const both = list.reduce((sum, row) => sum + row.bothCount, 0);
  return {
    season,
    generatedAt: (now instanceof Date ? now : new Date()).toISOString(),
    recentYears: win.recent,
    historicYears: win.historic,
    source: "Official leftover and current sale lists crossed with hosted 2020–2022 lists. Identifiers only.",
    bothCount: both,
    withBoth: list.filter((row) => row.bothCount).length,
    withRecent: list.filter((row) => row.recent).length,
    withHistoric: list.filter((row) => row.historic).length,
    changedCount: list.filter((row) => row.changed).length,
    counties: list,
  };
}

function publicSnapshot(snapshot) {
  return {
    season: snapshot.season,
    generatedAt: snapshot.generatedAt,
    bothCount: snapshot.bothCount,
    withBoth: snapshot.withBoth,
    withRecent: snapshot.withRecent,
    withHistoric: snapshot.withHistoric,
    changedCount: snapshot.changedCount,
    countyCount: snapshot.counties.length,
    both: snapshot.counties.filter((row) => row.bothCount).map((row) => ({
      id: row.id,
      bothCount: row.bothCount,
    })),
  };
}

function snapshotPaths() {
  return {
    counties: path.join(ROOT, "counties", "repeat.json"),
    site: path.join(ROOT, "site", "data", "repeat.json"),
  };
}

function stripOwners(snapshot) {
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    for (const key of Object.keys(node)) {
      if (/^(owner|owner_name|owner_location|hasOwner|owner1)$/i.test(key)) {
        throw new Error("repeat snapshot refused to write owner fields");
      }
      walk(node[key]);
    }
  };
  walk(snapshot);
  return snapshot;
}

function countyPublic(row, withCache) {
  const out = {
    id: row.id,
    name: row.name,
    recent: row.recent,
    historic: row.historic,
    bothCount: row.bothCount,
    both: row.both,
    changed: row.changed,
  };
  if (withCache) out.files = row.files || [];
  return out;
}

function writeSnapshot(snapshot) {
  const files = snapshotPaths();
  const note = "Parcel identifiers and amounts only. Owner names are not stored.";
  const shared = {
    season: snapshot.season,
    generatedAt: snapshot.generatedAt,
    recentYears: snapshot.recentYears,
    historicYears: snapshot.historicYears,
    source: snapshot.source,
    note,
    bothCount: snapshot.bothCount,
    withBoth: snapshot.withBoth,
    withRecent: snapshot.withRecent,
    withHistoric: snapshot.withHistoric,
    changedCount: snapshot.changedCount,
  };
  const siteView = stripOwners({
    ...shared,
    counties: snapshot.counties.map((row) => countyPublic(row, false)),
  });
  const cacheDir = path.join(ROOT, "inbox", "repeat");
  fs.mkdirSync(path.dirname(files.site), { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(files.counties, JSON.stringify(siteView, null, 2) + "\n");
  fs.writeFileSync(files.site, JSON.stringify(siteView, null, 2) + "\n");
  fs.writeFileSync(path.join(cacheDir, "cache.json"), JSON.stringify({
    ...shared,
    counties: snapshot.counties.map((row) => countyPublic(row, true)),
  }) + "\n");
  return files;
}

function loadPrevious() {
  const cache = path.join(ROOT, "inbox", "repeat", "cache.json");
  const file = fs.existsSync(cache) ? cache : snapshotPaths().counties;
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_err) {
    return null;
  }
}

async function run(counties, options) {
  const opts = options || {};
  const windows = yearWindows(opts.season || calendar.SEASON);
  const adsById = Object.fromEntries(((opts.ads && opts.ads.counties) || []).map((row) => [row.id, row]));
  const prevById = Object.fromEntries(((opts.previous && opts.previous.counties) || []).map((row) => [row.id, row]));
  const inboxDir = opts.inboxDir || path.join(ROOT, "inbox", "repeat");
  const selected = counties.filter((county) => !opts.countyId || county.id === opts.countyId);
  let florenceExtra = [];
  if (!opts.countyId || opts.countyId === "florence") {
    florenceExtra = await catalog.discoverFlorence(opts.fetchFn);
  }
  const rows = {};
  await mapLimit(selected, opts.concurrency || CONCURRENCY, async (county) => {
    const extra = county.id === "florence" ? florenceExtra : [];
    const candidates = collectCandidates(county, adsById[county.id], extra);
    const files = [];
    let changed = false;
    for (const candidate of candidates) {
      const got = await ingestUrl(county, candidate, prevById[county.id], inboxDir, opts.fetchFn);
      if (!got || got.skip) continue;
      if (!got.reused) changed = true;
      files.push(got);
    }
    const local = localHistoricPath(county.id);
    if (local) {
      const raw = fs.readFileSync(local);
      const extracted = extractIds(textFromBuffer(local, "application/json", raw));
      if (extracted.count >= MIN_IDS) {
        files.push({
          url: "local:full_2022_structured.json",
          year: 2022,
          lastModified: null,
          idCount: extracted.count,
          reused: true,
          extracted,
        });
      }
    }
    rows[county.id] = buildCountyRow(county, files, windows, changed);
  });
  return buildSnapshot(counties, rows, opts.now, windows);
}

module.exports = {
  yearWindows,
  collectCandidates,
  pickSides,
  pairScore,
  buildCountyRow,
  buildSnapshot,
  publicSnapshot,
  writeSnapshot,
  snapshotPaths,
  loadPrevious,
  run,
  guessExt,
  textFromBuffer,
  USER_AGENT,
};
