# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this is

**เศรษฐีสยาม (Siam Setthi)** — an original 90s-Thai-style property board game. The **TV is the shared board**, each **phone is a private controller**. Built for couch play on a **TCL 75″ 4K Google TV (75Q6C)**. UI language is **Thai**.

It is **LAN-first**: TV + phones connect to a host computer running the server over the same Wi-Fi. (Public-internet deploy is possible — see `docs/DEPLOY.md`.)

## Commands

```bash
npm install
npm run dev      # server + tv + phone together (concurrently)
npm test         # Vitest — game-logic tests (packages/rules)
npm run build    # typecheck + build ALL workspaces (run before declaring done)

# single workspace
npm run build --workspace @siamsetthi/tv
npm run dev   --workspace @siamsetthi/server
```

Dev ports: TV `5173`, phone `5174`, server `4000`. This is **npm workspaces**, not pnpm (ignore the pnpm wording in `docs/superpowers/plans/`). In dev the Vite servers proxy `/socket.io` → `:4000`, so clients talk to the server **same-origin** (matching prod).

**Single-origin (prod/Docker):** the server (`apps/server`) also serves the built SPAs — TV at `/`, phone at `/phone` (built with `base=/phone/`), Socket.IO at `/socket.io` — all on **one port** (`PORT`, default 4000). Clients default to `window.location.origin` for the socket (override with `VITE_SERVER_URL`). This is what makes the Cloudflare-tunnel deploy trivial (one hostname, `wss://`).

**Docker (Cloudflare tunnel one-shot):** `.env` (`TUNNEL_TOKEN=…`, gitignored) + `docker compose up -d --build` runs the `app` container (server serving everything on `PORT=3308`, no host ports published) plus `cloudflared`, which shares the app's netns (`network_mode: service:app`). Point the tunnel's public hostname at `http://localhost:3308` — the port must match `PORT`. `scripts/docker-start.sh` just runs the server via `tsx`; the old `scripts/static.mjs` is unused now.

**Auto-deploy:** `scripts/auto-deploy.sh` (git-poll → pull → redeploy) + `scripts/install-auto-deploy.sh` (systemd service+timer, unit name `siamsetthi-auto-deploy`). Same pattern as the `f:\home` project. Lock + log-rotate + dirty/ahead safety guards. Deploy step defaults to `docker compose up -d --build`, override with `AUTO_DEPLOY_CMD`.

## Architecture

| Path | Package | Role |
| --- | --- | --- |
| `packages/rules` | `@siamsetthi/rules` | **Pure** game logic: `reduceGameState(state, action)`, 40-tile `BOARD`, card decks, types. No React/DOM/socket. |
| `packages/shared` | `@siamsetthi/shared` | Socket.IO event type contracts. |
| `apps/server` | `@siamsetthi/server` | Express + Socket.IO. Owns `Map<roomCode, Room>`. **Server-authoritative.** |
| `apps/tv` | `@siamsetthi/tv` | React board screen (Vite). |
| `apps/phone` | `@siamsetthi/phone` | React controller (Vite). |

Data flow: phone/TV send a typed **action** → server runs the **reducer** → server **broadcasts the whole `GameState`** back. Clients are thin renderers.

## Rules you MUST follow

1. **All game logic lives in `packages/rules`.** Never put rules in a client. Add a Vitest case in `packages/rules/test/` for every new branch. The reducer is pure (clone-then-mutate a draft, never mutate the input).
2. **The server owns randomness (anti-cheat).** `normalizeAction` and the bot driver re-roll dice / re-draw cards server-side; client-supplied `dice`/`draw` are discarded. Don't move randomness to clients.
3. **The board must stay exactly 40 tiles.** `apps/tv` `positionFor()` assumes an 11×11 perimeter (corners at 0/10/20/30). Changing tile count breaks board geometry.
4. **`GameState` is one serializable object broadcast whole.** Keep new state fields serializable. `rollCount` is bumped each roll and drives TV roll animations — keep it monotonic.
5. **Bots are normal players with `isBot: true`.** Their decisions are server-side heuristics in `decideBotAction`/`botBuildAction` (`apps/server`). The reducer does NOT know about bots. To tune behavior, edit the server, not the reducer.
6. **Reconnect:** phone stores `{roomCode, playerId}` in `localStorage` and emits `rejoinRoom` on (re)connect. Don't break this when touching the join flow.

## TV rendering notes (`apps/tv`)

- The whole UI is authored on a **fixed 1920×1080 `.tv-stage`** that is `transform: scale()`d to fill the screen (`useStageScale`). Prefer **px** sizing inside the stage; `vw`/`vh` resolve against the real viewport, not the stage, so avoid them for layout that must scale with the board.
- Tokens are an absolute overlay (`TokenLayer`) measured from real tile DOM (`offsetLeft/offsetTop`, scale-independent). Re-measure on `posKey` / dock resize.
- Settings (`sound`/`motion`/`zoom`) persist in `localStorage`; `[data-motion="off"]` disables animations. Sound is synth Web Audio (no asset files) and needs a first user gesture to unlock.

## Env vars (build-time, both frontends read them)

- `VITE_SERVER_URL` — Socket.IO server origin. Default: `http://<page-host>:4000` (LAN).
- `VITE_PHONE_URL` — (TV only) phone app origin used for the QR/join link. Default: `http://<tv-host>:5174` (LAN).

## Gotchas

- `node_modules/@siamsetthi/*` and `apps/*/dist` are **tracked in git** from the initial commit; source edits show as changes there via workspace symlinks. Don't be alarmed; don't reorganize git history unless asked.
- Don't commit or push unless the user asks.
- Verify changes by building (`npm run build`) and, for behavior, a quick Playwright smoke run (Chromium is installed) — see the pattern referenced in `docs/ARCHITECTURE.md`.

## Docs

- `README.md` — overview + quick start
- `docs/SETUP-TCL-GOOGLE-TV.md` — running on the TCL 75Q6C, bots, second-TV (Sony) perf
- `docs/GAMEPLAY.md` — full rules + price/rent tables
- `docs/ARCHITECTURE.md` — internals + how to extend
- `docs/DEPLOY.md` — LAN vs public deploy (Cloudflare Pages frontends + Node server host)
