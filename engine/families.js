"use strict";

const fs = require("fs");
const htmlTable = require("./adapters/families/html-table");
const countyPdf = require("./adapters/families/county-pdf");
const xlsx = require("./adapters/families/xlsx");
const pageWatch = require("./adapters/families/page-watch");
const lexington = require("./adapters/lexington");
const beaufort = require("./adapters/beaufort");

const FAMILIES = {
  "html-table": {
    id: "html-table",
    label: "County website HTML table",
    ingest(text, county) {
      return htmlTable.parseHtml(text, county);
    },
  },
  "county-pdf": {
    id: "county-pdf",
    label: "Treasurer-hosted listing PDF, from extracted text",
    ingest(text, county) {
      return countyPdf.parseText(text, county);
    },
  },
  xlsx: {
    id: "xlsx",
    label: "Spreadsheet download",
    fromPath: true,
    ingest(file, county) {
      return xlsx.parseFile(file, county);
    },
  },
  "page-or-newspaper": {
    id: "page-or-newspaper",
    adapter: "page-watch",
    label: "Seasonal page, newspaper ad, or bidder portal",
    watch(html, pageUrl) {
      return pageWatch.inspectHtml(html, pageUrl);
    },
  },
  "realad-pdf": {
    id: "realad-pdf",
    label: "Newspaper REALAD plus prior sale list",
    ingest(text, county) {
      if (county && county.adapter === "lexington") return lexington.parseFileText(text, county);
      if (county && county.adapter === "beaufort") return beaufort.parseBeaufortRealadText(text);
      return beaufort.parseBeaufortRealadText(text);
    },
  },
};

function listFamilyDefs() {
  return Object.values(FAMILIES).map((family) => ({
    id: family.id,
    label: family.label,
    adapter: family.adapter || family.id,
    ingest: typeof family.ingest === "function",
    watch: typeof family.watch === "function",
  }));
}

function publicSummary(summary) {
  return {
    family: summary.family || null,
    countyId: summary.countyId || null,
    rowCount: summary.rowCount || 0,
    amountTotal: summary.amountTotal != null ? summary.amountTotal : null,
    recognizedIds: summary.recognizedIds != null ? summary.recognizedIds : null,
    missingColumns: summary.missingColumns || [],
    identifierFormat: summary.identifierFormat || null,
  };
}

function ingestFile(county, filePath, familyId) {
  const id = familyId || (county && county.sourceFamily);
  const family = FAMILIES[id];
  if (!family || typeof family.ingest !== "function") {
    const err = new Error("No ingest adapter for family " + id);
    err.code = "NO_FAMILY";
    throw err;
  }
  const summary = family.fromPath
    ? family.ingest(filePath, county)
    : family.ingest(fs.readFileSync(filePath, "utf8"), county);
  summary.countyId = summary.countyId || (county && county.id) || null;
  summary.family = summary.family || id;
  return summary;
}

function watchHtml(html, pageUrl) {
  return pageWatch.inspectHtml(html, pageUrl);
}

module.exports = {
  FAMILIES,
  listFamilyDefs,
  publicSummary,
  ingestFile,
  watchHtml,
};
