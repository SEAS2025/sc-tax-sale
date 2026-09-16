#!/usr/bin/env node
"use strict";

const fs = require("fs");
const { registry, getAdapter, geocodeLexingtonTms } = require("./index");

function usage() {
  console.log(`sc-tax-sale

  node engine/cli.js counties
  node engine/cli.js describe <county-id>
  node engine/cli.js geocode <tms>
  node engine/cli.js parse-csv <county-id> <file>
  node engine/cli.js parse-beaufort-text <2022|realad> <file>
  node engine/cli.js inquiry <county-id> <csv-file> [count]

parse-csv prints counts only. It does not print owner names.
`);
}

const [cmd, a, b, c] = process.argv.slice(2);

if (!cmd || cmd === "help" || cmd === "--help") {
  usage();
  process.exit(0);
}

if (cmd === "counties") {
  const counts = registry.countByStatus();
  const rows = registry.listCounties().map((county) => ({
    id: county.id,
    name: county.name,
    fips: county.fips,
    status: county.status,
    adapter: county.adapter,
  }));
  console.log(JSON.stringify({ count: rows.length, counts, counties: rows }, null, 2));
  process.exit(0);
}

if (cmd === "describe") {
  const county = registry.getCounty(a);
  if (!county) {
    console.error("Unknown county");
    process.exit(1);
  }
  const publicView = Object.assign({}, county);
  console.log(JSON.stringify(publicView, null, 2));
  process.exit(0);
}

if (cmd === "geocode") {
  const result = geocodeLexingtonTms(a);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (cmd === "parse-csv") {
  const { county, adapter } = getAdapter(a);
  if (typeof adapter.parseFileText !== "function") {
    console.error("Adapter has no CSV parser");
    process.exit(1);
  }
  const text = fs.readFileSync(b, "utf8");
  const summary = adapter.parseFileText(text, county);
  console.log(JSON.stringify({
    county: county.id,
    rowCount: summary.rowCount,
    missingColumns: summary.missingColumns,
    recognizedTms: summary.recognizedTms,
    amount2025Total: summary.amount2025Total,
    amount2022Total: summary.amount2022Total,
  }, null, 2));
  process.exit(0);
}

if (cmd === "parse-beaufort-text") {
  const { adapter } = getAdapter("beaufort");
  const text = fs.readFileSync(b, "utf8");
  const parsed = a === "realad"
    ? adapter.parseBeaufortRealadText(text)
    : adapter.parseBeaufort2022Text(text);
  console.log(JSON.stringify({
    rowCount: parsed.rowCount,
    uniquePins: parsed.uniquePins,
    parseErrorCount: parsed.parseErrorCount || 0,
  }, null, 2));
  process.exit(0);
}

if (cmd === "inquiry") {
  const { county, adapter } = getAdapter(a);
  const draft = adapter.draftInquiry || require("./adapters/beaufort/inquiry").draftInquiry;
  const text = fs.readFileSync(b, "utf8");
  const result = draft(text, {
    count: c || 10,
    countyName: county.name + " County",
    identifierLabel: county.identifier === "tms" ? "TMS" : "PIN",
  });
  process.stdout.write(result.text + "\n");
  process.exit(0);
}

console.error("Unknown command: " + cmd);
usage();
process.exit(1);
