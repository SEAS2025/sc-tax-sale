# Human handoff queue

When the crawler hits a **login**, **CAPTCHA / Cloudflare challenge**, **password page**, or would need **bulk qPublic/Beacon parcel scraping**, it stops that county and appends a row here. Keep browsing other counties. After you finish an item, write the result in `handoff-inbox.md` and the agent continues.

Do **not** commit owner lists, listing PDFs, or qPublic dumps.

## Waiting on you

Optional only. The last seven unknown counties are classified without these.

| County | Kind | URL | What to do |
| --- | --- | --- | --- |
| Anderson | login | https://acpass.andersoncountysc.org/loginreg3/login.php | ACPASS is a payment portal. Public sale page is enough. Listings promised **30 Sep 2026**. |
| Laurens | subscribe / PDF | https://1543.newstogo.us/editionviewer/default.aspx?Edition=a1d4f6a3-9c80-4cc6-8436-26eab0597187 | Nov 12 2025 *Delinquent Tax Notices*. Download if you want the names. Do not commit the file. |
| Berkeley | HTTP 403 to scanner | https://berkeleycountysc.gov/dept/delinquent-tax-collector/ | Daily `scan` cannot read this page. Human browse already classified it. Re-open if the 2026 ad appears. |
| Chester | HTTP 403 to scanner | https://chestercountysc.gov/departments/tax-and-finance-departments/tax-collector | Same as Berkeley. Ads last three weeks of October. |

## Cleared this session (agent can keep going)

| County | Kind | Result |
| --- | --- | --- |
| Chester | Cloudflare | Challenge passed in a real browser. Treasurer page is public: https://chestercountysc.gov/departments/tax-and-finance-departments/tax-collector/ — ads last 3 weeks of October; sale first Monday of November **or** December. No parcel file on the page. Family: `page-or-newspaper`. |
| Berkeley | Cloudflare | Challenge passed. Official page: https://berkeleycountysc.gov/dept/delinquent-tax-collector/ — ads in the *Post and Courier*; land/mobile-home sales November or December. No county listing file. Family: `page-or-newspaper`. |
| Laurens | bad seed URL | `https://laurenscounty.us/` is hijacked (Cloudflare → rockvilleobgyn.com). Official site is https://laurenscountysc.gov/departments/treasurer/delinquent_taxes.php |

## qPublic / Beacon (do not bulk-scrape)

These are assessor lookups **after** you already have a TMS/PIN. The agent recorded them and moved on. Open one only to look up a specific ID.

- Abbeville — https://qpublic.schneidercorp.com/Application.aspx?AppID=613&LayerID=10508&PageTypeID=2&PageID=4483
- Aiken — https://qpublic.schneidercorp.com/Application.aspx?App=AikenCountySC&PageType=Search
- Chester — https://beacon.schneidercorp.com/
- Colleton — https://qpublic.schneidercorp.com/Application.aspx?AppID=1046&LayerID=23500&PageTypeID=2&PageID=9798
- Darlington — http://www.qpublic.net/sc/darlington/
- Fairfield — https://beacon.schneidercorp.com/Application.aspx?AppID=796&LayerID=11834&PageTypeID=1&PageID=5735
- Georgetown — https://www.qpublic.net/sc/georgetown/
- Jasper — https://qpublic.schneidercorp.com/Application.aspx?AppID=921&LayerID=17896&PageTypeID=1&PageID=7979
- Newberry — https://qpublic.schneidercorp.com/Application.aspx?AppID=868&LayerID=16446&PageTypeID=2&PageID=7247
- Orangeburg — https://qpublic.schneidercorp.com/Application.aspx?App=OrangeburgCountySC&PageType=Search
- Union — http://qpublic.net/sc/union/
- York — https://qpublic.schneidercorp.com/Application.aspx?App=YorkCountySC&Layer=Parcels&PageType=Search
