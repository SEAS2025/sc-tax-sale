#!/usr/bin/env node
"use strict";

const fs = require("fs");
const { registry, getAdapter, geocodeLexingtonTms, families } = require("./index");

function usage() {
  console.log(`sc-tax-sale

  node engine/cli.js counties
  node engine/cli.js describe <county-id>
  node engine/cli.js geocode <tms>
  node engine/cli.js parse-csv <county-id> <file>
  node engine/cli.js parse-beaufort-text <2022|realad> <file>
  node engine/cli.js inquiry <county-id> <csv-file> [count]
  node engine/cli.js families
  node engine/cli.js ingest <county-id> <file> [--family <id>]
  node engine/cli.js watch <county-id> [--file <html>]

ingest and parse-csv print counts only. They do not print owner names.
watch records listing links on a public page. It does not download sale files.
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

if (cmd === "families") {
  const defs = families.listFamilyDefs();
  const counties = registry.listCounties();
  const grouped = defs.map((family) => ({
    ...family,
    counties: counties.filter((c) => c.sourceFamily === family.id).map((c) => c.id),
  }));
  console.log(JSON.stringify({ families: grouped }, null, 2));
  process.exit(0);
}

if (cmd === "ingest") {
  const county = registry.getCounty(a);
  if (!county) {
    console.error("Unknown county");
    process.exit(1);
  }
  const familyFlag = process.argv.indexOf("--family");
  const familyId = familyFlag >= 0 ? process.argv[familyFlag + 1] : county.sourceFamily;
  const fileFlag = process.argv.indexOf("--file");
  const file = fileFlag >= 0 ? process.argv[fileFlag + 1] : b;
  if (!file) {
    console.error("Missing file");
    process.exit(1);
  }
  try {
    const summary = families.ingestFile(county, file, familyId);
    console.log(JSON.stringify(families.publicSummary(summary), null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (cmd === "watch") {
  const county = registry.getCounty(a);
  if (!county) {
    console.error("Unknown county");
    process.exit(1);
  }
  const fileFlag = process.argv.indexOf("--file");
  const run = fileFlag >= 0
    ? Promise.resolve({
      status: 200,
      url: process.argv[fileFlag + 1],
      text: fs.readFileSync(process.argv[fileFlag + 1], "utf8"),
      contentType: "text/html",
    })
    : fetchPage(county.treasurerUrl);
  run.then((page) => {
    if (!page) {
      console.error("No treasurerUrl to watch");
      process.exit(1);
    }
    const watched = families.watchHtml(page.text, page.url || county.treasurerUrl);
    console.log(JSON.stringify({
      countyId: county.id,
      sourceFamily: county.sourceFamily,
      url: page.url || county.treasurerUrl,
      httpStatus: page.status,
      blocked: watched.blocked,
      blockReason: watched.blockReason,
      listingLinkCount: watched.listingLinks.length,
      listingLinks: watched.listingLinks.map((link) => ({
        text: link.text,
        href: link.href,
      })),
      mentionsNewspaper: watched.mentionsNewspaper,
      mentionsTaxSale: watched.mentionsTaxSale,
      suggestedCollapse: watched.suggestedCollapse,
    }, null, 2));
    process.exit(0);
  }).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
  return;
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

async function fetchPage(url) {
  if (!url) return null;
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "sc-tax-sale-research/1.0 (public page watch)" },
  });
  const contentType = response.headers.get("content-type") || "";
  if (/pdf|spreadsheet|excel|zip/i.test(contentType)) {
    return {
      status: response.status,
      url: response.url,
      text: "",
      contentType,
    };
  }
  return {
    status: response.status,
    url: response.url,
    text: await response.text(),
    contentType,
  };
}

console.error("Unknown command: " + cmd);
usage();
process.exit(1);
