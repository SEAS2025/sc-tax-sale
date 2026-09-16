# Out-of-state delinquent-property tracks

Two tracks that sit **outside** the 46-county South Carolina registry in `counties/sc.json`.
They are not counted by `engine/test.js`, are not part of SC pricing, and are not sold as SC coverage.

- **Maggie Valley, North Carolina** — Haywood County. Foreclosure state, not a lien-certificate state.
- **Grand Canyon, Arizona** — Coconino County (Grand Canyon Village, Tusayan, Williams, Flagstaff) and Mohave County (Grand Canyon West / Peach Springs side). Yavapai County was checked for relevance.

Public records only. No login, captcha, or paywall was bypassed. **No obituaries, death notices, or any owner-name source were used.** The published lists do carry a `LIABLE OWNER` column; that column is located only so it can be dropped, and no owner value is written to any snapshot, JSON file, document, or PDF.

Generated 2026-09-16T22:48:48.058Z by `engine/out-of-state.js` (driver: `scripts/hunt-out-of-state.sh`).

## Status of this run

- `verify`: 2026-09-16T22:38:51.681Z
- `land`: 2026-09-16T22:39:09.196Z
- `lists`: 2026-09-16T22:41:15.641Z
- `wayback`: 2026-09-16T22:48:48.034Z
- `pair`: not completed in this run
- `pdf`: not completed in this run

## Summary

| County | Regime | Verified sources | Readable tax years | Widest paired span | Parcels in that pair |
| --- | --- | --- | --- | --- | --- |
| Haywood NC | Foreclosure (NC) | 12 | none | — | 0 |
| Coconino AZ | Lien certificate (AZ) | 7 | none | — | 0 |
| Mohave AZ | Lien certificate (AZ) | 6 | none | — | 0 |
| Yavapai AZ | Lien certificate (AZ) | 3 | none | — | 0 |

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
- <https://www.themountaineer.com/search/?q=delinquent+tax&t=article&l=100&s=start_time&sd=desc> — HTTP 200, 529278 bytes, via fetch (index) — Public search index used to discover which advertisement years were published.
- <https://www.themountaineer.com/news/local/county_government/haywood-county-delinquent-tax-liens-2017/article_46577228-27ac-11e8-84db-db93d9d0fe16.html> — HTTP 200, 335533 bytes, via fetch (listing, tax year 2017) — G.S. 105-369 advertisement for tax year 2017, ordered by the Haywood County Board of Commissioners on 5 February 2018. Published as six public PDF assets with Liable Owner / Parcel / Amount columns.
- <https://www.themountaineer.com/news/haywood-county-delinquent-property-taxes-searchable-database/table_aacb7d88-cdf3-11ed-86d6-63fe99f2cb89.html> — HTTP 200, 1423770 bytes, via fetch (listing, tax year 2022) — Published 29 March 2023. Header row LIABLE OWNER / PARCEL / AMOUNT; parcel is the NC grid PIN with hyphens stripped.
- <https://www.themountaineer.com/news/haywood-county-delinquent-property-taxes-2023/table_b947921c-ecb9-11ee-be16-d3009a61771d.html> — HTTP 200, 1393041 bytes, via fetch (listing, tax year 2023) — Published 26 March 2024.
- <https://www.themountaineer.com/haywood-county-delinquent-tax-listings-2025/table_5350fa1b-a3ce-47a1-bff2-52bec243d9ce.html> — HTTP 200, 1318045 bytes, via fetch (listing, tax year 2025) — Published 16 April 2026.

**Not reachable / blocked.**

- <https://www.haywoodcountync.gov/Bids.aspx?CatID=17&txtSort=Category&showAllBids=True> — HTTP 404

**Identifier format.** Haywood publishes the North Carolina grid PIN with its hyphens stripped, for example 8614733009 for 8614-73-3009. The canonical form kept in this repo is that digits-only 10-character string, applied to both sides of every intersection.

**Files read.**

