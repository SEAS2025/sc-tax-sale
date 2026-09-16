#!/usr/bin/env node
"use strict";

/**
 * Browse official county sites for public tax-sale lists.
 *
 * Starts at SCAC homepage URLs (scripts/county-seeds.js), clicks through
 * Departments / Treasurer / Document Center / search, and follows one hop
 * of listing links on the same host or a county-published Dropbox/Drive/
 * SharePoint folder. Public pages only. A captcha or login wall is recorded
 * and skipped. Listing files are not copied into git.
 *
 *   node scripts/browse.js aiken berkeley
 *   node scripts/browse.js --unknown
 */

const fs = require("fs");
const path = require("path");
const { firefox } = require("playwright");
const { SEEDS } = require("./county-seeds");

const ROOT = path.join(__dirname, "..");
const REPORT_DIR = path.join(ROOT, "docs", "crawl");
const HTML_DIR = path.join(ROOT, ".crawl-html");
const STRONG_RE = /tax[\s-]*sale|delinquent|realad|forfeit|bidder/i;
const SKIP_TEXT = /pay my tax|print tax|tax receipt|levy sheet|exemption|capital sales|a-tax|accommodations|vehicle tax/i;
const FILE_RE = /\.(pdf|xlsx|xls|csv|zip|aspx)(\?|#|$)/i;
const CLOUD_RE = /(^|\.)((dropbox|box)\.com|drive\.google\.com|docs\.google\.com|sharepoint\.com|1drv\.ms|onedrive\.live\.com)$/i;
const NAV_RE = /delinquent|tax sale|tax collector|treasurer|document center|related information|departments|agenda|news|forfeited/i;
const QPUBLIC_RE = /qpublic|beacon\.schneider|schneidercorp/i;

function argIds() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--unknown");
  if (process.argv.includes("--unknown")) {
    const registry = JSON.parse(fs.readFileSync(path.join(ROOT, "counties", "sc.json"), "utf8"));
    const unknown = registry.counties.filter((c) => c.status === "unknown").map((c) => c.id);
    return unknown.concat(args);
  }
  if (!args.length) {
    console.error("Usage: node scripts/browse.js <county-id>... | --unknown");
    process.exit(1);
  }
  return args;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (_err) {
    return "";
  }
}

function allowedHop(href, seedHosts) {
  const host = hostOf(href);
  if (!host) return false;
  if (seedHosts.some((seed) => host === seed || host.endsWith("." + seed))) return true;
  return CLOUD_RE.test(host);
}

function isListingLink(link) {
  const text = link.text || "";
  const href = link.href || "";
  if (QPUBLIC_RE.test(href)) return false;
  if (SKIP_TEXT.test(text)) return false;
  if (STRONG_RE.test(text) || STRONG_RE.test(href)) return true;
  return FILE_RE.test(href) && /listing|sale|delinquent|bidder/i.test(text + " " + href);
}

