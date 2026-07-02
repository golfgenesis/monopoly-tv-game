#!/bin/sh
# Single-origin runtime: the game server serves the built TV + phone SPAs AND
# the Socket.IO endpoint on ONE port (default 4000). No extra static servers,
# no extra ports — ideal behind a Cloudflare tunnel.
set -e

# Locate the tsx binary regardless of how npm hoisted it.
if [ -x ./node_modules/.bin/tsx ]; then
  TSX=./node_modules/.bin/tsx
elif [ -x ./apps/server/node_modules/.bin/tsx ]; then
  TSX=./apps/server/node_modules/.bin/tsx
else
  TSX="npx tsx"
fi

exec $TSX apps/server/src/index.ts
