"use strict";

/**
 * Designed PDF for the out-of-state repeat-delinquent file.
 *
 * Same visual language as engine/export-repeat-pdf.js — cover, one chapter per
 * county, gold highlight on the rows that matter most, county-office links —
 * but written to its own file so it never overwrites the South Carolina report
 * and never edits a module the SC track owns.
 *
 * Honesty rules baked in here:
 *   - The file name and the cover state the *real* number of tax years between
 *     the two lists. A three-year gap is never printed as five.
 *   - An acres column and its 1–6 acre highlight appear only when the source
 *     list actually published acreage. The Haywood advertisement does not, so
 *     for Haywood the highlight falls on parcels advertised in every readable
 *     year instead, and no acreage is invented.
 *   - Identifiers, amounts, and official office links only. Owner names are
 *     never written, and the rendered HTML is checked for owner-shaped rows
 *     before it is printed.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { sanitizeRow } = require("./specs");
const scPdf = require("./export-repeat-pdf");

const ROOT = path.join(__dirname, "..");

/** File name follows what was actually found, never the label we wished for. */
function fileNameFor(snapshot) {
  const counties = (snapshot && snapshot.counties) || [];
  if (!counties.length) return "Out-of-state-repeat-delinquent.pdf";
  const states = [...new Set(counties.map((row) => row.stateCode))];
  const scope = counties.length === 1
    ? counties[0].name + "-" + counties[0].stateCode
    : (states.length === 1 ? states[0] : "Out-of-state");
  const span = snapshot.span;
  if (snapshot.isFiveYear) return scope + "-5-year-delinquent.pdf";
  return scope + "-" + span + "-year-repeat-delinquent.pdf";
}

function defaultDest(snapshot) {
  return path.join(ROOT, "inbox", "repeat", fileNameFor(snapshot));
}

function downloadsDest(snapshot) {
  return path.join(process.env.HOME || os.homedir(), "Downloads", fileNameFor(snapshot));
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

function spanWords(span) {
  const words = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
  return words[span] || String(span);
}

/* --------------------------------------------------------------- row build */

function buildRows(snapshot) {
  const rows = [];
  for (const county of snapshot.counties || []) {
    const readable = county.readableYears || [];
    for (const pair of county.both || []) {
      const advertised = pair.advertisedYears || [];
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
        amountRecent: pair.amountRecent,
        amountHistoric: pair.amountHistoric,
        advertisedYears: advertised.join(", "),
        advertisedCount: advertised.length,
        everyYear: readable.length > 0 && advertised.length === readable.length,
        acres: pair.acres == null ? null : pair.acres,
      }));
    }
  }
  return rows;
}

function hasAcreage(list) {
  return list.some((row) => hasValue(row.acres));
}

/** Highlight 1–6 acres when acreage exists; otherwise the most persistent rows. */
function isHighlightRow(row, withAcres) {
  if (withAcres) return scPdf.isTargetAcreage(row.acres);
  return Boolean(row.everyYear);
}

function sortRows(list, withAcres) {
  return list.slice().sort((a, b) => {
    if (withAcres) {
      const aa = hasValue(a.acres) && Number.isFinite(Number(a.acres)) ? Number(a.acres) : Number.POSITIVE_INFINITY;
      const bb = hasValue(b.acres) && Number.isFinite(Number(b.acres)) ? Number(b.acres) : Number.POSITIVE_INFINITY;
      if (aa !== bb) return aa - bb;
    } else if (a.advertisedCount !== b.advertisedCount) {
      return b.advertisedCount - a.advertisedCount;
    }
    return (b.amountRecent || 0) - (a.amountRecent || 0) || String(a.tms).localeCompare(String(b.tms));
  });
}

function visibleColumns(list, withAcres) {
  const first = list[0] || {};
  const cols = [{ id: "tms", label: "Parcel identifier", cls: "c-id" }];
  if (list.some((row) => hasValue(row.amountHistoric))) {
    cols.push({ id: "amountHistoric", label: "Advertised " + (first.historicYear || "older"), cls: "c-amt num", money: true });
  }
  if (list.some((row) => hasValue(row.amountRecent))) {
    cols.push({ id: "amountRecent", label: "Advertised " + (first.recentYear || "newer"), cls: "c-amt num", money: true });
  }
  if (withAcres) cols.push({ id: "acres", label: "Acres", cls: "c-ac num", acres: true });
  if (list.some((row) => hasValue(row.advertisedYears))) {
    cols.push({ id: "advertisedYears", label: "Tax years advertised", cls: "c-tax" });
  }
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
  return { urls: office.map((row) => row.url) };
}

