"use strict";

/**
 * Scan official treasurer pages for 2026 sale dates and listing links.
 * Records hrefs, HTTP status, and Last-Modified. Never stores owner rows.
 */

const fs = require("fs");
const path = require("path");
const pageWatch = require("./adapters/families/page-watch");
const calendar = require("./ads-calendar");

const ROOT = path.join(__dirname, "..");
const USER_AGENT = "sc-tax-sale-watch/1.0 (public page watch; no owner lists stored)";
const FETCH_MS = 18000;
const CONCURRENCY = 5;

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9,
  oct: 10, nov: 11, dec: 12,
};

const LISTING_KEEP = /tax[\s-]*sale|delinquent|realad|listing|advertis|bidder|forfeited|2026|08\.19\.26|paper\.xls/i;
const LIST_FILE = /delinquent[\s-]*list|tax[\s-]*sale[\s-]*(list|file|listing)|real[\s-]*property[\s-]*(list|file|listing)|mobile[\s-]*home[\s-]*(list|file)|paper\.xls|08\.19\.26|9-01-26|tax-sale-tab/i;
const NOT_LIST = /bidder|instruction|faq|registration|schedule of events|fact sheet|overage|claim form|calendar|notice to bidders|buyer'?s information|procedures/i;
const YEAR_2026 = /2026|08\.19\.26|9-01-26|1-30-26/i;
const YEAR_2025_ONLY = /2025/;
const SALE_2026 = /2026 (delinquent )?tax sale|tax sale(?: will be| is| begins| begins at|:?).{0,60}2026|(?:held|begins|begin).{0,40}2026/i;
const NEWSPAPER = /newspaper|legal notice|press and banner|aiken standard|bamberg leader|post and courier|calhoun times|lancaster news|chronicle|twin city|herald advocate|times and democrat|seneca journal|country chronicle|mccormick messenger|darlington news|people sentinel|union county news|the herald|greenville news/i;

function todayIso(now) {
  const d = now instanceof Date ? now : new Date(now || Date.now());
  return d.toISOString().slice(0, 10);
}

