# SC Tax Sale Atlas

South Carolina delinquent tax sale analysis for all 46 counties. Southeast Aerial Systems.

Lexington is the live county. Beaufort and ten other counties have verified treasurer pages classified into source families (see `docs/COVERAGE.md`). There is no statewide file: cover the other counties with three ingest adapters (`html-table`, `county-pdf`, `xlsx`) plus a page watcher, not 46 PDF parsers. Haywood County, North Carolina is an out-of-state extra and is not part of SC pricing.

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
- `counties/sc.json` — 46-county registry. Census FIPS. Lexington live, Beaufort researched.
- `engine/` — Lexington TMS adapter and Beaufort PIN parsers.
- `docs/COVERAGE.md` — how to cover all 46 counties by source family, not 46 parsers.
- `docs/SOURCES.md` — what was verified, and what was not.

The original analysis app was a Base44 React project. This repo does not publish that UI, its auth, or owner-level CSVs.

## Use

```bash
npm test
node engine/cli.js counties
node engine/cli.js geocode 000600-06-119
```

Sale lists stay on your machine. See `docs/ENGINE.md`.

## Deploy

`wrangler.toml` sets `pages_build_output_dir = "site"`.

```bash
npx wrangler login
./scripts/deploy-pages.sh
```

If Wrangler is not logged in, the script is still the deploy path. Do not invent a Pages URL.
