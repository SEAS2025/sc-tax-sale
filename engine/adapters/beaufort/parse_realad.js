"use strict";

/**
 * Beaufort REALAD parser.
 * Logic copied from beaufort-tax-pdfs/parse_beaufort_realad_structured.js.
 * If a newspaper layout differs from the Lexington-style table, adjust after
 * the TAX YEARS anchor — same note as the original parser.
 */

const { normalizePin } = require("./pin_utils");

const PIN_RE = /R\d{3}\s+\d{3}\s+\d{3}\s+\d{4}\s+\d{4}/g;

function parseBeaufortRealadText(text) {
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  const hi = normalized.indexOf("TAX YEARS");
  let rest = hi >= 0 ? normalized.slice(hi) : normalized;
  const ms = rest.search(/\n\d{5}/);
  const body = ms >= 0 ? rest.slice(ms + 1) : rest.trim();

  const hits = [...body.matchAll(PIN_RE)]
    .map((m) => ({
      tms: normalizePin(m[0].replace(/\s+/g, "")),
      index: m.index,
    }))
    .filter((h) => h.tms);

  const rows = [];
  let cursor = 0;

  for (let i = 0; i < hits.length; i++) {
    const { tms, index: tmsStart } = hits[i];
    const nextTms = i + 1 < hits.length ? hits[i + 1].index : body.length;
    const seg = body.slice(tmsStart, nextTms);

    const mm = seg.match(/\$([\d,]+\.\d{2})\s*(\d{4})(?:\s+(\d{4}))?/);
    if (!mm) {
      rows.push({
        tms,
        parseError: "no_dollar_amount_after_pin",
        ownerLocationRaw: body.slice(cursor, tmsStart).replace(/\s+/g, " ").trim(),
      });
      continue;
    }

    const fullM = mm[0];
    const rel = seg.indexOf(fullM);
    const moneyEnd = tmsStart + rel + fullM.length;
    const pinAtStart = seg.match(/^(R\d{3}\s+\d{3}\s+\d{3}\s+\d{4}\s+\d{4})/);
    const pinLen = pinAtStart ? pinAtStart[1].length : 0;
    const afterPin = seg.slice(pinLen, rel);
    const district = afterPin.replace(/\s+/g, " ").trim();
    const ownerBlock = body.slice(cursor, tmsStart).replace(/\s+/g, " ").trim();
    let itemNumber = null;
    const im = ownerBlock.match(/^(\d{5})\s*/);
    if (im) itemNumber = im[1];
    const ownerLocation = im ? ownerBlock.slice(im[0].length).trim() : ownerBlock;

    rows.push({
      itemNumber,
      propertyOwnerLocation: ownerLocation,
      tms,
      district: district || null,
      amountDue: "$" + mm[1],
      taxYears: [mm[2], mm[3]].filter(Boolean),
    });
    cursor = moneyEnd;
  }

  const errors = rows.filter((r) => r.parseError);
  const ok = rows.filter((r) => !r.parseError);
  return {
    source: "beaufort-realad-text",
    identifier: "pin",
    columnName: "tms",
    bodyStartUsed: "after TAX YEARS + first newline + 5-digit item (Beaufort REALAD)",
    rowCount: ok.length,
    parseErrorCount: errors.length,
    uniquePins: new Set(ok.map((r) => r.tms)).size,
    rows,
  };
}

module.exports = { parseBeaufortRealadText };