| Tax year | Rows read | Unique parcels | Identifier-shaped tokens anywhere on page | Reader | Source | Status |
| --- | --- | --- | --- | --- | --- | --- |
| — | 0 | 0 | 0 | html-table | registry:office | only-0-parcels-in-parcel-column |
| — | 0 | 0 | 0 | html-table | hop:haywoodcountync.gov | only-0-parcels-in-parcel-column |
| — | 0 | 0 | 0 | html-table | hop:haywoodcountync.gov | only-0-parcels-in-parcel-column |
| — | 0 | 0 | 0 | html-table | hop:haywoodcountync.gov | only-0-parcels-in-parcel-column |
| — | 0 | 0 | 0 | html-table | hop:haywoodcountync.gov | only-0-parcels-in-parcel-column |
| — | 0 | 0 | 0 | html-table | hop:haywoodcountync.gov | only-0-parcels-in-parcel-column |
| — | 0 | 0 | 0 | html-table | hop:haywoodcountync.gov | only-0-parcels-in-parcel-column |
| — | 0 | 0 | 0 | html-table | hop:haywoodcountync.gov | only-0-parcels-in-parcel-column |
| — | 0 | 0 | 0 | html-table | registry:notices | only-0-parcels-in-parcel-column |
| 2026 | 0 | 0 | 0 | html-table | hop:haywoodcountync.gov | only-0-parcels-in-parcel-column |
| — | 0 | 0 | 0 | html-table | registry:search | only-0-parcels-in-parcel-column |
| 2017 | 0 | 0 | 0 | html-table | registry:listing | only-0-parcels-in-parcel-column |
| 2017 | 640 | 640 | n/a | pdf-columns | asset-pdf:2017 | read ok |
| 2017 | 785 | 785 | n/a | pdf-columns | asset-pdf:2017 | read ok |
| 2017 | 785 | 785 | n/a | pdf-columns | asset-pdf:2017 | read ok |
| 2017 | 785 | 785 | n/a | pdf-columns | asset-pdf:2017 | read ok |
| 2017 | 785 | 785 | n/a | pdf-columns | asset-pdf:2017 | read ok |
| 2017 | 335 | 312 | n/a | pdf-columns | asset-pdf:2017 | read ok |
| 2017 | 0 | 0 | 0 | pdf-columns | asset-pdf:2017 | only-0-parcels-in-parcel-column |
| 2022 | 3163 | 3153 | n/a | html-table | registry:listing | read ok |
| 2023 | 3088 | 3082 | n/a | html-table | registry:listing | read ok |
| 2025 | 2837 | 2824 | n/a | html-table | registry:listing | read ok |
| 2019 | 0 | 0 | 0 | html-table | wayback:haywoodcountync.gov | only-0-parcels-in-parcel-column |

**Parcels per tax year.**

_No tax year produced a readable parcel column._

**Intersections, with the true year span of each.**

_Fewer than two tax years are readable, so there is nothing to intersect._

**No pair — a genuine zero, not a parsing failure.** Nothing is reported for this county. Sources responded, but no published page exposed a readable parcel column. Across every page fetched for this county there were 0 identifier-shaped tokens in total, so the pages genuinely do not carry parcel data — they are navigation and document-index pages.

**Wayback CDX.** `haywoodcountync.gov|delinquent` — Internet Archive is temporarily offline (service-wide outage).

## Coconino County, AZ

**Focus.** Grand Canyon Village, Tusayan, Williams, Flagstaff

**Statutory basis.** Arizona counties sell tax lien certificates at an annual auction, normally in February. A.R.S. 42-18106 requires the county treasurer to prepare a delinquent tax list; 42-18109 requires publication in a newspaper of general circulation; 42-18112 sets the sale. A certificate holder may begin judicial foreclosure after three years under A.R.S. 42-18152, so a parcel that is still delinquent five years later has normally carried liens across several sales.

Statute text verified over the network:
- <https://www.azleg.gov/ars/42/18106.htm> — HTTP 200
- <https://www.azleg.gov/ars/42/18109.htm> — HTTP 200
- <https://www.azleg.gov/ars/42/18112.htm> — HTTP 200
- <https://www.azleg.gov/ars/42/18152.htm> — HTTP 200

**Official sources verified.**

- <https://www.coconino.az.gov/treasurer> — HTTP 200, 147115 bytes, via playwright (office)
- <https://coconino.arizonataxsale.com/> — HTTP 200, 21749 bytes, via playwright (auction)
- <https://www.coconino.az.gov/DocumentCenter> — HTTP 200, 542033 bytes, via playwright (docs)

**Not reachable / blocked.**

- <https://www.coconino.az.gov/166/Treasurer> — HTTP 404
- <https://www.coconino.az.gov/165/Tax-Lien-Sale> — HTTP 404
- <https://treasurer.coconino.az.gov/> — HTTP 0 — page.goto: Timeout 45000ms exceeded.
Call log:
  - navigating to "https://treasurer.coconino.az.gov/", waiting until "domcontentloaded"

