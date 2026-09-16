"use strict";

/**
 * Pull parcel identifiers and trailing dollar amounts from listing text.
 * Owner strings are ignored.
 */

const { normalizePin } = require("./adapters/beaufort/pin_utils");
const { parseAmount } = require("./csv");

const PATTERNS = [
  { name: "beaufort-pin", re: /\bR\s*\d{3}\s+\d{3}\s+\d{3}\s+\d{4}\s+\d{4}\b/gi },
  { name: "lex-tms", re: /\b\d{2}-\d{4}-\d{4}\b/g },
  { name: "dashed-10", re: /\b\d{2}-\d{4}-\d{3}-\d{2}-\d{2}\b/g },
  { name: "dotted-map", re: /\b\d{3}-\d{2}-\d{2}-\d{3}\.\d{3}\b/g },
  { name: "sc-map", re: /\b\d{3,4}-\d{2}-\d{2}-\d{2,3}(?:\.\d{1,3})?\b/g },
  { name: "spartanburg-map", re: /\b\d-\d{2}-\d{2}-\d{3}(?:\.\d{2})?\b/g },
  { name: "mapblock", re: /\b\d{6}-\d{2}-\d{3}\b/g },
  { name: "wb-item", re: /\b\d{6}-\d{2}-\d\b/g },
  { name: "florence-map", re: /\b\d{3,5}-\d{2}-\d{3}\b/g },
  { name: "wb-map", re: /\b\d{2}-\d{3}-\d{3}(?:\.[A-Z0-9]+)?\b/g },
  { name: "pin-10", re: /\b\d{10}\b/g },
  { name: "pin-11", re: /\b\d{11}\b/g },
  { name: "map-13", re: /\b[A-Z]?\d{12,13}\b/g },
];

function normalizeId(raw, kind) {
  const s = String(raw || "").toUpperCase().replace(/\s+/g, kind === "beaufort-pin" ? "" : " ").trim();
  if (kind === "beaufort-pin") return normalizePin(s) || normalizePin(s.replace(/\s/g, ""));
  if (kind === "map-13") return s.replace(/\s/g, "");
  if (kind === "pin-10") return s.replace(/\s/g, "");
  return s.replace(/\s+/g, "");
}

function isDateLikePin(id, kind) {
  if (kind === "pin-10" && /^(19|20)\d{8}$/.test(id)) return true;
  if (kind === "pin-11" && /^(19|20)\d{9}$/.test(id)) return true;
  return false;
}

function extractHits(text) {
  const blob = String(text || "");
  const hits = [];
  for (const pattern of PATTERNS) {
    const re = new RegExp(pattern.re.source, pattern.re.flags);
    let match;
    while ((match = re.exec(blob))) {
      const id = normalizeId(match[0], pattern.name);
      if (!id || isDateLikePin(id, pattern.name)) continue;
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

function extractIds(text) {
  const blob = String(text || "");
  const found = new Map();
  const kinds = new Map();
  for (const hit of extractHits(blob)) {
    const window = blob.slice(hit.index, hit.index + 180);
    const money = window.match(/\$[\d,]+\.\d{2}/g);
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

function intersect(recent, historic) {
  const both = [];
  const historicSet = new Set(historic.ids || []);
  for (const id of recent.ids || []) {
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
  extractIds,
  extractHits,
  intersect,
  normalizeId,
};
