#!/usr/bin/env node
"use strict";

/**
 * Out-of-state delinquent-property research runner.
 *
 * Two tracks that sit outside the 46-county South Carolina registry:
 *   Haywood County, North Carolina  (Maggie Valley) — foreclosure regime
 *   Coconino and Mohave County, Arizona (Grand Canyon) — lien-certificate regime
 *
 * Public records only. No login, captcha, or paywall is bypassed. Owner names,
 * obituaries, and death notices are never read or stored — parcel identifiers
 * and amounts only. Every URL is verified over the network before it is
 * recorded, and lists are read by column position (engine/out-of-state-tables.js)
 * rather than by loose pattern matching.
 *
 * Designed to run unattended and resumable:
 *   node engine/out-of-state.js            full pass
 *   node engine/out-of-state.js --phase=verify|land|lists|wayback|pair|doc|pdf
 *   node engine/out-of-state.js --county=coconino-az
 *
 * State lives in inbox/out-of-state/state.json (gitignored). The findings
 * document docs/OUT_OF_STATE.md is rewritten after every phase so a crash or
 * reboot still leaves a truthful, current document behind.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const tables = require("./out-of-state-tables");
const oosIds = require("./out-of-state-ids");

const ROOT = path.join(__dirname, "..");
const REGISTRY = path.join(ROOT, "counties", "out-of-state.json");
const INBOX = path.join(ROOT, "inbox", "out-of-state");
const STATE_FILE = path.join(INBOX, "state.json");
const DOC = path.join(ROOT, "docs", "OUT_OF_STATE.md");

const UA = "sc-tax-sale-research/1.0 (public records research; parcel identifiers only; +https://github.com/SEAS2025/sc-tax-sale)";
const BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";
const FETCH_MS = 45000;
const MIN_ROWS = 25;
const MIN_BODY_BYTES = 400;
const CDX_PAUSE_MS = 8000;
const CDX_TRIES = 4;
const SEASON = new Date().getUTCFullYear();

/** A pair is only called "five-year" when the tax years really are five apart. */
const TARGET_SPAN = 5;

function spanLabel(span) {
  if (span === 1) return "one tax year apart";
  return span + " tax years apart";
}

/* ------------------------------------------------------------------ utils */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(...parts) {
  process.stdout.write("[" + new Date().toISOString() + "] " + parts.join(" ") + "\n");
}

function loadRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return freshState();
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return parsed && parsed.counties ? parsed : freshState();
  } catch (_err) {
    return freshState();
  }
}

function freshState() {
  return { startedAt: new Date().toISOString(), counties: {}, land: [], phases: {} };
}

