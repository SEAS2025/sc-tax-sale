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
 * obituaries, and death notices are never read or stored — identifiers and
 * amounts only. Every URL is verified over the network before it is recorded.
 *
 * Designed to run unattended and resumable:
 *   node engine/out-of-state.js            full pass
 *   node engine/out-of-state.js --phase=verify|lists|wayback|pair|doc|pdf
 *   node engine/out-of-state.js --county=coconino-az
 *
 * State lives in inbox/out-of-state/state.json (gitignored). The findings
 * document docs/OUT_OF_STATE.md is rewritten after every phase so a crash or
 * reboot still leaves a truthful, current document behind.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const oosIds = require("./out-of-state-ids");
const repeat = require("./repeat");
const { indexSpecs } = require("./specs");

const ROOT = path.join(__dirname, "..");
const REGISTRY = path.join(ROOT, "counties", "out-of-state.json");
const INBOX = path.join(ROOT, "inbox", "out-of-state");
const STATE_FILE = path.join(INBOX, "state.json");
const DOC = path.join(ROOT, "docs", "OUT_OF_STATE.md");

const UA = "sc-tax-sale-research/1.0 (public records research; parcel identifiers only; +https://github.com/SEAS2025/sc-tax-sale)";
const BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";
const FETCH_MS = 45000;
const MIN_IDS = 8;
const CDX_PAUSE_MS = 6000;
const CDX_TRIES = 5;
const SEASON = new Date().getUTCFullYear();
const RECENT_YEARS = [SEASON, SEASON - 1, SEASON - 2];
const HISTORIC_YEARS = [SEASON - 6, SEASON - 5, SEASON - 4];

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
  if (!fs.existsSync(STATE_FILE)) {
    return { startedAt: new Date().toISOString(), counties: {}, land: [], phases: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch (_err) {
    return { startedAt: new Date().toISOString(), counties: {}, land: [], phases: {} };
  }
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
      pair: null,
    };
  }
  return state.counties[county.id];
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
  if (!years.length) return null;
  return Math.max(...years);
}

/* ------------------------------------------------------------------ fetch */