function decode(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toIso(year, month, day) {
  const y = Number(year);
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  if (y < 2020 || y > 2028) return null;
  return y + "-" + m + "-" + d;
}

function extractDates(text) {
  const found = new Set();
  const blob = String(text || "");
  const long = /(\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+20\d{2})/gi;
  let match;
  while ((match = long.exec(blob))) {
    const parts = match[1].replace(/[.]/g, "").match(/([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})/);
    if (!parts) continue;
    const month = MONTHS[parts[1].toLowerCase()];
    if (month) found.add(toIso(parts[3], month, parts[2]));
  }
  const iso = /\b(20[2-3]\d)-(\d{2})-(\d{2})\b/g;
  while ((match = iso.exec(blob))) found.add(toIso(match[1], match[2], match[3]));
  return [...found].filter(Boolean).sort();
}

function wallReason(status, html, text) {
  if (status === 401 || status === 403) return "http-" + status;
  const short = String(text || "").length < 900;
  if (short && /just a moment|cf-browser-verification|challenge-platform|attention required/i.test(html)) {
    return "cloudflare";
  }
  if (/<input\b[^>]*type=["']password["']/i.test(html) && /sign in|log[\s-]?in/i.test(text)) {
    return "login";
  }
  if (/(cf-turnstile|hcaptcha.com|h-captcha)/i.test(html) && /verify you are human|checking your browser/i.test(text)) {
    return "captcha";
  }
  return null;
}

function publicListingLink(link) {
  const text = String(link.text || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const href = String(link.href || "");
  if (!LISTING_KEEP.test(text + " " + href)) return null;
  if (/owner name|amount due \$\d/i.test(text)) return { text: "listing file", href };
  return { text: text || "listing file", href };
}

function listingLooksLike2026(link, lastModified) {
  const blob = ((link && link.href) || "") + " " + ((link && link.text) || "");
  if (NOT_LIST.test(blob)) return false;
  if (YEAR_2025_ONLY.test(blob) && !YEAR_2026.test(blob)) return false;
  if (!LIST_FILE.test(blob) && !/paper\.xls/i.test(blob)) return false;
  if (YEAR_2026.test(blob)) return true;
  if (lastModified && /2026/.test(String(lastModified))) return true;
  return false;
}

function extractFacts(html, pageUrl) {
  const text = decode(html);
  const watched = pageWatch.inspectHtml(html, pageUrl);
  const wall = wallReason(200, html, text);
  const listingLinks = (watched.listingLinks || [])
    .map(publicListingLink)
    .filter(Boolean)
    .slice(0, 8);
  return {
    blocked: Boolean(wall),
    blockReason: wall,
    listingLinks,
    mentionsNewspaper: NEWSPAPER.test(text) || watched.mentionsNewspaper,
    mentionsTaxSale: watched.mentionsTaxSale,
    mentions2026: SALE_2026.test(text),
    leftover2025: /2025 (delinquent )?tax sale|tax sale.{0,40}2025/i.test(text) && !SALE_2026.test(text),
    foundDates: extractDates(text).filter((d) => d >= "2025-01-01" && d <= "2026-12-31"),
    hasHtmlTable: watched.suggestedCollapse === "html-table",
    suggestedCollapse: watched.suggestedCollapse,
  };
}

function watchUrlsFor(county, seed) {
  const urls = [];
  const add = (url) => {
    if (url && !urls.includes(url)) urls.push(url);
  };
  add(county.treasurerUrl);
  add(county.listingUrl);
  add(county.listingSampleUrl);
  (seed.extraUrls || []).forEach(add);
  (seed.listingWatchUrls || []).forEach(add);
  return urls;
}

const CATCH_DAYS = 7;

function catchStart(row) {
  if (!row) return null;
  if (row.watchFrom && String(row.watchFrom).startsWith("2026")) return row.watchFrom;
  if (row.listPromised && String(row.listPromised).startsWith("2026")) return row.listPromised;
  const ads = (row.adDates || []).filter((d) => String(d).startsWith("2026")).sort();
  if (ads[0]) return ads[0];
  if (row.saleDate && String(row.saleDate).startsWith("2026")) return calendar.shiftDays(row.saleDate, -21);
  return null;
}

function catchUntil(row) {
  const start = catchStart(row);
  return start ? calendar.shiftDays(start, CATCH_DAYS) : null;
}

function inCatchWindow(iso, today) {
  if (!iso || !String(iso).startsWith("2026")) return false;
  if (iso > today) return false;
  return today <= calendar.shiftDays(iso, CATCH_DAYS);
}

function isDue(row, today) {
  if (!row || row.listStatus === "held" || row.listStatus === "posted") return false;
  return inCatchWindow(catchStart(row), today);
}

function windowOpen(row, today) {
  if (!row || row.listStatus === "held") return false;
  return Boolean(row.watchFrom && row.watchFrom <= today);
}

function decideListStatus(seed, scan) {
  if (seed.listStatus === "held") return "held";
  const links = (scan && scan.listingLinks) || [];
  const heads = (scan && scan.heads) || [];
  const found2026 = links.some((link) => listingLooksLike2026(link))
    || heads.some((h) => listingLooksLike2026({ href: h.url, text: "" }, h.lastModified));
  if (found2026 && seed.listStatus !== "flyer") return "posted";
  if (scan && scan.hasHtmlTable && scan.mentions2026 && seed.listStatus === "posted") return "posted";
  if (scan && scan.hasHtmlTable && scan.mentions2026 && /2026-10-19/.test((scan.foundDates || []).join(" "))) {
    return "posted";
  }
  if (seed.listStatus === "posted") return "posted";
  if (seed.listStatus === "flyer") return "flyer";
  if (seed.listStatus === "leftover") {
    if (scan && scan.mentions2026 && !scan.leftover2025) return "scheduled";
    return "leftover";
  }
  return seed.listStatus;
}

function publicScan(scan) {
  if (!scan) return null;
  return {
    at: scan.at,
    url: scan.url,
    httpStatus: scan.httpStatus,
    blocked: Boolean(scan.blocked),
    blockReason: scan.blockReason || null,
    listingLinkCount: (scan.listingLinks || []).length,
    listingLinks: scan.listingLinks || [],
    mentions2026: Boolean(scan.mentions2026),
    leftover2025: Boolean(scan.leftover2025),
    mentionsNewspaper: Boolean(scan.mentionsNewspaper),
    foundDates: scan.foundDates || [],
    hasHtmlTable: Boolean(scan.hasHtmlTable),
    suggestedCollapse: scan.suggestedCollapse || null,
    heads: (scan.heads || []).map((h) => ({
      url: h.url,
      httpStatus: h.httpStatus,
      lastModified: h.lastModified || null,
      contentType: h.contentType || null,
    })),
    error: scan.error || null,
  };
}

function buildCountyRow(county, seed, scan, today) {
  const base = seed || {
    saleDate: null,
    saleDates: [],
    saleNote: null,
    adOutlet: null,
    adDates: [],
    listPromised: null,
    watchFrom: null,
    listStatus: "unknown",
    datePrecision: "unknown",
    extraUrls: [],
    listingWatchUrls: [],
  };
  const listStatus = decideListStatus(base, scan);
  const saleDate = base.saleDate;
  return {
    id: county.id,
    name: county.name,
    treasurerUrl: county.treasurerUrl || null,
    saleDate,
    saleDates: base.saleDates || [],
    saleNote: base.saleNote,
    adOutlet: base.adOutlet,
    adDates: base.adDates || [],
    listPromised: base.listPromised,
    watchFrom: base.watchFrom,
    catchUntil: catchUntil({ ...base, listStatus }),
    catchDays: CATCH_DAYS,
    listStatus,
    datePrecision: base.datePrecision || "unknown",
    windowOpen: windowOpen({ ...base, listStatus }, today),
    due: isDue({ ...base, listStatus }, today),
    salePassed: Boolean(saleDate && saleDate < today && listStatus !== "held" && saleDate.startsWith("2026")),
    lastScan: publicScan(scan),
  };
}

function countSnapshot(counties) {
  const counts = {
    held: 0,
    posted: 0,
    scheduled: 0,
    rule: 0,
    leftover: 0,
    flyer: 0,
    unknown: 0,
    windowOpen: 0,
    due: 0,
    blocked: 0,
  };
  counties.forEach((row) => {
    if (counts[row.listStatus] != null) counts[row.listStatus] += 1;
    else counts.unknown += 1;
    if (row.windowOpen) counts.windowOpen += 1;
    if (row.due) counts.due += 1;
    if (row.lastScan && row.lastScan.blocked) counts.blocked += 1;
  });
  return counts;
}

function buildSnapshot(counties, scans, now) {
  const today = todayIso(now);
  const rows = counties.map((county) => (
    buildCountyRow(county, calendar.getSeed(county.id), scans[county.id] || null, today)
  ));
  return {
    season: calendar.SEASON,
    checked: calendar.CHECKED,
    generatedAt: (now instanceof Date ? now : new Date()).toISOString(),
    today,
    source: "Official treasurer pages plus the seeded 2026 calendar. Listing files are not stored.",
    counts: countSnapshot(rows),
    counties: rows,
  };
}

async function fetchUrl(url, method, fetchFn) {
  const fn = fetchFn || fetch;
  const response = await fn(url, {
    method: method || "GET",
    redirect: "follow",
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_MS),
  });
  const contentType = response.headers.get("content-type") || "";
  const lastModified = response.headers.get("last-modified");
  const binary = /pdf|spreadsheet|excel|zip|octet-stream/i.test(contentType);
  let text = "";
  if (method !== "HEAD" && !binary) {
    text = await response.text();
    if (text.length > 400000) text = text.slice(0, 400000);
  }
  return {
    status: response.status,
    url: response.url || url,
    contentType,
    lastModified,
    text,
    binary,
  };
}

async function scanCounty(county, options) {
  const opts = options || {};
  const seed = calendar.getSeed(county.id) || {};
  const at = new Date().toISOString();
  if (opts.html != null) {
    const facts = extractFacts(opts.html, opts.pageUrl || county.treasurerUrl);
    return { at, url: opts.pageUrl || county.treasurerUrl, httpStatus: 200, heads: [], ...facts };
  }
  const urls = watchUrlsFor(county, seed);
  if (!urls.length) {
    return { at, url: null, httpStatus: 0, blocked: false, listingLinks: [], foundDates: [], heads: [], error: "no-url" };
  }
  const fetchFn = opts.fetchFn;
  const pageUrl = urls[0];
  let page;
  try {
    page = await fetchUrl(pageUrl, "GET", fetchFn);
  } catch (err) {
    return {
      at,
      url: pageUrl,
      httpStatus: 0,
      blocked: false,
      listingLinks: [],
      foundDates: [],
      heads: [],
      error: String(err.message || err).slice(0, 160),
    };
  }
  const facts = extractFacts(page.text, page.url);
  const wall = wallReason(page.status, page.text, decode(page.text));
  const heads = [];
  for (const fileUrl of urls.slice(1)) {
    try {
      const head = await fetchUrl(fileUrl, "HEAD", fetchFn);
      heads.push({
        url: head.url,
        httpStatus: head.status,
        lastModified: head.lastModified,
        contentType: head.contentType,
      });
    } catch (err) {
      heads.push({ url: fileUrl, httpStatus: 0, lastModified: null, contentType: null, error: String(err.message || err).slice(0, 80) });
    }
  }
  return {
    at,
    url: page.url,
    httpStatus: page.status,
    heads,
    ...facts,
    blocked: Boolean(wall),
    blockReason: wall,
  };
}

async function mapLimit(items, limit, worker) {
  const out = new Array(items.length);
  let index = 0;
  async function next() {
    const i = index++;
    if (i >= items.length) return;
    out[i] = await worker(items[i], i);
    return next();
  }
  const starters = [];
  for (let i = 0; i < Math.min(limit, items.length); i += 1) starters.push(next());
  await Promise.all(starters);
  return out;
}

async function scanCounties(counties, options) {
  const opts = options || {};
  const today = todayIso(opts.now);
  const selected = counties.filter((county) => {
    if (opts.countyId) return county.id === opts.countyId;
    if (!opts.dueOnly) return true;
    const seed = calendar.getSeed(county.id);
    return isDue({ ...(seed || {}), listStatus: (seed && seed.listStatus) || "unknown" }, today);
  });
  const scans = {};
  await mapLimit(selected, opts.concurrency || CONCURRENCY, async (county) => {
    scans[county.id] = await scanCounty(county, opts);
  });
  return scans;
}

function snapshotPaths() {
  return {
    counties: path.join(ROOT, "counties", "ads.json"),
    site: path.join(ROOT, "site", "data", "ads.json"),
  };
}

function writeSnapshot(snapshot) {
  const files = snapshotPaths();
  const json = JSON.stringify(snapshot, null, 2) + "\n";
  fs.mkdirSync(path.dirname(files.site), { recursive: true });
  fs.writeFileSync(files.counties, json);
  fs.writeFileSync(files.site, json);
  return files;
}

function publicSnapshot(snapshot) {
  return {
    season: snapshot.season,
    today: snapshot.today,
    generatedAt: snapshot.generatedAt,
    counts: snapshot.counts,
    countyCount: snapshot.counties.length,
  };
}

module.exports = {
  USER_AGENT,
  CATCH_DAYS,
  todayIso,
  extractDates,
  extractFacts,
  catchStart,
  catchUntil,
  inCatchWindow,
  isDue,
  windowOpen,
  decideListStatus,
  buildCountyRow,
  buildSnapshot,
  scanCounty,
  scanCounties,
  writeSnapshot,
  snapshotPaths,
  publicSnapshot,
  watchUrlsFor,
  listingLooksLike2026,
};
