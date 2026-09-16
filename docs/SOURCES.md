# Sources

Checked 16 September 2026 unless a row says otherwise. URLs that were not opened are omitted. Nothing in this file is a guessed ArcGIS service.

## What this product is

The original product is a Base44 React app titled “South Carolina Delinquent Tax Sale Analysis,” extracted locally and not published here. Only Lexington had a live CSV. Beaufort had a dedicated viewer component that was not wired as `csvUrl`. Haywood County, North Carolina was a separate page.

A later Node folder, `beaufort-tax-pdfs`, is a PDF parser port of that Lexington workflow. Its CSV column is still named `tms` “for tooling compatibility.” Beaufort parcels are PINs (`R` + 17 digits), not Lexington TMS numbers.

This repository is the public marketing site and parameterized engine. It does not include the Base44 UI dump, auth, `VITE_BASE44` settings, or owner-level sale files.

## Census FIPS and county centers

- [2020 Gazetteer counties for South Carolina](https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2020_Gazetteer/2020_gaz_counties_45.txt) — `GEOID`, `INTPTLAT`, `INTPTLONG`.
- [Census ANSI county code lists](https://www.census.gov/library/reference/code-lists/ansi/2020.html).

County centers in `counties/sc.json` are those internal points, not the approximate centers in the original `scCounties.js` (some of those coordinates were reused across counties).

### FIPS errors fixed from the original `scCounties.js`

The original file skipped codes and then duplicated others. Confirmed corrections:

| County | Original file | Census `COUNTYFP` |
| --- | --- | --- |
| Cherokee | 023 | 021 |
| Chester | 025 | 023 |
| Chesterfield | 027 | 025 |
| Clarendon | 029 | 027 |
| Colleton | 035 | 029 |
| Darlington | 037 | 031 |
| Dillon | 039 | 033 |
| Dorchester | 043 | 035 |
| Edgefield | 045 | 037 |
| Fairfield | 047 | 039 |
| Florence | 049 | 041 |
| Georgetown | 051 | 043 |
| Greenville | 053 | 045 |
| Greenwood | 055 | 047 |
| Hampton | 057 | 049 |
| Horry | 059 | 051 |
| Jasper | 061 | 053 |
| Kershaw | 063 | 055 |
| Lancaster | 065 | 057 |
| Laurens | 067 | 059 |
| Lee | 069 | 061 |
| Lexington | 063 | 063 |
| McCormick | 071 | 065 |
| Marion | 067 | 067 |
| Marlboro | 069 | 069 |
| Newberry | 073 | 071 |
| Oconee | 075 | 073 |
| Orangeburg | 077 | 075 |
| Pickens | 079 | 077 |
| Richland | 079 | 079 |

Saluda through York already matched Census (081–091). Kershaw and Lexington both stored 063; Lee and Marlboro both stored 069. Lexington’s real code is 063. Kershaw is 055. McCormick is 065, which the old file had assigned to Lancaster.

Counties whose treasurer pages were opened on 16 September 2026 and classified into a source family are `researched` even without an adapter. See `docs/COVERAGE.md`. The rest stay `unknown` with null URLs.

## Lexington (live)

Original app fields, then what was re-checked:

| Item | Status on 16 September 2026 |
| --- | --- |
| Treasurer page stored as `https://lex-co.sc.gov/departments/treasurer/delinquent-taxes` | HTTP 200 after redirect to `https://lex-co.sc.gov/treasurer/delinquent-taxes` |
| `https://maps.lex-co.com/OneMap/` | HTTP 200 |
| `https://www.lex-co.com/PropSearch/` | HTTP 200 |
| `https://lex-co.sc.gov/planning-gis` | HTTP 200 |
| OneMap query template `?query=17b6046d7b9-layer-6_4,TMS,{TMS}` | Copied from the original app. The host responds. A live parcel query was not re-run. |
| Property card template `https://www.lex-co.com/PropSearch/#/property?tm={TMS_NODASH}` | Copied from the original app. |
| `https://maps.lex-co.com/agstserver/rest/services/Property/MapServer` | HTTP 403. The original owner-lookup function used layer 4. It is not wired here as a public query. |

CSV schema, from the original county screen when no file was loaded:

`tms, owner_location_2025_REALAD, owner_location_2022_list, amount_2025_REALAD, amount_2022_list`

Filename used by the original app: `Lexington_both_2022_list_and_2025_REALAD.csv`. That file is not in this repo and the CDN URL is not republished, because the list includes owner names and addresses.

TMS geocoder: original function `geocodeLexingtonTMS`. Section keys 06, 07, 08, 13, 14, 15, 19, 20, 21, 25, 26, 27, 32, 33, 34. Unknown sections fall back to `[33.78, -81.18]` as in that function. These are approximate section centers plus a small offset, not surveyed parcel coordinates.

The owner-lookup function documented a second shape, `000600-06-119` (section in the middle). The engine accepts both shapes. The old geocoder used only the first segment, which misses the section on the map-block form.

## Beaufort (researched, parser ready)

Not a live CSV in the original app. Parser logic is ported from the Node PDF tools.

| Item | Status on 16 September 2026 |
| --- | --- |
| `https://www.beaufortcountytreasurer.com/research-and-data` | HTTP 200. Original notes say sale PDFs are linked from this page (Dropbox). Those file URLs were not copied. |
| `https://www.beaufortcountytreasurer.com/tax-bill-lookup` | HTTP 200 |
| GIS Mapping link on [Beaufort online services](https://www.beaufortcountysc.gov/online-services/index.html) | `https://experience.arcgis.com/experience/9e534a7884744a2680a0f472e2aabdc3` HTTP 200 |
| “Beaufort County mapping site” on the same page | `https://gis-department-mapping-site-collage-bcscgis.hub.arcgis.com/` HTTP 200 |
| `https://www.beaufortcountysc.gov/gis/` | HTTP 200 |
| Hosted Address/Parcels feature service | `https://gis.beaufortcountysc.gov/server/rest/services/Hosted/AddressParcels/FeatureServer` HTTP 200, JSON lists layers Address (0), Parcels (1), Boundary (2). Not used as a query template. |
| Original viewer `https://gis.beaufortcountysc.gov/Html5Viewer/index.html?viewer=BCSCParcelViewer` | HTTP 404 |
| `https://gis.beaufortcountysc.gov/server/rest/services/Parcels/MapServer` | Redirected to a login page. Not treated as a public query. |
| `https://gis.beaufortcountysc.gov/publicmapping/` | HTTP 404 |

PIN format copied from `pin_utils.js`: `R` + 17 digits, displayed `R### ### ### #### ####`.

## Haywood County, North Carolina (extra)

Mentioned only. Not in `counties/sc.json` and not in SC pricing. List URLs were copied from the original Haywood page and were not re-fetched:

- 2022, 2023, and 2025 tables on themountaineer.com (see `counties/extras.json`)
- Tax bill search template: `https://taxes.haywoodcountync.gov/ITSPublic/TaxBillSearch?parcelNumber={PIN}`

## Other researched treasurer pages (16 September 2026)

Opened or cited while classifying source families. No GIS URLs added. No listing files stored.

| County | Family | Page |
| --- | --- | --- |
| Charleston | county-pdf | https://www.charlestoncounty.gov/departments/delinquent-tax/tax-sale.php (200). Sample 2025 PDF uses 10-digit PINs. |
| Greenville | html-table | https://www.greenvillecounty.org/appsAS400/Taxsale/ (200). Columns Item #, Map #, Name, Amount Due. |
| Horry | xlsx | https://www.horrycountysc.gov/departments/treasurer/delinquent-tax/ (200). Advertises an `.xlsx` delinquent list. |
| Bamberg | page-or-newspaper | https://www.bambergcounty.sc.gov/tax-services/delinquent-tax-office/delinquent-tax-properties |
| Williamsburg | page-or-newspaper | https://www.williamsburgcounty.sc.gov/325/Delinquent-Tax-Sale |
| Spartanburg | page-or-newspaper | https://www.spartanburgcounty.org/640/2025-Tax-Sale-Info |
| Sumter | page-or-newspaper | https://www.sumtercountysc.gov/departments/s_-_z/treasurer/delinquent_tax.php |
| Dorchester | page-or-newspaper | https://www.dorchestercountysc.gov/government/property-tax-services/delinquent-tax |
| Lancaster | page-or-newspaper | https://www.lancastercountysc.gov/198/Tax-Sale-Procedures |
| Richland | page-or-newspaper | https://www.richlandcountysc.gov/Property-Business/Taxes/Delinquent-Taxes/Tax-Sale |
| Aiken | page-or-newspaper | https://www.aikencountysc.gov/309/Delinquent-Tax-Sale (200). 2 Nov 2026; Aiken Standard ads. Bidder-instructions PDF only. |
| Anderson | page-or-newspaper | https://www.andersoncountysc.org/tax-sale/ (200). Sale 19 Oct 2026; listings promised 30 Sep 2026. 2025 FLC PDFs are post-sale. |
| Abbeville | page-or-newspaper | https://abbevillecountysc.com/delinquent-tax-collector/ (200). Press and Banner ads. No file. |

qPublic/Beacon (`qpublic.schneidercorp.com`) is an assessor GIS portal for many SC counties. It is not a tax-sale list.

## What was not done

No remaining-county treasurer crawl. No invented ArcGIS URLs. No download of owner CSVs, Greenville HTML rows, or the Charleston PDF into git. No parcel counts.
