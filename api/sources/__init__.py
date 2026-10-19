"""Source registry: what to fetch, how often, and when data counts as stale."""
from __future__ import annotations

from . import eia, feeds, iso, nrc, wna
from .common import Source

MIN, HOUR, DAY = 60, 3600, 86400

SOURCES = {
    'eia_grid': Source('eia_grid', eia.fetch_grid, ttl=10 * MIN, stale_after=4 * HOUR,
                       label='EIA-930 hourly demand',
                       url='https://www.eia.gov/electricity/gridmonitor/',
                       cadence='Hourly, about 1–2 h behind', timeout=25),
    'eia_fuel': Source('eia_fuel', eia.fetch_fuel, ttl=30 * MIN, stale_after=36 * HOUR,
                       label='EIA-930 US48 generation by fuel',
                       url='https://www.eia.gov/electricity/gridmonitor/',
                       cadence='Hourly, published about 1 day behind', timeout=25),
    'eia_prices': Source('eia_prices', eia.fetch_prices, ttl=12 * HOUR, stale_after=120 * DAY,
                         label='EIA retail electricity prices',
                         url='https://www.eia.gov/electricity/data/browser/',
                         cadence='Monthly, about 2–3 months behind', timeout=25,
                         resolution='month'),
    **{f'iso_{key}': Source(f'iso_{key}', fetch, ttl=2 * MIN, stale_after=30 * MIN,
                            label=iso.META[key]['label'], url=iso.META[key]['url'],
                            cadence=iso.META[key]['cadence'], timeout=15)
       for key, fetch in iso.ISOS.items()},
    'nrc_status': Source('nrc_status', nrc.fetch_status, ttl=30 * MIN, stale_after=5 * DAY,
                         label='NRC power reactor status',
                         url='https://www.nrc.gov/reading-rm/doc-collections/event-status/reactor-status/',
                         cadence='Each business day', resolution='day'),
    'nrc_directory': Source('nrc_directory', nrc.fetch_directory, ttl=DAY, stale_after=45 * DAY,
                            label='NRC operating reactor list',
                            url='https://www.nrc.gov/reactors/operating/list-power-reactor-units',
                            cadence='As licensed units change'),
    'nrc_events': Source('nrc_events', nrc.fetch_events, ttl=30 * MIN, stale_after=14 * DAY,
                         label='NRC event notification reports',
                         url='https://www.nrc.gov/reading-rm/doc-collections/event-status/event/',
                         cadence='When events are reported'),
    'feeds': Source('feeds', feeds.fetch_feeds, ttl=15 * MIN, stale_after=4 * DAY,
                    label='News and operator feeds',
                    url='https://www.world-nuclear-news.org/',
                    cadence='As published', timeout=25, carry=feeds.carry_forward),
    'wna': Source('wna', wna.fetch_world, ttl=DAY, stale_after=60 * DAY,
                  label='World Nuclear Association fleet table',
                  url='https://world-nuclear.org/information-library/facts-and-figures/world-nuclear-power-reactors-and-uranium-requireme',
                  cadence='Monthly', resolution='day'),
}

ISO_KEYS = [f'iso_{key}' for key in iso.ISOS]
