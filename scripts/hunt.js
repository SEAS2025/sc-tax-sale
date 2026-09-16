#!/usr/bin/env node
"use strict";

/**
 * Hunt for officially hosted delinquent tax-sale lists on both sides of the
 * five-year window.
 *
 * Sources are public records only: county treasurer hosts, their CivicPlus
 * document centers, public object-storage prefixes, and the Wayback Machine's
 * captures of those same official hosts. Owner names are never parsed, kept,
 * or written; a confirmed find records only the URL, the sale year, and how
 * many parcel identifiers the file yielded.
 *
 * Resumable: every probe verdict lands in inbox/hunt/state.json, so a rerun
 * skips URLs it has already judged and picks up at the next county.
 *
 *   node scripts/hunt.js                 # every county, priority order
 *   node scripts/hunt.js --only horry,oconee
 *   node scripts/hunt.js --skip-wayback --max-doc-id 800
 */

const fs = require("fs");
const path = require("path");
const catalog = require("../engine/listings-catalog");
const repeat = require("../engine/repeat");
const calendar = require("../engine/ads-calendar");
const { extractIds } = require("../engine/extract-ids");
const { SEEDS: HOME_SEEDS } = require("./county-seeds");

const ROOT = path.join(__dirname, "..");
const HUNT_DIR = path.join(ROOT, "inbox", "hunt");
const FILE_DIR = path.join(HUNT_DIR, "files");
const STATE_FILE = path.join(HUNT_DIR, "state.json");
const DISCOVERED = path.join(ROOT, "engine", "listings-discovered.json");
const REGISTRY = path.join(ROOT, "counties", "sc.json");

const MIN_IDS = 8;
const RECENT_YEARS = new Set([2024, 2025, 2026]);
const HISTORIC_YEARS = new Set([2020, 2021, 2022]);

// Politeness profiles. Wayback gets one request at a time with a wide gap
// because earlier runs tripped its 503 rate limiter.
const PROFILE_SITE = { concurrency: 2, minIntervalMs: 900 };
const PROFILE_SWEEP = { concurrency: 4, minIntervalMs: 260 };
const PROFILE_WAYBACK = { concurrency: 1, minIntervalMs: 6000 };

// Counties whose current list is hosted but whose ~2020-2022 archive is
// missing convert to paired parcels the moment one archive lands, so they run
// first. Then the two that need a current list, then everything unhosted.
const PRIORITY = [
  "bamberg", "colleton", "dillon", "georgetown", "greenville", "horry", "oconee",
  "beaufort", "cherokee",
];

const DOC_CENTER_HINT = /DocumentCenter\/View\//i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (_err) {
    return "";
  }
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch (_err) {
    return "";
  }
}

function log(...parts) {
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log("[" + stamp + "]", ...parts);
}

/* ---------------------------------------------------------------- limiter */

const LIMITS = new Map();

function limiterFor(host, profile) {
  let lim = LIMITS.get(host);
  if (!lim) {
    lim = { running: 0, last: 0, queue: [], ...profile };
    LIMITS.set(host, lim);
  }
  return lim;
}

function pump(lim) {
  if (lim.running >= lim.concurrency || !lim.queue.length) return;
  const gap = lim.last + lim.minIntervalMs - Date.now();
  if (gap > 0) {
    if (!lim.timer) {
      lim.timer = setTimeout(() => {
        lim.timer = null;
        pump(lim);
      }, gap);
    }
    return;
  }
  const job = lim.queue.shift();
  lim.running += 1;
  lim.last = Date.now();
  Promise.resolve()
    .then(job.task)
    .then(job.resolve, job.reject)
    .finally(() => {
      lim.running -= 1;
      pump(lim);
    });
  pump(lim);
}

function schedule(host, profile, task) {
  const lim = limiterFor(host || "unknown", profile);
  return new Promise((resolve, reject) => {
    lim.queue.push({ task, resolve, reject });
    pump(lim);
  });
}

/* ------------------------------------------------------------------ fetch */

function backoffMs(attempt, response) {
  const retryAfter = response && response.headers && response.headers.get("retry-after");
  const hinted = retryAfter && /^\d+$/.test(retryAfter.trim()) ? Number(retryAfter) * 1000 : 0;
  return Math.max(hinted, Math.min(120000, 3000 * Math.pow(2, attempt)) + Math.floor(Math.random() * 1500));
}