function saveState(state) {
  fs.mkdirSync(INBOX, { recursive: true });
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

function countyState(state, county) {
  if (!state.counties[county.id]) {
    state.counties[county.id] = {
      id: county.id,
      name: county.name,
      stateCode: county.state,
      verified: [],
      unreachable: [],
      lists: [],
      wayback: { queried: [], errors: [] },
      years: {},
      intersections: [],
      headline: null,
    };
  }
  const cs = state.counties[county.id];
  cs.years = cs.years || {};
  cs.intersections = cs.intersections || [];
  return cs;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (_err) {
    return "";
  }
}

function yearFromUrl(url, text) {
  const blob = String(url || "") + " " + String(text || "");
  const years = (blob.match(/\b(20[0-3]\d)\b/g) || []).map(Number).filter((y) => y >= 2005 && y <= SEASON + 1);
  return years.length ? Math.max(...years) : null;
}

/* ------------------------------------------------------------------ fetch */

async function rawFetch(url, method) {
  const response = await fetch(url, {
    method: method || "GET",
    redirect: "follow",
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml,application/pdf,*/*",
    },
    signal: AbortSignal.timeout(FETCH_MS),
  });
  const buf = method === "HEAD" || !response.ok ? Buffer.alloc(0) : Buffer.from(await response.arrayBuffer());
  return {
    ok: response.ok,
    status: response.status,
    url: response.url || url,
    contentType: response.headers.get("content-type") || "",
    buf,
    via: "fetch",
  };
}

let browserPromise = null;

async function getBrowser() {
  if (browserPromise) return browserPromise;
  browserPromise = (async () => {
    try {
      const { firefox } = require("playwright");
      return await firefox.launch({ headless: true });
    } catch (err) {
      log("playwright unavailable:", String(err.message || err).slice(0, 120));
      return null;
    }
  })();
  return browserPromise;
}

/**
 * Some county sites sit behind a CDN that refuses a plain client. Rendering the
 * public page in a real browser is still ordinary public-page access: no login,
 * no captcha solving, no paywall circumvention. A wall that is actually there
 * is recorded and the page is skipped.
 */
async function browserFetch(url) {
  const browser = await getBrowser();
  if (!browser) return null;
  let context;
  try {
    context = await browser.newContext({ userAgent: BROWSER_UA });
    const page = await context.newPage();
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: FETCH_MS });
    await page.waitForTimeout(2500);
    const status = response ? response.status() : 0;
    const html = await page.content();
    const title = (await page.title()) || "";
    if (/captcha|are you a robot|verify you are human/i.test(html) && html.length < 8000) {
      return { ok: false, status, url: page.url(), blocked: "captcha wall — not bypassed", via: "playwright" };
    }
    // A wall has to be the whole page. Government sites built on CivicPlus put
    // "Website Sign In" in the title of every ordinary public page, so the words
    // alone are not evidence of a wall.
    const wholePageIsWall = /^(sign in|log in|subscribe|subscription required)\b/i.test(title.trim())
      || /please (?:sign in|log in) to (?:read|continue|view)/i.test(html)
      || /subscribe to (?:read|continue|view) (?:this|the rest)/i.test(html);
    if (wholePageIsWall) {
      return { ok: false, status, url: page.url(), blocked: "login or subscription wall — not bypassed", via: "playwright" };
    }
    return {
      ok: status > 0 && status < 400,
      status,
      url: page.url(),
      contentType: "text/html",
      buf: Buffer.from(html, "utf8"),
      via: "playwright",
    };
  } catch (err) {
    return { ok: false, status: 0, url, error: String(err.message || err).slice(0, 160), via: "playwright" };
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

async function getUrl(url, options) {
  const opts = options || {};
  let got;
  try {
    got = await rawFetch(url, opts.method || "GET");
  } catch (err) {
    got = { ok: false, status: 0, url, error: String(err.message || err).slice(0, 160), via: "fetch" };
  }
  const retry = !got.ok && [0, 403, 429, 503].includes(got.status);
  if (retry && opts.allowBrowser !== false) {
    const rendered = await browserFetch(url);
    if (rendered) return rendered;
  }
  return got;
}

/* ------------------------------------------------- phase 1: verify sources */

async function verifySources(registry, state, only) {
  for (const county of registry.counties) {
    if (only && county.id !== only) continue;
    const cs = countyState(state, county);
    cs.verified = [];
    cs.unreachable = [];
    const targets = (county.statuteUrls || []).map((url) => ({ url, role: "statute" }))
      .concat(county.candidateUrls || []);
    for (const target of targets) {
      const got = await getUrl(target.url);
      const record = {
        url: target.url,
        finalUrl: got.url,
        role: target.role,
        taxYear: target.taxYear || null,
        advertisedYear: target.advertisedYear || null,
        format: target.format || null,
        followAssetPdfs: Boolean(target.followAssetPdfs),
        note: target.note || null,
        status: got.status,
        via: got.via,
        bytes: got.buf ? got.buf.length : 0,
        contentType: got.contentType || "",
        checkedAt: new Date().toISOString(),
      };
      if (got.blocked) record.blocked = got.blocked;
      if (got.error) record.error = got.error;
      if (got.ok && record.bytes > MIN_BODY_BYTES) {
        cs.verified.push(record);
        log("verified", county.id, got.status, target.url);
      } else {
        if (got.ok && record.bytes <= MIN_BODY_BYTES) {
          record.tooSmall = "answered but returned only " + record.bytes + " bytes, too little to read";
        }
        cs.unreachable.push(record);
        log("not usable", county.id, got.status, target.url, got.blocked || got.error || record.tooSmall || "");
      }
      saveState(state);
      await sleep(1200);
    }
  }
  state.phases.verify = new Date().toISOString();
  saveState(state);
  return state;
}

/* ------------------------------------------- phase 2: land ownership facts */

async function probeLand(registry, state) {
  state.land = [];
  for (const probe of registry.landOwnershipProbes || []) {
    const got = await getUrl(probe.url);
    const row = { url: probe.url, note: probe.note, status: got.status, via: got.via, ok: Boolean(got.ok) };
    if (got.blocked) row.blocked = got.blocked;
    if (got.error) row.error = String(got.error).slice(0, 160);
    if (got.ok && got.buf && got.buf.length) {
      const text = htmlToText(got.buf.toString("utf8"));
      row.acreageMentions = [...text.matchAll(/([\d,]{4,12})\s*(acres|square miles)/gi)]
        .slice(0, 6).map((m) => m[0].replace(/\s+/g, " "));
      row.percentMentions = [...text.matchAll(/(\d{1,3}(?:\.\d)?)\s*(?:%|percent)[^.]{0,80}?(federal|forest|park|tribal|state trust|private)/gi)]
        .slice(0, 8).map((m) => m[0].replace(/\s+/g, " ").slice(0, 120));
    }
    state.land.push(row);
    log("land probe", got.status, probe.url);
    saveState(state);
    await sleep(1500);
  }
  state.phases.land = new Date().toISOString();
  saveState(state);
  return state;
}

/* -------------------------------------------------- phase 3: fetch listings */

function htmlToText(html) {
  return String(html || "")
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(tr|p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ");
}

function extFor(url, contentType) {
  const blob = String(contentType || "") + " " + String(url || "");
  if (/\.pdf(\.pdf)?(\?|$)|application\/pdf/i.test(blob)) return ".pdf";
  if (/\.xlsx(\?|$)|spreadsheetml/i.test(blob)) return ".xlsx";
  if (/\.csv(\?|$)|text\/csv/i.test(blob)) return ".csv";
  return ".html";
}

function stashName(countyId, year, url, ext) {
  const hash = crypto.createHash("sha1").update(String(url)).digest("hex").slice(0, 10);
  return countyId + "-" + (year || "unk") + "-" + hash + ext;
}

/**
 * Read a saved listing file by structure: HTML goes through the column-addressed
 * table reader, PDF through the column-group reader over `pdftotext -layout`.
 */
function readListing(dest, contentType, stateCode) {
  const ext = path.extname(dest).toLowerCase();
  if (ext === ".pdf" || /pdf/i.test(contentType)) {
    let text = "";
    try {
      text = execFileSync("pdftotext", ["-layout", dest, "-"], { encoding: "utf8", maxBuffer: 60 * 1024 * 1024 });
    } catch (_err) {
      return { count: 0, rowCount: 0, ids: [], amounts: {}, reader: "pdftotext-failed", rows: [], looseTokens: 0 };
    }
    const got = tables.readColumnarText(text, stateCode);
    return Object.assign(got, { reader: "pdf-columns", looseTokens: looseTokenCount(text, stateCode, got) });
  }
  const html = fs.readFileSync(dest, "utf8");
  const fromTable = tables.readParcelTables(html, stateCode);
  if (fromTable.rowCount) return Object.assign(fromTable, { reader: "html-table", looseTokens: null });
  const text = htmlToText(html);
  const fromText = tables.readColumnarText(text, stateCode);
  if (fromText.rowCount) return Object.assign(fromText, { reader: "html-columns", looseTokens: null });
  return Object.assign(fromTable, { reader: "html-table", looseTokens: looseTokenCount(text, stateCode, fromTable) });
}

/**
 * When no readable parcel column is found, count how many identifier-shaped
 * tokens the page holds at all. Zero is real evidence that a page carries no
 * parcel data, rather than evidence that the reader failed.
 */
function looseTokenCount(text, stateCode, structured) {
  if (structured && structured.rowCount) return null;
  try {
    return oosIds.extractIds(text, stateCode).count;
  } catch (_err) {
    return null;
  }
}

/** Public PDF assets attached to a published advertisement article. */
function assetPdfLinks(html, baseUrl) {
  const out = new Set();
  const re = /https?:\/\/[^\s"'<>]+?\.pdf(?:\.pdf)?(?=["'\s<>])/gi;
  let match;
  while ((match = re.exec(String(html || "")))) {
    const url = match[0];
    if (/\/(templates|shared-content|resources)\//i.test(url)) continue;
    out.add(url);
  }
  if (!out.size && baseUrl) {
    const rel = /href="([^"]+\.pdf(?:\.pdf)?)"/gi;
    let m;
    while ((m = rel.exec(String(html || "")))) {
      try {
        out.add(new URL(m[1], baseUrl).toString());
      } catch (_err) { /* skip */ }
    }
  }
  return [...out];
}

async function ingest(county, cs, url, meta) {
  const info = meta || {};
  if (cs.lists.some((row) => row.requestedUrl === url || row.url === url)) return null;
  const got = await getUrl(url);
  const year = info.taxYear || yearFromUrl(url) || null;
  if (!got.ok || !got.buf || got.buf.length < 400) {
    cs.lists.push({
      url,
      requestedUrl: url,
      taxYear: year,
      source: info.source,
      status: got.status,
      via: got.via,
      rowCount: 0,
      idCount: 0,
      skipped: got.blocked || got.error || ("http-" + got.status),
    });
    return null;
  }
  const ext = extFor(got.url, got.contentType);
  const dest = path.join(INBOX, stashName(county.id, year, url, ext));
  fs.mkdirSync(INBOX, { recursive: true });
  fs.writeFileSync(dest, got.buf);
  const read = readListing(dest, got.contentType, county.state);
  const row = {
    url: got.url,
    requestedUrl: url,
    taxYear: year,
    advertisedYear: info.advertisedYear || null,
    source: info.source,
    status: got.status,
    via: got.via,
    bytes: got.buf.length,
    contentType: got.contentType,
    file: path.basename(dest),
    reader: read.reader,
    columnGroups: read.groups || null,
    headers: (read.tables && read.tables[0] && read.tables[0].headers) || null,
    parcelColumn: (read.tables && read.tables[0] && read.tables[0].parcelColumn) != null
      ? read.tables[0].parcelColumn : null,
    ownerColumnDropped: Boolean(read.droppedOwnerColumn),
    rowCount: read.rowCount,
    idCount: read.count,
    rejected: read.rejected || 0,
    looseTokens: read.looseTokens == null ? null : read.looseTokens,
  };
  if (read.count >= MIN_ROWS) {
    row.ids = read.ids;
    row.amounts = read.amounts;
  } else {
    row.skipped = "only-" + read.count + "-parcels-in-parcel-column";
  }
  cs.lists.push(row);
  log("ingest", county.id, "taxYear " + (year || "unk"), read.rowCount + " rows", read.count + " parcels", row.reader, url.slice(0, 90));
  return row;
}

async function fetchListings(registry, state, only) {
  for (const county of registry.counties) {
    if (only && county.id !== only) continue;
    const cs = countyState(state, county);
    for (const record of cs.verified) {
      if (record.role === "statute" || record.role === "index") continue;
      const meta = {
        taxYear: record.taxYear,
        advertisedYear: record.advertisedYear,
        source: "registry:" + record.role,
      };
      const row = await ingest(county, cs, record.url, meta);
      saveState(state);
      await sleep(1500);

      // A published advertisement may carry its list as attached PDF assets.
      if (record.followAssetPdfs || (row && !row.idCount && record.role === "listing")) {
        const page = await getUrl(record.url);
        if (page.ok && page.buf && page.buf.length) {
          const assets = assetPdfLinks(page.buf.toString("utf8"), record.url);
          log("assets", county.id, record.taxYear || "unk", assets.length + " pdf assets");
          for (const asset of assets) {
            await ingest(county, cs, asset, {
              taxYear: record.taxYear,
              advertisedYear: record.advertisedYear,
              source: "asset-pdf:" + (record.taxYear || "unk"),
            });
            saveState(state);
            await sleep(1500);
          }
        }
      }

      if (record.role === "office" || record.role === "docs" || record.role === "notices") {
        for (const link of await listingLinks(record.url)) {
          await ingest(county, cs, link.url, { taxYear: link.year, source: "hop:" + hostOf(record.url) });
          saveState(state);
          await sleep(1500);
        }
      }
    }
  }
  state.phases.lists = new Date().toISOString();
  saveState(state);
  return state;
}

const LISTING_RE = /delinquent|tax[\s-]*lien|tax[\s-]*sale|foreclos|advertis|unsold|over[\s-]*the[\s-]*counter/i;

async function listingLinks(pageUrl) {
  const got = await getUrl(pageUrl);
  if (!got.ok || !got.buf || !got.buf.length) return [];
  const html = got.buf.toString("utf8");
  const out = [];
  const seen = new Set();
  const re = /<a[^>]+href="([^"#]+)"[^>]*>([\s\S]{0,200}?)<\/a>/gi;
  let match;
  while ((match = re.exec(html))) {
    const text = htmlToText(match[2]).replace(/\s+/g, " ").trim();
    let href;
    try {
      href = new URL(match[1], got.url).toString();
    } catch (_err) {
      continue;
    }
    if (seen.has(href)) continue;
    if (!LISTING_RE.test(href + " " + text)) continue;
    if (/qpublic|beacon|schneidercorp|eaglegis|eagleweb/i.test(href)) continue; // no parcel-viewer scraping
    if (/login|signin|account|subscribe/i.test(href)) continue;
    if (hostOf(href) !== hostOf(got.url) && !/\.(pdf|xlsx|xls|csv)(\?|$)/i.test(href)) continue;
    seen.add(href);
    out.push({ url: href, year: yearFromUrl(href, text), text: text.slice(0, 100) });
    if (out.length >= 12) break;
  }
  return out;
}

/* ------------------------------------------------------- phase 4: wayback */

async function cdxQuery(params) {
  const url = "https://web.archive.org/cdx/search/cdx?" + new URLSearchParams(params).toString();
  let wait = CDX_PAUSE_MS;
  for (let attempt = 1; attempt <= CDX_TRIES; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(FETCH_MS) });
      const body = await response.text();
      if (response.status === 200 && !/Temporarily Offline/i.test(body)) {
        if (!body.trim()) return { ok: true, rows: [] };
        return { ok: true, rows: JSON.parse(body) };
      }
      if (response.status === 404) return { ok: true, rows: [] };
      if (/Temporarily Offline/i.test(body)) {
        return { ok: false, rows: [], error: "Internet Archive is temporarily offline (service-wide outage)" };
      }
      log("cdx", response.status, "attempt", attempt);
    } catch (err) {
      log("cdx error attempt", attempt, String(err.message || err).slice(0, 100));
    }
    await sleep(wait);
    wait = Math.min(wait * 2, 120000);
  }
  return { ok: false, rows: [], error: "CDX did not answer after " + CDX_TRIES + " attempts (timeout or 5xx)" };
}

async function waybackHunt(registry, state, only) {
  for (const county of registry.counties) {
    if (only && county.id !== only) continue;
    const cs = countyState(state, county);
    cs.wayback = { queried: [], errors: [] };
    for (const target of county.waybackTargets || []) {
      const key = target.host + "|" + (target.match || "*");
      const result = await cdxQuery({
        url: target.host + "/*",
        output: "json",
        fl: "timestamp,original,mimetype,statuscode",
        collapse: "urlkey",
        filter: "statuscode:200",
        from: "20180101",
        to: String(SEASON) + "1231",
        limit: "400",
      });
      if (!result.ok) {
        cs.wayback.errors.push({ key, error: result.error });
        log("cdx failed", county.id, key, result.error);
        saveState(state);
        await sleep(CDX_PAUSE_MS);
        continue;
      }
      const rows = result.rows.slice(1);
      const matched = rows
        .filter(([, original]) => (target.match ? new RegExp(target.match, "i").test(original) : LISTING_RE.test(original)))
        .map(([timestamp, original, mimetype]) => ({
          timestamp,
          year: Number(String(timestamp).slice(0, 4)),
          original,
          mimetype,
          snapshot: "https://web.archive.org/web/" + timestamp + "id_/" + original,
        }));
      cs.wayback.queried.push({ key, total: rows.length, matched: matched.length, hits: matched.slice(0, 30) });
      log("cdx", county.id, key, rows.length + " rows,", matched.length + " matched");
      saveState(state);
      const known = new Set(Object.keys(cs.years || {}).map(Number));
      for (const hit of matched.slice(0, 8)) {
        if (known.has(hit.year)) continue;
        await ingest(county, cs, hit.snapshot, { taxYear: hit.year - 1, source: "wayback:" + target.host });
        saveState(state);
        await sleep(2500);
      }
      await sleep(CDX_PAUSE_MS);
    }
  }
  state.phases.wayback = new Date().toISOString();
  saveState(state);
  return state;
}

/* --------------------------------------------- phase 5: year sets and pairs */

function usableLists(cs) {
  return (cs.lists || []).filter((row) => row.ids && row.ids.length >= MIN_ROWS);
}

/**
 * Union every usable file for a tax year into one set. The 2017 Haywood
 * advertisement, for example, is six separate PDF pages of the same list.
 */
function buildYearSets(cs) {
  const years = {};
  for (const row of usableLists(cs)) {
    const year = Number(row.taxYear);
    if (!Number.isFinite(year)) continue;
    if (!years[year]) years[year] = { taxYear: year, ids: [], amounts: {}, rowCount: 0, files: [], advertisedYear: row.advertisedYear || null };
    const bucket = years[year];
    const set = new Set(bucket.ids);
    for (const id of row.ids) {
      if (!set.has(id)) {
        set.add(id);
        bucket.ids.push(id);
      }
      const amount = row.amounts ? row.amounts[id] : null;
      if (amount != null && bucket.amounts[id] == null) bucket.amounts[id] = amount;
    }
    bucket.rowCount += row.rowCount || 0;
    bucket.files.push({ url: row.url, file: row.file, rowCount: row.rowCount, idCount: row.idCount, reader: row.reader });
    if (!bucket.advertisedYear && row.advertisedYear) bucket.advertisedYear = row.advertisedYear;
  }
  for (const bucket of Object.values(years)) bucket.idCount = bucket.ids.length;
  return years;
}

function intersectYears(years) {
  const keys = Object.keys(years).map(Number).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      const a = years[keys[i]];
      const b = years[keys[j]];
      const setB = new Set(b.ids);
      const both = a.ids.filter((id) => setB.has(id));
      out.push({
        from: keys[i],
        to: keys[j],
        span: keys[j] - keys[i],
        count: both.length,
        ids: both,
      });
    }
  }
  return out.sort((x, y) => x.span - y.span || x.from - y.from);
}

