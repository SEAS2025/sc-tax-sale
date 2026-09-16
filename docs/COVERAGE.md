# How to cover all 46 South Carolina counties

There is no statewide tax-sale file. S.C. Code Ann. § 12-51-40 lets each county set its own sale date, then requires the delinquent tax officer to advertise the parcels under “Delinquent Tax Sale” once a week for three consecutive weeks. The original Base44 app already knew this: `scCounties.js` listed all 46 names, but only Lexington had a `csvUrl`. Cloning the Beaufort PDF parser 45 times will not work. PDF layouts, identifiers, and even whether a list exists on the website all differ.

What scales is **one canonical row** plus **five source families**. A county graduates from `unknown` → `researched` when its family and treasurer URL are verified, then to `live` when an adapter can ingest a local file without storing owner lists in git.

## Canonical row

Every county, after ingest, is the same CSV the Lexington screen already used:

| Field | Meaning |
| --- | --- |
| `tms` | Parcel identifier as published (name kept for the Lexington port; Beaufort stores a PIN here) |
| `owner_location_{year}_REALAD` | Owner / situs as advertised that cycle |
| `owner_location_{prior}_list` | Same from the prior sale list, if you have it |
| `amount_{year}_REALAD` | Delinquent amount on the current ad |
| `amount_{prior}_list` | Amount on the prior list |

Do not commit those files. `parse-*` commands print counts and totals only.

## The five families

Verified examples were opened 16 September 2026. GIS endpoints are listed only when they were already in this repo or not required to classify the **list**.

### 1. `realad-pdf` — newspaper REALAD + prior sale PDF

Lexington (live) and Beaufort (parser ready). Text extract, then a layout-specific regex. Identifier is county-specific (Lexington dashed TMS vs Beaufort `R`+17 PIN). This is the original product. Use it where the treasurer only posts PDFs or Dropbox links, not a table.

### 2. `html-table` — county website is already a table

**Greenville** publishes a live HTML table at `https://www.greenvillecounty.org/appsAS400/Taxsale/` (HTTP 200). Columns: `Item #`, `Map #`, `Name`, `Amount Due`. Map numbers are 13-digit strings, sometimes with a letter prefix (`WG06030500300`). That is one adapter for every county that dumps the same four columns to HTML. Do not scrape the Greenville table into this repo (owner names).

**Oconee** (browsed 16 Sep 2026) publishes a live table at `https://oconeesc.com/delinquent-tax/sale-list`. Columns: `Item Number`, `Owner Name`, `Map Number`, `Description`, `Total Tax Due`. The same html-table adapter reads that header row. Sale date on the information page: 9 Nov 2026. Do not scrape the table into git.

### 3. `county-pdf` — treasurer-hosted listing PDF

**Charleston** posts `https://www.charlestoncounty.org/departments/delinquent-tax/files/RP-Tax-Sale-Listing.pdf` from `https://www.charlestoncounty.gov/departments/delinquent-tax/tax-sale.php` (HTTP 200). Rows are 10-digit PINs (`4601102055`), class code, owner, situs, appraisal, assessed, acreage, total due. The PDF itself quotes S.C. Code § 30-2-50 (no using the list for commercial solicitation). Parse locally; do not republish.

2026 Charleston sale is advertised to begin 9 November 2026; the 2025 PDF is the layout sample.