async function politeFetch(url, options) {
  const opts = options || {};
  const profile = opts.profile || PROFILE_SITE;
  const retries = opts.retries == null ? 3 : opts.retries;
  const host = hostOf(url);
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await schedule(host, profile, () => fetch(catalog.encodeUrl(url), {
        method: opts.method || "GET",
        redirect: "follow",
        headers: Object.assign({ "user-agent": repeat.USER_AGENT }, opts.headers || {}),
        signal: AbortSignal.timeout(opts.timeoutMs || 30000),
      }));
      if ([429, 502, 503, 504].includes(response.status) && attempt < retries) {
        await sleep(backoffMs(attempt, response));
        continue;
      }
      return response;
    } catch (err) {
      lastError = err;
      if (attempt < retries) await sleep(backoffMs(attempt, null));
    }
  }
  if (lastError) throw lastError;
  return null;
}

/* ------------------------------------------------------------------ state */

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_err) {
    return fallback;
  }
}

function saveJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

const state = loadJson(STATE_FILE, { verdicts: {}, counties: {} });
if (!state.verdicts) state.verdicts = {};
if (!state.counties) state.counties = {};

function saveState() {
  saveJson(STATE_FILE, state);
}

/* ------------------------------------------------------------ known hosts */

function registryCounties() {
  const reg = loadJson(REGISTRY, { counties: [] });
  return reg.counties || [];
}

function countyHosts(county) {
  const urls = []
    .concat(HOME_SEEDS[county.id] || [])
    .concat(county.homepage ? [county.homepage] : [])
    .concat(county.treasurerUrl ? [county.treasurerUrl] : [])
    .concat(county.listingUrl ? [county.listingUrl] : [])
    .concat(county.listingSampleUrl ? [county.listingSampleUrl] : [])
    .concat(catalog.seedsFor(county.id).map((row) => row.url))
    .concat(((calendar.getSeed(county.id) || {}).extraUrls) || [])
    .concat(((calendar.getSeed(county.id) || {}).listingWatchUrls) || []);
  const hosts = new Set();
  for (const url of urls) {
    const host = hostOf(url);
    // Wayback and generic archives are tools, not county hosts.
    if (!host || /web\.archive\.org|archive\.org/.test(host)) continue;
    hosts.add(host);
  }
  return [...hosts];
}

function countyStartUrls(county) {
  const urls = []
    .concat(HOME_SEEDS[county.id] || [])
    .concat(county.treasurerUrl ? [county.treasurerUrl] : [])
    .concat(county.listingUrl ? [county.listingUrl] : [])
    .concat(((calendar.getSeed(county.id) || {}).extraUrls) || []);
  return [...new Set(urls.filter(Boolean))];
}

/* ------------------------------------------------------------- validation */

function alreadyKnown(countyId, url) {
  return catalog.seedsFor(countyId).some((row) => row.url === url);
}

function yearOfCandidate(candidate) {
  if (candidate.year) return candidate.year;
  return catalog.yearFrom(candidate.url);
}

/**
 * Download a candidate once and count the parcel identifiers in it. A file
 * only counts as a listing when it yields real identifiers; a schedule of
 * events or a bidder form will not.
 */
async function validate(countyId, candidate) {
  const key = countyId + "|" + candidate.url;
  if (state.verdicts[key]) return state.verdicts[key];
  let verdict = { url: candidate.url, year: yearOfCandidate(candidate), source: candidate.source, ok: false };
  try {
    const response = await politeFetch(candidate.url, {
      profile: candidate.profile || PROFILE_SITE,
      timeoutMs: candidate.timeoutMs || 45000,
      retries: candidate.retries == null ? 2 : candidate.retries,
    });
    if (!response || !response.ok) {
      verdict.reason = "http-" + (response ? response.status : "error");
    } else {
      const contentType = response.headers.get("content-type") || "";
      const buf = Buffer.from(await response.arrayBuffer());
      if (buf.length < 400) {
        verdict.reason = "tiny-" + buf.length;
      } else {
        fs.mkdirSync(FILE_DIR, { recursive: true });
        const ext = repeat.guessExt(response.url || candidate.url, contentType);
        const dest = path.join(FILE_DIR, countyId + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7) + ext);
        fs.writeFileSync(dest, buf);
        let extracted = { count: 0 };
        try {
          extracted = extractIds(repeat.textFromBuffer(dest, contentType, buf));
        } catch (err) {
          verdict.reason = "parse-" + String(err.message || err).slice(0, 40);
        }
        verdict.idCount = extracted.count || 0;
        if (extracted.count >= MIN_IDS) {
          verdict.ok = true;
          verdict.reason = "ids-" + extracted.count;
          verdict.finalUrl = response.url || candidate.url;
        } else {
          verdict.reason = verdict.reason || "ids-" + (extracted.count || 0);
          try { fs.unlinkSync(dest); } catch (_err) { /* leave it */ }
        }
      }
    }
  } catch (err) {
    verdict.reason = String(err.message || err).slice(0, 60);
  }
  state.verdicts[key] = verdict;
  saveState();
  return verdict;
}