function allYearsIntersection(years) {
  const keys = Object.keys(years).map(Number).sort((a, b) => a - b);
  if (keys.length < 3) return null;
  let acc = years[keys[0]].ids;
  for (let i = 1; i < keys.length; i += 1) {
    const set = new Set(years[keys[i]].ids);
    acc = acc.filter((id) => set.has(id));
  }
  return { years: keys, count: acc.length, ids: acc };
}

/**
 * Choose the pair to print. Preference is an exact five-year span; otherwise
 * the widest span available, and the label follows whatever was actually found.
 */
function pickHeadline(intersections) {
  const usable = intersections.filter((row) => row.count > 0);
  if (!usable.length) return null;
  const exact = usable.filter((row) => row.span === TARGET_SPAN).sort((a, b) => b.count - a.count)[0];
  const chosen = exact || usable.slice().sort((a, b) => b.span - a.span || b.count - a.count)[0];
  return {
    from: chosen.from,
    to: chosen.to,
    span: chosen.span,
    count: chosen.count,
    ids: chosen.ids,
    isFiveYear: chosen.span === TARGET_SPAN,
    label: chosen.span === TARGET_SPAN
      ? "five-year delinquent file"
      : chosen.span + "-year repeat-delinquent file",
  };
}

function pairAll(registry, state, only) {
  for (const county of registry.counties) {
    if (only && county.id !== only) continue;
    const cs = countyState(state, county);
    cs.years = buildYearSets(cs);
    cs.intersections = intersectYears(cs.years).map((row) => ({ ...row, ids: row.ids }));
    cs.allYears = allYearsIntersection(cs.years);
    cs.headline = pickHeadline(cs.intersections);
    const yearList = Object.keys(cs.years).sort().join(", ") || "none";
    log("pair", county.id, "tax years [" + yearList + "]",
      cs.headline ? cs.headline.from + "x" + cs.headline.to + " = " + cs.headline.count + " (" + cs.headline.span + "y)" : "no pair");
  }
  state.phases.pair = new Date().toISOString();
  saveState(state);
  return state;
}

