# Engine

The engine is parameterized by `counties/sc.json`. Every county has an `adapter` from its source family. `ingest` and `watch` print counts and listing links only.

## Commands

```bash
npm test
node engine/cli.js counties
node engine/cli.js describe lexington
node engine/cli.js geocode 06-1234-5678
node engine/cli.js parse-csv lexington path/to/local.csv
node engine/cli.js parse-beaufort-text 2022 path/to/extracted.txt
node engine/cli.js inquiry beaufort path/to/local.csv 10
```

`parse-csv` and `ingest` print counts and totals only. They do not print owner names. Do not commit treasurer CSVs, spreadsheets, or PDFs. `out/`, `inbox/`, and `.crawl-html/` are gitignored.

```bash
node engine/cli.js families
node engine/cli.js ingest greenville path/to/local.html
node engine/cli.js ingest charleston path/to/extracted.txt
node engine/cli.js ingest horry path/to/local.xlsx
node engine/cli.js watch bamberg --file path/to/saved-page.html
```

`ingest` picks the adapter from `sourceFamily` (`html-table`, `county-pdf`, `xlsx`, `realad-pdf`). `county-pdf` reads extracted text, not the PDF binary. `watch` looks for listing links on a local HTML file or the county `treasurerUrl`. It does not download sale files. A login wall or captcha is recorded as blocked.

## Lexington

- Identifier: TMS, dashed sections.
- Shapes: `06-1234-5678` (section first) and `000600-06-119` (section in the middle).
- Geocode: `engine/geocode/lexington-tms.js`, copied from `geocodeLexingtonTMS` without Base44 auth.
- CSV columns: `tms`, `owner_location_2025_REALAD`, `owner_location_2022_list`, `amount_2025_REALAD`, `amount_2022_list`.
- Links use the county templates in the registry. They are not proof a parcel record exists.

## Beaufort

- Identifier: PIN. The field name stays `tms` so crosswalk tools match the Lexington port.
- `engine/adapters/beaufort/pin_utils.js` — normalize `R` + 17 digits.
- `parse_2022.js` — 2022 sale-list text pattern.
- `parse_realad.js` — REALAD text after the `TAX YEARS` anchor.
- `inquiry.js` — treasurer draft from a local CSV. Letter body lists identifier and amounts, not a payment link.

PDF text extraction still depends on a local PDF and is not a dependency of `npm test`. Supply extracted text, or run the original PDF scripts against files you download from the treasurer page.

## All 46 counties

There is no statewide feed. See `docs/COVERAGE.md`. Ingest by source family (`realad-pdf`, `html-table`, `county-pdf`, `xlsx`, `page-or-newspaper`), not by writing 46 parsers. A county is `researched` when its treasurer page and family are verified, `live` only when an adapter exists.

## Status words

| Status | Meaning here |
| --- | --- |
| live | Adapter plus verified official pages. Lexington only. The sale file is not stored in git. |
| researched | Official page and source family verified. A family adapter may exist. Not a redistributed sale file. |
| unknown | Name, FIPS, and census center only. |
