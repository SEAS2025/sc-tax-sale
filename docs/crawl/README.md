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

Other county reports in this folder are in progress. A cookie-consent script that mentions reCaptcha is not a captcha wall.
