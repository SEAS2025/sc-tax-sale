"use strict";

const registry = require("./registry");
const lexington = require("./adapters/lexington");
const beaufort = require("./adapters/beaufort");
const { geocodeLexingtonTms, parseLexingtonTms } = require("./geocode/lexington-tms");

const adapters = {
  lexington,
  beaufort,
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
  adapters,
  getAdapter,
  geocodeLexingtonTms,
  parseLexingtonTms,
};
