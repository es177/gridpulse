"""Seed database with enrichment entities, known investments, and reactor data."""

import json
import sys
import os
from datetime import datetime

# Add backend to path for imports
sys.path.insert(0, os.path.dirname(__file__))

from database import (
    EnrichmentEntity,
    Investment,
    PolicyEvent,
    Reactor,
    SessionLocal,
    init_db,
)

ENRICHMENT_ENTITIES = [
    {
        "name": "Centrus Energy",
        "type": "enrichment",
        "stage": "operating",
        "lat": 39.0095,
        "lng": -83.0095,
        "description": "HALEU production at American Centrifuge Plant in Piketon, OH. Only US facility producing HALEU under DOE contract.",
        "doe_funding_usd": 150_000_000,
        "nrc_docket": "70-7004",
        "website": "https://centrusenergy.com",
    },
    {
        "name": "Urenco USA",
        "type": "enrichment",
        "stage": "operating",
        "lat": 32.4487,
        "lng": -103.1855,
        "description": "Only operating commercial uranium enrichment plant in the US, located in Eunice, NM. Gas centrifuge technology.",
        "doe_funding_usd": 0,
        "nrc_docket": "70-7015",
        "website": "https://urencousa.com",
    },
    {
        "name": "Global Laser Enrichment (Silex Systems)",
        "type": "enrichment",
        "stage": "R&D",
        "lat": 37.2296,
        "lng": -76.5572,
        "description": "GE-Hitachi laser enrichment technology (SILEX). Potential for lower-cost enrichment. NRC license granted.",
        "doe_funding_usd": 0,
        "nrc_docket": "70-7016",
        "website": "https://silex.com.au",
    },
    {
        "name": "Oklo Inc",
        "type": "reactor",
        "stage": "licensed",
        "lat": 37.4419,
        "lng": -122.1430,
        "description": "Fast reactor + fuel recycling. Aurora powerhouse microreactor design. Went public via SPAC. NRC application resubmitted.",
        "doe_funding_usd": 0,
        "nrc_docket": "99902046",
        "website": "https://oklo.com",
    },
    {
        "name": "TerraPower",
        "type": "reactor",
        "stage": "construction",
        "lat": 41.7861,
        "lng": -106.3200,
        "description": "Natrium sodium-cooled fast reactor with molten salt energy storage. Under construction in Kemmerer, WY. Founded by Bill Gates.",
        "doe_funding_usd": 2_000_000_000,
        "nrc_docket": "99902000",
        "website": "https://terrapower.com",
    },
    {
        "name": "X-energy",
        "type": "reactor",
        "stage": "licensed",
        "lat": 39.2904,
        "lng": -76.6122,
        "description": "Xe-100 high-temperature gas-cooled reactor (HTGR) using TRISO fuel. DOE ARDP awardee for Dow Chemical site deployment.",
        "doe_funding_usd": 1_200_000_000,
        "nrc_docket": "99902071",
        "website": "https://x-energy.com",
    },
    {
        "name": "Kairos Power",
        "type": "reactor",
        "stage": "construction",
        "lat": 35.9313,
        "lng": -84.3107,
        "description": "Fluoride-salt-cooled high-temperature reactor (KP-FHR). Hermes demonstration reactor under construction in Oak Ridge, TN.",
        "doe_funding_usd": 303_000_000,
        "nrc_docket": "99902097",
        "website": "https://kairospower.com",
    },
    {
        "name": "Commonwealth Fusion Systems",
        "type": "fusion",
        "stage": "construction",
        "lat": 42.4668,
        "lng": -71.2660,
        "description": "SPARC tokamak using high-temperature superconducting magnets. Targeting net energy by late 2020s. $1.8B raised.",
        "doe_funding_usd": 0,
        "nrc_docket": None,
        "website": "https://cfs.energy",
    },
    {
        "name": "NuScale Power",
        "type": "reactor",
        "stage": "licensed",
        "lat": 45.5152,
        "lng": -122.6784,
        "description": "Small Modular Reactor (SMR). First SMR to receive NRC design certification. 77 MWe per module.",
        "doe_funding_usd": 600_000_000,
        "nrc_docket": "99902052",
        "website": "https://nuscalepower.com",
    },
    {
        "name": "Terrestrial Energy",
        "type": "reactor",
        "stage": "R&D",
        "lat": 44.2312,
        "lng": -76.4810,
        "description": "Integral Molten Salt Reactor (IMSR). Canadian company with US NRC pre-application review.",
        "doe_funding_usd": 0,
        "nrc_docket": None,
        "website": "https://terrestrialenergy.com",
    },
    {
        "name": "General Matter",
        "type": "reactor",
        "stage": "R&D",
        "lat": 37.4275,
        "lng": -122.1697,
        "description": "Building compact fusion devices using a novel plasma confinement approach. Palo Alto-based startup focused on commercially viable fusion energy.",
        "doe_funding_usd": 0,
        "nrc_docket": None,
        "website": "https://generalmatter.com",
    },
    {
        "name": "American Centrifuge Plant",
        "type": "enrichment",
        "stage": "operating",
        "lat": 39.0095,
        "lng": -83.0095,
        "description": "DOE-owned facility in Piketon, OH operated by Centrus Energy. Producing HALEU for advanced reactor fuel.",
        "doe_funding_usd": 150_000_000,
        "nrc_docket": "70-7004",
        "website": "https://centrusenergy.com",
    },
]

