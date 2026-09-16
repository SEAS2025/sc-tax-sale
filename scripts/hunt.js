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
const PROFILE_SWEEP = { concurrency: 8, minIntervalMs: 110 };
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

/**
 * One bucket per host. The bucket used to keep whichever profile happened to
 * create it, so a host first touched by the slow crawl profile stayed at that
 * pace forever -- a HEAD sweep asking for 110 ms between probes silently ran
 * at 900 ms with two slots, turning a 7-minute sweep into an hour of near
 * silence. The requested profile now takes effect on every acquire.
 */
function limiterFor(host, profile) {
  let lim = LIMITS.get(host);
  if (!lim) {
    lim = { running: 0, last: 0, queue: [], timer: null, concurrency: 1, minIntervalMs: 1000 };
    LIMITS.set(host, lim);
  }
  if (profile) {
    if (profile.concurrency) lim.concurrency = profile.concurrency;
    if (profile.minIntervalMs != null) lim.minIntervalMs = profile.minIntervalMs;
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
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    lim.running -= 1;
    pump(lim);
  };
  // Release before settling the caller, on both paths. Doing it in a trailing
  // .finally() also works but leaves lim.running briefly overstated while the
  // caller runs, which makes the invariant untestable and easy to break.
  Promise.resolve()
    .then(job.task)
    .then(
      (value) => {
        release();
        job.resolve(value);
      },
      (err) => {
        release();
        job.reject(err);
      },
    );
  pump(lim);
}

function schedule(host, profile, task) {
  const lim = limiterFor(host || "unknown", profile);
  return new Promise((resolve, reject) => {
    lim.queue.push({ task, resolve, reject });
    pump(lim);
  });
}

/* ---------------------------------------------------------------- watchdog */

const STALL_MS = 5 * 60 * 1000;

/**
 * Run one phase under a stall watchdog. A phase that reports no progress for
 * STALL_MS is abandoned loudly and the crawl moves on: finishing the state
 * with known gaps beats burning an hour on a wedged host. Phases cooperate by
 * calling ctx.touch() as they work and checking ctx.expired in their loops,
 * because an abandoned promise in JS keeps running otherwise.
 */
function runPhase(label, fn, stallMs) {
  const limit = stallMs || STALL_MS;
  const ctx = {
    label,
    expired: false,
    last: Date.now(),
    touch() {
      this.last = Date.now();
    },
  };
  let timer = null;
  const bail = new Promise((resolve) => {
    const tick = () => {
      if (ctx.expired) return;
      if (Date.now() - ctx.last >= limit) {
        ctx.expired = true;
        log("    !! WATCHDOG:", label, "made no progress for", Math.round(limit / 60000), "min; abandoning phase");
        resolve([]);
        return;
      }
      timer = setTimeout(tick, 10000);
    };
    timer = setTimeout(tick, 10000);
  });
  return Promise.race([
    Promise.resolve().then(() => fn(ctx)),
    bail,
  ]).then(
    (value) => {
      clearTimeout(timer);
      ctx.expired = true;
      return Array.isArray(value) ? value : [];
    },
    (err) => {
      clearTimeout(timer);
      ctx.expired = true;
      throw err;
    },
  );
}

/* ------------------------------------------------------------------ fetch */

function backoffMs(attempt, response, capMs) {
  const cap = capMs || 120000;
  const retryAfter = response && response.headers && response.headers.get("retry-after");
  const hinted = retryAfter && /^\d+$/.test(retryAfter.trim()) ? Number(retryAfter) * 1000 : 0;
  const grown = Math.min(cap, 3000 * Math.pow(2, attempt)) + Math.floor(Math.random() * 1500);
  return Math.min(Math.max(hinted, grown), cap);
}