/**
 * Pairing kept for the single-county unit test: a parcel counts only when the
 * same canonical identifier appears in two different tax years.
 */
function pairCounty(cs) {
  const years = buildYearSets(cs);
  const intersections = intersectYears(years);
  const headline = pickHeadline(intersections);
  if (!headline) {
    const count = Object.keys(years).length;
    return {
      bothCount: 0,
      both: [],
      years,
      intersections,
      headline: null,
      reason: count === 0
        ? "no list with a readable parcel column"
        : count === 1
          ? "only one tax year has a readable list, so there is nothing to intersect"
          : "lists found for several tax years but no parcel appears on two of them",
    };
  }
  return {
    bothCount: headline.count,
    both: headline.ids.map((id) => ({
      tms: id,
      amountRecent: years[headline.to].amounts[id] == null ? null : years[headline.to].amounts[id],
      amountHistoric: years[headline.from].amounts[id] == null ? null : years[headline.from].amounts[id],
    })),
    years,
    intersections,
    headline,
    reason: null,
  };
}

/* ------------------------------------------------------ phase 6: findings */

function fmtUrl(url) {
  return "<" + url + ">";
}

/** Say why a URL could not be used, rather than calling a 200 "unreachable". */
function unusableReason(row) {
  if (row.blocked) return " — " + row.blocked;
  if (row.error) return " — " + row.error;
  if (row.tooSmall) return " — " + row.tooSmall;
  if (row.status === 404) return " — page not found";
  if (row.status === 0) return " — no answer";
  return "";
}

