"use strict";

/**
 * Beaufort County parcel id: R + 17 digits, formatted R### ### ### #### ####
 * Copied from beaufort-tax-pdfs/pin_utils.js.
 * Matches the PIN shape used by the county parcel layers (field name pin_
 * on the hosted AddressParcels service). This module does not query that service.
 */

function normalizePin(raw) {
  const s = String(raw || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .trim();
  const m = s.match(/^R(\d{17})$/);
  if (!m) return null;
  const d = m[1];
  return (
    "R" +
    d.slice(0, 3) +
    " " +
    d.slice(3, 6) +
    " " +
    d.slice(6, 9) +
    " " +
    d.slice(9, 13) +
    " " +
    d.slice(13, 17)
  );
}

const PIN_TOKEN_RE = /R\d{3}\s*\d{3}\s*\d{3}\s*\d{4}\s*\d{4}/gi;

function extractPinsFromText(text) {
  const set = new Set();
  let m;
  const re = new RegExp(PIN_TOKEN_RE.source, "gi");
  while ((m = re.exec(text)) !== null) {
    const n = normalizePin(m[0]);
    if (n) set.add(n);
  }
  return [...set].sort();
}

module.exports = { normalizePin, extractPinsFromText, PIN_TOKEN_RE };
