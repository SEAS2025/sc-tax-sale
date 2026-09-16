"use strict";

const { parseAmount } = require("../../csv");

/**
 * County listing PDFs are parsed from extracted text (pdftotext), not by
 * storing the PDF. Charleston’s public sample is 10-digit PINs plus a
 * trailing total-due amount. Owner text is detected, not returned.
 */

const PIN_10 = /\b(\d{10})\b/;
const MONEY = /\$[\d,]+\.\d{2}/g;

function parseText(text, county) {
  const lines = String(text || "").split(/\r?\n/);
  const rows = [];
  for (const line of lines) {
    const pin = line.match(PIN_10);
    const money = line.match(MONEY);
    if (!pin || !money) continue;
    const amount = parseAmount(money[money.length - 1]);
    if (!amount) continue;
    const rest = line.replace(pin[0], "").replace(MONEY, "");
    rows.push({
      tms: pin[1],
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
    identifierFormat: rows.length ? "10-digit" : null,
    rows,
  };
}

module.exports = {
  id: "county-pdf",
  parseText,
};
