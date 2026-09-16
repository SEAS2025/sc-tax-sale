# Out-of-state delinquent-property tracks

Two tracks that sit **outside** the 46-county South Carolina registry in `counties/sc.json`.
They are not counted by `engine/test.js`, are not part of SC pricing, and are not sold as SC coverage.

- **Maggie Valley, North Carolina** — Haywood County. Foreclosure state, not a lien-certificate state.
- **Grand Canyon, Arizona** — Coconino County (Grand Canyon Village, Tusayan, Williams, Flagstaff) and Mohave County (Grand Canyon West / Peach Springs side). Yavapai County was checked for relevance.

Public records only. No login, captcha, or paywall was bypassed. **No obituaries, death notices, or any owner-name source were used.** Parcel identifiers and amounts only — owner names are never stored or published.

Generated 2026-09-16T21:19:27.207Z by `engine/out-of-state.js` (driver: `scripts/hunt-out-of-state.sh`).
Recent window 2026/2025/2024 · historic window 2020/2021/2022.

## Status of this run

- `verify`: completed 2026-09-16T21:19:11.463Z
- `land`: completed 2026-09-16T21:19:27.204Z
- `lists`: not completed in this run
- `wayback`: not completed in this run
- `pair`: not completed in this run

## Summary

| County | Regime | Verified sources | Lists with identifiers | Years found | Parcels on both windows |
| --- | --- | --- | --- | --- | --- |
| Haywood NC | Foreclosure (NC) | 10 | 0 | none | — |
| Coconino AZ | Lien certificate (AZ) | 7 | 0 | none | — |
| Mohave AZ | Lien certificate (AZ) | 6 | 0 | none | — |
| Yavapai AZ | Lien certificate (AZ) | 3 | 0 | none | — |

## Haywood County, NC

**Focus.** Maggie Valley, Waynesville, Clyde, Canton

**Statutory basis.** North Carolina does not sell tax lien certificates. G.S. 105-369 requires the tax collector to report and advertise tax liens on real property annually; collection ends in a tax foreclosure sale under G.S. 105-374 (mortgage style) or G.S. 105-375 (in rem).

Statute text verified over the network:
- <https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_105/GS_105-369.html> — HTTP 200
- <https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_105/GS_105-374.html> — HTTP 200
- <https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_105/GS_105-375.html> — HTTP 200

**Official sources verified.**
- <https://www.haywoodcountync.gov/274/Tax-Collections> — HTTP 200, 130030 bytes, via fetch (office)
- <https://www.haywoodcountync.gov/337/Tax-Foreclosures> — HTTP 200, 98830 bytes, via fetch (office)
- <https://www.haywoodcountync.gov/Bids.aspx?CatID=17&txtSort=Category&showAllBids=&Status=open> — HTTP 200, 104568 bytes, via fetch (notices)
- <https://taxes.haywoodcountync.gov/> — HTTP 200, 703 bytes, via fetch (search)
- <https://www.themountaineer.com/news/haywood-county-delinquent-property-taxes-searchable-database/table_aacb7d88-cdf3-11ed-86d6-63fe99f2cb89.html> — HTTP 200, 1423770 bytes, via fetch (listing)
- <https://www.themountaineer.com/news/haywood-county-delinquent-property-taxes-2023/table_b947921c-ecb9-11ee-be16-d3009a61771d.html> — HTTP 200, 1393041 bytes, via fetch (listing)
- <https://www.themountaineer.com/haywood-county-delinquent-tax-listings-2025/table_5350fa1b-a3ce-47a1-bff2-52bec243d9ce.html> — HTTP 200, 1412715 bytes, via playwright (listing)

**Not reachable / blocked.**
- <https://www.haywoodcountync.gov/Bids.aspx?CatID=17&txtSort=Category&showAllBids=True> — HTTP 404

**Lists retrieved.**

_No list responded._

**Identifier format observed in the retrieved text.** _No list text was retrieved, so no identifier format was observed._

**Pairing a recent list against a ~5-year-earlier list.**

- Pairing has not run yet.

## Coconino County, AZ

**Focus.** Grand Canyon Village, Tusayan, Williams, Flagstaff

**Statutory basis.** Arizona counties sell tax lien certificates at an annual auction, normally in February. A.R.S. 42-18106 requires the county treasurer to prepare a delinquent tax list; 42-18109 requires publication in a newspaper of general circulation; 42-18112 sets the sale. A certificate holder may begin judicial foreclosure after three years under A.R.S. 42-18152, so a parcel that is still delinquent five years later has normally carried liens across several sales.

Statute text verified over the network:
- <https://www.azleg.gov/ars/42/18106.htm> — HTTP 200
- <https://www.azleg.gov/ars/42/18109.htm> — HTTP 200
- <https://www.azleg.gov/ars/42/18112.htm> — HTTP 200
- <https://www.azleg.gov/ars/42/18152.htm> — HTTP 200

**Official sources verified.**
- <https://www.coconino.az.gov/treasurer> — HTTP 200, 147117 bytes, via playwright (office)
- <https://coconino.arizonataxsale.com/> — HTTP 200, 21749 bytes, via playwright (auction)
- <https://www.coconino.az.gov/DocumentCenter> — HTTP 200, 542147 bytes, via playwright (docs)