KNOWN_INVESTMENTS = [
    {
        "company": "Helion Energy",
        "date": "2023-05-10",
        "amount_usd": 500_000_000,
        "round_type": "series_e",
        "investors": ["Sam Altman", "OpenAI"],
        "technology_type": "fusion",
        "summary": "Helion Energy raised $500M led by Sam Altman for fusion energy development, with a PPA signed with Microsoft.",
    },
    {
        "company": "Commonwealth Fusion Systems",
        "date": "2023-12-14",
        "amount_usd": 1_800_000_000,
        "round_type": "series_b",
        "investors": ["Tiger Global", "Google", "Emerson Collective", "Breakthrough Energy"],
        "technology_type": "fusion",
        "summary": "CFS raised $1.8B in Series B to build SPARC tokamak, the largest private fusion investment ever.",
    },
    {
        "company": "TerraPower",
        "date": "2024-08-15",
        "amount_usd": 750_000_000,
        "round_type": "growth",
        "investors": ["SK Group", "Bill Gates"],
        "technology_type": "nuclear",
        "summary": "TerraPower raised $750M to advance Natrium reactor construction in Kemmerer, Wyoming.",
    },
    {
        "company": "NuScale Power",
        "date": "2022-05-01",
        "amount_usd": 380_000_000,
        "round_type": "spac",
        "investors": ["Spring Valley Acquisition Corp"],
        "technology_type": "nuclear",
        "summary": "NuScale went public via SPAC merger, raising $380M for its small modular reactor deployment.",
    },
    {
        "company": "Oklo Inc",
        "date": "2024-05-09",
        "amount_usd": 307_000_000,
        "round_type": "spac",
        "investors": ["AltC Acquisition Corp", "Sam Altman"],
        "technology_type": "nuclear",
        "summary": "Oklo went public via SPAC merger with AltC, raising $307M for fast reactor development.",
    },
    {
        "company": "Fervo Energy",
        "date": "2023-11-28",
        "amount_usd": 244_000_000,
        "round_type": "series_c",
        "investors": ["Devon Energy", "DCVC"],
        "technology_type": "geothermal",
        "summary": "Fervo raised $244M for next-generation enhanced geothermal systems leveraging oil & gas drilling tech.",
    },
    {
        "company": "Koloma",
        "date": "2024-02-13",
        "amount_usd": 245_700_000,
        "round_type": "series_b",
        "investors": ["Breakthrough Energy", "Khosla Ventures", "United Airlines Ventures"],
        "technology_type": "hydrogen",
        "summary": "Koloma raised $245.7M for geologic hydrogen exploration and production technology.",
    },
    {
        "company": "Radiant Nuclear",
        "date": "2023-06-01",
        "amount_usd": 15_000_000,
        "round_type": "series_a",
        "investors": ["Founders Fund", "Kairos Ventures"],
        "technology_type": "nuclear",
        "summary": "Radiant raised $15M for portable microreactor development targeting remote and defense applications.",
    },
    {
        "company": "Last Energy",
        "date": "2023-09-01",
        "amount_usd": 40_000_000,
        "round_type": "series_a",
        "investors": ["Gigafund"],
        "technology_type": "nuclear",
        "summary": "Last Energy raised $40M to deploy standardized PWR microreactors for European industrial customers.",
    },
    {
        "company": "Transmutex",
        "date": "2023-04-01",
        "amount_usd": 20_000_000,
        "round_type": "series_a",
        "investors": ["PULSE Ventures"],
        "technology_type": "nuclear",
        "summary": "Transmutex raised $20M for subcritical transmutation reactor that burns nuclear waste as fuel.",
    },
    {
        "company": "Kairos Power",
        "date": "2023-08-01",
        "amount_usd": 200_000_000,
        "round_type": "growth",
        "investors": ["unnamed investors"],
        "technology_type": "nuclear",
        "summary": "Kairos Power raised $200M bringing total to over $600M for Hermes demonstration reactor construction.",
    },
    {
        "company": "X-energy",
        "date": "2023-01-01",
        "amount_usd": 80_000_000,
        "round_type": "series_c",
        "investors": ["Ares Management", "Dow Inc"],
        "technology_type": "nuclear",
        "summary": "X-energy raised $80M to advance Xe-100 HTGR deployment at Dow Chemical's Seadrift, TX facility.",
    },
]

