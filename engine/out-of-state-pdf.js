"use strict";

/**
 * Designed PDF for the out-of-state 5-year delinquent file.
 *
 * Same visual language as engine/export-repeat-pdf.js — cover, one chapter per
 * county, acres column, gold highlight at 1–6 acres, acres sorted smallest
 * first — but written to its own file so it never overwrites the South
 * Carolina report and never edits a module the SC track owns.
 *
 * Identifiers, listing specs, and official office URLs only. Owner names are
 * never written.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { mergeSpecs, sanitizeRow } = require("./specs");
const scPdf = require("./export-repeat-pdf");

const ROOT = path.join(__dirname, "..");
const FILENAME = "Out-of-state-5-year-delinquent.pdf";

function defaultDest() {
  return path.join(ROOT, "inbox", "repeat", FILENAME);
}

function downloadsDest() {
  return path.join(process.env.HOME || os.homedir(), "Downloads", FILENAME);
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

function acresText(value) {
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
  if (!y || !m || !d) return day;
  return months[Number(m) - 1] + " " + Number(d) + ", " + y;
}

function hasValue(value) {
  return value != null && value !== "";
}

function acresSortValue(value) {
  const n = Number(value);
  return value == null || value === "" || !Number.isFinite(n) ? Number.POSITIVE_INFINITY : n;
}

function buildRows(snapshot) {
  const rows = [];
  for (const county of snapshot.counties || []) {
    const specsRecent = county._specsRecent || new Map();
    const specsHistoric = county._specsHistoric || new Map();
    for (const pair of county.both || []) {
      const specs = mergeSpecs(specsRecent.get(pair.tms), specsHistoric.get(pair.tms));
      rows.push(sanitizeRow({
        county: county.name,
        countyId: county.id,
        stateCode: county.stateCode,
        fips: county.fips || "",
        tms: pair.tms,
        recentYear: county.recent && county.recent.year,
        historicYear: county.historic && county.historic.year,
        recentUrl: county.recent && county.recent.url,
        historicUrl: county.historic && county.historic.url,
        amountRecent: pair.amountRecent != null ? pair.amountRecent : specs.amount,
        amountHistoric: pair.amountHistoric,
        taxYears: specs.taxYears,
        acres: specs.acres,
        district: specs.district,
        class: specs.class,
        item: specs.item,
        situs: specs.situs,
        legal: specs.legal,
      }));
    }
  }
  return rows;
}

function visibleColumns(list) {
  const first = list[0] || {};
  const cols = [{ id: "tms", label: "Parcel identifier", cls: "c-id" }];
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
  if (list.some((row) => hasValue(row.situs))) cols.push({ id: "situs", label: "Situs", cls: "c-sit" });
  if (list.some((row) => hasValue(row.legal))) cols.push({ id: "legal", label: "Lot / legal", cls: "c-leg" });
  return cols;
}

function displayValue(row, col) {
  if (col.money) return money(row[col.id]);
  if (col.acres) return acresText(row[col.id]);
  return row[col.id];
}

function shortSource(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const leaf = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
    const text = (parsed.hostname.replace(/^www\./, "") + (leaf ? " · " + leaf : "")).replace(/\+/g, " ");
    return text.length > 56 ? text.slice(0, 54) + "…" : text;
  } catch (_err) {
    return String(url);
  }
}

function officeFacts(countyId, state) {
  const cs = (state && state.counties && state.counties[countyId]) || {};
  const office = (cs.verified || []).filter((row) => row.role === "office" || row.role === "auction");
  return {
    urls: office.map((row) => row.url),
    statutes: (cs.verified || []).filter((row) => row.role === "statute").map((row) => row.url),
  };
}

function regimeLine(stateCode) {
  if (stateCode === "NC") {
    return "North Carolina does not sell tax lien certificates. G.S. 105-369 requires the collector to advertise tax liens on real property each year (normally March–June); collection ends in a foreclosure sale under G.S. 105-374 or 105-375. Bid at the courthouse sale, with a 10-day upset-bid period.";
  }
  return "Arizona counties sell tax lien certificates at an annual auction, normally in February, under A.R.S. Title 42, Chapter 18, with the delinquent list published in a newspaper of general circulation. A certificate holder may begin judicial foreclosure after three years (A.R.S. 42-18152), so a parcel still delinquent five years later has normally carried liens across several sales.";
}

function printCss() {
  return `
    :root {
      --ink: #1c241c; --paper: #f4efe4; --rule: #c9bfa8;
      --deep: #14241c; --deep-2: #1c3328; --accent: #c4a15a;
      --live: #1f6b4a; --muted: #6e685e;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { color: var(--ink); background: white; font: 9.5pt/1.35 "Liberation Sans", "DejaVu Sans", "Noto Sans", sans-serif; }
    @page { size: letter landscape; margin: 0.42in 0.42in 0.48in; }
    @page :first { margin: 0; }
    .cover {
      page-break-after: always; break-after: page; height: 8.5in; overflow: hidden;
      padding: 0.36in 0.5in 0.28in;
      background: linear-gradient(180deg, rgba(196,161,90,0.12), transparent 6.4in), var(--deep);
      color: #f6f1e6;
    }
    .kicker { margin: 0 0 0.16in; letter-spacing: 0.2em; text-transform: uppercase; font-size: 8.5pt; color: var(--accent); }
    .cover h1 { margin: 0 0 0.06in; font: 600 32pt/0.92 "Liberation Serif", "Noto Serif", Palatino, Georgia, serif; letter-spacing: -0.03em; }
    .cover h1 span { display: block; color: var(--accent); font-size: 15pt; letter-spacing: 0; margin-top: 0.06in; }
    .cover-lede { max-width: 8.6in; margin: 0.1in 0 0.16in; color: #d9d1c2; font-size: 10.5pt; line-height: 1.4; }
    .stats { display: flex; gap: 0.16in; margin: 0 0 0.16in; }
    .stat { flex: 1; border: 1px solid #3d5246; background: var(--deep-2); padding: 0.12in 0.14in 0.1in; }
    .stat b { display: block; font: 600 22pt/1 "Liberation Serif", "Noto Serif", Palatino, serif; color: #fff; }
    .stat span { color: #c8c0b0; font-size: 8pt; letter-spacing: 0.04em; text-transform: uppercase; }
    .cards { display: flex; gap: 0.1in; margin: 0 0 0.16in; }
    .card { flex: 1; background: #f4efe4; color: var(--ink); padding: 0.1in 0.12in; }
    .card strong { display: block; font: 600 12.5pt/1.1 "Liberation Serif", "Noto Serif", Palatino, serif; }
    .card em { display: block; font-style: normal; font-size: 16pt; font-weight: 650; color: var(--live); margin: 0.03in 0; }
    .card small { color: var(--muted); font-size: 7.4pt; line-height: 1.35; }
    .swatch { display: inline-block; width: 0.12in; height: 0.12in; background: #f0d27a; border: 1px solid #c4a15a; vertical-align: -1px; margin-right: 0.04in; }
    .read { display: flex; gap: 0.14in; margin: 0 0 0.18in; }
    .read div { flex: 1; border-top: 1px solid #3d5246; padding-top: 0.1in; color: #d9d1c2; font-size: 8.5pt; line-height: 1.4; }
    .read strong { display: block; color: var(--accent); font-size: 8pt; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 0.04in; }
    .legal { border-top: 3px solid var(--accent); padding-top: 0.14in; color: #cfc6b6; font-size: 8.5pt; line-height: 1.45; max-width: 9.4in; }
    .legal strong { color: #f6f1e6; }
    .county { page-break-before: always; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    tbody { display: table-row-group; }
    .banner th { background: var(--deep); color: #f6f1e6; text-align: left; padding: 0.09in 0.08in 0.08in; border: 0; }
    .banner .name { font: 600 16pt/1.1 "Liberation Serif", "Noto Serif", Palatino, serif; }
    .banner .meta { color: #d9d1c2; font-size: 8pt; font-weight: 400; padding-top: 0.04in; }
    .banner-inner { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.2in; }
    .banner .count { text-align: right; font: 600 18pt/1 "Liberation Serif", "Noto Serif", Palatino, serif; color: var(--accent); white-space: nowrap; }
    .banner .facts { color: #d9d1c2; font-size: 7.6pt; font-weight: 400; line-height: 1.4; max-width: 8.6in; }
    .banner .facts b { color: #f0e7d4; font-weight: 650; }
    .cols th { background: #24362c; color: #f0e7d4; font-size: 7pt; letter-spacing: 0.04em; text-transform: uppercase; font-weight: 650; padding: 0.06in 0.05in; border-bottom: 2px solid var(--accent); text-align: left; }
    .cols .num, td.num { text-align: right; }
    td { padding: 0.045in 0.05in; border-bottom: 1px solid #ddd4c2; vertical-align: top; font-size: 7.6pt; overflow: hidden; }
    tbody tr:nth-child(even) td { background: #f7f2e8; }
    tbody tr:nth-child(odd) td { background: #fffdf8; }
    tbody tr.row-target td { background: #f3dd9a; }
    tbody tr.row-target:nth-child(even) td { background: #edd27a; }
    .id { font-family: "Liberation Mono", "DejaVu Sans Mono", ui-monospace, monospace; font-size: 8pt; font-weight: 650; white-space: nowrap; }
    .num { font-variant-numeric: tabular-nums; }
    .empty { color: #b3aa9a; }
    .c-id { width: 16%; } .c-amt { width: 11%; } .c-tax { width: 12%; } .c-ac { width: 7%; }
    .c-dist { width: 7%; } .c-cls { width: 8%; } .c-sit { width: 22%; } .c-leg { width: 17%; }
    .sources { margin: 0.05in 0 0; color: #c8c0b0; font-size: 7.5pt; }
  `;
}

function renderHtml(snapshot, rows, state) {
  const byCounty = new Map();
  for (const row of rows) {
    if (!byCounty.has(row.county)) byCounty.set(row.county, []);
    byCounty.get(row.county).push(row);
  }
  for (const [name, list] of byCounty) byCounty.set(name, scPdf.sortCountyRows(list));
  const highlight = rows.filter((row) => scPdf.isTargetAcreage(row.acres)).length;

  const cards = (snapshot.counties || []).map((county) => {
    const list = byCounty.get(county.name) || [];
    const marked = list.filter((row) => scPdf.isTargetAcreage(row.acres)).length;
    return `<article class="card"><strong>${escapeHtml(county.name)} ${escapeHtml(county.stateCode)}</strong><em>${list.length}</em><small>${escapeHtml(String(county.recent && county.recent.year || "—"))} × ${escapeHtml(String(county.historic && county.historic.year || "—"))} · ${marked} of ${list.length} at 1–6 ac<br>${escapeHtml(shortSource(county.recent && county.recent.url))}</small></article>`;
  }).join("");

  const sections = (snapshot.counties || []).map((county) => {
    const list = byCounty.get(county.name) || [];
    if (!list.length) return "";
    const marked = list.filter((row) => scPdf.isTargetAcreage(row.acres)).length;
    const cols = visibleColumns(list);
    const head = cols.map((col) => `<th class="${col.cls}">${escapeHtml(col.label)}</th>`).join("");
    const body = list.map((row) => (
      `<tr class="${scPdf.rowClass(row)}">` + cols.map((col) => {
        const extra = col.id === "tms" ? "id" : (col.cls.includes("num") ? "num" : "");
        return `<td class="${extra}">${cell(displayValue(row, col))}</td>`;
      }).join("") + "</tr>"
    )).join("");
    const facts = officeFacts(county.id, state);
    return `
      <section class="county">
        <table>
          <thead>
            <tr class="banner">
              <th colspan="${cols.length}">
                <div class="banner-inner">
                  <div>
                    <div class="name">${escapeHtml(county.name)} County, ${escapeHtml(county.stateCode)}</div>
                    <div class="meta">FIPS ${escapeHtml(county.fips || "")} · newest list ${escapeHtml(String(county.recent && county.recent.year || "—"))} × historic list ${escapeHtml(String(county.historic && county.historic.year || "—"))} · identifiers only · county office links, never owners</div>
                    <div class="facts"><b>Sale process.</b> ${escapeHtml(regimeLine(county.stateCode))}</div>
                    <div class="facts"><b>Official office.</b> ${escapeHtml(facts.urls.join(" · ") || "No official office page responded during this run.")}</div>
                    <div class="sources">${escapeHtml(shortSource(county.recent && county.recent.url))} · ${escapeHtml(shortSource(county.historic && county.historic.url))}</div>
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
  <title>Out-of-state five-year delinquent file</title>
  <style>${printCss()}</style>
</head>
<body>
  <section class="cover">
    <p class="kicker">Southeast Aerial Systems</p>
    <h1>Out-of-state delinquent file<span>Maggie Valley, North Carolina · Grand Canyon, Arizona</span></h1>
    <p class="cover-lede">Parcels that appear on a county's newest published delinquent or tax-lien list and on a published list from about five years earlier. These counties sit outside the 46-county South Carolina registry and are not part of South Carolina pricing. Identifiers, listing specs, and official office links only — owner names are not stored. Gold rows are 1–6 acres.</p>
    <div class="stats">
      <div class="stat"><b>${rows.length.toLocaleString("en-US")}</b><span>Parcels in both years</span></div>
      <div class="stat"><b>${(snapshot.counties || []).length}</b><span>Counties with a pair</span></div>
      <div class="stat"><b>${escapeHtml(String(snapshot.season || ""))}</b><span>Season</span></div>
      <div class="stat"><b>${highlight.toLocaleString("en-US")}</b><span>Highlighted 1–6 acres</span></div>
    </div>
    <div class="cards">${cards}</div>
    <div class="read">
      <div><strong>What a row is</strong>A parcel identifier that appears on both the newest published list and a published list from about five years earlier. Sorted by county, then acres smallest first; unknown acres last.</div>
      <div><strong>Two different regimes</strong>North Carolina advertises tax liens under G.S. 105-369 and then forecloses — there are no lien certificates. Arizona sells lien certificates each February under A.R.S. Title 42, Ch. 18. <span class="swatch"></span>Gold rows are 1–6 acres.</div>
      <div><strong>What is left off</strong>Owner names are not stored, and no obituary or death notice was used. Federal (NPS, USFS) and tribal land near the Grand Canyon is not on any county tax roll and is not in this file. Not for commercial solicitation.</div>
    </div>
    <p class="legal"><strong>${escapeHtml(formatDate(snapshot.generatedAt) || "Draft")}.</strong> ${escapeHtml(snapshot.source || "")} Full source list, HTTP status of every URL, and what was unavailable: docs/OUT_OF_STATE.md.</p>
  </section>
  ${sections}
</body>
</html>`;
  if (/\bowner_name\b|\bowner_location\b|"owner":/i.test(html)) {
    throw new Error("out-of-state PDF refused to write owner fields");
  }
  return html;
}

async function printWithPlaywrightChromium(htmlPath, dest) {
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("file://" + htmlPath, { waitUntil: "load" });
    await page.pdf({ path: dest, format: "Letter", landscape: true, printBackground: true });
  } finally {
    await browser.close().catch(() => {});
  }
  return dest;
}

async function toPdf(htmlPath, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    scPdf.printPdf(htmlPath, dest);
    return { dest, engine: "chrome" };
  } catch (err) {
    process.stdout.write("chrome print unavailable: " + String(err.message || err).slice(0, 120) + "\n");
  }
  try {
    await printWithPlaywrightChromium(htmlPath, dest);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return { dest, engine: "playwright-chromium" };
  } catch (err) {
    process.stdout.write("playwright chromium print unavailable: " + String(err.message || err).slice(0, 160) + "\n");
  }
  try {
    execFileSync("weasyprint", [htmlPath, dest], { timeout: 180000, stdio: ["ignore", "ignore", "pipe"] });
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return { dest, engine: "weasyprint" };
  } catch (_err) {
    // fall through
  }
  return { dest: null, engine: null };
}

async function write(snapshot, state, options) {
  const opts = options || {};
  const dest = opts.dest || defaultDest();
  const rows = buildRows(snapshot);
  if (!rows.length) return { rowCount: 0, dest: null, html: null, note: "no paired parcels" };
  const html = renderHtml(snapshot, rows, state);
  const htmlPath = dest.replace(/\.pdf$/i, ".html");
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.writeFileSync(htmlPath, html);
  const printed = await toPdf(path.resolve(htmlPath), dest);
  let copy = null;
  if (printed.dest) {
    const extra = opts.copyTo === false ? null : (opts.copyTo || downloadsDest());
    if (extra && extra !== printed.dest) {
      try {
        fs.mkdirSync(path.dirname(extra), { recursive: true });
        fs.copyFileSync(printed.dest, extra);
        copy = extra;
      } catch (_err) {
        // Downloads may not exist on a headless host
      }
    }
  }
  return {
    rowCount: rows.length,
    dest: printed.dest,
    copy,
    html: htmlPath,
    engine: printed.engine,
    note: printed.dest ? null : "no PDF engine on this host; designed HTML written instead",
  };
}

module.exports = {
  FILENAME,
  defaultDest,
  downloadsDest,
  buildRows,
  visibleColumns,
  renderHtml,
  regimeLine,
  write,
};
