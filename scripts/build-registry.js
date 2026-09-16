"use strict";

/**
 * Build counties/sc.json from the 2020 Census Gazetteer internal points
 * (GEOID / INTPTLAT / INTPTLONG) plus adapter metadata verified for this repo.
 *
 * Source table: https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2020_Gazetteer/2020_gaz_counties_45.txt
 * Fetched 2026-09-16. Do not invent treasurer or GIS URLs here.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

/** [id, name, county FIPS, lat, lng] in Gazetteer GEOID order is not required. */
const CENSUS = [
  ["abbeville", "Abbeville", "001", 34.229041, -82.454058],
  ["aiken", "Aiken", "003", 33.550013, -81.632983],
  ["allendale", "Allendale", "005", 32.979757, -81.363265],
  ["anderson", "Anderson", "007", 34.521235, -82.638603],
  ["bamberg", "Bamberg", "009", 33.203021, -81.053161],
  ["barnwell", "Barnwell", "011", 33.260552, -81.434228],
  ["beaufort", "Beaufort", "013", 32.358112, -80.689422],
  ["berkeley", "Berkeley", "015", 33.2077, -79.953655],
  ["calhoun", "Calhoun", "017", 33.67478, -80.780347],
  ["charleston", "Charleston", "019", 32.800458, -79.94248],
  ["cherokee", "Cherokee", "021", 35.049796, -81.607647],
  ["chester", "Chester", "023", 34.689342, -81.161249],
  ["chesterfield", "Chesterfield", "025", 34.637018, -80.159227],
  ["clarendon", "Clarendon", "027", 33.664682, -80.217889],
  ["colleton", "Colleton", "029", 32.835018, -80.655244],
  ["darlington", "Darlington", "031", 34.332185, -79.962115],
  ["dillon", "Dillon", "033", 34.390172, -79.374964],
  ["dorchester", "Dorchester", "035", 33.082186, -80.404697],
  ["edgefield", "Edgefield", "037", 33.776498, -81.968245],
  ["fairfield", "Fairfield", "039", 34.395669, -81.127001],
  ["florence", "Florence", "041", 34.028535, -79.710233],
  ["georgetown", "Georgetown", "043", 33.417531, -79.296333],
  ["greenville", "Greenville", "045", 34.892645, -82.372077],
  ["greenwood", "Greenwood", "047", 34.155796, -82.127876],
  ["hampton", "Hampton", "049", 32.778334, -81.143822],
  ["horry", "Horry", "051", 33.909269, -78.976675],
  ["jasper", "Jasper", "053", 32.43059, -81.021627],
  ["kershaw", "Kershaw", "055", 34.338356, -80.590885],
  ["lancaster", "Lancaster", "057", 34.686818, -80.703688],
  ["laurens", "Laurens", "059", 34.483676, -82.005498],
  ["lee", "Lee", "061", 34.15864, -80.251209],
  ["lexington", "Lexington", "063", 33.899246, -81.266118],
  ["marion", "Marion", "067", 34.08362, -79.354001],
  ["marlboro", "Marlboro", "069", 34.60167, -79.679435],
  ["mccormick", "McCormick", "065", 33.897599, -82.316196],
  ["newberry", "Newberry", "071", 34.289881, -81.599676],
  ["oconee", "Oconee", "073", 34.748766, -83.06154],
  ["orangeburg", "Orangeburg", "075", 33.436135, -80.802913],
  ["pickens", "Pickens", "077", 34.885368, -82.723377],
  ["richland", "Richland", "079", 34.029095, -80.898037],
  ["saluda", "Saluda", "081", 34.005278, -81.727903],
  ["spartanburg", "Spartanburg", "083", 34.932014, -81.991624],
  ["sumter", "Sumter", "085", 33.91614, -80.382376],
  ["union", "Union", "087", 34.690397, -81.615896],
  ["williamsburg", "Williamsburg", "089", 33.626462, -79.716474],
  ["york", "York", "091", 34.970188, -81.183187],
];