SEED_POLICY_EVENTS = [
    {
        "title": "Inflation Reduction Act Nuclear Production Tax Credits Take Effect",
        "date": "2024-01-01",
        "source_url": "https://www.energy.gov/ne/inflation-reduction-act",
        "event_type": "legislation",
        "entities": ["DOE", "IRS"],
        "dollar_amount": 30_000_000_000,
        "sentiment": "positive",
        "summary": "IRA nuclear PTCs providing up to $15/MWh for existing nuclear plants and investment credits for new builds take effect.",
    },
    {
        "title": "NRC Certifies NuScale SMR Design",
        "date": "2023-01-19",
        "source_url": "https://www.nrc.gov/",
        "event_type": "regulatory",
        "entities": ["NRC", "NuScale Power"],
        "dollar_amount": None,
        "sentiment": "positive",
        "summary": "NRC issues first-ever design certification for a small modular reactor, NuScale's 50 MWe VOYGR module.",
    },
    {
        "title": "DOE Selects TerraPower and X-energy for ARDP Awards",
        "date": "2022-10-01",
        "source_url": "https://www.energy.gov/ne/advanced-reactor-demonstration-program",
        "event_type": "funding_announcement",
        "entities": ["DOE", "TerraPower", "X-energy"],
        "dollar_amount": 3_200_000_000,
        "sentiment": "positive",
        "summary": "DOE awards $3.2B combined to TerraPower Natrium and X-energy Xe-100 under the Advanced Reactor Demonstration Program.",
    },
    {
        "title": "ADVANCE Act Signed Into Law",
        "date": "2024-07-09",
        "source_url": "https://www.congress.gov/",
        "event_type": "legislation",
        "entities": ["NRC", "Congress"],
        "dollar_amount": None,
        "sentiment": "positive",
        "summary": "Bipartisan ADVANCE Act reforms NRC licensing framework, reducing timelines and fees for advanced nuclear technologies.",
    },
    {
        "title": "FERC Order 2023 Interconnection Reform",
        "date": "2023-07-28",
        "source_url": "https://www.ferc.gov/",
        "event_type": "regulatory",
        "entities": ["FERC"],
        "dollar_amount": None,
        "sentiment": "positive",
        "summary": "FERC finalizes landmark interconnection queue reform to reduce delays for clean energy projects connecting to the grid.",
    },
    {
        "title": "US Bans Russian Enriched Uranium Imports",
        "date": "2024-05-13",
        "source_url": "https://www.congress.gov/",
        "event_type": "legislation",
        "entities": ["DOE", "Centrus Energy", "Urenco USA"],
        "dollar_amount": 2_700_000_000,
        "sentiment": "positive",
        "summary": "Congress bans Russian LEU imports with $2.7B DOE funding to expand domestic enrichment capacity.",
    },
]

