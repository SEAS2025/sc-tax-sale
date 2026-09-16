# Engine

The engine is parameterized by `counties/sc.json`. A county without an `adapter` cannot be parsed. That is intentional.

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

`parse-csv` prints counts and totals only. It does not print owner names. Do not commit treasurer CSVs or PDFs. `out/` is gitignored.

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
| researched | Official pages and a local parser. Beaufort only. Not a live feed. |
| unknown | Name, FIPS, and census center only. |
