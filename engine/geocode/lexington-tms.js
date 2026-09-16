"use strict";

/**
 * Lexington County TMS section grid.
 * Copied from the original Base44 function geocodeLexingtonTMS.
 * Auth and the Base44 client were removed. Coordinates are section centers
 * plus a small deterministic offset — not a surveyed parcel point.
 *
 * Two TMS shapes appear in the original app:
 *   - geocodeLexingtonTMS comment: "06-1234-5678" (section is the first segment)
 *   - lookupOwner: "000600-06-119" (section is the middle segment)
 * The geocoder below uses the section from parseLexingtonTms, so both shapes
 * hit the grid. Unknown sections fall back to the original function's
 * hardcoded fallback [33.78, -81.18], not a parcel lookup.
 */

const TMS_SECTION_MAP = {
  "06": [33.923, -81.275],
  "07": [33.923, -81.180],
  "08": [33.923, -81.085],
  "13": [33.828, -81.275],
  "14": [33.828, -81.180],
  "15": [33.828, -81.085],
  "19": [33.733, -81.275],
  "20": [33.733, -81.180],
  "21": [33.733, -81.085],
  "25": [33.638, -81.275],
  "26": [33.638, -81.180],
  "27": [33.638, -81.085],
  "32": [33.543, -81.275],
  "33": [33.543, -81.180],
  "34": [33.543, -81.085],
};

const UNKNOWN_SECTION_FALLBACK = [33.78, -81.18];

function parseLexingtonTms(raw) {
  const cleaned = String(raw || "").replace(/\s+/g, "");
  if (!cleaned) return { ok: false, error: "TMS required" };
  const parts = cleaned.split("-");
  const nodash = cleaned.replace(/-/g, "");

  if (/^\d{6}-\d{2}-\d{3}$/.test(cleaned)) {
    return {
      ok: true,
      format: "mapblock-section-parcel",
      tms: cleaned,
      mapBlock: parts[0],
      section: parts[1],
      district: null,
      parcel: parts[2],
      nodash,
    };
  }

  if (/^\d{1,2}-\d+-\d+$/.test(cleaned)) {
    return {
      ok: true,
      format: "section-district-parcel",
      tms: cleaned,
      mapBlock: null,
      section: parts[0].padStart(2, "0"),
      district: parts[1],
      parcel: parts[2],
      nodash,
    };
  }

  if (parts.length >= 1 && parts[0]) {
    return {
      ok: true,
      format: "dashed-first-segment-section",
      tms: cleaned,
      mapBlock: null,
      section: parts[0].padStart(2, "0"),
      district: parts.length > 1 ? parts[1] : null,
      parcel: parts.length > 2 ? parts[2] : null,
      nodash,
    };
  }

  return { ok: false, error: "Invalid TMS format", tms: cleaned };
}

function geocodeLexingtonTms(tms) {
  const parsed = parseLexingtonTms(tms);
  if (!parsed.ok) return parsed;

  const known = Object.prototype.hasOwnProperty.call(TMS_SECTION_MAP, parsed.section);
  const baseCoords = known ? TMS_SECTION_MAP[parsed.section] : UNKNOWN_SECTION_FALLBACK;
  const district = parsed.district != null ? parseInt(parsed.district, 10) : 0;
  const parcel = parsed.parcel != null ? parseInt(parsed.parcel, 10) : 0;
  const districtN = Number.isFinite(district) ? district : 0;
  const parcelN = Number.isFinite(parcel) ? parcel : 0;
  const offsetLat = ((districtN % 10) - 5) * 0.003;
  const offsetLng = ((parcelN % 10) - 5) * 0.003;

  return {
    ok: true,
    tms: parsed.tms,
    section: parsed.section,
    format: parsed.format,
    knownSection: known,
    approximate: true,
    lat: baseCoords[0] + offsetLat,
    lng: baseCoords[1] + offsetLng,
  };
}

module.exports = {
  TMS_SECTION_MAP,
  UNKNOWN_SECTION_FALLBACK,
  parseLexingtonTms,
  geocodeLexingtonTms,
};