if (CENSUS.length !== 46) {
  throw new Error("Expected 46 SC counties, got " + CENSUS.length);
}

const LEXINGTON = {
  status: "live",
  sourceFamily: "realad-pdf",
  identifier: "tms",
  identifierFormat: "dashed-sections",
  adapter: "lexington",
  geocode: "geocodeLexingtonTMS",
  csvFilename: "Lexington_both_2022_list_and_2025_REALAD.csv",
  csvRedistributed: false,
  csvSchema: [
    "tms",
    "owner_location_2025_REALAD",
    "owner_location_2022_list",
    "amount_2025_REALAD",
    "amount_2022_list",
  ],
  treasurerUrl: "https://lex-co.sc.gov/treasurer/delinquent-taxes",
  listingSampleUrl:
    "https://lex-co.sc.gov/sites/lexco/files/Documents/Lexington%20County/Departments/Treasurer/Tax%20Sale/REAL%20ESTATE%20LISTING.pdf",
  treasurerUrlAliasRedirectsFrom:
    "https://lex-co.sc.gov/departments/treasurer/delinquent-taxes",
  gisUrl: "https://maps.lex-co.com/OneMap/",
  propertySearchUrl: "https://www.lex-co.com/PropSearch/",
  gisQueryTemplate:
    "https://maps.lex-co.com/OneMap/?query=17b6046d7b9-layer-6_4,TMS,{TMS}",
  propertyCardTemplate:
    "https://www.lex-co.com/PropSearch/#/property?tm={TMS_NODASH}",
  planningGisUrl: "https://lex-co.sc.gov/planning-gis",
  notes:
    "Live county in the original Base44 analysis app. Adapter, TMS section geocoder, and CSV schema are implemented. The original CDN CSV is not redistributed (owner names and addresses). A county-hosted REAL ESTATE LISTING PDF responded 200 on 16 Sep 2026 (Last-Modified 16 Nov 2023); treat it as a layout sample, not the 2026 ad. 2026 advertisements are scheduled in the Chronicle beginning 15 Oct 2026.",
};

const BEAUFORT = {
  status: "researched",
  sourceFamily: "realad-pdf",
  identifier: "pin",
  identifierFormat: "R+17-digits",
  adapter: "beaufort",
  geocode: null,
  csvRedistributed: false,
  treasurerUrl: "https://www.beaufortcountytreasurer.com/research-and-data",
  taxBillLookupUrl: "https://www.beaufortcountytreasurer.com/tax-bill-lookup",
  gisUrl:
    "https://experience.arcgis.com/experience/9e534a7884744a2680a0f472e2aabdc3",
  mappingSiteUrl:
    "https://gis-department-mapping-site-collage-bcscgis.hub.arcgis.com/",
  gisDepartmentUrl: "https://www.beaufortcountysc.gov/gis/",
  parcelFeatureServiceUrl:
    "https://gis.beaufortcountysc.gov/server/rest/services/Hosted/AddressParcels/FeatureServer",
  notes:
    "Parser ready (PIN, not TMS). Not wired as a live CSV in the original app. County-published GIS links verified 2026-09-16. The older Html5Viewer URL returned 404; Parcels/MapServer redirected to login. No parcel count is claimed.",
};

/**
 * Treasurer pages opened or cited 16 Sep 2026. No adapters yet, so these
 * stay `researched`. GIS URLs are omitted unless already verified.
 * See docs/COVERAGE.md for the five source families.
 */