# Reactor data with coordinates for map display
REACTOR_DATA = [
    ("Beaver Valley 1", "1", "50-334", "PA", 40.6217, -80.4339, 2900, "PWR", "Energy Harbor"),
    ("Beaver Valley 2", "2", "50-412", "PA", 40.6217, -80.4339, 2900, "PWR", "Energy Harbor"),
    ("Braidwood 1", "1", "50-456", "IL", 41.2406, -88.2281, 3586, "PWR", "Constellation Energy"),
    ("Braidwood 2", "2", "50-457", "IL", 41.2406, -88.2281, 3586, "PWR", "Constellation Energy"),
    ("Byron 1", "1", "50-454", "IL", 42.0758, -89.2817, 3586, "PWR", "Constellation Energy"),
    ("Byron 2", "2", "50-455", "IL", 42.0758, -89.2817, 3586, "PWR", "Constellation Energy"),
    ("Calvert Cliffs 1", "1", "50-317", "MD", 38.4347, -76.4419, 2737, "PWR", "Constellation Energy"),
    ("Calvert Cliffs 2", "2", "50-318", "MD", 38.4347, -76.4419, 2737, "PWR", "Constellation Energy"),
    ("Catawba 1", "1", "50-413", "SC", 35.0514, -81.0700, 3411, "PWR", "Duke Energy"),
    ("Catawba 2", "2", "50-414", "SC", 35.0514, -81.0700, 3411, "PWR", "Duke Energy"),
    ("Clinton 1", "1", "50-461", "IL", 40.1722, -88.8339, 3473, "BWR", "Constellation Energy"),
    ("Columbia", "1", "50-397", "WA", 46.4711, -119.3337, 3544, "BWR", "Energy Northwest"),
    ("Comanche Peak 1", "1", "50-445", "TX", 32.2986, -97.7853, 3612, "PWR", "Vistra Corp"),
    ("Comanche Peak 2", "2", "50-446", "TX", 32.2986, -97.7853, 3612, "PWR", "Vistra Corp"),
    ("Cook 1", "1", "50-315", "MI", 41.9756, -86.5658, 3304, "PWR", "Indiana Michigan Power"),
    ("Cook 2", "2", "50-316", "MI", 41.9756, -86.5658, 3468, "PWR", "Indiana Michigan Power"),
    ("Cooper", "1", "50-298", "NE", 40.3619, -95.6414, 2419, "BWR", "Nebraska Public Power"),
    ("Davis-Besse", "1", "50-346", "OH", 41.5972, -83.0864, 2817, "PWR", "Energy Harbor"),
    ("Diablo Canyon 1", "1", "50-275", "CA", 35.2117, -120.8561, 3411, "PWR", "Pacific Gas & Electric"),
    ("Diablo Canyon 2", "2", "50-323", "CA", 35.2117, -120.8561, 3411, "PWR", "Pacific Gas & Electric"),
    ("Dresden 2", "2", "50-237", "IL", 41.3897, -88.2714, 2957, "BWR", "Constellation Energy"),
    ("Dresden 3", "3", "50-249", "IL", 41.3897, -88.2714, 2957, "BWR", "Constellation Energy"),
    ("Farley 1", "1", "50-348", "AL", 31.2228, -85.1086, 2775, "PWR", "Southern Nuclear"),
    ("Farley 2", "2", "50-364", "AL", 31.2228, -85.1086, 2775, "PWR", "Southern Nuclear"),
    ("Fermi 2", "2", "50-341", "MI", 41.9606, -83.2578, 3486, "BWR", "DTE Energy"),
    ("FitzPatrick", "1", "50-333", "NY", 43.5236, -76.3981, 2536, "BWR", "Constellation Energy"),
    ("Ginna", "1", "50-244", "NY", 43.2778, -77.3103, 1775, "PWR", "Constellation Energy"),
    ("Grand Gulf 1", "1", "50-416", "MS", 32.0069, -91.0486, 4408, "BWR", "Entergy"),
    ("Hatch 1", "1", "50-321", "GA", 31.9342, -82.3444, 2804, "BWR", "Southern Nuclear"),
    ("Hatch 2", "2", "50-366", "GA", 31.9342, -82.3444, 2804, "BWR", "Southern Nuclear"),
    ("Hope Creek 1", "1", "50-354", "NJ", 39.4681, -75.5347, 3840, "BWR", "PSEG Nuclear"),
    ("LaSalle 1", "1", "50-373", "IL", 41.2439, -88.6708, 3546, "BWR", "Constellation Energy"),
    ("LaSalle 2", "2", "50-374", "IL", 41.2439, -88.6708, 3546, "BWR", "Constellation Energy"),
    ("Limerick 1", "1", "50-352", "PA", 40.2242, -75.5889, 3515, "BWR", "Constellation Energy"),
    ("Limerick 2", "2", "50-353", "PA", 40.2242, -75.5889, 3515, "BWR", "Constellation Energy"),
    ("McGuire 1", "1", "50-369", "NC", 35.4322, -80.9494, 3411, "PWR", "Duke Energy"),
    ("McGuire 2", "2", "50-370", "NC", 35.4322, -80.9494, 3411, "PWR", "Duke Energy"),
    ("Millstone 2", "2", "50-336", "CT", 41.3086, -72.1681, 2700, "PWR", "Dominion Energy"),
    ("Millstone 3", "3", "50-423", "CT", 41.3086, -72.1681, 3650, "PWR", "Dominion Energy"),
    ("Monticello", "1", "50-263", "MN", 45.3333, -93.8483, 2004, "BWR", "Xcel Energy"),
    ("Nine Mile Point 1", "1", "50-220", "NY", 43.5222, -76.4100, 1850, "BWR", "Constellation Energy"),
    ("Nine Mile Point 2", "2", "50-410", "NY", 43.5222, -76.4100, 3988, "BWR", "Constellation Energy"),
    ("North Anna 1", "1", "50-338", "VA", 38.0606, -77.7897, 2893, "PWR", "Dominion Energy"),
    ("North Anna 2", "2", "50-339", "VA", 38.0606, -77.7897, 2893, "PWR", "Dominion Energy"),
    ("Oconee 1", "1", "50-269", "SC", 34.7939, -82.8986, 2568, "PWR", "Duke Energy"),
    ("Oconee 2", "2", "50-270", "SC", 34.7939, -82.8986, 2568, "PWR", "Duke Energy"),
    ("Oconee 3", "3", "50-287", "SC", 34.7939, -82.8986, 2568, "PWR", "Duke Energy"),
    ("Palo Verde 1", "1", "50-528", "AZ", 33.3881, -112.8619, 3990, "PWR", "Arizona Public Service"),
    ("Palo Verde 2", "2", "50-529", "AZ", 33.3881, -112.8619, 3990, "PWR", "Arizona Public Service"),
    ("Palo Verde 3", "3", "50-530", "AZ", 33.3881, -112.8619, 3990, "PWR", "Arizona Public Service"),
    ("Peach Bottom 2", "2", "50-277", "PA", 39.7589, -76.2689, 3514, "BWR", "Constellation Energy"),
    ("Peach Bottom 3", "3", "50-278", "PA", 39.7589, -76.2689, 3514, "BWR", "Constellation Energy"),
    ("Perry 1", "1", "50-440", "OH", 41.8011, -81.1442, 3758, "BWR", "Energy Harbor"),
    ("Point Beach 1", "1", "50-266", "WI", 44.2811, -87.5367, 1800, "PWR", "NextEra Energy"),
    ("Point Beach 2", "2", "50-301", "WI", 44.2811, -87.5367, 1800, "PWR", "NextEra Energy"),
    ("Prairie Island 1", "1", "50-282", "MN", 44.6219, -92.6331, 1650, "PWR", "Xcel Energy"),
    ("Prairie Island 2", "2", "50-306", "MN", 44.6219, -92.6331, 1650, "PWR", "Xcel Energy"),
    ("Quad Cities 1", "1", "50-254", "IL", 41.7264, -90.3100, 2957, "BWR", "Constellation Energy"),
    ("Quad Cities 2", "2", "50-265", "IL", 41.7264, -90.3100, 2957, "BWR", "Constellation Energy"),
    ("River Bend 1", "1", "50-458", "LA", 30.7572, -91.3317, 3091, "BWR", "Entergy"),
    ("Robinson 2", "2", "50-261", "SC", 34.4017, -80.1583, 2339, "PWR", "Duke Energy"),
    ("Salem 1", "1", "50-272", "NJ", 39.4628, -75.5361, 3459, "PWR", "PSEG Nuclear"),
    ("Salem 2", "2", "50-311", "NJ", 39.4628, -75.5361, 3459, "PWR", "PSEG Nuclear"),
    ("Seabrook 1", "1", "50-443", "NH", 42.8986, -70.8489, 3648, "PWR", "NextEra Energy"),
    ("Sequoyah 1", "1", "50-327", "TN", 35.2264, -85.0886, 3455, "PWR", "Tennessee Valley Authority"),
    ("Sequoyah 2", "2", "50-328", "TN", 35.2264, -85.0886, 3455, "PWR", "Tennessee Valley Authority"),
    ("Shearon Harris 1", "1", "50-400", "NC", 35.6333, -78.9556, 2900, "PWR", "Duke Energy"),
    ("South Texas 1", "1", "50-498", "TX", 28.7950, -96.0489, 3853, "PWR", "STP Nuclear"),
    ("South Texas 2", "2", "50-499", "TX", 28.7950, -96.0489, 3853, "PWR", "STP Nuclear"),
    ("St. Lucie 1", "1", "50-335", "FL", 27.3486, -80.2464, 2700, "PWR", "NextEra Energy"),
    ("St. Lucie 2", "2", "50-389", "FL", 27.3486, -80.2464, 2700, "PWR", "NextEra Energy"),
    ("Summer 1", "1", "50-395", "SC", 34.2961, -81.3203, 2900, "PWR", "Dominion Energy"),
    ("Surry 1", "1", "50-280", "VA", 37.1656, -76.6983, 2587, "PWR", "Dominion Energy"),
    ("Surry 2", "2", "50-281", "VA", 37.1656, -76.6983, 2587, "PWR", "Dominion Energy"),
    ("Susquehanna 1", "1", "50-387", "PA", 41.0922, -76.1467, 3952, "BWR", "Talen Energy"),
    ("Susquehanna 2", "2", "50-388", "PA", 41.0922, -76.1467, 3952, "BWR", "Talen Energy"),
    ("Turkey Point 3", "3", "50-250", "FL", 25.4353, -80.3308, 2300, "PWR", "NextEra Energy"),
    ("Turkey Point 4", "4", "50-251", "FL", 25.4353, -80.3308, 2300, "PWR", "NextEra Energy"),
    ("Vogtle 1", "1", "50-424", "GA", 33.1422, -81.7647, 3626, "PWR", "Southern Nuclear"),
    ("Vogtle 2", "2", "50-425", "GA", 33.1422, -81.7647, 3626, "PWR", "Southern Nuclear"),
    ("Vogtle 3", "3", "50-500", "GA", 33.1422, -81.7647, 3565, "PWR", "Southern Nuclear"),
    ("Vogtle 4", "4", "50-501", "GA", 33.1422, -81.7647, 3565, "PWR", "Southern Nuclear"),
    ("Waterford 3", "3", "50-382", "LA", 29.9953, -90.4719, 3716, "PWR", "Entergy"),
    ("Watts Bar 1", "1", "50-390", "TN", 35.6050, -84.7914, 3459, "PWR", "Tennessee Valley Authority"),
    ("Watts Bar 2", "2", "50-391", "TN", 35.6050, -84.7914, 3459, "PWR", "Tennessee Valley Authority"),
    ("Wolf Creek 1", "1", "50-482", "KS", 38.2386, -95.6886, 3565, "PWR", "Evergy"),
]


