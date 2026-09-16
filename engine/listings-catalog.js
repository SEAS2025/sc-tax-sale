"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Known official listing files (URL + sale year). The scanner merges these
 * with hrefs found on treasurer pages and with Florence's public S3 prefix.
 * No owner rows live here.
 */

const S3 = "https://s3.us-east-1.amazonaws.com/files.florenceco.org/";

const SEEDS = {
  bamberg: [
    { url: "https://www.bambergcounty.sc.gov/sites/default/files/uploads/2025-tax-sale-list.pdf", year: 2025 },
    { url: "https://www.bambergcounty.sc.gov/sites/default/files/uploads/2024-tax-sale-list.pdf", year: 2024 },
  ],
  calhoun: [
    { url: "https://calhouncounty.sc.gov/sites/calhouncounty/files/Documents/2025%20week%203%20newspaper%20ad.pdf", year: 2025 },
    { url: "https://calhouncounty.sc.gov/sites/calhouncounty/files/Documents/Calhoun%20County/Departments/Tax%20Collector/SaleAds/2024/2024%20TAX%20SALE%20FINAL%20LIST.pdf", year: 2024 },
    { url: "https://calhouncounty.sc.gov/sites/calhouncounty/files/Documents/Calhoun%20County/Departments/Tax%20Collector/SaleAds/2022/CCTC-2022_Sale_WK1_REAL.pdf", year: 2022 },
  ],
  charleston: [
    { url: "https://www.charlestoncounty.org/departments/delinquent-tax/files/RP-Tax-Sale-Listing.pdf", year: 2025 },
    { url: "https://www.charlestoncounty.org/departments/delinquent-tax/files/MH-Tax-Sale-Listing.pdf", year: 2025 },
    { url: "https://web.archive.org/web/20211101000000id_/https://www.charlestoncounty.org/departments/delinquent-tax/files/RP-Tax-Sale-Listing.pdf", year: 2021 },
  ],
  cherokee: [
    { url: "https://cherokeecountysc.gov/wp-content/uploads/2021/12/Bidder-List-Update-12-3-21-PDF.pdf", year: 2021 },
    { url: "https://cherokeecountysc.gov/wp-content/uploads/2026/08/TAX-SALE-TAB.pdf", year: 2026 },
  ],
  colleton: [
    { url: "https://www.colletoncounty.org/sites/default/files/uploads/taxsale-1-30-26.pdf", year: 2026 },
    { url: "https://www.colletoncounty.org/sites/default/files/uploads/del_tax/taxsalelist-01-29.pdf", year: 2026 },
  ],
  dillon: [
    { url: "https://www.dilloncountysc.org/Documents/Departments/Treasurer/PAPER.XLS", year: 2026 },
  ],
  florence: [
    { url: S3 + "public/DelinquentTax/2026/2026 Tax Sale List Real 9-01-26.pdf", year: 2026 },
    { url: S3 + "public/DelinquentTax/2021/03/2021 Delinquent Tax Sale List - Real Property - Updated List thru 9-24-21.pdf", year: 2021 },
    { url: S3 + "public/DelinquentTax/2022/lists/07/2022 List real for website updated 9-29-22.pdf", year: 2022 },
  ],
  georgetown: [
    { url: "https://www.gtcountysc.gov/DocumentCenter/View/3625", year: 2025 },
  ],
  greenville: [
    { url: "https://www.greenvillecounty.org/appsAS400/Taxsale/", year: 2026 },
  ],
  horry: [
    { url: "https://www.horrycountysc.gov/media/b5af14ce/delinquent-list-on-website-081926.xlsx", year: 2026 },
  ],
  lexington: [
    { url: "https://lex-co.sc.gov/sites/lexco/files/Documents/Lexington%20County/Departments/Treasurer/Tax%20Sale/REALAD%20%233%20WEB%202024%2010-31-2024.pdf", year: 2024 },
    { url: "https://lex-co.sc.gov/sites/lexco/files/Documents/Lexington%20County/Departments/Treasurer/Tax%20Sale/REAL%20ESTATE%20ADVERTISEMENT%20%232%202021.pdf", year: 2021 },
  ],
  oconee: [
    { url: "https://oconeesc.com/delinquent-tax/sale-list", year: 2026 },
  ],
  pickens: [
    { url: "https://www.co.pickens.sc.us/departments/delinquent_tax/document_center/Departments/Delinquent%20Tax/2020DelinquentTaxSaleListing.pdf?t=202101111621320", year: 2020 },
  ],
  williamsburg: [
    { url: "https://williamsburgcounty.sc.gov/DocumentCenter/View/2202/DELINQUENT-TAX-SALE", year: 2025 },
    { url: "https://www.williamsburgcounty.sc.gov/DocumentCenter/View/855/2020-REAL-DEL-TAX-UNPAID-RECORDS-rev", year: 2020 },
  ],
};

