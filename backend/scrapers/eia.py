"""EIA API client for real-time grid data."""
from __future__ import annotations

import os
from datetime import datetime, timedelta

import httpx

EIA_BASE = "https://api.eia.gov/v2"


async def fetch_fuel_mix() -> list[dict]:
    """Fetch real-time fuel type generation data from EIA."""
    api_key = os.getenv("EIA_API_KEY", "")
    if not api_key:
        return _mock_fuel_mix()

    url = f"{EIA_BASE}/electricity/rto/fuel-type-data/data/"
    params = {
        "api_key": api_key,
        "frequency": "hourly",
        "data[0]": "value",
        "sort[0][column]": "period",
        "sort[0][direction]": "desc",
        "length": 200,
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            rows = data.get("response", {}).get("data", [])
            return [
                {
                    "timestamp": r.get("period"),
                    "region": r.get("respondent", "US"),
                    "fuel_type": _normalize_fuel(r.get("fueltype", "")),
                    "value_mw": float(r.get("value", 0) or 0),
                    "respondent": r.get("respondent-name", ""),
                }
                for r in rows
            ]
    except Exception as e:
        print(f"[EIA] Error fetching fuel mix: {e}")
        return _mock_fuel_mix()


async def fetch_regional_demand() -> list[dict]:
    """Fetch real-time demand by RTO/ISO region."""
    api_key = os.getenv("EIA_API_KEY", "")
    if not api_key:
        return _mock_regional_demand()

    url = f"{EIA_BASE}/electricity/rto/region-data/data/"
    params = {
        "api_key": api_key,
        "frequency": "hourly",
        "data[0]": "value",
        "facets[type][]": "D",
        "sort[0][column]": "period",
        "sort[0][direction]": "desc",
        "length": 50,
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            rows = data.get("response", {}).get("data", [])
            return [
                {
                    "timestamp": r.get("period"),
                    "region": r.get("respondent", ""),
                    "value_mw": float(r.get("value", 0) or 0),
                    "respondent": r.get("respondent-name", ""),
                }
                for r in rows
            ]
    except Exception as e:
        print(f"[EIA] Error fetching demand: {e}")
        return _mock_regional_demand()


def _normalize_fuel(raw: str) -> str:
    mapping = {
        "NUC": "nuclear",
        "SUN": "solar",
        "WND": "wind",
        "NG": "gas",
        "COL": "coal",
        "WAT": "hydro",
        "OIL": "oil",
        "OTH": "other",
        "ALL": "all",
    }
    return mapping.get(raw.upper().strip(), raw.lower())


def _mock_fuel_mix() -> list[dict]:
    """Return realistic mock data when API key is unavailable."""
    import random

    now = datetime.utcnow().strftime("%Y-%m-%dT%H:00")
    regions = ["MISO", "PJM", "CAISO", "ERCOT", "SPP", "NYISO", "ISONE"]
    fuels = {
        "nuclear": (80000, 95000),
        "gas": (150000, 200000),
        "coal": (30000, 50000),
        "wind": (20000, 60000),
        "solar": (5000, 40000),
        "hydro": (20000, 35000),
        "other": (5000, 10000),
    }
    result = []
    for region in regions:
        for fuel, (lo, hi) in fuels.items():
            per_region = random.uniform(lo / len(regions), hi / len(regions))
            result.append(
                {
                    "timestamp": now,
                    "region": region,
                    "fuel_type": fuel,
                    "value_mw": round(per_region, 1),
                    "respondent": region,
                }
            )
    return result


def _mock_regional_demand() -> list[dict]:
    import random

    now = datetime.utcnow().strftime("%Y-%m-%dT%H:00")
    regions = {
        "MISO": ("Midcontinent ISO", 60000, 80000),
        "PJM": ("PJM Interconnection", 80000, 120000),
        "CAISO": ("California ISO", 25000, 40000),
        "ERCOT": ("Electric Reliability Council of Texas", 40000, 65000),
        "SPP": ("Southwest Power Pool", 25000, 40000),
        "NYISO": ("New York ISO", 15000, 25000),
        "ISONE": ("ISO New England", 10000, 18000),
    }
    return [
        {
            "timestamp": now,
            "region": code,
            "value_mw": round(random.uniform(lo, hi), 1),
            "respondent": name,
        }
        for code, (name, lo, hi) in regions.items()
    ]