/* --------------------------------------------------------------- wayback */

function waybackUrl(timestamp, original) {
  return "https://web.archive.org/web/" + timestamp + "id_/" + original;
}

const CDX_KEEP = /\.(pdf|xls|xlsx|csv)(\?|$)/i;

async function cdxRows(host, from, to) {
  // matchType=domain covers the bare domain and every subdomain in one query.
  // Asking for "www.host/*" alone silently misses captures filed under the
  // bare host, which is how the first pass came back empty.
  const url = "https://web.archive.org/cdx/search/cdx"
    + "?url=" + encodeURIComponent(host) + "&matchType=domain"
    + "&output=json&fl=original,timestamp,statuscode,mimetype,length"
    + "&filter=statuscode:200"
    + "&filter=urlkey:.*(tax|delinq|sale|realad|advertis|forfeit).*"
    + "&collapse=urlkey&limit=900"
    + "&from=" + from + "&to=" + to;
  try {
    const response = await politeFetch(url, {
      profile: PROFILE_WAYBACK,
      timeoutMs: 120000,
      retries: 6,
    });
    if (!response || !response.ok) {
      log("    cdx", host, from + "-" + to, "http", response ? response.status : "error");
      return [];
    }
    const body = await response.text();
    if (!body.trim()) {
      log("    cdx", host, from + "-" + to, "no captures");
      return [];
    }
    let rows;
    try {
      rows = JSON.parse(body);
    } catch (_err) {
      log("    cdx", host, from + "-" + to, "non-json reply", body.slice(0, 60).replace(/\s+/g, " "));
      return [];
    }
    if (!Array.isArray(rows) || rows.length < 2) {
      log("    cdx", host, from + "-" + to, "no captures");
      return [];
    }
    return rows.slice(1).map((row) => ({
      original: row[0],
      timestamp: row[1],
      status: row[2],
      mimetype: row[3],
      length: Number(row[4]) || 0,
    }));
  } catch (err) {
    log("    cdx", host, from + "-" + to, "failed", String(err.message || err).slice(0, 60));
    return [];
  }
}

function rankCdx(row) {
  const blob = row.original;
  let score = 0;
  if (/delinq/i.test(blob)) score += 6;
  if (/tax[\s._%-]*sale|taxsale/i.test(blob)) score += 5;
  if (/realad|real[\s._%-]*estate[\s._%-]*ad|advertis/i.test(blob)) score += 4;
  if (/list/i.test(blob)) score += 3;
  if (/\.xlsx?(\?|$)/i.test(blob)) score += 2;
  if (row.length > 40000) score += 2;
  if (row.length > 200000) score += 1;
  return score;
}