function listTable(cs) {
  const rows = cs.lists || [];
  if (!rows.length) return "_No list responded._\n";
  const lines = [
    "| Tax year | Rows read | Unique parcels | Identifier-shaped tokens anywhere on page | Reader | Source | Status |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of rows.slice(0, 50)) {
    lines.push("| " + [
      row.taxYear || "—",
      row.rowCount || 0,
      row.idCount || 0,
      row.looseTokens == null ? "n/a" : row.looseTokens,
      row.reader || "—",
      row.source || "—",
      row.skipped ? row.skipped : "read ok",
    ].join(" | ") + " |");
  }
  return lines.join("\n") + "\n";
}

function yearTable(cs) {
  const keys = Object.keys(cs.years || {}).map(Number).sort((a, b) => a - b);
  if (!keys.length) return "_No tax year produced a readable parcel column._\n";
  const lines = [
    "| Tax year | Advertised | Files | Rows read | Unique parcels |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const key of keys) {
    const bucket = cs.years[key];
    lines.push("| " + [
      key,
      bucket.advertisedYear || "—",
      bucket.files.length,
      bucket.rowCount,
      bucket.idCount,
    ].join(" | ") + " |");
  }
  return lines.join("\n") + "\n";
}

function intersectionTable(cs) {
  const rows = cs.intersections || [];
  if (!rows.length) return "_Fewer than two tax years are readable, so there is nothing to intersect._\n";
  const lines = [
    "| Tax years | True span | Parcels on both |",
    "| --- | --- | --- |",
  ];
  for (const row of rows) {
    lines.push("| " + row.from + " ∩ " + row.to + " | " + spanLabel(row.span) + " | " + row.count + " |");
  }
  if (cs.allYears) {
    lines.push("| " + cs.allYears.years.join(" ∩ ") + " | all " + cs.allYears.years.length + " readable years | " + cs.allYears.count + " |");
  }
  return lines.join("\n") + "\n";
}