**Not reachable / blocked.**
- <https://www.coconino.az.gov/166/Treasurer> — HTTP 404
- <https://www.coconino.az.gov/165/Tax-Lien-Sale> — HTTP 404
- <https://treasurer.coconino.az.gov/> — HTTP 0 — page.goto: Timeout 45000ms exceeded.
Call log:
  - navigating to "https://treasurer.coconino.az.gov/", waiting until "domcontentloaded"

- <https://publicnoticeads.com/az/> — HTTP 200

**Lists retrieved.**

_No list responded._

**Identifier format observed in the retrieved text.** _No list text was retrieved, so no identifier format was observed._

**Pairing a recent list against a ~5-year-earlier list.**

- Pairing has not run yet.

## Mohave County, AZ

**Focus.** Grand Canyon West / Peach Springs side, Kingman, Lake Havasu

**Statutory basis.** Same Arizona statutory cadence as Coconino: annual February tax lien certificate auction under A.R.S. Title 42, Chapter 18, with the delinquent list published in a newspaper of general circulation.

Statute text verified over the network:
- <https://www.azleg.gov/ars/42/18106.htm> — HTTP 200
- <https://www.azleg.gov/ars/42/18109.htm> — HTTP 200
- <https://www.azleg.gov/ars/42/18112.htm> — HTTP 200

**Official sources verified.**
- <https://www.mohave.gov/> — HTTP 200, 125396 bytes, via fetch (office)
- <https://www.mohavecounty.us/ContentPage.aspx?id=95&cid=444> — HTTP 200, 88212 bytes, via playwright (office)
- <https://mohave.arizonataxsale.com/> — HTTP 200, 21739 bytes, via playwright (auction)

**Not reachable / blocked.**
- <https://www.mohave.gov/ContentPage.aspx?id=95&cid=444> — HTTP 404
- <https://publicnoticeads.com/az/> — HTTP 200

**Lists retrieved.**

_No list responded._

**Identifier format observed in the retrieved text.** _No list text was retrieved, so no identifier format was observed._

**Pairing a recent list against a ~5-year-earlier list.**

- Pairing has not run yet.

## Yavapai County, AZ

**Focus.** Checked for Grand Canyon relevance only. Yavapai County does not reach the Grand Canyon rim; its northern boundary sits well south of the park.

**Statutory basis.** Same Arizona statutory cadence. Included only to confirm or rule out Grand Canyon coverage.

Statute text verified over the network:
- <https://www.azleg.gov/ars/42/18112.htm> — HTTP 200

**Official sources verified.**
- <https://www.yavapaiaz.gov/> — HTTP 200, 179479 bytes, via fetch (office)
- <https://yavapai.arizonataxsale.com/> — HTTP 200, 21576 bytes, via playwright (auction)

**Not reachable / blocked.**
- <https://www.yavapaiaz.gov/Departments/Treasurer> — HTTP 404

**Lists retrieved.**

_No list responded._

**Identifier format observed in the retrieved text.** _No list text was retrieved, so no identifier format was observed._

**Pairing a recent list against a ~5-year-earlier list.**

- Pairing has not run yet.

## How much Grand Canyon land is actually on a county tax roll

A large share of the land around the Grand Canyon is federal (National Park Service, U.S. Forest Service) or tribal (Havasupai, Navajo, Hualapai). Federal and tribal trust land is not assessed by a county and never appears on a delinquent tax roll, and Arizona State Trust land is also off the county roll. The taxable universe near the canyon is therefore far smaller than the map suggests: it is effectively the private in-holdings and townsite parcels — Tusayan, Valle, Williams, Flagstaff and the private subdivisions along the SR-64 and US-180 corridors in Coconino County, and the private parcels on the Mohave County side away from the Hualapai reservation. No parcel is added to this file to make the count look larger.

Sources probed for this statement:

- <https://www.nps.gov/grca/learn/management/statistics.htm> — HTTP 200 verified. Grand Canyon National Park acreage, federal land not on any county tax roll.
  - quoted from that page: 1,218,375 acres
  - quoted from that page: 1,904 square miles
  - quoted from that page: 7.5% of park
- <https://www.coconino.az.gov/2418/Comprehensive-Plan> — HTTP 200 not reachable. Coconino County land ownership breakdown.
- <https://land.az.gov/> — HTTP 200 verified. Arizona State Land Department trust land, also off the county tax roll.

## Method and limits

- Every URL above was requested over the network during this run; the HTTP status shown is what came back. Nothing is listed that was not fetched.
- Identifier extraction reuses the repo's approach (`engine/extract-ids.js`) through `engine/out-of-state-ids.js`, which adds the Arizona assessor parcel number shape (`NNN-NN-NNN`, optional letter or split decimal) and the North Carolina grid PIN shape (`NNNN-NN-NNNN`). The Arizona shape overlaps an existing South Carolina pattern, so it is kept in a separate module and the SC pattern table is unchanged.
- Acreage and other specs reuse `engine/specs.js`. A blank acres cell means the official list did not print acreage; nothing is estimated.
- Pairing reuses the intersect logic from `engine/repeat.js`: a parcel counts only if the same identifier appears on a list in the recent window and on a list in the historic window.
- Raw listing files stay in gitignored `inbox/out-of-state/` and are never committed.
- Parcel-viewer products (qPublic, Beacon, Eagle) are excluded from link-following; they are not bulk-scraped.
- Not for commercial solicitation.
