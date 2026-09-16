"use strict";

const { parseCsv, parseAmount, parseOwnerLocation } = require("../csv");
const { parseLexingtonTms, geocodeLexingtonTms } = require("../geocode/lexington-tms");

const REQUIRED_COLUMNS = [
  "tms",
  "owner_location_2025_REALAD",
  "owner_location_2022_list",
  "amount_2025_REALAD",
  "amount_2022_list",
];

function linksFor(tms, county) {
  const parsed = parseLexingtonTms(tms);
  const pin = encodeURIComponent((parsed.tms || tms || "").replace(/\s+/g, ""));
  const nodash = parsed.nodash || String(tms || "").replace(/[-\s]/g, "");
  const gis = county && county.gisQueryTemplate
    ? county.gisQueryTemplate.replace("{TMS}", pin)
    : null;
  const card = county && county.propertyCardTemplate
    ? county.propertyCardTemplate.replace("{TMS_NODASH}", nodash)
    : null;
  return { gis, propertyCard: card };
}

function normalizeRow(row, county) {
  const parsed = parseLexingtonTms(row.tms);
  const owner2025 = parseOwnerLocation(row.owner_location_2025_REALAD || "");
  const owner2022 = parseOwnerLocation(row.owner_location_2022_list || "");
  return {
    tms: row.tms || "",
    tmsParsed: parsed,
    geocode: parsed.ok ? geocodeLexingtonTms(row.tms) : null,
    links: linksFor(row.tms, county),
    amt2025: parseAmount(row.amount_2025_REALAD),
    amt2022: parseAmount(row.amount_2022_list),
    hasOwner2025: Boolean(owner2025.owner),
    hasOwner2022: Boolean(owner2022.owner),
  };
}

function summarize(rows, county) {
  const normalized = rows.map((r) => normalizeRow(r, county));
  const missing = REQUIRED_COLUMNS.filter((col) => rows.length && rows[0][col] == null);
  return {
    countyId: "lexington",
    identifier: "tms",
    rowCount: normalized.length,
    missingColumns: missing,
    amount2025Total: normalized.reduce((s, r) => s + r.amt2025, 0),
    amount2022Total: normalized.reduce((s, r) => s + r.amt2022, 0),
    recognizedTms: normalized.filter((r) => r.tmsParsed && r.tmsParsed.ok).length,
    rows: normalized,
  };
}

function parseFileText(text, county) {
  const rows = parseCsv(text);
  return summarize(rows, county);
}

module.exports = {
  id: "lexington",
  REQUIRED_COLUMNS,
  parseFileText,
  normalizeRow,
  linksFor,
};