async function rawFetch(url, method) {
  const response = await fetch(url, {
    method: method || "GET",
    redirect: "follow",
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml,application/pdf,application/vnd.ms-excel,*/*",
    },
    signal: AbortSignal.timeout(FETCH_MS),
  });
  const buf = method === "HEAD" || !response.ok ? Buffer.alloc(0) : Buffer.from(await response.arrayBuffer());
  return {
    ok: response.ok,
    status: response.status,
    url: response.url || url,
    contentType: response.headers.get("content-type") || "",
    lastModified: response.headers.get("last-modified") || null,
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
 * no captcha solving, no paywall circumvention.
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
    if (/sign in|log in to continue|subscribe to (read|continue)/i.test(title)) {
      return { ok: false, status, url: page.url(), blocked: "login or subscription wall — not bypassed", via: "playwright" };
    }
    return {
      ok: status > 0 && status < 400,
      status,
      url: page.url(),
      contentType: "text/html",
      lastModified: null,
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
  let got = null;
  try {
    got = await rawFetch(url, opts.method || "GET");
  } catch (err) {
    got = { ok: false, status: 0, url, error: String(err.message || err).slice(0, 160), via: "fetch" };
  }
  const needsBrowser = !got.ok && (got.status === 403 || got.status === 429 || got.status === 0 || got.status === 503);
  if (needsBrowser && opts.allowBrowser !== false) {
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
    const targets = [];
    for (const url of county.statuteUrls || []) targets.push({ url, role: "statute" });
    for (const row of county.candidateUrls || []) targets.push(row);
    for (const target of targets) {
      const got = await getUrl(target.url);
      const record = {
        url: target.url,
        finalUrl: got.url,
        role: target.role,
        year: target.year || null,
        status: got.status,
        via: got.via,
        bytes: got.buf ? got.buf.length : 0,
        contentType: got.contentType || "",
        checkedAt: new Date().toISOString(),
      };
      if (got.blocked) record.blocked = got.blocked;
      if (got.error) record.error = got.error;
      if (got.ok && record.bytes > 400) {
        cs.verified.push(record);
        log("verified", county.id, got.status, target.url);
      } else {
        cs.unreachable.push(record);
        log("unreachable", county.id, got.status, target.url, got.blocked || got.error || "");
      }
      saveState(state);
      await sleep(1200);
    }
  }
  state.phases.verify = new Date().toISOString();
  saveState(state);
  return state;
}

/* ------------------------------------------- phase 1b: land ownership facts */

async function probeLand(registry, state) {
  state.land = [];
  for (const probe of registry.landOwnershipProbes || []) {
    const got = await getUrl(probe.url);
    const row = { url: probe.url, note: probe.note, status: got.status, via: got.via, ok: Boolean(got.ok) };
    if (got.ok && got.buf && got.buf.length) {
      const text = htmlToText(got.buf.toString("utf8"));
      row.acreageMentions = [...text.matchAll(/([\d,]{4,12})\s*(acres|square miles)/gi)]
        .slice(0, 6)
        .map((m) => m[0].replace(/\s+/g, " "));
      row.percentMentions = [...text.matchAll(/(\d{1,3}(?:\.\d)?)\s*(?:%|percent)[^.]{0,80}?(federal|forest|park|tribal|state trust|private)/gi)]
        .slice(0, 8)
        .map((m) => m[0].replace(/\s+/g, " ").slice(0, 120));
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

/* -------------------------------------------------- phase 2: fetch listings */

function htmlToText(html) {
  return String(html || "")
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(tr|p|div|li|h\d)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, "  ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
    .replace(/[ \t]+/g, " ");
}

function bufferToText(dest, contentType, buf) {
  const ext = path.extname(dest).toLowerCase();
  if (ext === ".pdf" || /pdf/i.test(contentType)) {
    try {
      return execFileSync("pdftotext", ["-layout", dest, "-"], { encoding: "utf8", maxBuffer: 40 * 1024 * 1024 });
    } catch (_err) {
      return "";
    }
  }
  if (ext === ".xlsx" || ext === ".xls" || /excel|spreadsheet/i.test(contentType)) {
    try {
      return repeat.textFromBuffer(dest, contentType, buf);
    } catch (_err) {
      return buf.toString("utf8");
    }
  }
  return htmlToText(buf.toString("utf8"));
}

function extFor(url, contentType) {
  const blob = String(contentType || "") + " " + String(url || "");
  if (/\.pdf(\?|$)|application\/pdf/i.test(blob)) return ".pdf";
  if (/\.xlsx(\?|$)|spreadsheetml/i.test(blob)) return ".xlsx";
  if (/\.xls(\?|$)|ms-excel/i.test(blob)) return ".xls";
  if (/\.csv(\?|$)|text\/csv/i.test(blob)) return ".csv";
  return ".html";
}

function stashName(countyId, year, url, ext) {
  const hash = require("crypto").createHash("sha1").update(String(url)).digest("hex").slice(0, 10);
  return countyId + "-" + (year || "unk") + "-" + hash + ext;
}

async function ingest(county, cs, url, year, source) {
  if (cs.lists.some((row) => row.url === url)) return null;
  const got = await getUrl(url);
  if (!got.ok || !got.buf || got.buf.length < 400) {
    cs.lists.push({
      url,
      year: year || null,
      source,
      status: got.status,
      via: got.via,
      idCount: 0,
      skipped: got.blocked || got.error || ("http-" + got.status),
    });
    return null;
  }
  const ext = extFor(got.url, got.contentType);
  const dest = path.join(INBOX, stashName(county.id, year, url, ext));
  fs.mkdirSync(INBOX, { recursive: true });
  fs.writeFileSync(dest, got.buf);
  const text = bufferToText(dest, got.contentType, got.buf);
  const extracted = oosIds.extractIds(text, county.state);
  const census = oosIds.shapeCensus(text);
  const row = {
    url: got.url,
    requestedUrl: url,
    year: year || yearFromUrl(got.url, "") || null,
    source,
    status: got.status,
    via: got.via,
    bytes: got.buf.length,
    contentType: got.contentType,
    file: path.basename(dest),
    idCount: extracted.count,
    shapes: census,
    kinds: [...new Set(Object.values(extracted.kinds))],
  };
  if (extracted.count >= MIN_IDS) {
    row.ids = extracted.ids;
    row.amounts = extracted.amounts;
    fs.writeFileSync(
      path.join(INBOX, path.basename(dest, ext) + ".text.txt"),
      text.slice(0, 4 * 1024 * 1024)
    );
  } else {
    row.skipped = "only-" + extracted.count + "-identifiers";
  }
  cs.lists.push(row);
  log("ingest", county.id, row.year || "unk", row.idCount + " ids", url);
  return row;
}

async function fetchListings(registry, state, only) {
  for (const county of registry.counties) {
    if (only && county.id !== only) continue;
    const cs = countyState(state, county);
    const seen = new Set(cs.lists.map((row) => row.url));
    for (const record of cs.verified) {
      if (record.role === "statute") continue;
      if (seen.has(record.url)) continue;
      await ingest(county, cs, record.url, record.year, "registry:" + record.role);
      saveState(state);
      await sleep(1500);
      // One hop: follow listing-looking links off a verified office page.
      if (record.role === "office" || record.role === "docs" || record.role === "notices") {
        for (const link of await listingLinks(record.url)) {
          if (cs.lists.some((row) => row.url === link.url)) continue;
          await ingest(county, cs, link.url, link.year, "hop:" + hostOf(record.url));
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

const LISTING_RE = /delinquent|tax[\s-]*lien|tax[\s-]*sale|foreclos|advertis|certificate of purchase|unsold|over[\s-]*the[\s-]*counter/i;

async function listingLinks(pageUrl) {
  const got = await getUrl(pageUrl);
  if (!got.ok || !got.buf || !got.buf.length) return [];
  if (!/html/i.test(got.contentType || "") && got.via !== "playwright") return [];
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

/* ------------------------------------------------------- phase 3: wayback */

async function cdxQuery(params) {
  const url = "https://web.archive.org/cdx/search/cdx?" + new URLSearchParams(params).toString();
  let wait = CDX_PAUSE_MS;
  for (let attempt = 1; attempt <= CDX_TRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": UA },
        signal: AbortSignal.timeout(FETCH_MS),
      });
      if (response.status === 200) {
        const text = await response.text();
        if (!text.trim()) return { ok: true, rows: [] };
        return { ok: true, rows: JSON.parse(text) };
      }
      if (response.status === 404) return { ok: true, rows: [] };
      log("cdx", response.status, "attempt", attempt, url.slice(0, 120));
    } catch (err) {
      log("cdx error attempt", attempt, String(err.message || err).slice(0, 100));
    }
    await sleep(wait);
    wait = Math.min(wait * 2, 120000);
  }
  return { ok: false, rows: [], error: "cdx exhausted after " + CDX_TRIES + " attempts" };
}

async function waybackHunt(registry, state, only) {
  for (const county of registry.counties) {
    if (only && county.id !== only) continue;
    const cs = countyState(state, county);
    cs.wayback = cs.wayback || { queried: [], errors: [] };
    for (const target of county.waybackTargets || []) {
      const key = target.host + "|" + (target.match || "*");
      if (cs.wayback.queried.some((row) => row.key === key)) continue;
      const params = {
        url: target.host + "/*",
        output: "json",
        fl: "timestamp,original,mimetype,statuscode",
        collapse: "urlkey",
        filter: "statuscode:200",
        from: String(HISTORIC_YEARS[0]) + "0101",
        to: String(SEASON) + "1231",
        limit: "800",
      };
      const result = await cdxQuery(params);
      if (!result.ok) {
        cs.wayback.errors.push({ key, error: result.error });
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
      cs.wayback.queried.push({ key, total: rows.length, matched: matched.length, hits: matched.slice(0, 40) });
      log("cdx", county.id, key, rows.length + " rows,", matched.length + " matched");
      saveState(state);

      const historic = matched
        .filter((row) => HISTORIC_YEARS.includes(row.year))
        .sort((a, b) => a.year - b.year)
        .slice(0, 6);
      const recent = matched
        .filter((row) => RECENT_YEARS.includes(row.year))
        .sort((a, b) => b.year - a.year)
        .slice(0, 4);
      for (const hit of historic.concat(recent)) {
        await ingest(county, cs, hit.snapshot, hit.year, "wayback:" + target.host);
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

/* ----------------------------------------------------------- phase 4: pair */

function usableLists(cs) {
  return (cs.lists || []).filter((row) => row.ids && row.ids.length >= MIN_IDS);
}

function pairCounty(cs) {
  const lists = usableLists(cs);
  const recent = lists
    .filter((row) => RECENT_YEARS.includes(Number(row.year)))
    .sort((a, b) => Number(b.year) - Number(a.year) || b.idCount - a.idCount)[0] || null;
  const historicCands = lists.filter((row) => HISTORIC_YEARS.includes(Number(row.year)));
  if (!recent || !historicCands.length) {
    return {
      recent: recent ? publicList(recent) : null,
      historic: historicCands.length ? publicList(historicCands[0]) : null,
      both: [],
      bothCount: 0,
      reason: !recent ? "no recent list with usable identifiers" : "no list from " + HISTORIC_YEARS.join("/") + " with usable identifiers",
    };
  }
  let best = null;
  for (const historic of historicCands) {
    if (historic.url === recent.url) continue;
    const both = oosIds.intersect(
      { ids: recent.ids, amounts: recent.amounts },
      { ids: historic.ids, amounts: historic.amounts }
    );
    if (!best || both.length > best.both.length) best = { historic, both };
  }
  if (!best) return { recent: publicList(recent), historic: null, both: [], bothCount: 0, reason: "only one distinct list found" };
  return {
    recent: publicList(recent),
    historic: publicList(best.historic),
    both: best.both,
    bothCount: best.both.length,
    reason: best.both.length ? null : "lists found for both windows but no identifier appears on both",
  };
}

function publicList(row) {
  return { year: row.year, url: row.url, idCount: row.idCount, source: row.source, file: row.file };
}

function pairAll(registry, state, only) {
  for (const county of registry.counties) {
    if (only && county.id !== only) continue;
    const cs = countyState(state, county);
    cs.pair = pairCounty(cs);
    log("pair", county.id, cs.pair.bothCount + " on both", cs.pair.reason || "");
  }
  state.phases.pair = new Date().toISOString();
  saveState(state);
  return state;
}

/* ------------------------------------------------------ phase 5: findings */

function fmtUrl(url) {
  return "<" + url + ">";
}

function listSection(cs) {
  const rows = (cs.lists || []).filter((row) => row.idCount > 0 || row.skipped);
  if (!rows.length) return "_No list responded._\n";
  const lines = ["| Year | Identifiers | Source | Status | URL |", "| --- | --- | --- | --- | --- |"];
  for (const row of rows.slice(0, 40)) {
    lines.push("| " + [
      row.year || "—",
      row.idCount || 0,
      row.source || "—",
      row.skipped ? row.skipped : "ok (" + row.via + ")",
      row.url.length > 90 ? row.url.slice(0, 88) + "…" : row.url,
    ].join(" | ") + " |");
  }
  return lines.join("\n") + "\n";
}

function shapeSection(cs) {
  const withShapes = (cs.lists || []).filter((row) => row.shapes && row.shapes.length);
  if (!withShapes.length) return "_No list text was retrieved, so no identifier format was observed._";
  const top = new Map();
  for (const row of withShapes) {
    for (const shape of row.shapes) {
      const cur = top.get(shape.shape) || { count: 0, sample: shape.sample };
      cur.count += shape.count;
      top.set(shape.shape, cur);
    }
  }
  return [...top.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([shape, info]) => "`" + shape + "` (" + info.count + " tokens, e.g. `" + info.sample + "`)")
    .join(", ");
}

function landSection(state) {
  if (!state.land || !state.land.length) return "_Land-ownership probes have not run yet._\n";
  const lines = [];
  for (const row of state.land) {
    lines.push("- " + fmtUrl(row.url) + " — HTTP " + row.status + (row.ok ? " verified" : " not reachable") + ". " + row.note);
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
  out.push("Public records only. No login, captcha, or paywall was bypassed. **No obituaries, death notices, or any owner-name source were used.** Parcel identifiers and amounts only — owner names are never stored or published.");
  out.push("");
  out.push("Generated " + new Date().toISOString() + " by `engine/out-of-state.js` (driver: `scripts/hunt-out-of-state.sh`).");
  out.push("Recent window " + RECENT_YEARS.join("/") + " · historic window " + HISTORIC_YEARS.join("/") + ".");
  out.push("");
  out.push("## Status of this run");
  out.push("");
  for (const phase of ["verify", "land", "lists", "wayback", "pair"]) {
    out.push("- `" + phase + "`: " + (state.phases[phase] ? "completed " + state.phases[phase] : "not completed in this run"));
  }
  out.push("");

  out.push("## Summary");
  out.push("");
  out.push("| County | Regime | Verified sources | Lists with identifiers | Years found | Parcels on both windows |");
  out.push("| --- | --- | --- | --- | --- | --- |");
  for (const county of registry.counties) {
    const cs = state.counties[county.id];
    if (!cs) continue;
    const usable = usableLists(cs);
    const years = [...new Set(usable.map((row) => row.year).filter(Boolean))].sort();
    out.push("| " + [
      county.name + " " + county.state,
      county.regime === "foreclosure" ? "Foreclosure (NC)" : "Lien certificate (AZ)",
      (cs.verified || []).length,
      usable.length,
      years.length ? years.join(", ") : "none",
      cs.pair ? cs.pair.bothCount : "—",
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
    const badStatutes = (cs.unreachable || []).filter((row) => row.role === "statute");
    if (statutes.length) {
      out.push("Statute text verified over the network:");
      for (const row of statutes) out.push("- " + fmtUrl(row.url) + " — HTTP " + row.status);
    }
    if (badStatutes.length) {
      out.push("Statute URLs that did not respond (cited by section number only, text not fetched):");
      for (const row of badStatutes) out.push("- " + fmtUrl(row.url) + " — HTTP " + row.status + (row.error ? " " + row.error : ""));
    }
    out.push("");
    out.push("**Official sources verified.**");
    const official = (cs.verified || []).filter((row) => row.role !== "statute");
    if (official.length) {
      for (const row of official) {
        out.push("- " + fmtUrl(row.url) + " — HTTP " + row.status + ", " + row.bytes + " bytes, via " + row.via + " (" + row.role + ")");
      }
    } else {
      out.push("- None responded in this run.");
    }
    const blocked = (cs.unreachable || []).filter((row) => row.role !== "statute");
    if (blocked.length) {
      out.push("");
      out.push("**Not reachable / blocked.**");
      for (const row of blocked) {
        out.push("- " + fmtUrl(row.url) + " — HTTP " + row.status + (row.blocked ? " — " + row.blocked : row.error ? " — " + row.error : ""));
      }
    }
    out.push("");
    out.push("**Lists retrieved.**");
    out.push("");
    out.push(listSection(cs));
    out.push("**Identifier format observed in the retrieved text.** " + shapeSection(cs));
    out.push("");
    out.push("**Pairing a recent list against a ~5-year-earlier list.**");
    out.push("");
    if (cs.pair && cs.pair.bothCount) {
      out.push("- Recent list: " + cs.pair.recent.year + " — " + cs.pair.recent.idCount + " identifiers — " + fmtUrl(cs.pair.recent.url));
      out.push("- Historic list: " + cs.pair.historic.year + " — " + cs.pair.historic.idCount + " identifiers — " + fmtUrl(cs.pair.historic.url));
      out.push("- **" + cs.pair.bothCount + " parcels appear on both.**");
    } else if (cs.pair) {
      out.push("- **0 paired parcels.** Reason: " + (cs.pair.reason || "no usable pair") + ".");
      if (cs.pair.recent) out.push("  - Recent side available: " + cs.pair.recent.year + ", " + cs.pair.recent.idCount + " identifiers.");
      if (cs.pair.historic) out.push("  - Historic side available: " + cs.pair.historic.year + ", " + cs.pair.historic.idCount + " identifiers.");
    } else {
      out.push("- Pairing has not run yet.");
    }
    const cdxErrors = (cs.wayback && cs.wayback.errors) || [];
    if (cdxErrors.length) {
      out.push("");
      out.push("**Wayback CDX problems.** " + cdxErrors.map((row) => row.key + ": " + row.error).join("; "));
    }
    out.push("");
  }

  out.push("## How much Grand Canyon land is actually on a county tax roll");
  out.push("");
  out.push("A large share of the land around the Grand Canyon is federal (National Park Service, U.S. Forest Service) or tribal (Havasupai, Navajo, Hualapai). Federal and tribal trust land is not assessed by a county and never appears on a delinquent tax roll, and Arizona State Trust land is also off the county roll. The taxable universe near the canyon is therefore far smaller than the map suggests: it is effectively the private in-holdings and townsite parcels — Tusayan, Valle, Williams, Flagstaff and the private subdivisions along the SR-64 and US-180 corridors in Coconino County, and the private parcels on the Mohave County side away from the Hualapai reservation. No parcel is added to this file to make the count look larger.");
  out.push("");
  out.push("Sources probed for this statement:");
  out.push("");
  out.push(landSection(state));
  out.push("## Method and limits");
  out.push("");
  out.push("- Every URL above was requested over the network during this run; the HTTP status shown is what came back. Nothing is listed that was not fetched.");
  out.push("- Identifier extraction reuses the repo's approach (`engine/extract-ids.js`) through `engine/out-of-state-ids.js`, which adds the Arizona assessor parcel number shape (`NNN-NN-NNN`, optional letter or split decimal) and the North Carolina grid PIN shape (`NNNN-NN-NNNN`). The Arizona shape overlaps an existing South Carolina pattern, so it is kept in a separate module and the SC pattern table is unchanged.");
  out.push("- Acreage and other specs reuse `engine/specs.js`. A blank acres cell means the official list did not print acreage; nothing is estimated.");
  out.push("- Pairing reuses the intersect logic from `engine/repeat.js`: a parcel counts only if the same identifier appears on a list in the recent window and on a list in the historic window.");
  out.push("- Raw listing files stay in gitignored `inbox/out-of-state/` and are never committed.");
  out.push("- Parcel-viewer products (qPublic, Beacon, Eagle) are excluded from link-following; they are not bulk-scraped.");
  out.push("- Not for commercial solicitation.");
  out.push("");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, out.join("\n"));
  log("wrote", dest);
  return dest;
}

/* ---------------------------------------------------------- phase 6: PDF */

function snapshotForPdf(registry, state) {
  const counties = [];
  for (const county of registry.counties) {
    const cs = state.counties[county.id];
    if (!cs || !cs.pair || !cs.pair.bothCount) continue;
    counties.push({
      id: county.id,
      name: county.name,
      stateCode: county.state,
      fips: county.fips,
      recent: cs.pair.recent,
      historic: cs.pair.historic,
      bothCount: cs.pair.bothCount,
      both: cs.pair.both,
    });
  }
  return {
    season: SEASON,
    generatedAt: new Date().toISOString(),
    recentYears: RECENT_YEARS,
    historicYears: HISTORIC_YEARS,
    source: "Official out-of-state delinquent and tax-lien lists, plus Wayback Machine captures of the same official pages. Identifiers and amounts only.",
    bothCount: counties.reduce((sum, row) => sum + row.bothCount, 0),
    counties,
  };
}

function attachSpecs(snapshot) {
  for (const county of snapshot.counties) {
    for (const side of ["recent", "historic"]) {
      const file = county[side] && county[side].file;
      const textFile = file ? path.join(INBOX, path.basename(file, path.extname(file)) + ".text.txt") : null;
      const key = side === "recent" ? "_specsRecent" : "_specsHistoric";
      county[key] = textFile && fs.existsSync(textFile) ? indexSpecs(fs.readFileSync(textFile, "utf8")) : new Map();
    }
  }
  return snapshot;
}

async function buildPdf(registry, state) {
  const snapshot = attachSpecs(snapshotForPdf(registry, state));
  if (!snapshot.counties.length) {
    log("pdf skipped: no county has paired parcels");
    state.phases.pdf = "skipped — no paired parcels";
    saveState(state);
    return null;
  }
  const pdf = require("./out-of-state-pdf");
  const result = await pdf.write(snapshot, state);
  state.phases.pdf = JSON.stringify(result);
  saveState(state);
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
    writeDoc(registry, state);
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
  pairCounty,
  writeDoc,
  snapshotForPdf,
  htmlToText,
  yearFromUrl,
  RECENT_YEARS,
  HISTORIC_YEARS,
};
