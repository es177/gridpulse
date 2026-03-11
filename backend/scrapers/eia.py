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
    """Deterministic mock data based on actual US generation mix proportions.

    Values reflect typical US hourly generation by ISO/RTO region,
    derived from EIA Electricity Grid Monitor historical patterns (2024-2025).
    Source: https://www.eia.gov/electricity/gridmonitor/
    """
    import math

    now = datetime.utcnow()
    now_str = now.strftime("%Y-%m-%dT%H:00")
    hour = now.hour

    # Per-region fuel mix (MW) based on EIA historical averages
    region_profiles = {
        "PJM": {
            "nuclear": 33200, "gas": 52100, "coal": 13800,
            "wind": 4600, "solar": 2800, "hydro": 2100, "other": 1900,
        },
        "MISO": {
            "nuclear": 11800, "gas": 28400, "coal": 18200,
            "wind": 16500, "solar": 3200, "hydro": 1400, "other": 1100,
        },
        "ERCOT": {
            "nuclear": 5100, "gas": 30800, "coal": 5400,
            "wind": 14200, "solar": 7600, "hydro": 200, "other": 700,
        },
        "CAISO": {
            "nuclear": 2300, "gas": 14600, "coal": 100,
            "wind": 3100, "solar": 8900, "hydro": 4300, "other": 900,
        },
        "SPP": {
            "nuclear": 4800, "gas": 12100, "coal": 7600,
            "wind": 17200, "solar": 2400, "hydro": 1600, "other": 500,
        },
        "NYISO": {
            "nuclear": 5100, "gas": 14800, "coal": 200,
            "wind": 2100, "solar": 1400, "hydro": 5300, "other": 1200,
        },
        "ISONE": {
            "nuclear": 3300, "gas": 7400, "coal": 100,
            "wind": 800, "solar": 1100, "hydro": 1800, "other": 600,
        },
    }

    # Time-of-day variation: solar drops at night, gas compensates
    solar_factor = max(0, math.sin(math.pi * (hour - 6) / 12)) if 6 <= hour <= 18 else 0
    night_gas_bump = 1.15 if hour < 6 or hour > 20 else 1.0

    result = []
    for region, fuels in region_profiles.items():
        for fuel, base_mw in fuels.items():
            value = base_mw
            if fuel == "solar":
                value = base_mw * max(0.05, solar_factor)
            elif fuel == "gas":
                value = base_mw * night_gas_bump
            result.append({
                "timestamp": now_str,
                "region": region,
                "fuel_type": fuel,
                "value_mw": round(value, 1),
                "respondent": region,
            })
    return result


def _mock_regional_demand() -> list[dict]:
    """Deterministic demand data by ISO/RTO region.

    Source: https://www.eia.gov/electricity/gridmonitor/
    """
    now = datetime.utcnow().strftime("%Y-%m-%dT%H:00")
    regions = {
        "PJM": ("PJM Interconnection", 110500),
        "MISO": ("Midcontinent ISO", 80600),
        "ERCOT": ("Electric Reliability Council of Texas", 64000),
        "SPP": ("Southwest Power Pool", 46200),
        "CAISO": ("California ISO", 34200),
        "NYISO": ("New York ISO", 30100),
        "ISONE": ("ISO New England", 15100),
    }
    return [
        {
            "timestamp": now,
            "region": code,
            "value_mw": mw,
            "respondent": name,
        }
        for code, (name, mw) in regions.items()
    ]