function kindOf(href) {
  if (/\.pdf(\?|#|$)/i.test(href)) return "pdf";
  if (/\.xlsx?(\?|#|$)/i.test(href)) return "xlsx";
  if (/\.csv(\?|#|$)/i.test(href)) return "csv";
  if (/\.zip(\?|#|$)/i.test(href)) return "zip";
  if (CLOUD_RE.test(hostOf(href))) return "cloud";
  if (/\.aspx(\?|#|$)/i.test(href)) return "aspx";
  return "html";
}

function datesIn(text) {
  const found = String(text || "").match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+20\d\d\b/gi) || [];
  return [...new Set(found)].slice(0, 6);
}

async function launchFirefox() {
  // Playwright cannot drive the distro Firefox at /usr/bin/firefox (revision
  // mismatch). Prefer it, then the Playwright Firefox build, which is still
  // Firefox and was installed with `npx playwright install firefox`.
  try {
    const browser = await firefox.launch({
      headless: true,
      executablePath: "/usr/bin/firefox",
    });
    console.error("browser: /usr/bin/firefox");
    return browser;
  } catch (err) {
    console.error("system firefox unavailable (" + err.message.split("\n")[0] + "); using Playwright Firefox");
    const browser = await firefox.launch({ headless: true });
    console.error("browser: playwright firefox");
    return browser;
  }
}

async function readLinks(page) {
  return page.evaluate(() => {
    const out = [];
    const seen = new Set();
    for (const a of document.querySelectorAll("a[href]")) {
      const href = a.href || "";
      if (!href || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
      const text = (a.innerText || a.getAttribute("title") || a.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 180);
      const key = href + "|" + text;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ href, text });
    }
    return out;
  });
}

async function tableMeta(page) {
  return page.evaluate(() => {
    return [...document.querySelectorAll("table")].map((table) => {
      const headers = [...table.querySelectorAll("th")].map((th) => th.innerText.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 12);
      return { headers, rowCount: table.querySelectorAll("tr").length };
    }).filter((table) => table.headers.length || table.rowCount > 2).slice(0, 8);
  });
}

async function blockState(page) {
  const html = await page.content();
  const title = await page.title();
  const snippet = await page.evaluate(() => (document.body ? document.body.innerText : "").replace(/\s+/g, " ").slice(0, 1500));
  const captcha = /verify you are human|attention required|just a moment/i.test(snippet + " " + title)
    || (/cf-turnstile|h-captcha/i.test(html) && snippet.length < 500);
  const password = await page.locator('input[type="password"]').count();
  const loginWall = password > 0 && /sign in|log in|password/i.test(snippet);
  return {
    title: title.slice(0, 160),
    blocked: Boolean(captcha || loginWall),
    blockReason: captcha ? "captcha" : loginWall ? "login" : null,
    saleDates: datesIn(snippet),
    mentionsTaxSale: /tax sale|delinquent tax/i.test(snippet),
    mentionsNewspaper: /newspaper|legal notice|post and courier|the state|greenville news|horry independent|bamberg leader/i.test(snippet),
    civicplus: /civicplus|civicengage|documentcenter/i.test(html),
  };
}

async function openPage(page, url, report, htmlDir) {
  const entry = { url, status: null, error: null };
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    entry.status = response ? response.status() : null;
    entry.finalUrl = page.url();
    const state = await blockState(page);
    Object.assign(entry, state);
    entry.tables = await tableMeta(page);
    const html = await page.content();
    const file = path.join(htmlDir, "page-" + report.pages.length + ".html");
    fs.writeFileSync(file, html);
    entry.links = await readLinks(page);
  } catch (err) {
    entry.error = String(err.message || err).split("\n")[0].slice(0, 240);
    entry.links = [];
  }
  report.pages.push(entry);
  return entry;
}

function scoreNav(link) {
  let last = "";
  try {
    last = decodeURIComponent(new URL(link.href).pathname).split("/").filter(Boolean).pop() || "";
  } catch (_err) {
    last = "";
  }
  const blob = (link.text || "") + " " + last.replace(/[-_]/g, " ");
  if (/delinquent|tax sale/i.test(blob)) return 100;
  if (/tax collector|treasurer/i.test(blob)) return 80;
  if (/document center|related information/i.test(blob)) return 60;
  if (/forfeit/i.test(blob)) return 55;
  if (/^departments?$/i.test(blob.trim()) || /\bdepartments\b/i.test(link.text || "")) return 30;
  if (/agenda|news/i.test(blob)) return 20;
  return 0;
}

function suggest(report) {
  const listing = report.candidateLinks;
  const tables = report.pages.flatMap((page) => page.tables || []);
  const htmlTable = tables.some((table) => /map|pin|tms|parcel/i.test(table.headers.join(" ")) && /amount|due/i.test(table.headers.join(" ")));
  if (htmlTable) return "html-table";
  if (listing.some((link) => link.kind === "xlsx" || link.kind === "csv")) return "xlsx";
  if (listing.some((link) => link.kind === "pdf")) return "county-pdf";
  if (report.pages.some((page) => page.mentionsTaxSale || NAV_RE.test(page.title || "") || NAV_RE.test(page.finalUrl || ""))) {
    return "page-or-newspaper";
  }
  return "unknown";
}

function bestTreasurer(report) {
  const pages = report.pages.filter((page) => page.finalUrl && !page.blocked);
  const ranked = pages.slice().sort((a, b) => {
    const score = (page) => (/delinquent|tax-sale|taxsale/i.test(page.finalUrl + " " + page.title) ? 3 : 0)
      + (/treasurer|tax collector/i.test(page.finalUrl + " " + page.title) ? 2 : 0)
      + (page.mentionsTaxSale ? 1 : 0);
    return score(b) - score(a);
  });
  const best = ranked[0];
  if (!best || (!best.mentionsTaxSale && !/treasurer|delinquent|tax-sale|tax collector/i.test(best.finalUrl + " " + best.title))) {
    return null;
  }
  return best.finalUrl;
}

function stableListing(report) {
  const seedHosts = report.seedHosts || [];
  const stable = report.candidateLinks.find((link) => {
    if (link.kind === "cloud") return false;
    if (!["pdf", "xlsx", "csv"].includes(link.kind)) return false;
    return seedHosts.includes(hostOf(link.href));
  });
  return stable ? stable.href : null;
}

async function wayback(seedUrl) {
  const host = hostOf(seedUrl);
  if (!host) return [];
  const cdx = "https://web.archive.org/cdx/search/cdx?url=" + encodeURIComponent(host + "/*")
    + "&output=json&fl=original,timestamp,statuscode,mimetype&filter=statuscode:200&filter=original:.*(tax|delinquent).*&limit=12&collapse=urlkey";
  try {
    const response = await fetch(cdx, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return [{ error: "wayback HTTP " + response.status }];
    const rows = await response.json();
    return rows.slice(1).map((row) => ({
      original: row[0],
      timestamp: row[1],
      status: row[2],
      mimetype: row[3],
    })).filter((row) => /tax|delinquent|sale|listing/i.test(row.original)).slice(0, 8);
  } catch (err) {
    return [{ error: String(err.message || err).slice(0, 180) }];
  }
}

async function browseCounty(browser, id) {
  const seeds = SEEDS[id];
  if (!seeds) throw new Error("No seed for " + id);
  const htmlDir = path.join(HTML_DIR, id);
  fs.mkdirSync(htmlDir, { recursive: true });
  const report = {
    id,
    browsedAt: new Date().toISOString(),
    seedUrls: seeds,
    seedSource: "https://www.sccounties.org/county-information",
    seedHosts: [...new Set(seeds.map(hostOf).filter(Boolean))],
    pages: [],
    candidateLinks: [],
    followed: [],
    blocked: [],
    arcgis: [],
    qpublic: [],
    wayback: [],
    suggestedFamily: "unknown",
    treasurerUrl: null,
    listingSampleUrl: null,
    notes: "",
  };
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0 sc-tax-sale-research",
  });
  const page = await context.newPage();
  const visited = new Set();
  const deadline = Date.now() + 80000;

  async function visit(url) {
    if (Date.now() > deadline) return null;
    const key = url.split("#")[0];
    if (visited.has(key)) return null;
    visited.add(key);
    console.error("  open", url);
    return openPage(page, url, report, htmlDir);
  }

  for (const seed of seeds) {
    await visit(seed);
  }

  const home = report.pages[0];
  if (home && home.links) {
    const nav = home.links
      .filter((link) => scoreNav(link) > 0 && allowedHop(link.href, report.seedHosts))
      .sort((a, b) => scoreNav(b) - scoreNav(a))
      .slice(0, 6);
    for (const link of nav) {
      if (Date.now() > deadline) break;
      await visit(link.href);
    }
  }

  const extra = [];
  for (const entry of report.pages) {
    if (!/delinquent|tax sale|treasurer|tax collector|document center/i.test((entry.title || "") + " " + (entry.finalUrl || ""))) continue;
    for (const link of entry.links || []) {
      if (scoreNav(link) >= 55 && allowedHop(link.href, report.seedHosts)) extra.push(link);
    }
  }
  extra.sort((a, b) => scoreNav(b) - scoreNav(a));
  for (const link of extra.slice(0, 6)) {
    if (Date.now() > deadline) break;
    await visit(link.href);
  }

  const civic = report.pages.some((entry) => entry.civicplus);
  if (civic && seeds[0] && Date.now() < deadline) {
    const origin = new URL(seeds[0]).origin;
    await visit(origin + "/Search/Results?searchPhrase=tax+sale");
  }

  const seenCandidates = new Set();
  for (const entry of report.pages) {
    if (entry.blocked) {
      report.blocked.push({ url: entry.finalUrl || entry.url, reason: entry.blockReason });
      continue;
    }
    for (const link of entry.links || []) {
      if (QPUBLIC_RE.test(link.href) && report.qpublic.length < 3) {
        report.qpublic.push({ text: link.text, href: link.href, note: "Assessor lookup, not a sale list. Not scraped." });
      }
      if (/arcgis\.com/i.test(link.href) && /tax sale|delinquent/i.test(link.text + " " + link.href) && report.arcgis.length < 5) {
        report.arcgis.push({ text: link.text, href: link.href });
      }
      if (!isListingLink(link)) continue;
      if (seenCandidates.has(link.href)) continue;
      seenCandidates.add(link.href);
      report.candidateLinks.push({
        text: link.text,
        href: link.href,
        kind: kindOf(link.href),
        foundOn: entry.finalUrl || entry.url,
      });
    }
  }

  for (const link of report.candidateLinks.slice(0, 5)) {
    if (Date.now() > deadline) break;
    if (!allowedHop(link.href, report.seedHosts) && !/postandcourier|thestate\.com|greenvilleonline|horryindependent|scnow\.com/i.test(link.href)) {
      report.followed.push({ url: link.href, skipped: "off-host" });
      continue;
    }
    if (link.kind === "pdf" || link.kind === "xlsx" || link.kind === "csv" || link.kind === "zip") {
      report.followed.push({
        url: link.href,
        kind: link.kind,
        note: "Listing file recorded, not downloaded into git.",
      });
      continue;
    }
    const hopped = await visit(link.href);
    if (!hopped) continue;
    report.followed.push({
      url: hopped.finalUrl || link.href,
      blocked: hopped.blocked || false,
      blockReason: hopped.blockReason || null,
      title: hopped.title || null,
      saleDates: hopped.saleDates || [],
    });
  }

  report.wayback = await wayback(seeds[0]);
  report.suggestedFamily = suggest(report);
  report.treasurerUrl = bestTreasurer(report);
  report.listingSampleUrl = stableListing(report);
  const notes = [];
  if (report.blocked.length) notes.push("Blocked walls: " + report.blocked.map((b) => b.reason + " at " + b.url).join("; "));
  if (report.qpublic.length) notes.push("qPublic/Beacon link seen; not used as the sale universe.");
  if (!report.treasurerUrl) notes.push("No treasurer or tax-sale page confirmed from the homepage links.");
  if (report.candidateLinks.length) notes.push(report.candidateLinks.length + " listing-like link(s).");
  report.notes = notes.join(" ");

  const publicReport = {
    id: report.id,
    browsedAt: report.browsedAt,
    seedUrls: report.seedUrls,
    seedSource: report.seedSource,
    pages: report.pages.map((entry) => ({
      url: entry.url,
      finalUrl: entry.finalUrl || null,
      status: entry.status,
      title: entry.title || null,
      blocked: Boolean(entry.blocked),
      blockReason: entry.blockReason || null,
      error: entry.error || null,
      mentionsTaxSale: Boolean(entry.mentionsTaxSale),
      mentionsNewspaper: Boolean(entry.mentionsNewspaper),
      civicplus: Boolean(entry.civicplus),
      saleDates: entry.saleDates || [],
      tables: entry.tables || [],
    })),
    candidateLinks: report.candidateLinks,
    followed: report.followed,
    blocked: report.blocked,
    arcgis: report.arcgis,
    qpublic: report.qpublic.map((link) => ({ text: link.text, href: link.href, note: link.note })),
    wayback: report.wayback,
    suggestedFamily: report.suggestedFamily,
    treasurerUrl: report.treasurerUrl,
    listingSampleUrl: report.listingSampleUrl,
    notes: report.notes,
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const dest = path.join(REPORT_DIR, id + ".json");
  fs.writeFileSync(dest, JSON.stringify(publicReport, null, 2) + "\n");
  await context.close();
  console.error("wrote", dest, publicReport.suggestedFamily);
  return publicReport;
}

async function main() {
  const ids = [...new Set(argIds())];
  const browser = await launchFirefox();
  try {
    for (const id of ids) {
      console.error("county", id);
      try {
        await browseCounty(browser, id);
      } catch (err) {
        console.error("failed", id, err.message);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
