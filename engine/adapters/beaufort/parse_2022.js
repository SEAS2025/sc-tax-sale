"use strict";

/**
 * Beaufort 2022 tax-sale list parser.
 * Logic copied from beaufort-tax-pdfs/parse_beaufort_2022_structured.js.
 * The CSV/JSON column remains "tms" for tooling compatibility; the value is a PIN.
 * This file does not read PDFs or write owner files. Pass extracted text in.
 */

const { normalizePin } = require("./pin_utils");

function parseBeaufort2022Text(raw) {
  const t = String(raw || "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ");
  const re = /(R\d{3}\s+\d{3}\s+\d{3}\s+\d{4}\s+\d{4})\s+(\$[\d,]+\.\d{2})/g;
  const rows = [];
  let cursor = 0;
  let m;
  while ((m = re.exec(t)) !== null) {
    const pinRaw = m[1];
    const amt = m[2];
    const pin = normalizePin(pinRaw.replace(/\s+/g, ""));
    if (!pin) continue;
    const fullStart = m.index;
    const ownerBlock = t.slice(cursor, fullStart).replace(/\s+/g, " ").trim();
    let itemNumber = null;
    const im = ownerBlock.match(/^(\d{5})\s*/);
    if (im) itemNumber = im[1];
    const propertyOwnerLocation = im
      ? ownerBlock.slice(im[0].length).trim()
      : ownerBlock;
    const ym = ownerBlock.match(/(20\d{2}(?:\/20\d{2})+)/);
    const taxYears = ym ? ym[1] : "";
    rows.push({
      itemNumber,
      propertyOwnerLocation,
      tms: pin,
      taxYears,
      amountDue: amt,
    });
    cursor = m.index + m[0].length;
  }
  return {
    source: "beaufort-2022-text",
    identifier: "pin",
    columnName: "tms",
    rowCount: rows.length,
    uniquePins: new Set(rows.map((r) => r.tms)).size,
    rows,
  };
}

module.exports = { parseBeaufort2022Text };