function landSection(state) {
  if (!state.land || !state.land.length) return "_Land-ownership probes have not run yet._\n";
  const lines = [];
  for (const row of state.land) {
    lines.push("- " + fmtUrl(row.url) + " — HTTP " + row.status
      + (row.ok ? " verified" : " requested" + (unusableReason(row) || " — no readable page came back"))
      + ". " + row.note);
    for (const mention of (row.acreageMentions || []).slice(0, 3)) lines.push("  - quoted from that page: " + mention);
    for (const mention of (row.percentMentions || []).slice(0, 3)) lines.push("  - quoted from that page: " + mention);
  }
  return lines.join("\n") + "\n";
}

function writeDoc(registry, state, destPath) {
  const dest = destPath || DOC;
  const out = [];
  out.push("# Out-of-state delinquent-property tracks");
  out.push("");
  out.push("Two tracks that sit **outside** the 46-county South Carolina registry in `counties/sc.json`.");
  out.push("They are not counted by `engine/test.js`, are not part of SC pricing, and are not sold as SC coverage.");
  out.push("");
  out.push("- **Maggie Valley, North Carolina** — Haywood County. Foreclosure state, not a lien-certificate state.");
  out.push("- **Grand Canyon, Arizona** — Coconino County (Grand Canyon Village, Tusayan, Williams, Flagstaff) and Mohave County (Grand Canyon West / Peach Springs side). Yavapai County was checked for relevance.");
  out.push("");
  out.push("Public records only. No login, captcha, or paywall was bypassed. **No obituaries, death notices, or any owner-name source were used.** The published lists do carry a `LIABLE OWNER` column; that column is located only so it can be dropped, and no owner value is written to any snapshot, JSON file, document, or PDF.");
  out.push("");
  out.push("Generated " + new Date().toISOString() + " by `engine/out-of-state.js` (driver: `scripts/hunt-out-of-state.sh`).");
  out.push("");
  out.push("## Status of this run");
  out.push("");
  for (const phase of ["verify", "land", "lists", "wayback", "pair", "pdf"]) {
    out.push("- `" + phase + "`: " + (state.phases[phase] ? String(state.phases[phase]).slice(0, 200) : "not completed in this run"));
  }
  out.push("");

  out.push("## Summary");
  out.push("");
  out.push("| County | Regime | Verified sources | Readable tax years | Widest paired span | Parcels in that pair |");
  out.push("| --- | --- | --- | --- | --- | --- |");
  for (const county of registry.counties) {
    const cs = state.counties[county.id];
    if (!cs) continue;
    const years = Object.keys(cs.years || {}).sort();
    out.push("| " + [
      county.name + " " + county.state,
      county.regime === "foreclosure" ? "Foreclosure (NC)" : "Lien certificate (AZ)",
      (cs.verified || []).length,
      years.length ? years.join(", ") : "none",
      cs.headline ? spanLabel(cs.headline.span) : "—",
      cs.headline ? cs.headline.count : 0,
    ].join(" | ") + " |");
  }
  out.push("");

  for (const county of registry.counties) {
    const cs = state.counties[county.id];
    if (!cs) continue;
    out.push("## " + county.name + " County, " + county.state);
    out.push("");
    out.push("**Focus.** " + county.focus);
    out.push("");
    out.push("**Statutory basis.** " + county.regimeNote);
    out.push("");
    const statutes = (cs.verified || []).filter((row) => row.role === "statute");
    if (statutes.length) {
      out.push("Statute text verified over the network:");
      for (const row of statutes) out.push("- " + fmtUrl(row.url) + " — HTTP " + row.status);
      out.push("");
    }
    const badStatutes = (cs.unreachable || []).filter((row) => row.role === "statute");
    if (badStatutes.length) {
      out.push("Statute URLs that did not give a readable answer (cited by section number only, text not fetched):");
      for (const row of badStatutes) out.push("- " + fmtUrl(row.url) + " — HTTP " + row.status + unusableReason(row));
      out.push("");
    }
    out.push("**Official sources verified.**");
    out.push("");
    const official = (cs.verified || []).filter((row) => row.role !== "statute");
    if (official.length) {
      for (const row of official) {
        out.push("- " + fmtUrl(row.url) + " — HTTP " + row.status + ", " + row.bytes + " bytes, via " + row.via
          + " (" + row.role + (row.taxYear ? ", tax year " + row.taxYear : "") + ")"
          + (row.note ? " — " + row.note : ""));
      }
    } else {
      out.push("- None responded in this run.");
    }
    out.push("");
    const blocked = (cs.unreachable || []).filter((row) => row.role !== "statute");
    if (blocked.length) {
      out.push("**Not usable.** Each of these was requested; none gave back a page this run could read.");
      out.push("");
      for (const row of blocked) {
        out.push("- " + fmtUrl(row.url) + " — HTTP " + row.status + unusableReason(row));
      }
      out.push("");
    }
    if (county.identifierNote) {
      out.push("**Identifier format.** " + county.identifierNote);
      out.push("");
    }
    if (county.accessNote) {
      out.push("**How these pages were accessed.** " + county.accessNote);
      out.push("");
    }
    out.push("**Files read.**");
    out.push("");
    out.push(listTable(cs));
    out.push("**Parcels per tax year.**");
    out.push("");
    out.push(yearTable(cs));
    out.push("**Intersections, with the true year span of each.**");
    out.push("");
    out.push(intersectionTable(cs));
    if (cs.headline) {
      out.push("**Headline pair.** " + cs.headline.count + " parcels appear on both the tax-year-" + cs.headline.from
        + " and tax-year-" + cs.headline.to + " advertised lists — " + spanLabel(cs.headline.span) + ". "
        + (cs.headline.isFiveYear
          ? "That is a genuine five-year span, so the report may be labelled as a five-year delinquent file."
          : "That is **not** a five-year span, so nothing here is labelled a five-year file."));
      out.push("");
    } else {
      const loose = (cs.lists || []).reduce((sum, row) => sum + (row.looseTokens || 0), 0);
      out.push("**No pair — a genuine zero, not a parsing failure.** Nothing is reported for this county. "
        + (cs.lists && cs.lists.length
          ? "Sources responded, but no published page exposed a readable parcel column. Across every page fetched for this county there were "
            + loose + " identifier-shaped tokens in total, so the pages genuinely do not carry parcel data — they are navigation and document-index pages."
          : "No source responded."));
      out.push("");
    }
    const cdxErrors = (cs.wayback && cs.wayback.errors) || [];
    if (cdxErrors.length) {
      out.push("**Wayback CDX.** " + cdxErrors.map((row) => "`" + row.key + "` — " + row.error).join("; ") + ".");
      out.push("");
    }
    if (county.limitations) {
      out.push("**Limitations.**");
      out.push("");
      for (const line of county.limitations) out.push("- " + line);
      out.push("");
    }
  }

  out.push("## How much Grand Canyon land is actually on a county tax roll");
  out.push("");
  out.push("A large share of the land around the Grand Canyon is federal (National Park Service, U.S. Forest Service) or tribal (Havasupai, Navajo, Hualapai). Federal and tribal trust land is not assessed by a county and never appears on a delinquent tax roll, and Arizona State Trust land is also off the county roll. The taxable universe near the canyon is therefore far smaller than the map suggests: it is effectively the private in-holdings and townsite parcels — Tusayan, Valle, Williams, Flagstaff and the private subdivisions along the SR-64 and US-180 corridors in Coconino County, and the private parcels on the Mohave County side away from the Hualapai reservation. No parcel is added to this file to make any count look larger.");
  out.push("");
  out.push("Sources probed for this statement:");
  out.push("");
  out.push(landSection(state));
  out.push("## Method and limits");
  out.push("");
  out.push("- Every URL above was requested over the network during this run; the HTTP status shown is what came back. Nothing is listed that was not fetched.");
  out.push("- **Lists are read by column, not by pattern.** `engine/out-of-state-tables.js` finds the header row, finds the index of the `PARCEL` column, and reads only that column — skipping the `Field 1 / Field 2 / Field 3` pseudo-header the publishing system emits above the real header. Newspaper-style PDF advertisements are read the same way: the character position of every `Parcel` heading is taken from the header line of the five side-by-side owner / parcel / amount column groups, and a value is accepted only when it sits under one of those headings and is followed immediately by its dollar amount. No bare ten-digit pattern is ever run across a whole page, because that would also match phone numbers, asset ids, and totals.");
  out.push("- **Canonical identifier.** Haywood publishes the North Carolina grid PIN with its hyphens stripped (`8614733009`). That digits-only ten-character string is the canonical key, and it is applied to both sides of every intersection, so a hyphenated `8614-73-3009` from any other source collapses to the same key. A ten-digit run beginning `19xx` or `20xx` without hyphens is refused as date-like.");
  out.push("- **Year spans are reported as they are.** Each intersection above is labelled with the real number of tax years between the two lists. A three-year gap is never described as five.");
  out.push("- Acreage is printed only when the source list actually has an acreage column. The Haywood advertisement does not, so no acreage and no acreage highlighting appears for Haywood; nothing is estimated.");
  out.push("- Raw listing files stay in gitignored `inbox/out-of-state/` and are never committed.");
  out.push("- Parcel-viewer products (qPublic, Beacon, Eagle) are excluded from link-following; they are not bulk-scraped.");
  out.push("- Not for commercial solicitation.");
  out.push("");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, out.join("\n"));
  assertNoOwnersInFile(dest);
  log("wrote", dest);
  return dest;
}