const RESEARCHED = {
  charleston: {
    status: "researched",
    sourceFamily: "county-pdf",
    identifier: "pin",
    identifierFormat: "10-digit",
    treasurerUrl:
      "https://www.charlestoncounty.gov/departments/delinquent-tax/tax-sale.php",
    listingSampleUrl:
      "https://www.charlestoncounty.org/departments/delinquent-tax/files/RP-Tax-Sale-Listing.pdf?v=0",
    notes:
      "Family county-pdf. 2025 listing PDF uses 10-digit PINs. 2026 sale advertised to begin 9 Nov 2026. PDF cites S.C. Code 30-2-50. Ingest extracted text with `ingest charleston`. Do not commit the listing.",
  },
  greenville: {
    status: "researched",
    sourceFamily: "html-table",
    identifier: "map",
    identifierFormat: "13-digit",
    treasurerUrl: "https://www.greenvillecounty.org/TaxCollector/",
    listingUrl: "https://www.greenvillecounty.org/appsAS400/Taxsale/",
    notes:
      "Family html-table. Live HTML columns Item #, Map #, Name, Amount Due. Map numbers are 13-digit, sometimes with a letter prefix. HTTP 200 on 16 Sep 2026. Ingest a saved table with `ingest greenville`. Do not scrape into git.",
  },
  horry: {
    status: "researched",
    sourceFamily: "xlsx",
    identifier: null,
    identifierFormat: null,
    treasurerUrl:
      "https://www.horrycountysc.gov/departments/treasurer/delinquent-tax/",
    notes:
      "Family xlsx. Treasurer page (HTTP 200) advertises Delinquent List 08.19.26.xlsx. Ingest a local workbook with `ingest horry`. Column map is header-based. Do not commit the spreadsheet.",
  },
  bamberg: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl:
      "https://www.bambergcounty.sc.gov/tax-services/delinquent-tax-office/delinquent-tax-properties",
    notes:
      "Family page-or-newspaper. 2025 sale 8 Dec 2025; advertised in the Bamberg Leader. A seasonal Tax Sale List link, not a standing file.",
  },
  williamsburg: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl:
      "https://www.williamsburgcounty.sc.gov/325/Delinquent-Tax-Sale",
    notes:
      "Family page-or-newspaper. 2025 sale was 3 Dec 2025. Page says 2026 information will be added at the appropriate time.",
  },
  spartanburg: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl: "https://www.spartanburgcounty.org/640/2025-Tax-Sale-Info",
    notes:
      "Family page-or-newspaper. CivicPlus page for 18–19 Nov 2025. Final 2025 list was posted as unavailable when checked via the CivicPlus mirror.",
  },
  sumter: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl:
      "https://www.sumtercountysc.gov/departments/s_-_z/treasurer/delinquent_tax.php",
    notes:
      "Family page-or-newspaper. 2026 sale 9 Mar 2026. Page links a 2025 list of properties. File was not downloaded.",
  },
  dorchester: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl:
      "https://www.dorchestercountysc.gov/government/property-tax-services/delinquent-tax",
    notes:
      "Family page-or-newspaper. 2026 sale 19 Oct 2026 with a published fee calendar. No listing file sampled.",
  },
  lancaster: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl: "https://www.lancastercountysc.gov/198/Tax-Sale-Procedures",
    notes:
      "Family page-or-newspaper. 2026 sale 9 Nov 2026. Updated list after 5 pm 6 Nov for registered bidders.",
  },
  aiken: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl: "https://www.aikencountysc.gov/309/Delinquent-Tax-Sale",
    notes:
      "Family page-or-newspaper. Browsed 16 Sep 2026 from the SCAC homepage. 2026 sale 2 Nov 2026, advertised in the Aiken Standard. Bidder instructions PDF is DocumentCenter/View/2540; no parcel list on the page. Registration 18 Sep–16 Oct 2026. qPublic link is assessor lookup only.",
  },
  anderson: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl: "https://www.andersoncountysc.org/tax-sale/",
    notes:
      "Family page-or-newspaper. Browsed 16 Sep 2026. Sale 19 Oct 2026 at the Civic Center of Anderson. Page says property listings will be posted on that site beginning 30 Sep 2026. 2025 Forfeited Land Commission real-estate and mobile-home PDFs are on the same page (post-sale, not the current sale universe). acpass login wall was not bypassed.",
  },
  georgetown: {
    status: "researched",
    sourceFamily: "county-pdf",
    identifier: "tax-map",
    identifierFormat: "dashed, e.g. 01-0117-008-00-00",
    treasurerUrl: "https://www.gtcountysc.gov/408/Tax-Sale",
    listingSampleUrl: "https://www.gtcountysc.gov/DocumentCenter/View/3625",
    notes:
      "Family county-pdf. Browsed 16 Sep 2026. Document Center has 2025 Tax Sale List (View/3625), properties sold 11-03-2025 (View/3796), and 2024 sold (View/3882). First page headers include TaxMapNumber and CountyItemNumber. Dashed map samples look like 01-0117-008-00-00. PDF not stored. The county-pdf text adapter still keys off 10-digit PINs (Charleston); Georgetown needs a dashed-map text fixture before ingest.",
  },
  cherokee: {
    status: "researched",
    sourceFamily: "county-pdf",
    treasurerUrl: "https://cherokeecountysc.gov/delinquent-tax/",
    listingSampleUrl:
      "https://cherokeecountysc.gov/wp-content/uploads/2026/08/TAX-SALE-TAB.pdf",
    notes:
      "Family county-pdf. Browsed 16 Sep 2026. Delinquent Tax page links a one-page TAX-SALE-TAB.pdf (Aug 2026) and a bidder PDF. Page 1 has no text layer, so it was not parsed. Not stored in git.",
  },
  calhoun: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl: "https://calhouncounty.sc.gov/departments/tax-collector",
    notes:
      "Family page-or-newspaper. Browsed 16 Sep 2026. Delinquent tax collector page says the office plans and conducts tax sales. No current listing file. Assessor rollback and 2012–2018 sales PDFs are not the tax-sale ad.",
  },
  saluda: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl: "https://saludacounty.sc.gov/departments/tax-collector/delinquent-tax-sale",
    notes:
      "Family page-or-newspaper. Browsed 16 Sep 2026. 2026 sale Tuesday 8 Dec 2026 at 10 a.m. List will be in the Twin City News and on this page for three weeks, plus an updated list on the page Monday 7 Dec after 4:30 p.m. Not posted yet.",
  },
  orangeburg: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl: "https://www.orangeburgcounty.org/362/General-Tax-Sale-Information",
    notes:
      "Family page-or-newspaper. Browsed 16 Sep 2026. Sale Monday 14 Dec 2026, 10 a.m., Orangeburg County Conference Center. Real property advertised in the Times and Democrat for three weeks. List is the newspaper or the delinquent tax office. No file downloaded.",
  },
  hampton: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl: "https://www.hamptoncountysc.org/29/Delinquent-Tax",
    notes:
      "Family page-or-newspaper. Browsed 16 Sep 2026. FAQ says the sale is usually the first Monday in October or November. No listing file on the page.",
  },
  greenwood: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl: "https://www.greenwoodcounty-sc.gov/tax-collector",
    notes:
      "Family page-or-newspaper. Browsed 16 Sep 2026. Tax collector page says redemptions and tax-sale matters are handled by the Tax Office, Room 101 of the courthouse. No listing file.",
  },
  lee: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl: "https://www.leecountysc.org/directory/departments___elected_officials/delinquent_tax.php",
    notes:
      "Family page-or-newspaper. Browsed 16 Sep 2026. Page says the sale is normally the first Monday in November in the courtroom, subject to change. No listing file.",
  },
  union: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl: "https://gearupunionsc.com/departments/delinquent-tax-office/",
    notes:
      "Family page-or-newspaper. Browsed 16 Sep 2026. 2025 sale was 3 Nov 2025. Unsold properties are being assigned; the list is at the auditor’s office, not a public file on the page.",
  },
  fairfield: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl: "https://www.fairfieldsc.com/departments/tax-collector",
    notes:
      "Family page-or-newspaper. Browsed 16 Sep 2026. Tax collector page links a 2026 schedule of events, bidder terms, and an overage notice. No parcel listing file.",
  },
  marlboro: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl:
      "https://marlborocounty.sc.gov/Documents/Delinquent%20Tax/Tax%20Sale%20-%202026%20Calendar.pdf",
    notes:
      "Family page-or-newspaper. Calendar PDF says sale 9 Nov 2026. Ads in the Herald Advocate starting 8 Oct 2026. Calendar is not a parcel list and was not stored as a sale file.",
  },
  kershaw: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl: "https://www.kershaw.sc.gov/government/departments-r-z/treasurer/delinquent-matters",
    notes:
      "Family page-or-newspaper. Browsed 16 Sep 2026. Delinquent matters page covers overage claims and a policy that county employees cannot bid. No current parcel file.",
  },
  jasper: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl: "https://www.jaspercountysc.gov/services/forfeited-land/",
    notes:
      "Family page-or-newspaper. Browsed 16 Sep 2026. Forfeited Land page describes post-sale assignments that did not meet the minimum bid. No current sale list file. Agenda PDFs are meetings, not the ad.",
  },
  pickens: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl: "https://www.co.pickens.sc.us/departments/delinquent_tax/index.php",
    notes:
      "Family page-or-newspaper. Browsed 16 Sep 2026. Next sale Tuesday 13 Oct 2026 at the Performing Arts Center in Liberty. List is in the local newspaper and on this page for three weeks before the sale; an unofficial list is posted the Friday before. Results PDFs for prior sales are on the site and were not stored.",
  },
  newberry: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl: "https://www.newberrycounty.gov/delinquent-tax/tax-sales",
    notes:
      "Family page-or-newspaper. Browsed 16 Sep 2026 after the county site redirected from newberrycounty.net. Tax sales page and a procedures PDF (tax_sale_info-consolidated.pdf) exist. The delinquent-tax page still lists a sale on 3 Nov 2025. No current parcel file stored.",
  },
  laurens: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl: "https://laurenscountysc.gov/departments/treasurer/delinquent_taxes.php",
    notes:
      "Family page-or-newspaper. SCAC seed laurenscounty.us is not the treasurer site. Official page browsed 16 Sep 2026. 2025 sale was 3 Dec 2025; list in the Laurens County Advertiser and Clinton Chronicle. Registration for the next sale reopens 1 Nov 2026. Newspaper viewer is a subscribe wall; not bypassed.",
  },
  berkeley: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl: "https://berkeleycountysc.gov/dept/delinquent-tax-collector/",
    notes:
      "Family page-or-newspaper. Playwright still gets a Cloudflare challenge on this URL and does not solve it. A human browser pass recorded ads in the Post and Courier and land/mobile-home sales in November or December, with no county listing file.",
  },
  clarendon: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl: "https://www.clarendoncountysc.gov/our-government/treasurer/",
    notes:
      "Family page-or-newspaper. SCAC homepage redirected from clarendoncountygov.org to clarendoncountysc.gov. Treasurer page opened 16 Sep 2026. No tax-sale list linked.",
  },
  oconee: {
    status: "researched",
    sourceFamily: "html-table",
    identifier: "map",
    treasurerUrl: "https://oconeesc.com/delinquent-tax/sale-list",
    listingUrl: "https://oconeesc.com/delinquent-tax/sale-list",
    notes:
      "Family html-table. Browsed 16 Sep 2026. Sale list page columns: Item Number, Owner Name, Map Number, Description, Total Tax Due. Tax sale information page says the 2025 sale is 9 Nov 2026. Bidder registration is a separate page. Do not scrape the live table into git.",
  },
  marion: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl: "https://www.marionsc.org/departments/tax_collector/index.php",
    notes:
      "Family page-or-newspaper. Browsed 16 Sep 2026. Tax collector menu links a Tax Sale Information Form docx. That form was not stored. No parcel table on the page.",
  },
  darlington: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl: "https://www.darcosc.com/departments/tax_collector.php",
    notes:
      "Family page-or-newspaper. Browsed 16 Sep 2026. Sale is held in December at Darlington Middle School. Real property is advertised in the Darlington News and Press for three weeks. Specific date is by phone. No listing file on the page.",
  },
  colleton: {
    status: "researched",
    sourceFamily: "county-pdf",
    identifier: "map",
    identifierFormat: "dotted, e.g. 213-00-00-020.000",
    treasurerUrl: "https://www.colletoncounty.org/delinquent-tax/tax-sale",
    listingSampleUrl:
      "https://www.colletoncounty.org/sites/default/files/uploads/taxsale-1-30-26.pdf",
    notes:
      "Family county-pdf. Browsed 16 Sep 2026. Sale advertised for 20 Feb 2026 at the Colleton Civic Center. Listing PDF headers are Owner Name, Map Number, Description, Acres, Total Tax Due. Dotted map numbers. File not stored. The text adapter accepts this map shape on a local extract.",
  },
  chester: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl:
      "https://chestercountysc.gov/departments/tax-and-finance-departments/tax-collector",
    notes:
      "Family page-or-newspaper. Playwright hit a Cloudflare challenge and did not solve it. A human browser pass on 16 Sep 2026 read the public tax collector page: ads the last three weeks of October; sale the first Monday of November or December. No parcel file. Forfeited Land Auction link to terryhowe.com was not scraped.",
  },
  york: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl: "https://www.yorkcountysc.gov/216/Tax-Collection",
    gisUrl:
      "https://experience.arcgis.com/experience/ef9243d9330c4891ba724689f2eb1502",
    notes:
      "Family page-or-newspaper. Browsed 16 Sep 2026. Tax Collection page links a 2026 fact sheet (sale 12 Oct 2026, in person, no parcel file) and an Experience Builder item titled 2025 York County Delinquent Tax Sales Dashboard. That item URL was on the county page; no MapServer was invented. Fact sheet PDF not stored.",
  },
  abbeville: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl: "https://abbevillecountysc.com/delinquent-tax-collector/",
    notes:
      "Family page-or-newspaper. Browsed 16 Sep 2026. FAQ says the sale is usually the first Monday in November and delinquent parcels are advertised in The Press and Banner for three weeks. No listing file linked. A cookie-consent script mentions reCaptcha; the page content loaded.",
  },
  richland: {
    status: "researched",
    sourceFamily: "page-or-newspaper",
    treasurerUrl:
      "https://www.richlandcountysc.gov/Property-Business/Taxes/Delinquent-Taxes/Tax-Sale",
    notes:
      "Family page-or-newspaper. 2025 sale ended. Bidder portal at www7.richlandcountysc.gov/TaxSaleBidder. No 2026 file sampled.",
  },
};