function regimeLine(stateCode) {
  if (stateCode === "NC") {
    return "North Carolina does not sell tax lien certificates. G.S. 105-369 requires the collector to advertise tax liens on real property each year, under an order of the board of commissioners; collection ends in a foreclosure sale under G.S. 105-374 or 105-375. Sales are held at the courthouse with a ten-day upset-bid period.";
  }
  return "Arizona counties sell tax lien certificates at an annual auction, normally in February, under A.R.S. Title 42, Chapter 18, with the delinquent list published in a newspaper of general circulation. A certificate holder may begin judicial foreclosure after three years (A.R.S. 42-18152).";
}

/* ------------------------------------------------------------------- print */

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
    .c-id { width: 20%; } .c-amt { width: 16%; } .c-tax { width: 26%; } .c-ac { width: 10%; }
    .sources { margin: 0.05in 0 0; color: #c8c0b0; font-size: 7.5pt; }
  `;
}

function renderHtml(snapshot, rows, state) {
  const withAcres = hasAcreage(rows);
  const byCounty = new Map();
  for (const row of rows) {
    if (!byCounty.has(row.county)) byCounty.set(row.county, []);
    byCounty.get(row.county).push(row);
  }
  for (const [name, list] of byCounty) byCounty.set(name, sortRows(list, withAcres));
  const highlight = rows.filter((row) => isHighlightRow(row, withAcres)).length;
  const spanText = snapshot.span === 5
    ? "Five-year delinquent file"
    : spanWords(snapshot.span) + "-year repeat-delinquent file";

  const cards = (snapshot.counties || []).map((county) => {
    const list = byCounty.get(county.name) || [];
    const marked = list.filter((row) => isHighlightRow(row, withAcres)).length;
    const readable = (county.readableYears || []).join(", ");
    return `<article class="card"><strong>${escapeHtml(county.name)} ${escapeHtml(county.stateCode)}</strong><em>${list.length}</em><small>Tax year ${escapeHtml(String(county.historic.year))} × ${escapeHtml(String(county.recent.year))} — ${escapeHtml(String(county.span))} tax years apart<br>${marked} ${withAcres ? "at 1–6 ac" : "on every readable year"}<br>Readable years: ${escapeHtml(readable)}</small></article>`;
  }).join("");

  const sections = (snapshot.counties || []).map((county) => {
    const list = byCounty.get(county.name) || [];
    if (!list.length) return "";
    const marked = list.filter((row) => isHighlightRow(row, withAcres)).length;
    const cols = visibleColumns(list, withAcres);
    const head = cols.map((col) => `<th class="${col.cls}">${escapeHtml(col.label)}</th>`).join("");
    const body = list.map((row) => (
      `<tr class="${isHighlightRow(row, withAcres) ? "row-target" : ""}">` + cols.map((col) => {
        const extra = col.id === "tms" ? "id" : (col.cls.includes("num") ? "num" : "");
        return `<td class="${extra}">${cell(displayValue(row, col))}</td>`;
      }).join("") + "</tr>"
    )).join("");
    const facts = officeFacts(county.id, state);
    const allYears = county.allYears
      ? county.allYears.count + " of these are on all " + county.allYears.years.length + " readable years (" + county.allYears.years.join(", ") + ")"
      : null;
    return `
      <section class="county">
        <table>
          <thead>
            <tr class="banner">
              <th colspan="${cols.length}">
                <div class="banner-inner">
                  <div>
                    <div class="name">${escapeHtml(county.name)} County, ${escapeHtml(county.stateCode)}</div>
                    <div class="meta">FIPS ${escapeHtml(county.fips || "")} · tax year ${escapeHtml(String(county.historic.year))} list × tax year ${escapeHtml(String(county.recent.year))} list · ${escapeHtml(String(county.span))} tax years apart · parcel identifiers and amounts only, never owners</div>
                    <div class="facts"><b>Sale process.</b> ${escapeHtml(regimeLine(county.stateCode))}</div>
                    <div class="facts"><b>Official office.</b> ${escapeHtml(facts.urls.join(" · ") || "No official office page responded during this run.")}</div>
                    ${allYears ? `<div class="facts"><b>Persistence.</b> ${escapeHtml(allYears)}.</div>` : ""}
                    ${county.noAcreage ? `<div class="facts"><b>No acreage.</b> This advertisement does not publish an acreage column, so no acreage is shown and none is estimated.</div>` : ""}
                    <div class="sources">${escapeHtml(shortSource(county.historic.url))} · ${escapeHtml(shortSource(county.recent.url))}</div>
                  </div>
                  <div class="count">${list.length}<div class="meta">parcels</div><div class="meta">${marked} ${withAcres ? "at 1–6 ac" : "every year"}</div></div>
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
  <title>${escapeHtml(spanText)}</title>
  <style>${printCss()}</style>
</head>
<body>
  <section class="cover">
    <p class="kicker">Southeast Aerial Systems</p>
    <h1>Haywood County, North Carolina<span>${escapeHtml(spanText)} · Maggie Valley and the Haywood County tax district</span></h1>
    <p class="cover-lede">Parcels that appear on the county's advertised tax-lien list for tax year ${escapeHtml(String((snapshot.counties[0] || {}).historic ? snapshot.counties[0].historic.year : ""))} and again on the list for tax year ${escapeHtml(String((snapshot.counties[0] || {}).recent ? snapshot.counties[0].recent.year : ""))} — ${escapeHtml(String(snapshot.span))} tax years apart. This county sits outside the 46-county South Carolina registry and is not part of South Carolina pricing. Parcel identifiers, advertised amounts, and official office links only — owner names are not stored.</p>
    <div class="stats">
      <div class="stat"><b>${rows.length.toLocaleString("en-US")}</b><span>Parcels on both lists</span></div>
      <div class="stat"><b>${escapeHtml(String(snapshot.span))}</b><span>Tax years apart</span></div>
      <div class="stat"><b>${((snapshot.counties[0] || {}).readableYears || []).length}</b><span>Readable list years</span></div>
      <div class="stat"><b>${highlight.toLocaleString("en-US")}</b><span>${withAcres ? "Highlighted 1–6 acres" : "On every readable year"}</span></div>
    </div>
    <div class="cards">${cards}</div>
    <div class="read">
      <div><strong>What a row is</strong>A parcel identifier that the county advertised as a delinquent tax lien in both tax years named above. The identifier is the North Carolina grid PIN exactly as the county publishes it in the advertisement, with hyphens stripped.</div>
      <div><strong>How it is read</strong>The advertised list is read by column: the PARCEL column is located in the header and only that column is read. <span class="swatch"></span>${withAcres ? "Gold rows are 1–6 acres." : "Gold rows were advertised in every year that could be read — the most persistent delinquencies."}</div>
      <div><strong>What is left off</strong>The advertisement carries a LIABLE OWNER column. It is dropped and never written here. No obituary or death notice was used. ${escapeHtml(county0NoAcreageNote(snapshot))} Not for commercial solicitation.</div>
    </div>
    <p class="legal"><strong>${escapeHtml(formatDate(snapshot.generatedAt) || "Draft")}.</strong> ${escapeHtml(snapshot.source || "")} Every source URL, its HTTP status, the row counts per year, and every intersection with its true year span: docs/OUT_OF_STATE.md.</p>
  </section>
  ${sections}
</body>
</html>`;
  assertNoOwners(html);
  return html;
}

function county0NoAcreageNote(snapshot) {
  const county = (snapshot.counties || [])[0];
  return county && county.noAcreage
    ? "This advertisement publishes no acreage, so no acreage figure appears anywhere in this file."
    : "";
}

/**
 * Refuse to print anything owner-shaped: an all-caps surname-comma-forename run,
 * a company suffix next to a parcel, or the dropped column's own header.
 */
function assertNoOwners(html) {
  if (/\bowner_name\b|\bowner_location\b|"owner":/i.test(html)) {
    throw new Error("out-of-state PDF refused to write owner fields");
  }
  if (/[A-Z]{3,}\s*,\s*[A-Z]{3,}/.test(html.replace(/<[^>]+>/g, " "))) {
    throw new Error("out-of-state PDF refused to write an owner-shaped name");
  }
  if (/\b(LLC|INC|HEIRS|ETAL|\/EXR|\/TR|\/LE|\/LT)\b\s*\d{10}/.test(html)) {
    throw new Error("out-of-state PDF refused to write an owner next to a parcel");
  }
  return true;
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
  const dest = opts.dest || defaultDest(snapshot);
  const rows = buildRows(snapshot);
  if (!rows.length) return { rowCount: 0, dest: null, html: null, note: "no paired parcels" };
  const html = renderHtml(snapshot, rows, state);
  const htmlPath = dest.replace(/\.pdf$/i, ".html");
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.writeFileSync(htmlPath, html);
  const printed = await toPdf(path.resolve(htmlPath), dest);
  let copy = null;
  if (printed.dest) {
    const extra = opts.copyTo === false ? null : (opts.copyTo || downloadsDest(snapshot));
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
    fileName: path.basename(dest),
    note: printed.dest ? null : "no PDF engine on this host; designed HTML written instead",
  };
}

module.exports = {
  fileNameFor,
  defaultDest,
  downloadsDest,
  buildRows,
  hasAcreage,
  isHighlightRow,
  sortRows,
  visibleColumns,
  renderHtml,
  assertNoOwners,
  regimeLine,
  write,
};
