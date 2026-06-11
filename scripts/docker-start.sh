#!/bin/sh
# Run all three services in one container (LAN play).
#   :4000  game server (Socket.IO)   :5173  TV board   :5174  phone controller
set -e

node scripts/static.mjs apps/tv/dist 5173 &
node scripts/static.mjs apps/phone/dist 5174 &

# Locate the tsx binary regardless of how npm hoisted it.
if [ -x ./node_modules/.bin/tsx ]; then
  TSX=./node_modules/.bin/tsx
elif [ -x ./apps/server/node_modules/.bin/tsx ]; then
  TSX=./apps/server/node_modules/.bin/tsx
else
  TSX="npx tsx"
fi

# Game server in the foreground so it owns the container lifecycle.
exec $TSX apps/server/src/index.ts