const NOT_LIST = /bidder|instruction|faq|registration|schedule of events|fact sheet|overage|claim form|calendar|notice to bidders|buyer'?s information|procedures|rules and regulations|process 20|sealed-bid|sealed bid/i;
const LIST_FILE = /tax[\s._-]*sale|delinquent|realad|listing|paper\.xls|08\.19\.26|sale-list|taxsale|real[\s._-]*property|mobile[\s._-]*home/i;
const FLORENCE_LIST = /tax sale list|delinquent tax sale list|list real|real website|2025-real|2026 tax sale list real|mobile homes 9/i;

function encodeUrl(url) {
  return String(url || "").includes(" ") ? encodeURI(url) : url;
}

function yearFrom(url, lastModified) {
  const blob = String(url || "") + " " + String(lastModified || "");
  const m = blob.match(/20(1[9]|2[0-6])/g);
  if (!m) return null;
  const years = m.map((y) => Number(y)).filter((y) => y >= 2019 && y <= 2026);
  return years.length ? Math.max(...years) : null;
}

function looksLikeListing(url, text) {
  const blob = String(url || "") + " " + String(text || "");
  if (NOT_LIST.test(blob)) return false;
  return LIST_FILE.test(blob);
}

/**
 * scripts/hunt.js appends confirmed official URLs here after downloading each
 * one and counting real parcel identifiers in it. Keeping the machine finds in
 * their own file lets an unattended crawl add sources without rewriting the
 * hand-curated SEEDS above.
 */
const DISCOVERED_FILE = path.join(__dirname, "listings-discovered.json");

function discovered() {
  try {
    return JSON.parse(fs.readFileSync(DISCOVERED_FILE, "utf8"));
  } catch (_err) {
    return {};
  }
}

function seedsFor(id) {
  const rows = (SEEDS[id] || []).map((row) => ({ url: row.url, year: row.year || null }));
  const seen = new Set(rows.map((row) => row.url));
  for (const row of discovered()[id] || []) {
    if (!row || !row.url || seen.has(row.url)) continue;
    seen.add(row.url);
    rows.push({ url: row.url, year: row.year || null });
  }
  return rows;
}

function yearHintMap(id) {
  return Object.fromEntries(seedsFor(id).map((row) => [row.url, row.year]));
}

async function discoverFlorence(fetchFn) {
  const fn = fetchFn || fetch;
  const url = S3 + "?list-type=2&prefix=public/DelinquentTax/&max-keys=300";
  try {
    const response = await fn(url, {
      headers: { "user-agent": "sc-tax-sale-watch/1.0 (public archive research; identifiers only)" },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return [];
    const xml = await response.text();
    const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
    return keys.filter((key) => FLORENCE_LIST.test(key) && !NOT_LIST.test(key)).map((key) => ({
      url: S3 + key,
      year: yearFrom(key),
    }));
  } catch (_err) {
    return [];
  }
}

module.exports = {
  S3,
  SEEDS,
  encodeUrl,
  yearFrom,
  looksLikeListing,
  seedsFor,
  yearHintMap,
  discoverFlorence,
};
