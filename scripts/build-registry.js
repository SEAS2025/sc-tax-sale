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
    "Live county in the original Base44 analysis app. Adapter, TMS section geocoder, and CSV schema are implemented. The original CDN CSV is not redistributed (owner names and addresses). Obtain lists from the treasurer page.",
};

const BEAUFORT = {
  status: "researched",
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