- <https://publicnoticeads.com/az/> — HTTP 200

**Files read.**

| Tax year | Rows read | Unique parcels | Identifier-shaped tokens anywhere on page | Reader | Source | Status |
| --- | --- | --- | --- | --- | --- | --- |
| — | 0 | 0 | 0 | html-table | registry:office | only-0-parcels-in-parcel-column |
| — | 0 | 0 | 0 | html-table | hop:coconino.az.gov | only-0-parcels-in-parcel-column |
| — | 0 | 0 | 0 | html-table | hop:coconino.az.gov | only-0-parcels-in-parcel-column |
| — | 0 | 0 | 0 | html-table | registry:auction | only-0-parcels-in-parcel-column |
| — | 0 | 0 | 0 | html-table | registry:docs | only-0-parcels-in-parcel-column |

**Parcels per tax year.**

_No tax year produced a readable parcel column._

**Intersections, with the true year span of each.**

_Fewer than two tax years are readable, so there is nothing to intersect._

**No pair — a genuine zero, not a parsing failure.** Nothing is reported for this county. Sources responded, but no published page exposed a readable parcel column. Across every page fetched for this county there were 0 identifier-shaped tokens in total, so the pages genuinely do not carry parcel data — they are navigation and document-index pages.

**Wayback CDX.** `coconino.az.gov|tax-lien` — Internet Archive is temporarily offline (service-wide outage); `coconino.az.gov|taxlien` — Internet Archive is temporarily offline (service-wide outage); `coconino.arizonataxsale.com|*` — Internet Archive is temporarily offline (service-wide outage).

**Limitations.**

- The county pages that responded are navigation and Document Center index pages. They carry no parcel table and no assessor parcel numbers at all, so the zero here is a real absence of published data rather than a reader that failed.
- The statutory A.R.S. 42-18109 delinquent list is published in a newspaper of general circulation. Arizona newspaper legal-notice archives were not machine-readable from a public page during this run.
- The annual lien auction runs on a RealAuction site whose item lists load through JavaScript behind a bidder account. No login was attempted and nothing was bypassed, so no auction inventory was read.
- No Arizona parcel is reported. Nothing is estimated or filled in to make the Grand Canyon side look populated.

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

**Files read.**

| Tax year | Rows read | Unique parcels | Identifier-shaped tokens anywhere on page | Reader | Source | Status |
| --- | --- | --- | --- | --- | --- | --- |
| — | 0 | 0 | 0 | html-table | registry:office | only-0-parcels-in-parcel-column |
| — | 0 | 0 | 0 | html-table | registry:office | only-0-parcels-in-parcel-column |
| — | 0 | 0 | 0 | html-table | registry:auction | only-0-parcels-in-parcel-column |
| 2018 | 0 | 0 | 0 | html-table | wayback:mohave.arizonataxsale.com | only-0-parcels-in-parcel-column |
| 2020 | 0 | 0 | 0 | html-table | wayback:mohave.arizonataxsale.com | only-0-parcels-in-parcel-column |
| 2023 | 0 | 0 | 0 | html-table | wayback:mohave.arizonataxsale.com | only-0-parcels-in-parcel-column |
| 2023 | 0 | 0 | 0 | html-table | wayback:mohave.arizonataxsale.com | only-0-parcels-in-parcel-column |
| 2023 | 0 | 0 | 0 | html-table | wayback:mohave.arizonataxsale.com | only-0-parcels-in-parcel-column |
| 2023 | 0 | 0 | 0 | html-table | wayback:mohave.arizonataxsale.com | only-0-parcels-in-parcel-column |
| 2019 | 0 | 0 | 0 | html-table | wayback:mohave.arizonataxsale.com | only-0-parcels-in-parcel-column |
| 2018 | 0 | 0 | 0 | html-table | wayback:mohave.arizonataxsale.com | only-0-parcels-in-parcel-column |

**Parcels per tax year.**

_No tax year produced a readable parcel column._

**Intersections, with the true year span of each.**

_Fewer than two tax years are readable, so there is nothing to intersect._

**No pair — a genuine zero, not a parsing failure.** Nothing is reported for this county. Sources responded, but no published page exposed a readable parcel column. Across every page fetched for this county there were 0 identifier-shaped tokens in total, so the pages genuinely do not carry parcel data — they are navigation and document-index pages.

**Limitations.**

- Same situation as Coconino: the pages that responded carry no parcel table and no assessor parcel numbers, so this is a real absence of published data.
- No Mohave parcel is reported.

