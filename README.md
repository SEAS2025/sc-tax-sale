# SC Tax Sale Atlas

South Carolina delinquent tax sale analysis for all 46 counties. Southeast Aerial Systems.

All 46 counties are live with a family adapter. The daily scanner watches official pages and, after each promised ad or list date, keeps that county in a seven-day catch window so a late posting is still seen. It rebuilds one statewide 5-year file: parcel IDs that appear on the newest hosted list and on a list from about five years earlier. Haywood County, North Carolina is an out-of-state extra and is not part of SC pricing. Sale-cycle PDFs stay local; owner names are not stored.

This is public-record research, not legal advice.

## Pricing

No checkout on the site. Write [southeastaerialsystems@gmail.com](mailto:southeastaerialsystems@gmail.com).

| Offer | Price |
| --- | --- |
| County pack | $79 / sale cycle |
| Inquiry add-on | $49 |
| Statewide season | $490 |
| Annual | $1,490 |

## Layout

- `site/` — static marketing site. Cloudflare Pages build output.
- `counties/sc.json` — 46-county registry. Census FIPS. Every county live with a family adapter.
- `engine/` — Lexington TMS, Beaufort PIN, and the five family adapters.
- `docs/COVERAGE.md` — how to cover all 46 counties by source family, not 46 parsers.
- `docs/SOURCES.md` — what was verified, and what was not.

The original analysis app was a Base44 React project. This repo does not publish that UI, its auth, or owner-level CSVs.

## Use

```bash
npm test
node engine/cli.js counties
node engine/cli.js geocode 000600-06-119
node engine/cli.js scan --write
node engine/cli.js repeat --write
node engine/cli.js repeat --xlsx
node engine/cli.js repeat --pdf
```

`scan` refreshes the 2026 ad calendar (`site/data/ads.json`) and rebuilds the statewide 5-year file (`site/data/repeat.json`) unless you pass `--ads-only`. A daily GitHub Action runs the same command against all 46 counties. After a promised ad or list date the county stays **due** for seven days so a late posting is still caught. When a county posts a new list, the next scan downloads it, intersects parcel IDs with the 2020–2022 archive, and updates the file. `--due` limits a manual fetch to that seven-day catch window. `repeat --xlsx` writes the county-organized workbook (identifiers and listing specs, no owner names) to `inbox/repeat/` and `~/Downloads`. `repeat --pdf` prints the same file as a landscape report.

Sale-cycle PDFs stay on your machine. The public file is identifiers and amounts only. See `docs/ENGINE.md`.

## Deploy

`wrangler.toml` sets `pages_build_output_dir = "site"`.

```bash
npx wrangler login
./scripts/deploy-pages.sh
```

If Wrangler is not logged in, the script is still the deploy path. Do not invent a Pages URL.