async function huntWayback(county, want, budget) {
  const found = [];
  const hosts = [...new Set(countyHosts(county).map((host) => host.replace(/^www\./, "")))];
  if (!hosts.length) return found;
  const spans = want === "historic" ? [["2019", "2022"]] : [["2023", "2026"]];
  for (const host of hosts) {
    for (const [from, to] of spans) {
      const rows = await cdxRows(host, from, to);
      if (!rows.length) continue;
      const wanted = rows
        .filter((row) => CDX_KEEP.test(row.original) || /pdf|excel|spreadsheet/i.test(row.mimetype || ""))
        .filter((row) => catalog.looksLikeListing(row.original))
        .filter((row) => row.length === 0 || row.length > 8000)
        .map((row) => ({ row, score: rankCdx(row) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, budget);
      log("    cdx", host, from + "-" + to, rows.length + " rows,", wanted.length + " listing-like");
      for (const { row } of wanted) {
        const year = Number(String(row.timestamp).slice(0, 4));
        const target = want === "historic" ? HISTORIC_YEARS : RECENT_YEARS;
        if (!target.has(year)) continue;
        const url = waybackUrl(row.timestamp, row.original);
        if (alreadyKnown(county.id, url)) continue;
        const verdict = await validate(county.id, {
          url,
          year,
          source: "wayback:" + host,
          profile: PROFILE_WAYBACK,
          timeoutMs: 120000,
          retries: 2,
        });
        log("      ", verdict.ok ? "HIT " : "miss", year, verdict.reason, row.original.slice(0, 110));
        if (verdict.ok) found.push(verdict);
        if (found.length >= 3) return found;
      }
    }
  }
  return found;
}

/* --------------------------------------------------- CivicPlus doc center */

function filenameFromHead(response) {
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  return match ? decodeURIComponent(match[1].replace(/"$/, "")) : "";
}

async function docCenterSweep(county, origin, maxId, want) {
  const found = [];
  const hits = [];
  const target = want === "historic" ? HISTORIC_YEARS : RECENT_YEARS;
  const ids = [];
  for (let id = 1; id <= maxId; id += 1) ids.push(id);
  let scanned = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (ids.length) {
      const id = ids.shift();
      const url = origin + "/DocumentCenter/View/" + id;
      try {
        const response = await politeFetch(url, {
          method: "HEAD",
          profile: PROFILE_SWEEP,
          timeoutMs: 15000,
          retries: 1,
        });
        scanned += 1;
        if (!response || !response.ok) continue;
        const name = filenameFromHead(response);
        if (!name) continue;
        if (!catalog.looksLikeListing(name)) continue;
        hits.push({ id, url, name });
      } catch (_err) {
        // a dead document id is normal; keep sweeping
      }
    }
  }));
  log("    doccenter", origin, "scanned", scanned, "listing-like", hits.length);
  hits.sort((a, b) => b.id - a.id);
  for (const hit of hits.slice(0, 40)) {
    const year = catalog.yearFrom(hit.name);
    if (year && !target.has(year)) continue;
    if (alreadyKnown(county.id, hit.url)) continue;
    const verdict = await validate(county.id, {
      url: hit.url,
      year: year || null,
      source: "doccenter:" + originOf(origin),
    });
    log("      ", verdict.ok ? "HIT " : "miss", verdict.year || "?", verdict.reason, hit.name.slice(0, 80));
    if (verdict.ok && verdict.year && target.has(verdict.year)) found.push(verdict);
    if (found.length >= 3) break;
  }
  return found;
}

/* -------------------------------------------------------------- site walk */

function absolute(base, href) {
  try {
    return new URL(href, base).toString();
  } catch (_err) {
    return null;
  }
}

function linksIn(html, base) {
  const out = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,220}?)<\/a>/gi;
  let match;
  while ((match = re.exec(html))) {
    const href = absolute(base, match[1]);
    if (!href || /^(javascript|mailto|tel):/i.test(match[1])) continue;
    const text = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
    out.push({ href: href.split("#")[0], text });
  }
  return out;
}

const DOC_RE = /\.(pdf|xls|xlsx|csv)(\?|$)/i;

async function crawlSite(county, want, blocked) {
  const found = [];
  const hosts = new Set(countyHosts(county));
  const target = want === "historic" ? HISTORIC_YEARS : RECENT_YEARS;
  const queue = countyStartUrls(county).map((url) => ({ url, depth: 0 }));
  const seen = new Set();
  const docs = new Map();
  while (queue.length) {
    const { url, depth } = queue.shift();
    if (seen.has(url) || seen.size > 40) continue;
    seen.add(url);
    let response;
    try {
      response = await politeFetch(url, { profile: PROFILE_SITE, timeoutMs: 30000, retries: 1 });
    } catch (err) {
      continue;
    }
    if (!response) continue;
    if (response.status === 403 || response.status === 401) {
      blocked.add(hostOf(url) + " http-" + response.status);
      continue;
    }
    if (!response.ok) continue;
    const contentType = response.headers.get("content-type") || "";
    if (!/html/i.test(contentType)) continue;
    const html = await response.text();
    if (DOC_CENTER_HINT.test(html)) county._civicplus = true;
    for (const link of linksIn(html, response.url || url)) {
      const host = hostOf(link.href);
      if (DOC_RE.test(link.href) || DOC_CENTER_HINT.test(link.href)) {
        if (!hosts.has(host)) continue;
        if (!catalog.looksLikeListing(link.href, link.text)) continue;
        if (!docs.has(link.href)) docs.set(link.href, link.text);
        continue;
      }
      if (depth >= 1) continue;
      if (!hosts.has(host)) continue;
      if (!/delinquent|tax-?sale|tax_sale|treasurer|tax-collector|document-?center/i.test(link.href + " " + link.text)) continue;
      queue.push({ url: link.href, depth: depth + 1 });
    }
  }
  log("    crawl", county.id, "pages", seen.size, "listing-like docs", docs.size);
  for (const [url, text] of docs) {
    if (alreadyKnown(county.id, url)) continue;
    const year = catalog.yearFrom(url, text);
    if (year && !target.has(year)) continue;
    const verdict = await validate(county.id, { url, year: year || null, source: "crawl" });
    log("      ", verdict.ok ? "HIT " : "miss", verdict.year || "?", verdict.reason, url.slice(0, 110));
    if (verdict.ok && verdict.year && target.has(verdict.year)) found.push(verdict);
    if (found.length >= 3) break;
  }
  return found;
}