/**
 * Guard against an owner value reaching the document. These look for an actual
 * data row — a surname-comma-forename or a company suffix sitting next to a
 * ten-digit parcel, or a markdown cell holding a name — not for the words
 * "liable owner", which the method notes legitimately mention.
 */
const OWNER_ROW_RES = [
  /[A-Z]{3,}\s*,\s*[A-Z]{3,}[^\n]{0,40}\b\d{10}\b/,
  /\b(?:LLC|INC|HEIRS|ETAL|EXR)\b[^\n]{0,24}\b\d{10}\b/,
  /\|\s*[A-Z]{3,}\s*,\s*[A-Z]{3,}[^|\n]*\|/,
];

function assertNoOwnersInFile(file) {
  const text = fs.readFileSync(file, "utf8");
  for (const re of OWNER_ROW_RES) {
    if (re.test(text)) {
      throw new Error("refused to write a document containing owner rows: " + file);
    }
  }
  return true;
}

/* ---------------------------------------------------------- phase 7: PDF */

function snapshotForPdf(registry, state) {
  const counties = [];
  for (const county of registry.counties) {
    const cs = state.counties[county.id];
    if (!cs || !cs.headline || !cs.headline.count) continue;
    const from = cs.years[cs.headline.from];
    const to = cs.years[cs.headline.to];
    const yearKeys = Object.keys(cs.years).map(Number).sort((a, b) => a - b);
    const both = cs.headline.ids.map((id) => ({
      tms: id,
      amountRecent: to.amounts[id] == null ? null : to.amounts[id],
      amountHistoric: from.amounts[id] == null ? null : from.amounts[id],
      advertisedYears: yearKeys.filter((year) => cs.years[year].amounts[id] != null || cs.years[year].ids.includes(id)),
    }));
    counties.push({
      id: county.id,
      name: county.name,
      stateCode: county.state,
      fips: county.fips,
      noAcreage: Boolean(county.noAcreage),
      recent: { year: cs.headline.to, url: (to.files[0] || {}).url, idCount: to.idCount },
      historic: { year: cs.headline.from, url: (from.files[0] || {}).url, idCount: from.idCount },
      span: cs.headline.span,
      isFiveYear: cs.headline.isFiveYear,
      readableYears: yearKeys,
      allYears: cs.allYears,
      bothCount: cs.headline.count,
      both,
    });
  }
  const spans = counties.map((row) => row.span);
  return {
    season: SEASON,
    generatedAt: new Date().toISOString(),
    span: spans.length ? Math.max(...spans) : null,
    isFiveYear: counties.length > 0 && counties.every((row) => row.isFiveYear),
    source: "Official G.S. 105-369 tax-lien advertisements for Haywood County, North Carolina. Parcel identifiers and amounts only.",
    bothCount: counties.reduce((sum, row) => sum + row.bothCount, 0),
    counties,
  };
}