def seed():
    """Populate database with seed data."""
    init_db()
    db = SessionLocal()

    try:
        # Seed enrichment entities
        existing = {e.name for e in db.query(EnrichmentEntity).all()}
        for entity in ENRICHMENT_ENTITIES:
            if entity["name"] not in existing:
                db.add(EnrichmentEntity(**entity))
        print(f"[Seed] Enrichment entities: {len(ENRICHMENT_ENTITIES)} checked")

        # Seed reactors
        existing_reactors = {r.name for r in db.query(Reactor).all()}
        for row in REACTOR_DATA:
            name, unit, docket, state, lat, lng, mwt, rtype, operator = row
            if name not in existing_reactors:
                db.add(
                    Reactor(
                        name=name,
                        unit=unit,
                        docket=docket,
                        state=state,
                        lat=lat,
                        lng=lng,
                        mwt_licensed=mwt,
                        reactor_type=rtype,
                        operator=operator,
                        license_expires="2040",
                        current_pct_power=100,
                    )
                )
        print(f"[Seed] Reactors: {len(REACTOR_DATA)} checked")

        # Seed investments
        existing_inv = {
            (i.company, str(i.amount_usd)) for i in db.query(Investment).all()
        }
        for inv in KNOWN_INVESTMENTS:
            key = (inv["company"], str(inv["amount_usd"]))
            if key not in existing_inv:
                db.add(
                    Investment(
                        company=inv["company"],
                        date=datetime.strptime(inv["date"], "%Y-%m-%d"),
                        amount_usd=inv["amount_usd"],
                        round_type=inv["round_type"],
                        investors_json=json.dumps(inv["investors"]),
                        technology_type=inv["technology_type"],
                        summary=inv["summary"],
                    )
                )
        print(f"[Seed] Investments: {len(KNOWN_INVESTMENTS)} checked")

        # Seed policy events
        existing_policy = {p.title for p in db.query(PolicyEvent).all()}
        for pe in SEED_POLICY_EVENTS:
            if pe["title"] not in existing_policy:
                db.add(
                    PolicyEvent(
                        title=pe["title"],
                        date=datetime.strptime(pe["date"], "%Y-%m-%d"),
                        source_url=pe["source_url"],
                        event_type=pe["event_type"],
                        entities_json=json.dumps(pe["entities"]),
                        dollar_amount=pe["dollar_amount"],
                        sentiment=pe["sentiment"],
                        summary=pe["summary"],
                    )
                )
        print(f"[Seed] Policy events: {len(SEED_POLICY_EVENTS)} checked")

        db.commit()
        print("[Seed] Database seeded successfully.")
    except Exception as e:
        db.rollback()
        print(f"[Seed] Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