async function politeFetch(url, options) {
  const opts = options || {};
  const profile = opts.profile || PROFILE_SITE;
  const retries = opts.retries == null ? 3 : opts.retries;
  const cap = opts.maxBackoffMs || 120000;
  // A hard ceiling on the whole retry sequence. Without it a run of 503s
  // could legitimately sleep for many minutes per URL, which reads exactly
  // like a hang from the outside.
  const giveUpAt = Date.now() + (opts.totalBudgetMs || 4 * 60 * 1000);
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
        const wait = backoffMs(attempt, response, cap);
        if (Date.now() + wait > giveUpAt) return response;
        await sleep(wait);
        continue;
      }
      // Identify a document from its headers without pulling the file down.
      // CivicPlus answers HEAD with 404 but GET with 200, so a sweep has to
      // issue a GET and then drop the body.
      if (opts.cancelBody && response.body) {
        try {
          await response.body.cancel();
        } catch (_err) {
          // an already-closed stream is fine
        }
      }
      return response;
    } catch (err) {
      lastError = err;
      if (attempt >= retries) break;
      const wait = backoffMs(attempt, null, cap);
      if (Date.now() + wait > giveUpAt) break;
      await sleep(wait);
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

/**
 * A capture timestamp is when the crawler visited, not the year of the sale.
 * cherokeecountysc.gov/wp-content/uploads/2021/12/...-12-3-21.pdf captured in
 * 2024 is still the 2021 list, and filing it as 2024 would drop an archive on
 * the recent side of the five-year window and manufacture a false pair. Trust
 * the year the county put in its own URL; fall back to the capture date only
 * when the URL says nothing at all.
 */
function captureYear(row) {
  return catalog.yearFrom(row.original) || Number(String(row.timestamp).slice(0, 4));
}

const CDX_KEEP = /\.(pdf|xls|xlsx|csv)(\?|$)/i;

// Several counties published the list as a plain page rather than a file
// (Colleton's /2020-tax-sale-list, for one), so an archived HTML capture is
// just as good a source as an archived PDF. Anything with no extension at all
// is treated as a possible page; validate() still demands real identifiers.
const CDX_PAGE = /\.(jpg|jpeg|png|gif|svg|css|js|ico|woff2?|ttf|zip|mp4|webp)(\?|$)/i;

function keepCapture(row) {
  if (CDX_KEEP.test(row.original)) return true;
  const mime = row.mimetype || "";
  if (/pdf|excel|spreadsheet/i.test(mime)) return true;
  if (CDX_PAGE.test(row.original)) return false;
  if (/image|video|audio|font|css|javascript/i.test(mime)) return false;
  // Everything else -- text/html, warc/revisit, or an unknown type -- is worth
  // a look. Revisit records carry no real mimetype but replay perfectly well.
  return true;
}

function bigEnough(row) {
  if (!CDX_KEEP.test(row.original)) return true; // pages and revisits run small
  return row.length === 0 || row.length > 8000;
}

async function cdxRaw(query, label) {
  const url = "https://web.archive.org/cdx/search/cdx?" + query
    + "&output=json&fl=original,timestamp,statuscode,mimetype,length"
    + "&filter=statuscode:200&limit=900";
  try {
    const response = await politeFetch(url, {
      profile: PROFILE_WAYBACK,
      timeoutMs: 120000,
      retries: 6,
    });
    if (!response || !response.ok) {
      log("    cdx", label, "http", response ? response.status : "error");
      return [];
    }
    const body = await response.text();
    let rows = null;
    if (body.trim()) {
      try {
        rows = JSON.parse(body);
      } catch (_err) {
        log("    cdx", label, "non-json reply", body.slice(0, 60).replace(/\s+/g, " "));
        return [];
      }
    }
    if (!Array.isArray(rows) || rows.length < 2) {
      log("    cdx", label, "no captures");
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
    log("    cdx", label, "failed", String(err.message || err).slice(0, 60));
    return [];
  }
}

// matchType=domain covers the bare domain and every subdomain in one query.
// Asking for "www.host/*" alone silently misses captures filed under the
// bare host, which is how the first pass came back empty.
function cdxRows(host, from, to) {
  return cdxRaw("url=" + encodeURIComponent(host) + "&matchType=domain"
    + "&filter=urlkey:.*(tax|delinq|sale|realad|advertis|forfeit).*"
    + "&collapse=urlkey&from=" + from + "&to=" + to, host + " " + from + "-" + to);
}

/**
 * Counties that republish to the same path every year are the best archive
 * source there is: the current list URL, replayed at an older capture, IS the
 * older list. collapse=timestamp:4 keeps one capture per year.
 */
function cdxExact(url, from, to) {
  return cdxRaw("url=" + encodeURIComponent(url) + "&matchType=exact"
    + "&collapse=timestamp:4&from=" + from + "&to=" + to, "exact " + url.slice(-60));
}

/** The folder a county keeps its lists in usually holds the older ones too. */
function cdxPrefix(dirUrl, from, to) {
  return cdxRaw("url=" + encodeURIComponent(dirUrl) + "&matchType=prefix"
    + "&collapse=urlkey&from=" + from + "&to=" + to, "prefix " + dirUrl.slice(-60));
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

function knownListingUrls(county) {
  const urls = catalog.seedsFor(county.id).map((row) => row.url)
    .concat(((calendar.getSeed(county.id) || {}).listingWatchUrls) || [])
    .concat(county.listingSampleUrl ? [county.listingSampleUrl] : []);
  return [...new Set(urls.filter((url) => url && !/web\.archive\.org/.test(url)))];
}

function parentDir(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/");
    parts.pop();
    return parsed.origin + parts.join("/") + "/";
  } catch (_err) {
    return null;
  }
}

/**
 * Try the cheap, high-yield shots first: replay the county's own current list
 * URL at an old capture, then sweep the folder it lives in. Only then fall
 * back to a domain-wide sweep, which is noisy and much slower.
 */
async function waybackTargeted(county, want, from, to, target, ctx) {
  const found = [];
  const seen = new Set();
  const dirs = new Set();
  for (const known of knownListingUrls(county)) {
    if (ctx && ctx.expired) return found;
    if (ctx) ctx.touch();
    const rows = await cdxExact(known, from, to);
    const dir = parentDir(known);
    if (dir) dirs.add(dir);
    for (const row of rows) {
      const year = captureYear(row);
      if (!target.has(year)) continue;
      const url = waybackUrl(row.timestamp, row.original);
      if (seen.has(url) || alreadyKnown(county.id, url)) continue;
      seen.add(url);
      const verdict = await validate(county.id, {
        url, year, source: "wayback-exact", profile: PROFILE_WAYBACK, timeoutMs: 120000, retries: 2,
      });
      log("      ", verdict.ok ? "HIT " : "miss", year, verdict.reason, "(replay of current list URL)");
      if (verdict.ok) found.push(verdict);
      if (found.length >= 2) return found;
    }
  }
  for (const dir of dirs) {
    if (ctx && ctx.expired) return found;
    if (ctx) ctx.touch();
    const rows = (await cdxPrefix(dir, from, to))
      .filter(keepCapture)
      .filter((row) => catalog.looksLikeListing(row.original))
      .map((row) => ({ row, score: rankCdx(row) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
    for (const { row } of rows) {
      const year = captureYear(row);
      if (!target.has(year)) continue;
      const url = waybackUrl(row.timestamp, row.original);
      if (seen.has(url) || alreadyKnown(county.id, url)) continue;
      seen.add(url);
      const verdict = await validate(county.id, {
        url, year, source: "wayback-prefix", profile: PROFILE_WAYBACK, timeoutMs: 120000, retries: 2,
      });
      log("      ", verdict.ok ? "HIT " : "miss", year, verdict.reason, row.original.slice(0, 100));
      if (verdict.ok) found.push(verdict);
      if (found.length >= 2) return found;
    }
  }
  return found;
}

async function huntWayback(county, want, budget, ctx) {
  const found = [];
  const hosts = [...new Set(countyHosts(county).map((host) => host.replace(/^www\./, "")))];
  if (!hosts.length) return found;
  const spans = want === "historic" ? [["2020", "2022"]] : [["2024", "2026"]];
  const targetYears = want === "historic" ? HISTORIC_YEARS : RECENT_YEARS;
  try {
    const targeted = await waybackTargeted(county, want, spans[0][0], spans[0][1], targetYears, ctx);
    found.push(...targeted);
    if (found.length >= 2) return found;
  } catch (err) {
    log("    wayback targeted failed", String(err.message || err).slice(0, 60));
  }
  for (const host of hosts) {
    if (ctx && ctx.expired) return found;
    for (const [from, to] of spans) {
      if (ctx) ctx.touch();
      const rows = await cdxRows(host, from, to);
      if (!rows.length) continue;
      const wanted = rows
        .filter(keepCapture)
        .filter((row) => catalog.looksLikeListing(row.original))
        .filter(bigEnough)
        .map((row) => ({ row, score: rankCdx(row) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, budget);
      log("    cdx", host, from + "-" + to, rows.length + " rows,", wanted.length + " listing-like");
      for (const { row } of wanted) {
        if (ctx && ctx.expired) return found;
        if (ctx) ctx.touch();
        const year = captureYear(row);
        const target = want === "historic" ? HISTORIC_YEARS : RECENT_YEARS;
        if (!target.has(year)) {
          log("       skip", year, "out of window", row.original.slice(0, 90));
          continue;
        }
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

async function docCenterSweep(county, origin, range, want, ctx) {
  const minId = range.min || 1;
  const maxId = range.max || 4000;
  const found = [];
  const hits = [];
  const target = want === "historic" ? HISTORIC_YEARS : RECENT_YEARS;
  const ids = [];
  for (let id = minId; id <= maxId; id += 1) ids.push(id);
  const total = ids.length;
  let scanned = 0;
  let throttled = 0;
  let lastBeat = Date.now();
  let giveUp = false;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (ids.length) {
      if (giveUp || (ctx && ctx.expired)) return;
      const id = ids.shift();
      const url = origin + "/DocumentCenter/View/" + id;
      // Counted before the request so the heartbeat advances even when a
      // probe fails; a silent loop is what made the last stall invisible.
      scanned += 1;
      if (ctx) ctx.touch();
      if (scanned % 100 === 0 || Date.now() - lastBeat > 60000) {
        lastBeat = Date.now();
        log("      doccenter", county.id, "probed " + scanned + "/" + total + ",", hits.length, "listing-like so far");
      }
      try {
        const response = await politeFetch(url, {
          profile: PROFILE_SWEEP,
          timeoutMs: 15000,
          retries: 0,
          maxBackoffMs: 4000,
          cancelBody: true,
        });
        if (!response) continue;
        if (response.status === 429 || response.status === 503) {
          throttled += 1;
          // The host is asking us to stop. Sweeping through a few thousand
          // more ids against a rate limiter is neither polite nor useful.
          if (throttled >= 15) {
            giveUp = true;
            log("      doccenter", county.id, "host is rate-limiting after", scanned, "probes; stopping sweep");
          }
          continue;
        }
        if (!response.ok) continue;
        const name = filenameFromHead(response);
        if (!name) continue;
        if (!catalog.looksLikeListing(name)) continue;
        log("      doccenter", county.id, "id", id, "->", name.slice(0, 70));
        hits.push({ id, url, name });
      } catch (_err) {
        // a dead document id is normal; keep sweeping
      }
    }
  }));
  log("    doccenter", origin, "scanned", scanned, "listing-like", hits.length, throttled ? "(throttled " + throttled + ")" : "");
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

async function crawlSite(county, want, blocked, ctx) {
  const found = [];
  const hosts = new Set(countyHosts(county));
  const target = want === "historic" ? HISTORIC_YEARS : RECENT_YEARS;
  const queue = countyStartUrls(county).map((url) => ({ url, depth: 0 }));
  const seen = new Set();
  const docs = new Map();
  while (queue.length) {
    if (ctx && ctx.expired) break;
    const { url, depth } = queue.shift();
    if (seen.has(url) || seen.size > 40) continue;
    seen.add(url);
    if (ctx) ctx.touch();
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
    if (ctx && ctx.expired) break;
    if (alreadyKnown(county.id, url)) continue;
    const year = catalog.yearFrom(url, text);
    if (year && !target.has(year)) continue;
    if (ctx) ctx.touch();
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

async function probeObjectStorage(county, want, ctx) {
  const found = [];
  const target = want === "historic" ? HISTORIC_YEARS : RECENT_YEARS;
  for (const host of countyHosts(county)) {
    if (ctx && ctx.expired) break;
    const bare = host.replace(/^www\./, "");
    for (const make of S3_PATTERNS) {
      if (ctx && ctx.expired) break;
      if (ctx) ctx.touch();
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
  const opts = { only: null, skipWayback: false, minDocId: 1, maxDocId: 4000, skipSweep: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--only") opts.only = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (argv[i] === "--skip-wayback") opts.skipWayback = true;
    else if (argv[i] === "--skip-sweep") opts.skipSweep = true;
    else if (argv[i] === "--max-doc-id") opts.maxDocId = Number(argv[++i]) || 4000;
    else if (argv[i] === "--min-doc-id") opts.minDocId = Number(argv[++i]) || 1;
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
      finds.push(...await runPhase("crawl " + county.id + "/" + want, (ctx) => crawlSite(county, want, blocked, ctx)));
    } catch (err) {
      log("    crawl failed", String(err.message || err).slice(0, 80));
    }

    log("  phase object-storage /", want);
    try {
      finds.push(...await runPhase("s3 " + county.id + "/" + want, (ctx) => probeObjectStorage(county, want, ctx)));
    } catch (err) {
      log("    s3 failed", String(err.message || err).slice(0, 80));
    }

    if (!opts.skipSweep && county._civicplus) {
      for (const host of countyHosts(county)) {
        log("  phase doccenter /", want, host);
        try {
          finds.push(...await runPhase(
            "doccenter " + county.id + "/" + host,
            (ctx) => docCenterSweep(county, "https://" + host, { min: opts.minDocId, max: opts.maxDocId }, want, ctx),
          ));
        } catch (err) {
          log("    doccenter failed", String(err.message || err).slice(0, 80));
        }
      }
    }

    if (!opts.skipWayback) {
      log("  phase wayback /", want);
      try {
        // Wayback legitimately pauses for minutes between throttled queries,
        // so it gets a wider stall allowance than the other phases.
        finds.push(...await runPhase(
          "wayback " + county.id + "/" + want,
          (ctx) => huntWayback(county, want, 18, ctx),
          8 * 60 * 1000,
        ));
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

if (require.main === module) {
  main().catch((err) => {
    log("fatal", err && err.stack ? err.stack : String(err));
    process.exit(1);
  });
}

module.exports = {
  LIMITS,
  limiterFor,
  schedule,
  runPhase,
  keepCapture,
  bigEnough,
  rankCdx,
  parentDir,
  filenameFromHead,
};