/* ------------------------------------------------- public object storage */

const S3_PATTERNS = [
  (host) => "https://s3.us-east-1.amazonaws.com/files." + host + "/?list-type=2&max-keys=400",
  (host) => "https://files." + host + "/?list-type=2&max-keys=400",
];

async function probeObjectStorage(county, want) {
  const found = [];
  const target = want === "historic" ? HISTORIC_YEARS : RECENT_YEARS;
  for (const host of countyHosts(county)) {
    const bare = host.replace(/^www\./, "");
    for (const make of S3_PATTERNS) {
      const url = make(bare);
      let response;
      try {
        response = await politeFetch(url, { profile: PROFILE_SITE, timeoutMs: 20000, retries: 1 });
      } catch (_err) {
        continue;
      }
      if (!response || !response.ok) continue;
      const xml = await response.text();
      if (!/<ListBucketResult/i.test(xml)) continue;
      const base = url.split("?")[0];
      const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
      const wanted = keys.filter((key) => catalog.looksLikeListing(key));
      log("    s3", base, keys.length, "keys,", wanted.length, "listing-like");
      for (const key of wanted.slice(0, 25)) {
        const year = catalog.yearFrom(key);
        if (year && !target.has(year)) continue;
        const target2 = base + key.split("/").map(encodeURIComponent).join("/");
        if (alreadyKnown(county.id, target2)) continue;
        const verdict = await validate(county.id, { url: target2, year: year || null, source: "s3" });
        if (verdict.ok && verdict.year && target.has(verdict.year)) found.push(verdict);
      }
    }
  }
  return found;
}

/* ------------------------------------------------------------- discovered */

function recordFinds(countyId, finds) {
  if (!finds.length) return;
  const discovered = loadJson(DISCOVERED, {});
  const list = discovered[countyId] || [];
  for (const find of finds) {
    if (list.some((row) => row.url === find.url)) continue;
    list.push({
      url: find.url,
      year: find.year,
      idCount: find.idCount,
      source: find.source,
      confirmedAt: new Date().toISOString().slice(0, 10),
    });
  }
  discovered[countyId] = list;
  saveJson(DISCOVERED, discovered);
}

/* ------------------------------------------------------------ checkpoint */

const { execFileSync } = require("child_process");

function git(args, allowFail) {
  try {
    return execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000,
    });
  } catch (err) {
    if (!allowFail) log("    git", args.join(" "), "failed:", String(err.message || err).split("\n")[0].slice(0, 120));
    return null;
  }
}

/**
 * Commit only the derived, owner-free artifacts. inbox/ is gitignored, so the
 * downloaded listing files, the workbook, and the report PDF never enter git.
 */
function checkpoint(message) {
  const tracked = [
    "engine/listings-discovered.json",
    "engine/listings-catalog.js",
    "counties/repeat.json",
    "site/data/repeat.json",
    "docs/HUNT_STATUS.md",
  ].filter((rel) => fs.existsSync(path.join(ROOT, rel)));
  if (!tracked.length) return;
  git(["add"].concat(tracked), true);
  const staged = git(["diff", "--cached", "--name-only"], true);
  if (!staged || !staged.trim()) return;
  git([
    "-c", "user.name=SEAS2025",
    "-c", "user.email=SEAS2025@users.noreply.github.com",
    "commit", "-q", "-m", message,
  ], true);
  // The bundle is the reboot-proof copy; a GitHub push may be refused for
  // scope reasons and must never abort the hunt.
  git(["bundle", "create", path.join(process.env.HOME || "/tmp", "sc-tax-sale-progress.bundle"), "main"], true);
  git(["push", "origin", "HEAD"], true);
  log("    checkpoint:", message);
}