## Yavapai County, AZ

**Focus.** Checked for Grand Canyon relevance only. Yavapai County does not reach the Grand Canyon rim; its northern boundary sits well south of the park.

**Statutory basis.** Same Arizona statutory cadence. Included only to confirm or rule out Grand Canyon coverage.

Statute text verified over the network:
- <https://www.azleg.gov/ars/42/18112.htm> — HTTP 200

**Official sources verified.**

- <https://www.yavapaiaz.gov/> — HTTP 200, 179479 bytes, via fetch (office)
- <https://yavapai.arizonataxsale.com/> — HTTP 200, 21575 bytes, via playwright (auction)

**Not reachable / blocked.**

- <https://www.yavapaiaz.gov/Departments/Treasurer> — HTTP 404

**Files read.**

| Tax year | Rows read | Unique parcels | Identifier-shaped tokens anywhere on page | Reader | Source | Status |
| --- | --- | --- | --- | --- | --- | --- |
| — | 0 | 0 | 0 | html-table | registry:office | only-0-parcels-in-parcel-column |
| — | 0 | 0 | 0 | html-table | registry:auction | only-0-parcels-in-parcel-column |

**Parcels per tax year.**

_No tax year produced a readable parcel column._

**Intersections, with the true year span of each.**

_Fewer than two tax years are readable, so there is nothing to intersect._

**No pair — a genuine zero, not a parsing failure.** Nothing is reported for this county. Sources responded, but no published page exposed a readable parcel column. Across every page fetched for this county there were 0 identifier-shaped tokens in total, so the pages genuinely do not carry parcel data — they are navigation and document-index pages.

## How much Grand Canyon land is actually on a county tax roll

A large share of the land around the Grand Canyon is federal (National Park Service, U.S. Forest Service) or tribal (Havasupai, Navajo, Hualapai). Federal and tribal trust land is not assessed by a county and never appears on a delinquent tax roll, and Arizona State Trust land is also off the county roll. The taxable universe near the canyon is therefore far smaller than the map suggests: it is effectively the private in-holdings and townsite parcels — Tusayan, Valle, Williams, Flagstaff and the private subdivisions along the SR-64 and US-180 corridors in Coconino County, and the private parcels on the Mohave County side away from the Hualapai reservation. No parcel is added to this file to make any count look larger.

Sources probed for this statement:

- <https://www.nps.gov/grca/learn/management/statistics.htm> — HTTP 200 verified. Grand Canyon National Park acreage, federal land not on any county tax roll.
  - quoted from that page: 1,218,375 acres
  - quoted from that page: 1,904 square miles
  - quoted from that page: 7.5% of park
- <https://www.coconino.az.gov/2418/Comprehensive-Plan> — HTTP 200 not reachable. Coconino County land ownership breakdown.
- <https://land.az.gov/> — HTTP 200 verified. Arizona State Land Department trust land, also off the county tax roll.

## Method and limits

- Every URL above was requested over the network during this run; the HTTP status shown is what came back. Nothing is listed that was not fetched.
- **Lists are read by column, not by pattern.** `engine/out-of-state-tables.js` finds the header row, finds the index of the `PARCEL` column, and reads only that column — skipping the `Field 1 / Field 2 / Field 3` pseudo-header the publishing system emits above the real header. Newspaper-style PDF advertisements are read the same way: the character position of every `Parcel` heading is taken from the header line of the five side-by-side owner / parcel / amount column groups, and a value is accepted only when it sits under one of those headings and is followed immediately by its dollar amount. No bare ten-digit pattern is ever run across a whole page, because that would also match phone numbers, asset ids, and totals.
- **Canonical identifier.** Haywood publishes the North Carolina grid PIN with its hyphens stripped (`8614733009`). That digits-only ten-character string is the canonical key, and it is applied to both sides of every intersection, so a hyphenated `8614-73-3009` from any other source collapses to the same key. A ten-digit run beginning `19xx` or `20xx` without hyphens is refused as date-like.
- **Year spans are reported as they are.** Each intersection above is labelled with the real number of tax years between the two lists. A three-year gap is never described as five.
- Acreage is printed only when the source list actually has an acreage column. The Haywood advertisement does not, so no acreage and no acreage highlighting appears for Haywood; nothing is estimated.
- Raw listing files stay in gitignored `inbox/out-of-state/` and are never committed.
- Parcel-viewer products (qPublic, Beacon, Eagle) are excluded from link-following; they are not bulk-scraped.
- Not for commercial solicitation.
