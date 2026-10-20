"""Source registry: what to fetch, how often, and when data counts as stale."""
from __future__ import annotations

from . import eia, feeds, iso, nrc, owid, wna
from .common import Source

MIN, HOUR, DAY = 60, 3600, 86400

# Exact upstream addresses, from the constants the fetchers use. {braces} mark parts filled at fetch time.
ISO_READS = {
    'caiso': ('CSV files', (iso.CAISO_DEMAND, iso.CAISO_FUEL)),
    'ercot': ('Dashboard JSON', (iso.ERCOT_DEMAND, iso.ERCOT_FUEL, iso.ERCOT_PRICES)),
    'spp': ('Chart JSON', (iso.SPP_LOAD, iso.SPP_MIX)),
    'miso': ('Public API JSON', (iso.MISO_LOAD, iso.MISO_MIX)),
    'nyiso': ('Daily CSV files', (iso.NYISO_LOAD.format(day='{yyyymmdd}'), iso.NYISO_MIX.format(day='{yyyymmdd}'))),
    'isone': ('Web service JSON, form POST', (iso.ISONE_WS,)),
}

SOURCES = {
    'eia_grid': Source('eia_grid', eia.fetch_grid, ttl=10 * MIN, stale_after=4 * HOUR,
                       label='EIA-930 hourly demand',
                       url='https://www.eia.gov/electricity/gridmonitor/',
                       cadence='Hourly, about 1–2 h behind', timeout=25,
                       method='EIA API v2 JSON; keyless Grid Monitor JSON in parallel when v2 is slow',
                       endpoints=(eia.V2 + 'rto/region-data/data/', eia.API930 + 'region_data/series_data')),
    'eia_fuel': Source('eia_fuel', eia.fetch_fuel, ttl=30 * MIN, stale_after=36 * HOUR,
                       label='EIA-930 US48 generation by fuel',
                       url='https://www.eia.gov/electricity/gridmonitor/',
                       cadence='Hourly, published about 1 day behind', timeout=25,
                       method='EIA API v2 JSON; keyless Grid Monitor JSON in parallel when v2 is slow',
                       endpoints=(eia.V2 + 'rto/fuel-type-data/data/', eia.API930 + 'region_data_by_fuel_type/series_data')),
    'eia_prices': Source('eia_prices', eia.fetch_prices, ttl=12 * HOUR, stale_after=120 * DAY,
                         label='EIA retail electricity prices',
                         url='https://www.eia.gov/electricity/data/browser/',
                         cadence='Monthly, about 2–3 months behind', timeout=25,
                         resolution='month', method='EIA API v2 JSON; Electric Power Monthly table 5.6.A as fallback',
                         endpoints=(eia.V2 + 'retail-sales/data/', eia.PRICE_TABLE)),
    **{f'iso_{key}': Source(f'iso_{key}', fetch, ttl=2 * MIN, stale_after=30 * MIN,
                            label=iso.META[key]['label'], url=iso.META[key]['url'],
                            cadence=iso.META[key]['cadence'], timeout=15,
                            method=ISO_READS[key][0], endpoints=ISO_READS[key][1])
       for key, fetch in iso.ISOS.items()},
    'nrc_status': Source('nrc_status', nrc.fetch_status, ttl=30 * MIN, stale_after=5 * DAY,
                         label='NRC power reactor status',
                         url='https://www.nrc.gov/documents-reports/document-collections/events-reports-associated-with/power-reactor-status-reports',
                         cadence='Each business day', resolution='day',
                         method='Text file, last 365 days', endpoints=(nrc.STATUS_URL,)),
    'nrc_directory': Source('nrc_directory', nrc.fetch_directory, ttl=DAY, stale_after=45 * DAY,
                            label='NRC operating reactor list',
                            url=nrc.DIRECTORY_URL,
                            cadence='As licensed units change', method='HTML table',
                            endpoints=(nrc.DIRECTORY_URL,)),
    'nrc_events': Source('nrc_events', nrc.fetch_events, ttl=30 * MIN, stale_after=14 * DAY,
                         label='NRC event notification reports',
                         url=nrc.EVENTS_URL,
                         cadence='When events are reported', method='HTML pages, one per report day',
                         endpoints=(nrc.EVENTS_URL + '/{year}',)),
    'feeds': Source('feeds', feeds.fetch_feeds, ttl=15 * MIN, stale_after=4 * DAY,
                    label='News and operator feeds', url='',
                    cadence='As published', timeout=25, carry=feeds.carry_forward,
                    method=f'RSS, JSON and HTML listings from {len(feeds.FEEDS)} publishers',
                    endpoints=tuple(f.url for f in feeds.FEEDS)),
    'wna': Source('wna', wna.fetch_world, ttl=DAY, stale_after=60 * DAY,
                  label='World Nuclear Association fleet table',
                  url='https://world-nuclear.org/information-library/facts-and-figures/world-nuclear-power-reactors-and-uranium-requireme',
                  cadence='Monthly', resolution='day', method='HTML table', endpoints=(wna.URL,)),
    'owid': Source('owid', owid.fetch_mix, ttl=DAY, stale_after=550 * DAY,  # a year's data lands 4-6 months after it ends
                   label='Ember and Energy Institute via Our World in Data',
                   url='https://ourworldindata.org/electricity-mix',
                   cadence='Yearly', timeout=20, resolution='year', method='CSV file',
                   endpoints=(owid.URL,)),
}

ISO_KEYS = [f'iso_{key}' for key in iso.ISOS]
