"use strict";

/**
 * Parcel specs from official listing text. Identifiers, amounts, acres,
 * tax years, district, class, and address-like situs only. Owner names
 * are never returned.
 */

const { parseAmount } = require("./csv");
const { extractHits } = require("./extract-ids");

const STREET = "ST|STREET|RD|ROAD|AVE|AVENUE|DR|DRIVE|LN|LANE|BLVD|CT|CIR|CIRCLE|HWY|HIGHWAY|WAY|PL|PLACE|PKWY|TRL|TRAIL|LOOP|RUN|XING|EXT|BLUFF|PT|POINT|ALY|ALLEY|TER|TERRACE";
const SITUS_RE = new RegExp(
  "\\b(\\d{1,6}[A-Z]?)\\s+((?:[NSEW]\\.\\s+)?(?:[A-Z']{2,20}\\s+){0,4}(?:" + STREET + ")\\.?)\\b",
  "ig"
);
const STREET_AFTER_ACRES = new RegExp("\\b(?:" + STREET + ")\\b", "i");
const TAX_YEARS_RE = /TAX\s*YEARS?[:\s]*((?:(?:19|20)\d{2})(?:\s*[,\/&-]\s*(?:(?:19|20)\d{2})){0,10})/i;
const YEAR_RUN_RE = /\b((?:19|20)\d{2})(?:\s*[,\/-]\s*((?:19|20)\d{2})){1,8}\b/;
const DIST_RE = /\b(?:DIST(?:RICT)?|TD|TAX\s*DIST)[:\s#]*([A-Z0-9-]{1,8})\b/i;
const CLASS_RE = /\b(?:CLASS|CLS|USE)[:\s]*([A-Z0-9]{1,8})\b/i;
const CLASS_WORD_RE = /\b(RES(?:IDENTIAL)?|VAC(?:ANT)?|MH|MOBILE|COM(?:MERCIAL)?|IND(?:USTRIAL)?|AGR(?:ICULTURAL)?|R[1-4]|C[1-4])\b/i;
const ITEM_RE = /\b(?:ITEM|NO\.?|#)\s*(\d{2,6})\b/i;
const LEGAL_RE = /\b(?:LOT|BLK|BLOCK|TR|TRACT|PH|PHASE|SEC|SECTION|UNIT)\s+[A-Z0-9.-]{1,12}/gi;
const MONEY_RE = /\$[\d,]+\.\d{2}/g;
const BARE_MONEY_RE = /\b\d{1,3}(?:,\d{3})+\.\d{2}\b/g;

function emptySpecs() {
  return {
    acres: null,
    taxYears: "",
    district: "",
    class: "",
    item: "",
    situs: "",
    legal: "",
    amount: null,
  };
}

function uniqYears(list) {
  return [...new Set((list || []).filter(Boolean))].sort().join(", ");
}

const STREET_WORDS = new Set(STREET.split("|"));

function findSitus(text) {
  const re = new RegExp(SITUS_RE.source, SITUS_RE.flags);
  let match;
  let best = "";
  let bestScore = 99;
  while ((match = re.exec(text))) {
    const street = match[2];
    if (/TAX|YEAR|DIST|CLASS|ACRE|ITEM|OWNER|DELINQ|JR|SR|\bI{2,3}\b|\bIV\b|ESTATE|LLC|TRUST|HEIRS/i.test(street)) continue;
    if (/\b(?:19|20)\d{2}\b/.test(street)) continue;
    const tokens = street.replace(/\./g, "").trim().split(/\s+/);
    const nameWords = tokens.filter((tok) => tok && !STREET_WORDS.has(tok.toUpperCase()) && !/^[NSEW]$/i.test(tok));
    if (nameWords.length === 0 || nameWords.length > 2) continue;
    if (nameWords.length < bestScore) {
      best = (match[1] + " " + street).replace(/\s+/g, " ").trim();
      bestScore = nameWords.length;
    }
  }
  return best;
}

function parseAcresToken(raw) {
  if (raw == null || raw === "" || raw === ".") return null;
  const n = Number(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 99999) return null;
  return n;
}

function parseLabeledAcres(text) {
  const compact = String(text || "");
  const patterns = [
    /AC(?:ER)?AGE[:\s]+(\d*\.?\d+)/i,
    /(\d*\.?\d+)\s*(?:±|\+\/-|-\+)\s*(?:AC(?:RE|RES)?\.?|H\/A)\b/i,
    /(?:±|\+\/-)\s*(\d*\.?\d+)\s*(?:AC(?:RE|RES)?\.?|H\/A)\b/i,
    /(\d*\.?\d+)\s*(?:AC(?:RE|RES)?\.?|H\/A)\b/i,
  ];
  for (const re of patterns) {
    const match = compact.match(re);
    if (!match || match[1] === "" || match[1] === ".") continue;
    const after = compact.slice(match.index + match[0].length, match.index + match[0].length + 14);
    if (STREET_AFTER_ACRES.test(after)) continue;
    const acres = parseAcresToken(match[1]);
    if (acres != null) return acres;
  }
  return null;
}

function parseColumnAcres(text) {
  const compact = String(text || "");
  const calhoun = compact.match(/\b\d{3}-\d{2}-\d{2}-\d{2,3}(?:\.\d{1,3})?\s+(\d+(?:\.\d+)?)\s+\d+\s+\$/);
  if (calhoun) {
    const acres = parseAcresToken(calhoun[1]);
    if (acres != null) return acres;
  }
  const charleston = compact.match(/\$\s*[\d,]+\.\d{2}\s+(\d+(?:\.\d+)?)\s+\$\s*[\d,]+\.\d{2}/);
  if (charleston) {
    const acres = parseAcresToken(charleston[1]);
    if (acres != null) return acres;
  }
  return null;
}

function parseAcres(text) {
  const labeled = parseLabeledAcres(text);
  if (labeled != null) return labeled;
  return parseColumnAcres(text);
}

function indexLayoutAcres(text) {
  const byId = new Map();
  const lines = String(text || "").split(/\r?\n/);
  let acresCol = -1;
  for (const line of lines) {
    const header = line.match(/\b(ACRES|ACREAGE|ACERAGE)\b/i);
    if (header && /MAP|TMS|PIN|LOTS|TAXPAYER|DISTRICT|CLASS/i.test(line)) {
      acresCol = header.index;
      continue;
    }
    if (acresCol < 0) continue;
    const hits = extractHits(line);
    if (!hits.length) continue;
    const chunk = line.slice(Math.max(0, acresCol - 1), acresCol + 8).trim();
    const token = (chunk.match(/^\d+(?:\.\d+)?/) || [])[0];
    const acres = parseAcresToken(token);
    if (acres == null) continue;
    for (const hit of hits) {
      if (!byId.has(hit.id)) byId.set(hit.id, acres);
    }
  }
  return byId;
}

function specsFromContext(text) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (!compact) return emptySpecs();
  const acresM = parseAcres(compact);
  let years = [];
  const yearBlock = compact.match(TAX_YEARS_RE);
  if (yearBlock) {
    years = yearBlock[1].match(/(?:19|20)\d{2}/g) || [];
  } else {
    const run = compact.match(YEAR_RUN_RE);
    if (run) years = compact.slice(run.index, run.index + 48).match(/(?:19|20)\d{2}/g) || [];
  }
  const distM = compact.match(DIST_RE);
  const dist = distM && !/^(TMS|TAX|YEAR|PIN|MAP|ITEM|SALE|LIST)$/i.test(distM[1]) ? distM : null;
  const cls = compact.match(CLASS_RE) || compact.match(CLASS_WORD_RE);
  const itemM = compact.match(ITEM_RE) || compact.match(/^\s*(\d{3,6})\b/);
  const item = itemM && !/^(?:19|20)\d{2}$/.test(itemM[1]) ? itemM[1] : "";
  const withoutMoney = compact.replace(MONEY_RE, " ").replace(BARE_MONEY_RE, " ");
  const situs = findSitus(withoutMoney);
  const legal = [...compact.matchAll(LEGAL_RE)].map((m) => m[0].replace(/\s+/g, " ").trim()).slice(0, 6);
  const money = compact.match(MONEY_RE) || compact.match(BARE_MONEY_RE);
  return {
    acres: acresM,
    taxYears: uniqYears(years),
    district: dist ? dist[1] : "",
    class: cls ? String(cls[1]).toUpperCase() : "",
    item,
    situs: situs,
    legal: legal.join("; "),
    amount: money ? parseAmount(money[0]) : null,
  };
}

function recordForHit(text, hits, i) {
  const hit = hits[i];
  const prevEnd = i > 0 ? hits[i - 1].end : Math.max(0, hit.index - 140);
  const nextStart = i + 1 < hits.length ? hits[i + 1].index : Math.min(text.length, hit.end + 480);
  return text.slice(prevEnd, nextStart);
}

function indexSpecs(text) {
  const blob = String(text || "");
  const hits = extractHits(blob);
  const byId = new Map();
  for (let i = 0; i < hits.length; i += 1) {
    const specs = specsFromContext(recordForHit(blob, hits, i));
    if (!byId.has(hits[i].id)) byId.set(hits[i].id, specs);
    else byId.set(hits[i].id, mergeSpecs(byId.get(hits[i].id), specs));
  }
  for (const [id, acres] of indexLayoutAcres(blob)) {
    const cur = byId.get(id) || emptySpecs();
    if (cur.acres == null) byId.set(id, Object.assign({}, cur, { acres }));
  }
  return byId;
}

function mergeSpecs(a, b) {
  const left = a || emptySpecs();
  const right = b || emptySpecs();
  const years = uniqYears([
    ...(String(left.taxYears || "").split(/,\s*/)),
    ...(String(right.taxYears || "").split(/,\s*/)),
  ]);
  return {
    acres: left.acres != null ? left.acres : right.acres,
    taxYears: years,
    district: left.district || right.district,
    class: left.class || right.class,
    item: left.item || right.item,
    situs: left.situs || right.situs,
    legal: left.legal || right.legal,
    amount: left.amount != null ? left.amount : right.amount,
  };
}

function sanitizeRow(row) {
  const out = { ...row };
  for (const key of Object.keys(out)) {
    if (/owner/i.test(key)) delete out[key];
  }
  return out;
}

module.exports = {
  emptySpecs,
  parseAcres,
  specsFromContext,
  indexSpecs,
  mergeSpecs,
  sanitizeRow,
};