/* ------------------------------------------------------------------ main */

function parseArgs() {
  const argv = process.argv.slice(2);
  const opts = { only: null, skipWayback: false, maxDocId: 4000, skipSweep: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--only") opts.only = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (argv[i] === "--skip-wayback") opts.skipWayback = true;
    else if (argv[i] === "--skip-sweep") opts.skipSweep = true;
    else if (argv[i] === "--max-doc-id") opts.maxDocId = Number(argv[++i]) || 4000;
  }
  return opts;
}

function needsOf(countyId, snapshot) {
  const row = (snapshot.counties || []).find((c) => c.id === countyId);
  if (!row) return { recent: true, historic: true };
  return { recent: !row.recent, historic: !row.historic };
}

async function huntCounty(county, needs, opts) {
  const blocked = new Set();
  const finds = [];
  const wants = [];
  if (needs.historic) wants.push("historic");
  if (needs.recent) wants.push("recent");
  log("county", county.id, "needs:", wants.join("+") || "nothing");
  if (!wants.length) return { finds, blocked: [] };

  for (const want of wants) {
    log("  phase crawl /", want);
    try {
      finds.push(...await crawlSite(county, want, blocked));
    } catch (err) {
      log("    crawl failed", String(err.message || err).slice(0, 80));
    }

    log("  phase object-storage /", want);
    try {
      finds.push(...await probeObjectStorage(county, want));
    } catch (err) {
      log("    s3 failed", String(err.message || err).slice(0, 80));
    }

    if (!opts.skipSweep && county._civicplus) {
      for (const host of countyHosts(county)) {
        log("  phase doccenter /", want, host);
        try {
          finds.push(...await docCenterSweep(county, "https://" + host, opts.maxDocId, want));
        } catch (err) {
          log("    doccenter failed", String(err.message || err).slice(0, 80));
        }
      }
    }

    if (!opts.skipWayback) {
      log("  phase wayback /", want);
      try {
        finds.push(...await huntWayback(county, want, 18));
      } catch (err) {
        log("    wayback failed", String(err.message || err).slice(0, 80));
      }
    }
  }

  const unique = [];
  for (const find of finds) {
    if (!unique.some((row) => row.url === find.url)) unique.push(find);
  }
  return { finds: unique, blocked: [...blocked] };
}

async function main() {
  const opts = parseArgs();
  fs.mkdirSync(HUNT_DIR, { recursive: true });
  const snapshot = loadJson(path.join(ROOT, "site", "data", "repeat.json"), { counties: [] });
  const all = registryCounties();
  const byId = Object.fromEntries(all.map((c) => [c.id, c]));
  const order = PRIORITY.filter((id) => byId[id]).concat(all.map((c) => c.id).filter((id) => !PRIORITY.includes(id)));
  const ids = opts.only ? opts.only.filter((id) => byId[id]) : order;

  log("hunt start;", ids.length, "counties; pid", process.pid);
  for (const id of ids) {
    const county = byId[id];
    const needs = needsOf(id, snapshot);
    if (!needs.recent && !needs.historic) {
      log("county", id, "already paired-capable, skipping");
      continue;
    }
    let result;
    try {
      result = await huntCounty(county, needs, opts);
    } catch (err) {
      log("county", id, "FAILED", String(err.message || err).slice(0, 120));
      result = { finds: [], blocked: ["error: " + String(err.message || err).slice(0, 80)] };
    }
    state.counties[id] = {
      ranAt: new Date().toISOString(),
      needs,
      found: result.finds.map((f) => ({ url: f.url, year: f.year, idCount: f.idCount, source: f.source })),
      blocked: result.blocked,
    };
    saveState();
    recordFinds(id, result.finds);
    log("county", id, "done;", result.finds.length, "confirmed");
    if (result.finds.length) checkpoint("Record hosted delinquent lists found for " + county.name + " County.");
  }
  log("hunt complete");
}

main().catch((err) => {
  log("fatal", err && err.stack ? err.stack : String(err));
  process.exit(1);
});
