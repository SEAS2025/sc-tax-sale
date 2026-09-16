# Crawl reports

Firefox (Playwright) visits each county’s official website from the SC Association of Counties directory, then follows treasurer, tax-sale, document-center, and search links. Reports here are link metadata only. HTML dumps stay in gitignored `.crawl-html/`. Listing PDFs and spreadsheets are not stored.

`/usr/bin/firefox` cannot be driven by Playwright 1.63 (revision mismatch). The crawler falls back to the Playwright Firefox build.

## Browsed 16 September 2026

| County | Family | Result |
| --- | --- | --- |
| Aiken | page-or-newspaper | [Delinquent Tax Sale](https://www.aikencountysc.gov/309/Delinquent-Tax-Sale). Sale 2 Nov 2026. Aiken Standard. Bidder-instructions PDF only. |
| Anderson | page-or-newspaper | [Tax sale](https://www.andersoncountysc.org/tax-sale/). Sale 19 Oct 2026. Listings promised from 30 Sep 2026. 2025 FLC PDFs posted. acpass login skipped. |
| Abbeville | page-or-newspaper | [Delinquent tax collector](https://abbevillecountysc.com/delinquent-tax-collector/). Press and Banner. No file. |
| Lexington | realad-pdf | Treasurer page already live. County PDF URL confirmed with HEAD only (2023 Last-Modified). |
| Georgetown | county-pdf | [Tax Sale](https://www.gtcountysc.gov/408/Tax-Sale). 2025 list Document Center View/3625. Headers TaxMapNumber / CountyItemNumber. File not stored. |
| Cherokee | county-pdf | [Delinquent Tax](https://cherokeecountysc.gov/delinquent-tax/). Scan PDF, no text layer. |
| Calhoun | page-or-newspaper | [Tax Collector](https://calhouncounty.sc.gov/departments/tax-collector). No current listing. |
| York | page-or-newspaper | [Tax Collection](https://www.yorkcountysc.gov/216/Tax-Collection). Sale 12 Oct 2026. County-published Experience URL recorded; no MapServer invented. |

All 46 counties are now classified: Lexington `live`, 45 `researched`. Playwright still stops at Cloudflare on Berkeley and Chester; a human pass recorded those two pages. Laurens uses laurenscountysc.gov, not the hijacked laurenscounty.us seed. A cookie-consent script that mentions reCaptcha is not a captcha wall. A Cloudflare “Just a moment” page is a captcha wall and is not solved.

Last seven (human browser, 16 Sep 2026):

| County | Family | Result |
| --- | --- | --- |
| Florence | county-pdf | [Delinquent Tax](https://www.florencecountysc.gov/offices/delinquent-tax/). Sale 5 Oct 2026. 2026 real and mobile-home PDFs on county S3. Not stored. |
| Dillon | xlsx | [Treasurer](https://www.dilloncountysc.org/departments/treasurer.php). `PAPER.XLS` labeled Delinquent Tax Sale List. Not stored. |
| Edgefield | page-or-newspaper | [Tax Collector](https://edgefieldcounty.sc.gov/tax-collector/). First Monday in December. |
| Chesterfield | page-or-newspaper | [Tax Collector](https://www.chesterfieldcountysc.com/tax-collector). Sale 26 Oct 2026. Newspaper ads. |
| McCormick | page-or-newspaper | [Treasurer](https://mccormickcountysc.org/departments/treasurer.php). First Monday in October. McCormick Messenger. |
| Barnwell | page-or-newspaper | [Tax Collector directory](https://www.barnwellcountysc.us/m/directory/department?did=15). Staff page only. |
| Allendale | page-or-newspaper | [Homepage](https://www.allendalecounty.com/). No dedicated tax-sale page. |

Lists found as county-hosted files (not stored in git): Georgetown Document Center View/3625, Colleton `taxsale-1-30-26.pdf`, Cherokee scan PDF, Florence 2026 S3 PDFs, Dillon `PAPER.XLS`. York’s 2025 dashboard is an Experience Builder item the county page linked.
