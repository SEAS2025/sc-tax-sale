"use strict";

/**
 * Seeded 2026 sale / advertisement calendar from official pages
 * (checked 16 Sep 2026). Scanner overlays last-scan facts. No owner lists.
 */

function row(partial) {
  const adDates = partial.adDates || [];
  const listPromised = partial.listPromised || null;
  const saleDate = partial.saleDate || null;
  let watchFrom = partial.watchFrom || null;
  if (!watchFrom) {
    if (adDates.length) watchFrom = adDates.slice().sort()[0];
    else if (listPromised) watchFrom = listPromised;
    else if (saleDate && String(saleDate).startsWith("2026")) watchFrom = shiftDays(saleDate, -21);
  }
  return {
    saleDate,
    saleDates: partial.saleDates || (saleDate ? [saleDate] : []),
    saleNote: partial.saleNote || null,
    adOutlet: partial.adOutlet || null,
    adDates,
    listPromised,
    watchFrom,
    listStatus: partial.listStatus || "unknown",
    datePrecision: partial.datePrecision || (saleDate ? "posted" : "unknown"),
    extraUrls: partial.extraUrls || [],
    listingWatchUrls: partial.listingWatchUrls || [],
  };
}

function shiftDays(iso, days) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const COUNTIES = {
  abbeville: row({
    saleDate: "2026-11-02",
    datePrecision: "implied",
    saleNote: "Usually first Monday in November",
    adOutlet: "The Press and Banner",
    listStatus: "rule",
  }),
  aiken: row({
    saleDate: "2026-11-02",
    saleNote: "9 a.m., USC Aiken Convocation Center",
    adOutlet: "Aiken Standard",
    adDates: ["2026-10-16", "2026-10-23", "2026-10-30"],
    listPromised: "2026-10-16",
    listStatus: "scheduled",
  }),
  allendale: row({ listStatus: "unknown" }),
  anderson: row({
    saleDate: "2026-10-19",
    saleNote: "Civic Center of Anderson",
    listPromised: "2026-09-30",
    watchFrom: "2026-09-30",
    listStatus: "scheduled",
  }),
  bamberg: row({
    saleDate: "2025-12-08",
    adOutlet: "Bamberg Leader",
    listStatus: "leftover",
  }),
  barnwell: row({
    adOutlet: "The People Sentinel / scpublicnotices.com",
    listStatus: "unknown",
  }),
  beaufort: row({
    saleDate: "2026-10-05",
    saleNote: "First Monday in October, Buckwalter Recreation Center, Bluffton",
    adOutlet: "Local newspapers + treasurer help center",
    watchFrom: "2026-09-14",
    listStatus: "scheduled",
    extraUrls: [
      "https://treasurerhelp.zendesk.com/hc/en-us/articles/4409081325069-List-of-Delinquent-Properties-for-Tax-Sale",
    ],
  }),
  berkeley: row({
    adOutlet: "Post and Courier",
    saleNote: "Land / mobile-home sales November or December",
    listStatus: "unknown",
  }),
  calhoun: row({
    saleDate: "2026-11-09",
    saleNote: "10 a.m., John Ford Community Center",
    adOutlet: "The Calhoun Times Leader",
    adDates: ["2026-10-23", "2026-10-30", "2026-11-06"],
    listStatus: "scheduled",
  }),
  charleston: row({
    saleDate: "2026-11-09",
    saleNote: "9 a.m., Charleston Coliseum; continues following days if needed",
    listPromised: "2026-09-07",
    watchFrom: "2026-09-07",
    listStatus: "scheduled",
    listingWatchUrls: [
      "https://www.charlestoncounty.org/departments/delinquent-tax/files/RP-Tax-Sale-Listing.pdf?v=0",
    ],
  }),
  cherokee: row({
    listStatus: "flyer",
    listingWatchUrls: [
      "https://cherokeecountysc.gov/wp-content/uploads/2026/08/TAX-SALE-TAB.pdf",
    ],
  }),
  chester: row({
    datePrecision: "implied",
    saleNote: "First Monday of November or December",
    adOutlet: "County newspapers, last three weeks of October",
    watchFrom: "2026-10-11",
    listStatus: "rule",
  }),
  chesterfield: row({
    saleDate: "2026-10-26",
    adOutlet: "County newspapers",
    listStatus: "scheduled",
  }),
  clarendon: row({ listStatus: "unknown" }),
  colleton: row({
    saleDate: "2026-02-20",
    saleNote: "Colleton Civic Center",
    listStatus: "held",
    listingWatchUrls: [
      "https://www.colletoncounty.org/sites/default/files/uploads/taxsale-1-30-26.pdf",
    ],
  }),
  darlington: row({
    saleNote: "December at Darlington Middle School; exact day by phone",
    adOutlet: "Darlington News & Press",
    listStatus: "unknown",
  }),
  dillon: row({
    listStatus: "posted",
    listingWatchUrls: [
      "https://www.dilloncountysc.org/Documents/Departments/Treasurer/PAPER.XLS",
    ],
  }),
  dorchester: row({
    saleDate: "2026-10-19",
    saleNote: "Published fee calendar (page may 403 to automated fetches)",
    listStatus: "scheduled",
  }),
  edgefield: row({
    saleDate: "2026-12-07",
    datePrecision: "implied",
    saleNote: "First Monday in December",
    listStatus: "rule",
  }),
  fairfield: row({
    saleDate: "2026-11-02",
    saleNote: "10 a.m., courtroom, 101 S. Congress St., Winnsboro",
    adOutlet: "Country Chronicle",
    adDates: ["2026-10-15", "2026-10-22", "2026-10-29"],
    listStatus: "scheduled",
    extraUrls: [
      "https://www.fairfieldsc.com/uploads/uploads/2026_Tax_Sale_Schedule_of_Events.pdf",
    ],
  }),
  florence: row({
    saleDate: "2026-10-05",
    saleDates: ["2026-10-05", "2026-10-06"],
    saleNote: "County Complex parking garage, 10 a.m.; continues 6 Oct if needed",
    listStatus: "posted",
    listingWatchUrls: [
      "https://s3.us-east-1.amazonaws.com/files.florenceco.org/public/DelinquentTax/2026/2026%20Tax%20Sale%20List%20Real%209-01-26.pdf",
    ],
  }),
  georgetown: row({
    saleDate: "2025-11-03",
    listStatus: "leftover",
    listingWatchUrls: ["https://www.gtcountysc.gov/DocumentCenter/View/3625"],
  }),
  greenville: row({
    saleDate: "2026-10-19",
    saleDates: ["2026-10-19", "2026-10-20"],
    saleNote: "Greenville Convention Center, 10 a.m.",
    listStatus: "posted",
    extraUrls: ["https://www.greenvillecounty.org/appsAS400/Taxsale/"],
  }),
  greenwood: row({ listStatus: "unknown" }),
  hampton: row({
    datePrecision: "implied",
    saleNote: "Usually first Monday in October or November",
    listStatus: "rule",
  }),
  horry: row({
    saleNote: "Date and place appear in the November newspaper ads (typically early December)",
    adOutlet: "Paper of general circulation, three consecutive Thursdays before the sale",
    watchFrom: "2026-11-01",
    listStatus: "posted",
    listingWatchUrls: [
      "https://www.horrycountysc.gov/media/b5af14ce/delinquent-list-on-website-081926.xlsx",
    ],
  }),
  jasper: row({
    saleNote: "Forfeited Land page is post-sale assignments, not the current ad",
    listStatus: "unknown",
  }),
  kershaw: row({ listStatus: "unknown" }),
  lancaster: row({
    saleDate: "2026-11-09",
    saleNote: "9 a.m., Springdale Recreation Center",
    adOutlet: "The Lancaster News",
    listStatus: "scheduled",
  }),
  laurens: row({
    saleDate: "2025-12-03",
    adOutlet: "Laurens County Advertiser and Clinton Chronicle",
    saleNote: "Registration for the next sale reopens 1 Nov 2026",
    watchFrom: "2026-11-01",
    listStatus: "leftover",
  }),
  lee: row({
    saleDate: "2026-11-02",
    datePrecision: "implied",
    saleNote: "Normally first Monday in November, courtroom; confirm in the County Observer",
    adOutlet: "County Observer",
    listStatus: "rule",
  }),
  lexington: row({
    saleDate: "2026-11-02",
    saleNote: "10 a.m., Barr Road Sports Complex",
    adOutlet: "Chronicle and Twin City News",
    adDates: ["2026-10-15", "2026-10-22", "2026-10-29"],
    listStatus: "scheduled",
  }),
  marion: row({ listStatus: "unknown" }),
  marlboro: row({
    saleDate: "2026-11-09",
    saleNote: "10:30 a.m., Bennettsville Community Center",
    adOutlet: "Herald Advocate",
    adDates: ["2026-10-08", "2026-10-15", "2026-10-22"],
    listStatus: "scheduled",
    extraUrls: [
      "https://marlborocounty.sc.gov/Documents/Delinquent%20Tax/Tax%20Sale%20-%202026%20Calendar.pdf",
    ],
  }),
  mccormick: row({
    saleDate: "2026-10-05",
    datePrecision: "implied",
    saleNote: "First Monday in October",
    adOutlet: "The McCormick Messenger",
    listStatus: "rule",
  }),
  newberry: row({
    saleDate: "2025-11-03",
    listStatus: "leftover",
  }),
  oconee: row({
    saleDate: "2026-11-09",
    adOutlet: "Seneca Journal Tribune",
    listPromised: "2026-10-21",
    listStatus: "scheduled",
  }),
  orangeburg: row({
    saleDate: "2026-12-14",
    saleNote: "10 a.m., Orangeburg County Conference Center",
    adOutlet: "Times and Democrat",
    listStatus: "scheduled",
  }),
  pickens: row({
    saleDate: "2026-10-13",
    saleNote: "Performing Arts Center, Liberty",
    adOutlet: "Local newspaper and the delinquent-tax page",
    listStatus: "scheduled",
  }),
  richland: row({
    saleNote: "2025 tax sale and sealed bid have ended; no 2026 date posted",
    listStatus: "leftover",
  }),
  saluda: row({
    saleDate: "2026-12-08",
    saleNote: "10 a.m.",
    adOutlet: "Twin City News",
    adDates: ["2026-11-19", "2026-11-26", "2026-12-03"],
    listStatus: "scheduled",
  }),
  spartanburg: row({
    saleDate: "2026-12-08",
    saleDates: ["2026-12-08", "2026-12-09"],
    listStatus: "scheduled",
    extraUrls: ["https://www.spartanburgcounty.org/178/Delinquent-Tax"],
  }),
  sumter: row({
    saleDate: "2026-03-09",
    listStatus: "held",
  }),
  union: row({
    saleDate: "2026-11-10",
    datePrecision: "implied",
    saleNote: "Second Tuesday in November, courthouse 2nd floor",
    adOutlet: "Union County News",
    listStatus: "rule",
  }),
  williamsburg: row({
    saleDate: "2025-12-03",
    saleNote: "2026 information will be added at the appropriate time",
    listStatus: "leftover",
  }),
  york: row({
    saleDate: "2026-10-12",
    saleDates: ["2026-10-12", "2026-10-13"],
    saleNote: "9 a.m., York County Fire Training Center; continues 13 Oct if needed",
    adOutlet: "The Herald",
    listStatus: "scheduled",
    extraUrls: [
      "https://www.yorkcountysc.gov/DocumentCenter/View/3590/2026-Tax-Sale-Information",
    ],
  }),
};

const SEASON = 2026;
const CHECKED = "2026-09-16";

function getSeed(id) {
  return COUNTIES[id] ? Object.assign({}, COUNTIES[id]) : null;
}

function listSeeds() {
  return Object.keys(COUNTIES).sort().map((id) => ({ id, ...COUNTIES[id] }));
}

module.exports = {
  SEASON,
  CHECKED,
  COUNTIES,
  getSeed,
  listSeeds,
  shiftDays,
};
