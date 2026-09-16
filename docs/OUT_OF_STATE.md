# Out-of-state delinquent-property tracks

Two tracks that sit **outside** the 46-county South Carolina registry in `counties/sc.json`.
They are not counted by `engine/test.js`, are not part of SC pricing, and are not sold as SC coverage.

- **Maggie Valley, North Carolina** — Haywood County. Foreclosure state, not a lien-certificate state.
- **Grand Canyon, Arizona** — Coconino County (Grand Canyon Village, Tusayan, Williams, Flagstaff) and Mohave County (Grand Canyon West / Peach Springs side). Yavapai County was checked for relevance.

Public records only. No login, captcha, or paywall was bypassed. **No obituaries, death notices, or any owner-name source were used.** Parcel identifiers and amounts only — owner names are never stored or published.

Generated 2026-09-16T21:13:47.018Z by `engine/out-of-state.js` (driver: `scripts/hunt-out-of-state.sh`).
Recent window 2026/2025/2024 · historic window 2020/2021/2022.

## Status of this run

- `verify`: completed 2026-09-16T21:13:47.015Z
- `land`: not completed in this run
- `lists`: not completed in this run
- `wayback`: not completed in this run
- `pair`: not completed in this run

## Summary

| County | Regime | Verified sources | Lists with identifiers | Years found | Parcels on both windows |
| --- | --- | --- | --- | --- | --- |
| Yavapai AZ | Lien certificate (AZ) | 2 | 0 | none | — |

## Yavapai County, AZ

**Focus.** Checked for Grand Canyon relevance only. Yavapai County does not reach the Grand Canyon rim; its northern boundary sits well south of the park.

**Statutory basis.** Same Arizona statutory cadence. Included only to confirm or rule out Grand Canyon coverage.

Statute text verified over the network:
- <https://www.azleg.gov/ars/42/18112.htm> — HTTP 200

**Official sources verified.**
- <https://www.yavapaiaz.gov/> — HTTP 200, 179477 bytes, via fetch (office)

**Not reachable / blocked.**
- <https://www.yavapaiaz.gov/Departments/Treasurer> — HTTP 404
- <https://yavapai.arizonataxsale.com/> — HTTP 403

**Lists retrieved.**

_No list responded._

**Identifier format observed in the retrieved text.** _No list text was retrieved, so no identifier format was observed._

**Pairing a recent list against a ~5-year-earlier list.**

- Pairing has not run yet.

## How much Grand Canyon land is actually on a county tax roll

A large share of the land around the Grand Canyon is federal (National Park Service, U.S. Forest Service) or tribal (Havasupai, Navajo, Hualapai). Federal and tribal trust land is not assessed by a county and never appears on a delinquent tax roll, and Arizona State Trust land is also off the county roll. The taxable universe near the canyon is therefore far smaller than the map suggests: it is effectively the private in-holdings and townsite parcels — Tusayan, Valle, Williams, Flagstaff and the private subdivisions along the SR-64 and US-180 corridors in Coconino County, and the private parcels on the Mohave County side away from the Hualapai reservation. No parcel is added to this file to make the count look larger.

Sources probed for this statement:

_Land-ownership probes have not run yet._

## Method and limits

- Every URL above was requested over the network during this run; the HTTP status shown is what came back. Nothing is listed that was not fetched.
- Identifier extraction reuses the repo's approach (`engine/extract-ids.js`) through `engine/out-of-state-ids.js`, which adds the Arizona assessor parcel number shape (`NNN-NN-NNN`, optional letter or split decimal) and the North Carolina grid PIN shape (`NNNN-NN-NNNN`). The Arizona shape overlaps an existing South Carolina pattern, so it is kept in a separate module and the SC pattern table is unchanged.
- Acreage and other specs reuse `engine/specs.js`. A blank acres cell means the official list did not print acreage; nothing is estimated.
- Pairing reuses the intersect logic from `engine/repeat.js`: a parcel counts only if the same identifier appears on a list in the recent window and on a list in the historic window.
- Raw listing files stay in gitignored `inbox/out-of-state/` and are never committed.
- Parcel-viewer products (qPublic, Beacon, Eagle) are excluded from link-following; they are not bulk-scraped.
- Not for commercial solicitation.
