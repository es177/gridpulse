#!/bin/bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd "/Users/evansiu/Vibe Coding/Claude/GridPulse/frontend"
npm install 2>&1
exec npm run dev
