"use strict";

const registry = require("./registry");
const families = require("./families");
const lexington = require("./adapters/lexington");
const beaufort = require("./adapters/beaufort");
const htmlTable = require("./adapters/families/html-table");
const countyPdf = require("./adapters/families/county-pdf");
const xlsx = require("./adapters/families/xlsx");
const { geocodeLexingtonTms, parseLexingtonTms } = require("./geocode/lexington-tms");
const ads = require("./ads");
const adsCalendar = require("./ads-calendar");
const repeat = require("./repeat");
const listingsCatalog = require("./listings-catalog");

function wrapFamily(id, parseFileText) {
  return {
    id,
    parseFileText,
    draftInquiry: beaufort.draftInquiry,
  };
}

const adapters = {
  lexington,
  beaufort,
  "html-table": wrapFamily("html-table", (text, county) => htmlTable.parseHtml(text, county)),
  "county-pdf": wrapFamily("county-pdf", (text, county) => countyPdf.parseText(text, county)),
  xlsx: {
    id: "xlsx",
    parseFile: (file, county) => xlsx.parseFile(file, county),
    parseFileText() {
      throw new Error("xlsx ingest needs a spreadsheet path: node engine/cli.js ingest <county> file.xlsx");
    },
    draftInquiry: beaufort.draftInquiry,
  },
  "page-watch": wrapFamily("page-watch", (text, county) => (
    families.FAMILIES["page-or-newspaper"].ingest(text, county)
  )),
};

function getAdapter(countyId) {
  const county = registry.getCounty(countyId);
  if (!county) {
    const err = new Error("Unknown county: " + countyId);
    err.code = "UNKNOWN_COUNTY";
    throw err;
  }
  if (!county.adapter || !adapters[county.adapter]) {
    const err = new Error("No adapter for " + county.name + " (" + county.status + ")");
    err.code = "NO_ADAPTER";
    throw err;
  }
  return { county, adapter: adapters[county.adapter] };
}

module.exports = {
  registry,
  families,
  adapters,
  getAdapter,
  geocodeLexingtonTms,
  parseLexingtonTms,
  ads,
  adsCalendar,
  repeat,
  listingsCatalog,
};