function row([id, name, fips, lat, lng]) {
  const base = {
    id,
    name,
    state: "SC",
    fips,
    stateFips: "45",
    geoid: "45" + fips,
    center: [lat, lng],
    status: "unknown",
    sourceFamily: null,
    identifier: null,
    identifierFormat: null,
    adapter: null,
    geocode: null,
    treasurerUrl: null,
    gisUrl: null,
    notes:
      "In the 46-county registry. Treasurer and GIS URLs are unset until verified against an official page. Do not invent ArcGIS endpoints.",
  };
  if (id === "lexington") return Object.assign(base, LEXINGTON);
  if (id === "beaufort") return Object.assign(base, BEAUFORT);
  if (RESEARCHED[id]) return Object.assign(base, RESEARCHED[id]);
  return base;
}

const counties = CENSUS.map(row).sort((a, b) => a.name.localeCompare(b.name));
const out = {
  title: "South Carolina counties",
  state: "SC",
  stateFips: "45",
  count: counties.length,
  generatedFrom: "scripts/build-registry.js",
  centerSource:
    "U.S. Census Bureau 2020 Gazetteer internal points (INTPTLAT, INTPTLONG), 2020_gaz_counties_45.txt",
  fipsSource:
    "U.S. Census Bureau county FIPS (COUNTYFP) in the same Gazetteer file. Lexington 063, Kershaw 055.",
  statuses: {
    live: "Adapter and official treasurer/GIS pages are in place. A sale-cycle file is not stored in this repo.",
    researched:
      "Official pages and/or a local parser exist. Not a live sale file in this product.",
    unknown: "County is in the registry only. Endpoints were not verified.",
  },
  counties,
};

const dest = path.join(ROOT, "counties", "sc.json");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log("wrote", dest, "counties", counties.length);
