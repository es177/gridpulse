#!/bin/bash
cd "/Users/evansiu/Vibe Coding/Claude/GridPulse/backend"
exec python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
