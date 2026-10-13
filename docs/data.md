# Data notes

What each number means and where it can mislead. The UI keeps these to one line per panel; this is the full list.

## EIA-930 (Grid page, Overview)

- Hourly values are MWh per hour, shown as average MW (and GW). Timestamps are the UTC hour as reported by EIA.
- Demand arrives about 1 hour after the hour. Net generation, interchange and the US48 fuel mix arrive about 22 hours later, so they carry their own timestamps and their chart lines end earlier.
- Day-ahead forecasts (DF) are published 3–6 hours ahead by each balancing area. The Lower 48 forecast is a partial sum of the areas that have reported. It runs 2–5% below demand for settled hours and much lower for the latest ones, so it is neither drawn nor compared for Lower 48.
- Total interchange is positive for net exports; net imports are shown as its negative.
- Lower 48 overlaps the seven ISO regions. Never add them together.
- Fuel mix keeps only hours where nuclear, gas, coal, wind, solar and hydro are all reported. Oil, geothermal and biomass are shown as Other. Storage charging is not stacked.
- Requests use `EIA_API_KEY` or `DEMO_KEY` against API v2. If v2 fails or is rate-limited, the same series come from EIA's keyless Grid Monitor endpoints (about 11 s), and retail prices from Electric Power Monthly table 5.6.A.

## Grid operator feeds (Live ISOs)

| Operator | Load means | Mix history | Net imports in mix | Price |
|---|---|---|---|---|
| CAISO | Current demand | Today, 5 min | Yes | — |
| ERCOT | System demand (actuals only) | Today | No | Hub average, RT 15-min |
| SPP | Actual load | ~2 hours | No | — |
| MISO | Total load, 5 min | Latest only | Yes | — |
| NYISO | Sum of 11 zone loads | Today | No | — |
| ISO-NE | Metered system load, excludes behind-the-meter solar | Today | Yes | — |

- Series are downsampled to 15-minute points over the operator's local operating day.
- MISO's operating day follows Eastern Standard Time all year.
- Mix totals can differ from load because of imports, losses and what each operator includes.
- PJM's real-time data needs a registered key, so PJM appears only in the hourly EIA data.

## NRC (Reactors)

- Percent power from the daily power reactor status report, published each business day for that morning. Weekends and federal holidays have no report.
- Status: full ≥ 95%, reduced 1–94%, offline 0%. "Since" scans back through the history; when it equals the first date in the file it means "at least since".
- Estimated output = reported percent × nameplate MWe (EIA-860M, in `api/data/reactors.json`). Actual net output differs with season and plant conditions.
- Coordinates, licensed MWt and MWe are reference data joined by NRC docket number.
- Event notification reports are summarized from structured fields only. Narratives, which name individuals, are not republished.
- NRC's bot filter rejects browser-like user agents; requests use an honest client identifier.

## Feeds

World Nuclear News, NRC News, NRC event reports, DOE Office of Nuclear Energy, EIA Today in Energy, PJM Inside Lines and ISO New England. Tags come from a keyword tagger and do not assert that a policy is enacted or a project built. A failing feed is listed and skipped without blocking the others.

## Prices

Average revenue per kWh sold, by state and sector, for one month that every state reported. This is not a tariff, a contract price or a wholesale price.

## World

World Nuclear Association table. Operable includes units not currently generating. Construction, planned and proposed capacity are gross MWe; operable capacity is net. Taiwan appears only in the world total.

## Reference figures

The Grid page shows three dated figures copied from reports (Berkeley Lab data-center scenarios, PJM 2028/29 capacity auction) in `frontend/src/data/reference.json`. They are labeled "Not live" and change only when a new report is published and the file is edited.