async function buildPdf(registry, state) {
  const snapshot = snapshotForPdf(registry, state);
  if (!snapshot.counties.length) {
    log("pdf skipped: no county has a paired tax-year intersection");
    state.phases.pdf = "skipped — no paired parcels";
    saveState(state);
    return null;
  }
  const pdf = require("./out-of-state-pdf");
  const result = await pdf.write(snapshot, state);
  state.phases.pdf = "wrote " + (result.dest || result.html) + " (" + result.rowCount + " rows, engine " + result.engine + ")";
  saveState(state);
  log("pdf", state.phases.pdf);
  return result;
}

/* ----------------------------------------------------------------- main */

async function main() {
  const args = process.argv.slice(2);
  const phaseArg = (args.find((a) => a.startsWith("--phase=")) || "").split("=")[1] || "all";
  const only = (args.find((a) => a.startsWith("--county=")) || "").split("=")[1] || null;
  const registry = loadRegistry();
  const state = loadState();
  fs.mkdirSync(INBOX, { recursive: true });

  const run = async (name, fn) => {
    if (phaseArg !== "all" && phaseArg !== name) return;
    log("phase", name, "start");
    try {
      await fn();
    } catch (err) {
      log("phase", name, "failed:", String(err.stack || err).slice(0, 400));
      state.phases[name + "Error"] = String(err.message || err).slice(0, 200);
      saveState(state);
    }
    try {
      writeDoc(registry, state);
    } catch (err) {
      log("doc write refused:", String(err.message || err).slice(0, 200));
    }
    log("phase", name, "done");
  };

  await run("verify", () => verifySources(registry, state, only));
  await run("land", () => probeLand(registry, state));
  await run("lists", () => fetchListings(registry, state, only));
  await run("wayback", () => waybackHunt(registry, state, only));
  await run("pair", async () => pairAll(registry, state, only));
  await run("pdf", () => buildPdf(registry, state));

  writeDoc(registry, state);
  const browser = await browserPromise;
  if (browser) await browser.close().catch(() => {});
  log("done");
}

if (require.main === module) {
  main().then(
    () => process.exit(0),
    (err) => {
      log("fatal", String(err.stack || err).slice(0, 600));
      process.exit(1);
    }
  );
}

module.exports = {
  loadRegistry,
  loadState,
  saveState,
  buildYearSets,
  intersectYears,
  allYearsIntersection,
  pickHeadline,
  pairCounty,
  pairAll,
  writeDoc,
  assertNoOwnersInFile,
  snapshotForPdf,
  assetPdfLinks,
  readListing,
  htmlToText,
  yearFromUrl,
  spanLabel,
  TARGET_SPAN,
  MIN_ROWS,
};
