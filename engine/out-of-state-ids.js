"use strict";

/**
 * Identifier patterns for the out-of-state tracks (North Carolina, Arizona).
 *
 * Kept in its own module so the South Carolina pattern table in
 * engine/extract-ids.js is untouched. The Arizona assessor parcel number
 * shape (NNN-NN-NNN) overlaps the South Carolina "florence-map" pattern, so
 * running it here avoids re-ordering a table the SC track depends on.
 *
 * Owner strings are never captured. Identifiers and trailing dollar amounts only.
 */

const { parseAmount } = require("./csv");

const PATTERNS = [
  // Coconino / Mohave / Yavapai assessor parcel numbers, e.g. 101-01-001, 301-25-123A.
  { name: "az-apn", state: "AZ", re: /\b\d{3}-\d{2}-\d{3}[A-Z]?\b/g },
  // Same APN printed with a split-parcel decimal, e.g. 301-25-123.001
  { name: "az-apn-split", state: "AZ", re: /\b\d{3}-\d{2}-\d{3}\.\d{1,3}\b/g },
  // North Carolina statewide grid PIN, e.g. 8626-27-9056
  { name: "nc-pin", state: "NC", re: /\b\d{4}-\d{2}-\d{4}\b/g },
  // Same PIN with a condo or split suffix, e.g. 8626-27-9056.001
  { name: "nc-pin-suffix", state: "NC", re: /\b\d{4}-\d{2}-\d{4}\.\d{1,3}\b/g },
];

const KINDS_BY_STATE = {
  AZ: ["az-apn-split", "az-apn"],
  NC: ["nc-pin-suffix", "nc-pin"],
};

function patternsFor(state) {
  const wanted = KINDS_BY_STATE[String(state || "").toUpperCase()];
  if (!wanted) return PATTERNS.slice();
  // Longest shape first so a split-parcel suffix is not truncated to the base APN.
  return wanted.map((name) => PATTERNS.find((p) => p.name === name)).filter(Boolean);
}

function normalizeId(raw) {
  return String(raw || "").toUpperCase().replace(/\s+/g, "").trim();
}

function looksLikeYearRange(id) {
  // 2019-20-2024 style tokens are dates in prose, not parcels.
  const head = id.slice(0, 4);
  return /^(19|20)\d{2}$/.test(head) && Number(head) >= 1900 && Number(head) <= 2100 && /^\d{4}-\d{2}-\d{4}$/.test(id) === false;
}

function isDateLike(id, kind) {
  if (kind !== "nc-pin" && kind !== "nc-pin-suffix") return false;
  // 2024-01-0100 would be an ISO-ish date fragment, not an NC grid PIN.
  const m = id.match(/^(\d{4})-(\d{2})-(\d{4})/);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  return year >= 1900 && year <= 2099 && month >= 1 && month <= 12;
}

function extractHits(text, state) {
  const blob = String(text || "");
  const hits = [];
  for (const pattern of patternsFor(state)) {
    const re = new RegExp(pattern.re.source, pattern.re.flags);
    let match;
    while ((match = re.exec(blob))) {
      const id = normalizeId(match[0]);
      if (!id || isDateLike(id, pattern.name) || looksLikeYearRange(id)) continue;
      hits.push({
        id,
        kind: pattern.name,
        index: match.index,
        end: match.index + match[0].length,
        raw: match[0],
      });
    }
  }
  hits.sort((a, b) => a.index - b.index || b.raw.length - a.raw.length);
  const collapsed = [];
  for (const hit of hits) {
    const last = collapsed[collapsed.length - 1];
    if (last && hit.index < last.end) {
      if (hit.raw.length > last.raw.length) collapsed[collapsed.length - 1] = hit;
      continue;
    }
    collapsed.push(hit);
  }
  return collapsed;
}

function extractIds(text, state) {
  const blob = String(text || "");
  const found = new Map();
  const kinds = new Map();
  for (const hit of extractHits(blob, state)) {
    const window = blob.slice(hit.index, hit.index + 180);
    const money = window.match(/\$[\d,]+\.\d{2}/g) || window.match(/\b\d{1,3}(?:,\d{3})*\.\d{2}\b/g);
    const amount = money ? parseAmount(money[0]) : null;
    if (!found.has(hit.id)) {
      found.set(hit.id, amount);
      kinds.set(hit.id, hit.kind);
    } else if (amount && !found.get(hit.id)) {
      found.set(hit.id, amount);
    }
  }
  return {
    ids: [...found.keys()],
    amounts: Object.fromEntries(found),
    kinds: Object.fromEntries(kinds),
    count: found.size,
  };
}

/**
 * Report the identifier shapes that actually appear in a fetched list, so the
 * findings document can state the observed format instead of a guessed one.
 */
function shapeCensus(text, limit) {
  const blob = String(text || "");
  const counts = new Map();
  const samples = new Map();
  const re = /\b[0-9][0-9A-Z]*(?:[-.][0-9A-Z]+){1,4}\b/g;
  let match;
  while ((match = re.exec(blob))) {
    const token = match[0].toUpperCase();
    if (token.length > 24) continue;
    const shape = token.replace(/[0-9A-Z]/g, (ch) => (ch >= "0" && ch <= "9" ? "N" : "A"));
    counts.set(shape, (counts.get(shape) || 0) + 1);
    if (!samples.has(shape)) samples.set(shape, token);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit || 8)
    .map(([shape, count]) => ({ shape, count, sample: samples.get(shape) }));
}

function intersect(recent, historic) {
  const both = [];
  const historicSet = new Set((historic && historic.ids) || []);
  for (const id of (recent && recent.ids) || []) {
    if (!historicSet.has(id)) continue;
    both.push({
      tms: id,
      amountRecent: recent.amounts[id] == null ? null : recent.amounts[id],
      amountHistoric: historic.amounts[id] == null ? null : historic.amounts[id],
    });
  }
  both.sort((a, b) => (b.amountRecent || 0) - (a.amountRecent || 0));
  return both;
}

module.exports = {
  PATTERNS,
  patternsFor,
  extractHits,
  extractIds,
  shapeCensus,
  intersect,
  normalizeId,
};
