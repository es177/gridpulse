# Data notes

What each number means and where it can mislead. The UI keeps these to one line per panel; this is the full list.

## EIA-930 (Grid page, Overview)

- Hourly values are MWh per hour, shown as average MW (and GW). Timestamps are hour-ending UTC: a value stamped 03:00 covers 02:00–03:00. Checked against MISO's own five-minute load.
- Demand arrives about 1 hour after the hour. Net generation, interchange and the US48 fuel mix arrive about 22 hours later, so they carry their own timestamps and their chart lines end earlier.
- Day-ahead forecasts (DF) are published 3–6 hours ahead by each balancing area. The Lower 48 forecast is a partial sum of the areas that have reported. It runs 2–5% below demand for settled hours and much lower for the latest ones, so it is neither drawn nor compared for Lower 48.
- CAISO's newest hours in EIA-930 repeat its day-ahead forecast until actuals arrive (typically 3–4 hours). A trailing run where demand equals the forecast exactly is treated as not yet reported, so CAISO's latest hour can lag the others. The Lower 48 total still includes those hours, a difference well under 0.5%.
- Total interchange is positive for net exports; net imports are shown as its negative.
- Lower 48 overlaps the seven ISO regions. Never add them together.
- Fuel mix keeps only hours where nuclear, gas, coal, wind, solar and hydro are all reported. Oil, geothermal and biomass are shown as Other. Storage charging is not stacked.
- Requests use `EIA_API_KEY` or `DEMO_KEY` against API v2. v2 answers a repeated query in under a second, but a new one can take a minute. So if v2 fails or has not answered within a second, the same series are also requested from EIA's keyless Grid Monitor endpoints (10–25 s), and retail prices from Electric Power Monthly table 5.6.A; the first valid answer is used.

## Grid operator feeds (Live ISOs)

| Operator | Load means | Mix history | Net imports in mix | Price |
|---|---|---|---|---|
| CAISO | Current demand | Today, 5 min | Yes | — |
| ERCOT | System demand (actuals only) | Today | No | Hub average, RT 15-min |
| SPP | Actual load | ~2 hours | No | — |
| MISO | Total load, 5 min | Latest only | Yes | — |
| NYISO | Sum of 11 zone loads | Today | No | — |
| ISO-NE | Metered system load, excludes behind-the-meter solar | Today | Yes | — |

- Operators report every 5 minutes; the latest reading is shown as is, and charts downsample the day to 15-minute points over the operator's local operating day.
- MISO's operating day follows Eastern Standard Time all year.
- Mix totals can differ from load because of imports, losses and what each operator includes.
- For NYISO and ISO-NE the generation mix can be one 5-minute interval older than the load shown.
- PJM's real-time data needs a registered key, so PJM appears only in the hourly EIA data.

## NRC (Reactors)

- Percent power from the daily power reactor status report. Every calendar day has a report, weekends and holidays included, but reports are posted on business days, so early on a Monday the latest can still be Friday's.
- Status: full ≥ 95%, reduced 1–94%, offline 0%. "Since" scans back through the history; when it equals the first date in the file it means "at least since".
- Estimated output = reported percent × nameplate MWe (EIA-860M, in `api/data/reactors.json`). Actual net output differs with season and plant conditions.
- Coordinates, licensed MWt and MWe are reference data joined by NRC docket number.
- Event notification reports are summarized from structured fields and the narrative's one-line all-caps subject heading. The rest of the narrative, which names individuals, is not republished.
- NRC's bot filter rejects browser-like user agents; requests identify themselves as GridPulse with the HTTP library's own token.

## Feeds

Publishers, each item linking to the original:

- Regulators and agencies: NRC News, NRC event reports (reactor events, scrams and emergencies only), DOE Office of Nuclear Energy, DOE Newsroom, NERC News, EIA Today in Energy and EIA Press Releases.
- Grid operators: PJM Inside Lines, MISO News, MISO real-time notifications, CAISO emergency notices and ERCOT grid conditions.
- Trade press: World Nuclear News, milestones only (grid connection, criticality, construction, licensing, restarts, closures, major orders and funding).

A story is listed only if its headline matches one of six topics (nuclear, reliability, demand, markets, generation, storage), counting the topic some publishers imply (nuclear for NRC, DOE nuclear and World Nuclear News; reliability for NERC and operator notices), and is at most 45 days old. Housekeeping, events, promotions, awards, staff news and opinion are dropped for every publisher, plus a short per-publisher list. MISO notifications keep only Maximum Generation, Energy Emergency and Capacity Advisory declarations, and CAISO drops routine maintenance restrictions and system tests. Tags come from a keyword tagger and do not assert that a policy is enacted or a project built.

- No CAISO or ERCOT items is the normal state: they appear only during emergencies. ERCOT's dashboard shows only the current condition, so an alert (conservation notice or appeal, or Energy Emergency Alert) becomes one item per state and Central day, stamped with the dashboard's last update, and stays listed after conditions return to normal.
- MISO labels notification times as UTC, but they are Eastern Standard Time all year and are converted as such. CAISO's notice times carry no zone and are read as Pacific time.
- NRC News comes from NRC's yearly release listing, which has dates only, so releases are stamped at midnight Eastern.
- EIA's feeds label times "EST" all year, so in summer an EIA item's time of day can be an hour off; the date is right.
- Publishers are fetched in parallel, each with its own timeout of 20 s or less inside a 25 s budget. A publisher that fails is named in the feed and its earlier items are kept.

## Prices

Average revenue per kWh sold, by state and sector, for one month that every state reported. This is not a tariff, a contract price or a wholesale price.

## World

World Nuclear Association table: reactors operable, under construction, planned and proposed, and yearly uranium requirements. Operable includes units not currently generating. Operable capacity is net MWe; construction, planned and proposed are gross. Generation and share are net output, mainly from IAEA PRIS. Taiwan appears only in the world total.

Country comparisons add yearly electricity by source from Our World in Data's energy dataset, built from Ember and the Energy Institute (CC BY 4.0). Many countries report gross generation there, so nuclear TWh and share can differ from the WNA figures by a few percent for the same year; the comparison labels each row with its source. Some countries lag a year or more, and the comparison uses the latest year every selected country has. Missing values stay blank.

## Reference figures

The Grid page shows three dated figures copied from reports (Berkeley Lab data-center scenarios, PJM 2028/29 capacity auction) in `frontend/src/data/reference.json`. They are labeled "static" and change only when a new report is published and the file is edited.
