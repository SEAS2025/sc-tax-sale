"use strict";

/**
 * Print the statewide 5-year file as a designed PDF.
 * Identifiers and listing specs only. Owner names are not written.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const exportRepeat = require("./export-repeat");
const adsCalendar = require("./ads-calendar");
const { getContact } = require("./county-contacts");

const ROOT = path.join(__dirname, "..");

function defaultDest() {
  return path.join(ROOT, "inbox", "repeat", "SC-5-year-delinquent-by-county.pdf");
}

function downloadsDest() {
  const home = process.env.HOME || os.homedir();
  return path.join(home, "Downloads", "SC-5-year-delinquent-by-county.pdf");
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function money(value) {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function acres(value) {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

function cell(value) {
  const text = value == null || value === "" ? "" : String(value);
  return text ? escapeHtml(text) : "<span class='empty'>—</span>";
}

function formatDate(iso) {
  if (!iso) return "";
  const day = String(iso).slice(0, 10);
  const [y, m, d] = day.split("-");
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  if (!y || !m || !d) return escapeHtml(day);
  return months[Number(m) - 1] + " " + Number(d) + ", " + y;
}

function groupByCounty(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.county)) map.set(row.county, []);
    map.get(row.county).push(row);
  }
  return map;
}

function hasValue(value) {
  return value != null && value !== "";
}

function isTargetAcreage(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 && n <= 6;
}

function rowClass(row) {
  return isTargetAcreage(row && row.acres) ? "row-target" : "";
}

function acresSortValue(acres) {
  const n = Number(acres);
  return acres == null || acres === "" || !Number.isFinite(n) ? Number.POSITIVE_INFINITY : n;
}

function sortCountyRows(list) {
  return (list || []).slice().sort((a, b) => {
    const aa = acresSortValue(a.acres);
    const bb = acresSortValue(b.acres);
    return aa - bb || (b.amountRecent || 0) - (a.amountRecent || 0) || String(a.tms).localeCompare(String(b.tms));
  });
}

function countyIdOf(row, name, paired) {
  if (row && row.countyId) return row.countyId;
  const match = (paired || []).find((c) => c.name === name);
  return (match && match.id) || String(name || "").toLowerCase().replace(/\s+/g, "");
}

function loadAdsById() {
  const adsPath = path.join(ROOT, "site", "data", "ads.json");
  const scanned = fs.existsSync(adsPath) ? JSON.parse(fs.readFileSync(adsPath, "utf8")) : { counties: [] };
  const map = new Map();
  for (const seed of adsCalendar.listSeeds()) map.set(seed.id, seed);
  for (const row of scanned.counties || []) {
    map.set(row.id, Object.assign({}, map.get(row.id) || {}, row));
  }
  return map;
}

function saleFactsFor(countyId, adsById) {
  const ads = (adsById && adsById.get(countyId)) || adsCalendar.getSeed(countyId) || {};
  const contact = getContact(countyId) || {};
  return {
    saleDate: ads.saleDate || null,
    saleDates: ads.saleDates && ads.saleDates.length ? ads.saleDates : (ads.saleDate ? [ads.saleDate] : []),
    saleNote: ads.saleNote || null,
    adOutlet: ads.adOutlet || null,
    adDates: ads.adDates || [],
    listPromised: ads.listPromised || null,
    watchFrom: ads.watchFrom || null,
    listStatus: ads.listStatus || null,
    treasurerUrl: ads.treasurerUrl || contact.url || null,
    office: contact.office || "",
    phone: contact.phone || "",
    email: contact.email || "",
    address: contact.address || "",
  };
}

function formatDates(list) {
  return (list || []).filter(Boolean).map(formatDate).filter(Boolean).join("; ");
}

function joinFact(parts) {
  return parts.filter(Boolean).join(" · ");
}

function visibleColumns(list) {
  const first = list[0] || {};
  const cols = [{ id: "tms", label: "Identifier", cls: "c-id" }];
  if (list.some((row) => hasValue(row.amountRecent))) {
    cols.push({ id: "amountRecent", label: "Due " + (first.recentYear || "new"), cls: "c-amt num", money: true });
  }
  if (list.some((row) => hasValue(row.amountHistoric))) {
    cols.push({ id: "amountHistoric", label: "Due " + (first.historicYear || "old"), cls: "c-amt num", money: true });
  }
  if (list.some((row) => hasValue(row.taxYears))) cols.push({ id: "taxYears", label: "Tax years", cls: "c-tax" });
  cols.push({ id: "acres", label: "Acres", cls: "c-ac num", acres: true });
  if (list.some((row) => hasValue(row.district))) cols.push({ id: "district", label: "Dist.", cls: "c-dist" });
  if (list.some((row) => hasValue(row.class))) cols.push({ id: "class", label: "Class", cls: "c-cls" });
  if (list.some((row) => hasValue(row.item))) cols.push({ id: "item", label: "Item", cls: "c-item" });
  if (list.some((row) => hasValue(row.situs))) cols.push({ id: "situs", label: "Situs", cls: "c-sit" });
  if (list.some((row) => hasValue(row.legal))) cols.push({ id: "legal", label: "Lot / legal", cls: "c-leg" });
  return cols;
}

function displayValue(row, col) {
  if (col.money) return money(row[col.id]);
  if (col.acres) return acres(row[col.id]);
  return row[col.id];
}

function shortSource(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const leaf = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
    const text = (parsed.hostname.replace(/^www\./, "") + (leaf ? " · " + leaf : "")).replace(/\+/g, " ");
    return text.length > 48 ? text.slice(0, 46) + "…" : text;
  } catch (_err) {
    return String(url);
  }
}

function chromePath() {
  return [
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].filter(Boolean).find((file) => fs.existsSync(file));
}

function printCss() {
  return `
    :root {
      --ink: #1c241c;
      --paper: #f4efe4;
      --paper-2: #e8e0d0;
      --rule: #c9bfa8;
      --deep: #14241c;
      --deep-2: #1c3328;
      --accent: #c4a15a;
      --live: #1f6b4a;
      --muted: #6e685e;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      color: var(--ink);
      background: white;
      font: 9.5pt/1.35 "Liberation Sans", "DejaVu Sans", "Noto Sans", sans-serif;
    }
    @page {
      size: letter landscape;
      margin: 0.42in 0.42in 0.48in;
    }
    @page :first { margin: 0; }
    .cover {
      page-break-after: always;
      break-after: page;
      height: 8.5in;
      overflow: hidden;
      padding: 0.36in 0.5in 0.28in;
      background:
        linear-gradient(180deg, rgba(196,161,90,0.12), transparent 6.4in),
        var(--deep);
      color: #f6f1e6;
    }
    .kicker {
      margin: 0 0 0.16in;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      font-size: 8.5pt;
      color: var(--accent);
    }
    .cover h1 {
      margin: 0 0 0.06in;
      font: 600 32pt/0.92 "Liberation Serif", "Noto Serif", Palatino, Georgia, serif;
      letter-spacing: -0.03em;
    }
    .cover h1 span { display: block; color: var(--accent); font-size: 15pt; letter-spacing: 0; margin-top: 0.06in; }
    .cover-lede {
      max-width: 8.4in;
      margin: 0.1in 0 0.16in;
      color: #d9d1c2;
      font-size: 10.5pt;
      line-height: 1.4;
    }
    .stats {
      display: flex;
      gap: 0.16in;
      margin: 0 0 0.16in;
    }
    .stat {
      flex: 1;
      border: 1px solid #3d5246;
      background: var(--deep-2);
      padding: 0.12in 0.14in 0.1in;
    }
    .stat b {
      display: block;
      font: 600 22pt/1 "Liberation Serif", "Noto Serif", Palatino, serif;
      color: #fff;
    }
    .stat span { color: #c8c0b0; font-size: 8pt; letter-spacing: 0.04em; text-transform: uppercase; }
    .cards { display: flex; gap: 0.1in; margin: 0 0 0.16in; }
    .card {
      flex: 1;
      background: #f4efe4;
      color: var(--ink);
      padding: 0.1in 0.12in 0.1in;
    }
    .card strong { display: block; font: 600 12.5pt/1.1 "Liberation Serif", "Noto Serif", Palatino, serif; }
    .card em { display: block; font-style: normal; font-size: 16pt; font-weight: 650; color: var(--live); margin: 0.03in 0; }
    .card small { color: var(--muted); font-size: 7.4pt; line-height: 1.35; }
    .swatch { display: inline-block; width: 0.12in; height: 0.12in; background: #f0d27a; border: 1px solid #c4a15a; vertical-align: -1px; margin-right: 0.04in; }
    .read {
      display: flex;
      gap: 0.14in;
      margin: 0 0 0.18in;
    }
    .read div {
      flex: 1;
      border-top: 1px solid #3d5246;
      padding-top: 0.1in;
      color: #d9d1c2;
      font-size: 8.5pt;
      line-height: 1.4;
    }
    .read strong { display: block; color: var(--accent); font-size: 8pt; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 0.04in; }
    .legal {
      border-top: 3px solid var(--accent);
      padding-top: 0.14in;
      color: #cfc6b6;
      font-size: 8.5pt;
      line-height: 1.45;
      max-width: 9.2in;
    }
    .legal strong { color: #f6f1e6; }
    .county { page-break-before: always; }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    thead { display: table-header-group; }
    tbody { display: table-row-group; }
    .banner th {
      background: var(--deep);
      color: #f6f1e6;
      text-align: left;
      padding: 0.09in 0.08in 0.08in;
      border: 0;
    }
    .banner .name {
      font: 600 16pt/1.1 "Liberation Serif", "Noto Serif", Palatino, serif;
    }
    .banner .meta { color: #d9d1c2; font-size: 8pt; font-weight: 400; padding-top: 0.04in; }
    .banner-inner { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.2in; }
    .banner .count {
      text-align: right;
      font: 600 18pt/1 "Liberation Serif", "Noto Serif", Palatino, serif;
      color: var(--accent);
      white-space: nowrap;
    }
    .banner .facts { color: #d9d1c2; font-size: 7.6pt; font-weight: 400; line-height: 1.4; max-width: 8.6in; }
    .banner .facts b { color: #f0e7d4; font-weight: 650; }
    .cols th {
      background: #24362c;
      color: #f0e7d4;
      font-size: 7pt;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-weight: 650;
      padding: 0.06in 0.05in;
      border-bottom: 2px solid var(--accent);
      text-align: left;
    }
    .cols .num, td.num { text-align: right; }
    td {
      padding: 0.045in 0.05in;
      border-bottom: 1px solid #ddd4c2;
      vertical-align: top;
      font-size: 7.6pt;
      overflow: hidden;
    }
    tbody tr:nth-child(even) td { background: #f7f2e8; }
    tbody tr:nth-child(odd) td { background: #fffdf8; }
    tbody tr.row-target td { background: #f3dd9a; }
    tbody tr.row-target:nth-child(even) td { background: #edd27a; }
    .id { font-family: "Liberation Mono", "DejaVu Sans Mono", ui-monospace, monospace; font-size: 8pt; font-weight: 650; white-space: nowrap; }
    .num { font-variant-numeric: tabular-nums; }
    .empty { color: #b3aa9a; }
    .c-id { width: 18%; }
    .c-amt { width: 11%; }
    .c-tax { width: 12%; }
    .c-ac { width: 7%; }
    .c-dist { width: 7%; }
    .c-cls { width: 8%; }
    .c-item { width: 7%; }
    .c-sit { width: 22%; }
    .c-leg { width: 16%; }
    .sources { margin: 0.05in 0 0; color: #c8c0b0; font-size: 7.5pt; }
  `;
}

function renderHtml(snapshot, rows) {
  const generated = formatDate(snapshot.generatedAt);
  const paired = (snapshot.counties || []).filter((c) => c.bothCount);
  const byCounty = groupByCounty(rows);
  for (const [name, list] of byCounty) byCounty.set(name, sortCountyRows(list));
  const adsById = loadAdsById();
  const highlightCount = rows.filter((row) => isTargetAcreage(row.acres)).length;
  const cards = paired.map((county) => {
    const list = byCounty.get(county.name) || [];
    const first = list[0] || {};
    const facts = saleFactsFor(county.id, adsById);
    const marked = list.filter((row) => isTargetAcreage(row.acres)).length;
    const sale = formatDates(facts.saleDates) || "Sale date not posted";
    return `<article class="card"><strong>${escapeHtml(county.name)}</strong><em>${list.length}</em><small>${escapeHtml(sale)}<br>${escapeHtml(facts.saleNote || "Official sale note not posted")}<br>${escapeHtml(String(county.recent && county.recent.year || "—"))} × ${escapeHtml(String(county.historic && county.historic.year || "—"))} · ${marked} of ${list.length} at 1–6 ac<br>${escapeHtml(shortSource(first.recentUrl))}</small></article>`;
  }).join("");
  const sections = [...byCounty.entries()].map(([name, list]) => {
    const first = list[0] || {};
    const facts = saleFactsFor(countyIdOf(first, name, paired), adsById);
    const marked = list.filter((row) => isTargetAcreage(row.acres)).length;
    const cols = visibleColumns(list);
    const head = cols.map((col) => `<th class="${col.cls}">${escapeHtml(col.label)}</th>`).join("");
    const body = list.map((row) => (
      `<tr class="${rowClass(row)}">` + cols.map((col) => {
        const value = displayValue(row, col);
        const extra = col.id === "tms" ? " id" : (col.cls.includes("num") ? " num" : "");
        return `<td class="${extra.trim()}">${cell(value)}</td>`;
      }).join("") + "</tr>"
    )).join("");
    const contactLine = joinFact([
      facts.office,
      facts.phone && ("Tel " + facts.phone),
      facts.email,
      facts.address,
    ]);
    const saleLine = joinFact([
      formatDates(facts.saleDates) && ("Sale " + formatDates(facts.saleDates)),
      facts.saleNote,
      facts.adOutlet && ("Ads in " + facts.adOutlet),
      facts.adDates.length && ("Ad dates " + formatDates(facts.adDates)),
      facts.listPromised && ("List promised " + formatDate(facts.listPromised)),
      facts.watchFrom && ("Watch from " + formatDate(facts.watchFrom)),
      facts.listStatus && ("Status " + facts.listStatus),
    ]);
    return `
      <section class="county">
        <table>
          <thead>
            <tr class="banner">
              <th colspan="${cols.length}">
                <div class="banner-inner">
                  <div>
                    <div class="name">${escapeHtml(name)} County</div>
                    <div class="meta">FIPS ${escapeHtml(first.fips || "")} · newest list ${escapeHtml(String(first.recentYear || "—"))} × historic list ${escapeHtml(String(first.historicYear || "—"))} · identifiers only · county office contact, never owners</div>
                    <div class="facts"><b>Contact.</b> ${escapeHtml(contactLine || "Official office contact not published on the treasurer page.")}</div>
                    <div class="facts"><b>Auction.</b> ${escapeHtml(saleLine || "Sale facts not posted.")}</div>
                    <div class="sources">${escapeHtml(shortSource(facts.treasurerUrl || first.recentUrl))} · ${escapeHtml(shortSource(first.recentUrl))} · ${escapeHtml(shortSource(first.historicUrl))}</div>
                  </div>
                  <div class="count">${list.length}<div class="meta">parcels</div><div class="meta">${marked} at 1–6 ac</div></div>
                </div>
              </th>
            </tr>
            <tr class="cols">${head}</tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </section>`;
  }).join("");
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>SC Tax Sale Atlas — 5-year delinquent file</title>
  <style>${printCss()}</style>
</head>
<body>
  <section class="cover">
    <p class="kicker">Southeast Aerial Systems</p>
    <h1>SC Tax Sale Atlas<span>Five-year delinquent file</span></h1>
    <p class="cover-lede">Parcels that appear on a county’s newest hosted tax-sale list and on a hosted list from about five years earlier. Identifiers, listing specs, and county-office contacts only — owner names are not stored. Gold rows are 1–6 acres.</p>
    <div class="stats">
      <div class="stat"><b>${rows.length.toLocaleString("en-US")}</b><span>Parcels in both years</span></div>
      <div class="stat"><b>${paired.length}</b><span>Counties with a pair</span></div>
      <div class="stat"><b>${escapeHtml(String(snapshot.season || ""))}</b><span>Season</span></div>
      <div class="stat"><b>${highlightCount.toLocaleString("en-US")}</b><span>Highlighted 1–6 acres</span></div>
    </div>
    <div class="cards">${cards}</div>
    <div class="read">
      <div><strong>What a row is</strong>A parcel ID that appears on both the newest hosted sale list and a hosted list from about five years earlier. Sorted by county, then acres smallest first; unknown acres last.</div>
      <div><strong>What the numbers are</strong>Amounts, acres, and tax years come from those official lists. A blank acres cell means that list did not print acreage. <span class="swatch"></span>Gold rows are 1–6 acres.</div>
      <div><strong>What is left off</strong>Owner names are not stored. Contact means the county treasurer or delinquent-tax office. This file is not for commercial solicitation. S.C. Code Ann. § 30-2-50.</div>
    </div>
    <p class="legal"><strong>${generated || "Draft"}.</strong> ${escapeHtml(snapshot.source || "Official leftover and current sale lists crossed with hosted 2020–2022 lists.")} Forty-one counties do not yet have a hosted newest-plus-historic pair and are omitted from the tables.</p>
  </section>
  ${sections}
</body>
</html>`;
  if (/\bowner_name\b|\bowner_location\b|"owner":/i.test(html) || /EXAMPLE OWNER/.test(html)) {
    throw new Error("repeat PDF refused to write owner fields");
  }
  return html;
}

function printPdf(htmlPath, dest) {
  const chrome = chromePath();
  if (!chrome) throw new Error("Chrome is required to print the 5-year PDF");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
  execFileSync(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--no-pdf-header-footer",
    "--print-to-pdf=" + dest,
    "file://" + htmlPath,
  ], {
    timeout: 180000,
    stdio: ["ignore", "ignore", "pipe"],
  });
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) {
    throw new Error("Chrome did not write a PDF");
  }
  return dest;
}

async function writeFromSnapshot(snapshot, options) {
  const opts = options || {};
  const dest = opts.dest || defaultDest();
  await exportRepeat.attachSpecs(snapshot, opts);
  const rows = exportRepeat.buildRows(snapshot);
  const html = renderHtml(snapshot, rows);
  const htmlPath = (opts.htmlPath || dest.replace(/\.pdf$/i, ".html"));
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.writeFileSync(htmlPath, html);
  printPdf(path.resolve(htmlPath), dest);
  const extra = opts.copyTo === false ? null : (opts.copyTo || downloadsDest());
  if (extra && extra !== dest) {
    try {
      fs.mkdirSync(path.dirname(extra), { recursive: true });
      fs.copyFileSync(dest, extra);
    } catch (_err) {
      // Downloads may be missing in CI
    }
  }
  return { dest, copy: extra && fs.existsSync(extra) ? extra : null, html: htmlPath, rowCount: rows.length };
}

module.exports = {
  defaultDest,
  downloadsDest,
  renderHtml,
  printPdf,
  writeFromSnapshot,
  chromePath,
  isTargetAcreage,
  rowClass,
  saleFactsFor,
  sortCountyRows,
};
