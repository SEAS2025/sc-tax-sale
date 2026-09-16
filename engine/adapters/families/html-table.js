"use strict";

const { parseAmount } = require("../../csv");

const ID_HEADERS = /^(map\s*#|map\s*number|map\s*no\.?|parcel|pin|tms|tax\s*map|account|item\s*#|item)$/i;
const AMOUNT_HEADERS = /(amount|total\s*due|due)/i;
const NAME_HEADERS = /(name|owner)/i;

function decode(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function parseTables(html) {
  const tables = [];
  const re = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let match;
  while ((match = re.exec(String(html || "")))) {
    const rows = [];
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let row;
    while ((row = rowRe.exec(match[1]))) {
      const cells = [];
      const cellRe = /<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi;
      let cell;
      while ((cell = cellRe.exec(row[1]))) cells.push(decode(cell[1]));
      if (cells.length) rows.push(cells);
    }
    if (rows.length) tables.push(rows);
  }
  return tables;
}

function headerIndex(headers) {
  const idCandidates = headers
    .map((h, i) => ({ h, i }))
    .filter((cell) => ID_HEADERS.test(cell.h));
  const preferred = idCandidates.find((cell) => !/^item/i.test(cell.h));
  const idAt = preferred ? preferred.i : (idCandidates[0] ? idCandidates[0].i : -1);
  const amountAt = headers.findIndex((h) => AMOUNT_HEADERS.test(h));
  const nameAt = headers.findIndex((h) => NAME_HEADERS.test(h));
  return { idAt, amountAt, nameAt };
}

function pickTable(tables) {
  let best = null;
  for (const rows of tables) {
    const headers = rows[0] || [];
    const idx = headerIndex(headers);
    if (idx.idAt < 0 || idx.amountAt < 0) continue;
    const score = rows.length + (idx.nameAt >= 0 ? 2 : 0);
    if (!best || score > best.score) best = { rows, headers, idx, score };
  }
  return best;
}

function summarize(parsed, county) {
  return {
    family: "html-table",
    countyId: county && county.id ? county.id : null,
    rowCount: parsed.rows.length,
    amountTotal: parsed.rows.reduce((sum, row) => sum + row.amount, 0),
    recognizedIds: parsed.rows.filter((row) => row.tms).length,
    missingColumns: parsed.missingColumns,
    identifierFormat: parsed.identifierFormat,
    columns: parsed.columns,
    rows: parsed.rows,
  };
}

function parseHtml(html, county) {
  const picked = pickTable(parseTables(html));
  if (!picked) {
    return summarize({
      rows: [],
      missingColumns: ["map/pin/tms", "amount"],
      identifierFormat: null,
      columns: [],
    }, county);
  }
  const { headers, idx, rows } = picked;
  const body = rows.slice(1).filter((cells) => cells.some((c) => c));
  const parsedRows = body.map((cells) => {
    const tms = (cells[idx.idAt] || "").replace(/\s+/g, "");
    const amountText = cells[idx.amountAt] || "";
    return {
      tms,
      amount: parseAmount(amountText),
      hasOwner: idx.nameAt >= 0 && Boolean(cells[idx.nameAt]),
    };
  }).filter((row) => row.tms);
  const sample = parsedRows[0] && parsedRows[0].tms;
  return summarize({
    rows: parsedRows,
    missingColumns: [],
    identifierFormat: sample && /^\d{13}$/.test(sample) ? "13-digit" : null,
    columns: headers,
  }, county);
}

module.exports = {
  id: "html-table",
  parseHtml,
  parseTables,
};
