"use strict";

const { parseAmount } = require("../../csv");

/**
 * County listing PDFs are parsed from extracted text (pdftotext), not by
 * storing the PDF. Charleston’s public sample is 10-digit PINs plus a
 * trailing total-due amount. Owner text is detected, not returned.
 */

const PIN_10 = /\b(\d{10})\b/;
const DASHED_MAP = /\b(\d{2}-\d{4}-\d{3}-\d{2}-\d{2})\b/;
const DOTTED_MAP = /\b(\d{3}-\d{2}-\d{2}-\d{3}\.\d{3})\b/;
const MONEY = /\$[\d,]+\.\d{2}/g;

function parseText(text, county) {
  const lines = String(text || "").split(/\r?\n/);
  const rows = [];
  for (const line of lines) {
    const pin = line.match(PIN_10);
    const dashed = line.match(DASHED_MAP);
    const dotted = line.match(DOTTED_MAP);
    const id = dotted ? dotted[1] : dashed ? dashed[1] : pin ? pin[1] : null;
    const money = line.match(MONEY);
    if (!id || !money) continue;
    const amount = parseAmount(money[money.length - 1]);
    if (!amount) continue;
    const rest = line.replace(id, "").replace(MONEY, "");
    rows.push({
      tms: id,
      amount,
      hasOwner: /[A-Za-z]{3,}/.test(rest),
    });
  }
  return {
    family: "county-pdf",
    countyId: county && county.id ? county.id : null,
    rowCount: rows.length,
    amountTotal: rows.reduce((sum, row) => sum + row.amount, 0),
    recognizedIds: rows.filter((row) => row.tms).length,
    missingColumns: rows.length ? [] : ["10-digit PIN", "total due"],
    identifierFormat: rows.some((row) => /\.\d{3}$/.test(row.tms))
      ? "dotted-map"
      : rows.some((row) => row.tms.includes("-"))
        ? "dashed-tax-map"
        : rows.length ? "10-digit" : null,
    rows,
  };
}

module.exports = {
  id: "county-pdf",
  parseText,
};