**Georgetown** (browsed 16 Sep 2026) posts a 2025 list at `https://www.gtcountysc.gov/DocumentCenter/View/3625` from [Tax Sale](https://www.gtcountysc.gov/408/Tax-Sale). Headers include `TaxMapNumber` (dashed, like `01-0117-008-00-00`) and `CountyItemNumber`. Not the Charleston 10-digit layout. PDF not stored.

**Cherokee** links a one-page scan, `https://cherokeecountysc.gov/wp-content/uploads/2026/08/TAX-SALE-TAB.pdf`, from [Delinquent Tax](https://cherokeecountysc.gov/delinquent-tax/). No text layer, so it was not parsed.

**Colleton** [tax sale](https://www.colletoncounty.org/delinquent-tax/tax-sale) links `taxsale-1-30-26.pdf` (sale advertised 20 Feb 2026). Headers: Map Number, Description, Acres, Total Tax Due. Map shape `213-00-00-020.000`. File not stored.

**Florence** [Delinquent Tax](https://www.florencecountysc.gov/offices/delinquent-tax/) posts 2026 real-property and mobile-home PDFs on county S3 (sale 5 Oct 2026). HEAD only; files not stored.

### 4. `xlsx` — spreadsheet download

**Horry** treasurer page `https://www.horrycountysc.gov/departments/treasurer/delinquent-tax/` (HTTP 200) advertises `Delinquent List 08.19.26.xlsx`. One sheet-to-canonical adapter covers every county that uses Excel. Column names will still need a per-file map the first time.

**Dillon** treasurer page labels `PAPER.XLS` as the Delinquent Tax Sale List (HEAD 200, `application/vnd.ms-excel`, Last-Modified 6 May 2026). Same adapter family. File not stored.

### 5. `page-or-newspaper` — CivicPlus / seasonal list / bidder portal

The county page is real, but the file is missing, behind bidder registration, or “see the newspaper.”

| County | Page opened or cited | What you actually get |
| --- | --- | --- |
| Bamberg | [Delinquent Tax Properties](https://www.bambergcounty.sc.gov/tax-services/delinquent-tax-office/delinquent-tax-properties) | 2025 sale 8 Dec 2025; list in the *Bamberg Leader* three Mondays prior; a “2025 Tax Sale List” link when in season |
| Williamsburg | [Delinquent Tax Sale](https://www.williamsburgcounty.sc.gov/325/Delinquent-Tax-Sale) | 2025 sale was 3 Dec 2025; 2026 “added at the appropriate time” |
| Spartanburg | [2025 Tax Sale Info](https://sc-spartanburgcounty.civicplus.com/640/2025-Tax-Sale-Info) | Sale 18–19 Nov 2025; “FINAL TAX SALE LIST 2025 — currently Unavailable” |
| Sumter | [Delinquent Tax](https://www.sumtercountysc.gov/departments/s_-_z/treasurer/delinquent_tax.php) | 2026 sale 9 Mar 2026; “LIST OF PROPERTIES FOR THE 2025 DELINQUENT TAX SALE” |
| Dorchester | [Delinquent Tax](https://www.dorchestercountysc.gov/government/property-tax-services/delinquent-tax) | 2026 sale 19 Oct 2026; calendar of fees, no file sampled |
| Lancaster | [Tax Sale Procedures](https://www.lancastercountysc.gov/198/Tax-Sale-Procedures) | 2026 sale 9 Nov 2026; updated list after 5 pm 6 Nov for registered bidders |
| Richland | [Tax Sale](https://www.richlandcountysc.gov/Property-Business/Taxes/Delinquent-Taxes/Tax-Sale) | 2025 sale ended; bidder app at `www7.richlandcountysc.gov/TaxSaleBidder` |
| Aiken | [Delinquent Tax Sale](https://www.aikencountysc.gov/309/Delinquent-Tax-Sale) | 2 Nov 2026; Aiken Standard; bidder instructions PDF, no parcel list |
| Anderson | [Tax Sale](https://www.andersoncountysc.org/tax-sale/) | 19 Oct 2026; listings promised from 30 Sep 2026; 2025 FLC PDFs posted |
| Abbeville | [Delinquent Tax Collector](https://abbevillecountysc.com/delinquent-tax-collector/) | First Monday in November; The Press and Banner |
| Calhoun | [Tax Collector](https://calhouncounty.sc.gov/departments/tax-collector) | Office conducts sales. No current file. |
| York | [Tax Collection](https://www.yorkcountysc.gov/216/Tax-Collection) | Sale 12 Oct 2026. 2025 Experience Builder dashboard linked from the page. |

These counties need a **page watcher**, not a parser, until a file appears. Then they collapse into family 2, 3, or 4.

## GIS is a second step, not the list

Schneider **qPublic / Beacon** hosts many SC assessors (`qpublic.schneidercorp.com`, `qpublic.net/sc/scassessors/`). That is how you look up a parcel **after** you have an ID. It is not the tax-sale list. Lexington already uses OneMap + PropSearch. Beaufort uses an Experience Builder map. Do not invent ArcGIS MapServer URLs for the other 44.

Until a county has a public query template, plot at the Census internal point (already in `counties/sc.json`) with a small deterministic offset, which is what the original app did when `geocodeFunction` was null.

## Identifier families (so far)

| Family | Example | Counties |
| --- | --- | --- |
| Dashed TMS | `06-1234-5678` or `000600-06-119` | Lexington |
| Beaufort PIN | `R### ### ### #### ####` | Beaufort |
| 13-digit map # | `0136001300600` | Greenville |
| 10-digit PIN | `4601102055` | Charleston |

New counties add a normalizer in `engine/ids/`, not a new product.

## Operating loop (every county, every year)

1. **Calendar.** There is no official statewide calendar. Track each treasurer page. Statute: first delinquent notice ~1 April, then three weekly ads, then the advertised sale date.
2. **Acquire.** Download the file for that family into a local `inbox/` (gitignored). Never commit it.
3. **Normalize.** `node engine/cli.js ingest <county> path`. New family adapters go here.
4. **Crosswalk.** Same PIN/TMS on this year’s ad and last year’s list — that is the original Lexington/Beaufort product.
5. **Locate.** GIS template if verified; otherwise county centroid.
6. **Ship.** Leaflet map + optional treasurer inquiry. Same as today.

## Order of work (effort, not politics)

1. **Family adapters** for `html-table`, `county-pdf` (text extract), `xlsx`, and `page-watch` are in `engine/adapters/families/`. CLI: `families`, `ingest`, `watch`.
2. **Greenville, Charleston, Horry** are the proof counties for those ingest families. Do not store their live listings in git.
3. **CivicPlus watcher** for Spartanburg / Lancaster / Dorchester / Sumter / Bamberg as their 2026 ads open.
4. **REALAD PDF** counties as treasurers post Dropbox/PDFs (Beaufort pattern).
5. **Newspaper OCR** last, for counties that never put a file on the website.

## What not to do

- Do not claim 46 live feeds. The original product had **one**.
- Do not use these lists for commercial solicitation. Charleston’s PDF cites § 30-2-50.
- Do not store owner CSVs in git.
- Do not scrape qPublic for the sale universe. The sale universe is the treasurer ad.

## Current registry after this pass

See `counties/sc.json`. Status words are unchanged: `live` needs an adapter, `researched` means the page/family is verified, `unknown` means we still have not opened a treasurer URL.
