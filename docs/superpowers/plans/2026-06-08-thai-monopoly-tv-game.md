# Thai TV Property Board Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished Thai-inspired TV board game where the TV is the shared game board and each player's phone is a private controller.

**Architecture:** Use a browser-based 2D game for the TV, with deterministic game rules separated from Phaser rendering. A Node realtime server owns rooms and synchronizes TV and phone clients through Socket.IO, while phones send typed player actions rather than changing game state directly.

**Tech Stack:** Vite, TypeScript, Phaser, React DOM overlays, Socket.IO, Vitest, Playwright, ESLint, pnpm.

---

## Product Direction

This is an original Thai-style property trading board game inspired by the social play pattern of classic economic board games. Do not copy official Monopoly names, board layout, card text, iconography, mascots, or visual identity.

Working title: `เศรษฐีสยาม`.

Target hardware: NEW 2025 TCL 75 inch 4K Mini QLED Google TV 75Q6C. The TV should run the host screen in a browser or lightweight Android TV wrapper. Phones connect over the same network by scanning a QR code or entering a short room code.

Primary feel: retro Thai toy-box energy from 1990s tabletop economic games: loud yellow title panels, red box borders, cyan-blue play areas, rainbow swooshes, thick black title lettering, anime-inspired character mascots, playful product-label details, and a cheerful "new game in the living room" mood. The final game must be original, but the emotional target is that same Thai childhood board-game excitement.

## Retro Thai Box-Art Direction

Use the supplied reference image as the visual mood target, not as copyable source art. The goal is to recreate the feeling of a Thai board game box from the 90s on a 75 inch 4K TV.

Key art direction:

- Palette: saturated yellow, cyan blue, hot red, grass green, orange, white, and black outlines.
- Layout: TV lobby screen should feel like a giant board-game box lid laid flat on the screen.
- Typography: huge Thai display title with thick black shadow/outline and slightly playful block proportions.
- Characters: create an original cast of 4 to 6 anime-inspired Thai/Asian teen-to-young-adult mascots standing across the title screen, each tied to a token color and player identity.
- Graphic motifs: rainbow wave stripes, starburst callouts, small "item no."-style decorative labels, fake product stamps, board preview inset, and playful card/package details.
- Board style: rectangular property tiles around the edge with high-contrast illustrations, bright ownership colors, and chunky outlines.
- Phone style: phones should use the same toy-box palette but calmer, with big tactile buttons and deed-card panels.
- Texture: slight printed-cardboard grain, halftone dots, soft ink misregistration, and sticker-like UI panels. Keep it subtle so text stays sharp on TV.

Legal and originality guardrails:

- Do not reuse the exact title, logo, characters, box art, board art, item numbers, or slogans from the reference.
- Do not trace the supplied image.
- Do not copy Monopoly branding or official board layout.
- Create an original title, original mascot cast, original property names, original cards, and original icon set.

## Core Experience

- TV shows the full board, player tokens, dice, bank status, property ownership, auctions, payments, and cinematic turn moments.
- Each phone shows only that player's controls, money, owned deeds, mortgage/sale actions, trade offers, and yes/no decisions.
- The board is readable at 10 feet on a 75 inch 4K screen. Use large typography, high contrast, and animated focus on the current player.
- The game supports 2 to 6 players locally.
- One player can host from the TV. Players join with QR code or room code.
- The TV never requires typing during gameplay after the room is created.

## Game Rules

The first playable version should include:

- Roll two dice.
- Move clockwise around a Thai-themed property board.
- Buy unowned properties.
- Pay rent to owners.
- Draw luck cards.
- Pay tax, fees, or event costs.
- Receive salary when passing the start tile.
- Auction skipped properties.
- Trade money and property between players.
- Mortgage and unmortgage properties.
- Build houses after owning a full color district.
- Bankruptcy and player elimination.
- Victory by last player standing or highest net worth after a time limit.

Recommended Thai board theme:

- Start: `รับเงินเดือน`
- Property districts: `ตลาด`, `คลอง`, `สถานี`, `ย่านเมืองเก่า`, `หาด`, `ภูเขา`, `มหานคร`
- Utility-like tiles: `การไฟ`, `การประปา`
- Transport tiles: `สถานีรถไฟ`, `ท่าเรือ`, `รถสองแถว`, `รถไฟฟ้า`
- Luck cards: `ดวง`, `วาสนา`
- Tax/event tiles: `ภาษีที่ดิน`, `ซ่อมบ้าน`, `งานบุญ`, `ค่าปรับ`
- Jail-like mechanic should be renamed and rethemed as `พักตากอากาศ` or `รอเอกสาร` to keep the tone friendlier.

## File Structure

Create:

- `package.json` - workspace scripts and dependencies.
- `pnpm-workspace.yaml` - app package grouping.
- `apps/tv/` - Vite TV client.
- `apps/tv/src/main.ts` - TV app bootstrap.
- `apps/tv/src/game/ThaiBoardScene.ts` - Phaser board scene, animation, camera, tokens, dice.
- `apps/tv/src/ui/TvOverlay.tsx` - DOM overlay for turn banner, QR code, modals, summaries.
- `apps/phone/` - Vite phone controller client.
- `apps/phone/src/main.tsx` - phone app bootstrap.
- `apps/phone/src/ControllerApp.tsx` - player controller screens.
- `apps/server/` - realtime Node server.
- `apps/server/src/index.ts` - HTTP and Socket.IO entrypoint.
- `packages/rules/src/` - pure deterministic game rules.
- `packages/rules/src/types.ts` - serializable game state and action types.
- `packages/rules/src/board.ts` - Thai board definition.
- `packages/rules/src/reducer.ts` - game action reducer.
- `packages/rules/src/economy.ts` - rent, net worth, mortgage, build costs.
- `packages/rules/src/cards.ts` - luck card definitions and effects.
- `packages/rules/test/` - Vitest tests for all game rules.
- `packages/shared/src/` - shared room, socket, and validation types.
- `assets/` - board art, icons, audio, fonts, and generated image notes.
- `docs/design/visual-direction.md` - Thai visual system and asset checklist.
- `docs/playtest/checklist.md` - TV and phone playtest checklist.

## Milestone 1: Project Foundation

- [ ] Create pnpm monorepo with `apps/tv`, `apps/phone`, `apps/server`, `packages/rules`, and `packages/shared`.
- [ ] Add Vite TypeScript setup for TV and phone clients.
- [ ] Add Node TypeScript setup for the realtime server.
- [ ] Add Vitest for pure rules packages.
- [ ] Add Playwright for browser smoke tests.
- [ ] Add shared ESLint and TypeScript config.
- [ ] Verify `pnpm install`, `pnpm test`, and `pnpm dev` all run.

Acceptance:

- Running `pnpm dev` starts the TV client, phone client, and server.
- Running `pnpm test` executes at least one passing rules test.

## Milestone 2: Pure Game Rules

- [ ] Define `Player`, `Tile`, `PropertyTile`, `Card`, `GameState`, and `GameAction` types.
- [ ] Build the first 32-tile Thai board with stable tile IDs.
- [ ] Implement turn order, dice results, movement, passing start salary, and landing effects.
- [ ] Implement buying, rent payment, auctions, trades, mortgages, building houses, and bankruptcy.
- [ ] Implement deterministic card effects with seeded shuffle support.
- [ ] Write Vitest tests for every rule branch.

Acceptance:

- The full game can be simulated without Phaser, React, sockets, or browser APIs.
- Tests prove that phone clients cannot directly mutate money, property, or dice results.

## Milestone 3: Realtime Room System

- [ ] Implement room creation from TV client.
- [ ] Generate 4 to 6 character room codes.
- [ ] Show QR code on TV that links phones to `/join/:roomCode`.
- [ ] Let phones join with player name and token choice.
- [ ] Assign stable player IDs and reconnect tokens.
- [ ] Broadcast public game state to the TV.
- [ ] Broadcast private player state to each phone.
- [ ] Validate all incoming actions server-side.

Acceptance:

- Two browser tabs can act as phones and control one TV tab.
- Refreshing a phone reconnects it to the same player if the room is still active.

## Milestone 4: TV Board Presentation

- [ ] Implement a 16:9 TV layout optimized for 3840 x 2160 and downscaled to 1920 x 1080.
- [ ] Render the board in Phaser with a square board, center event area, animated tokens, and dice.
- [ ] Add DOM overlay for current player, money summary, QR join state, and major decisions.
- [ ] Add camera zoom/focus for dice roll, movement, property purchase, rent payment, auction, trade result, and bankruptcy.
- [ ] Add TV-safe spacing so no important content touches the screen edges.

Acceptance:

- The board is legible from couch distance.
- All important text remains inside safe areas on desktop, 4K TV, and 1080p viewports.

## Milestone 5: Phone Controller UX

- [ ] Build join screen with room code and QR route support.
- [ ] Build waiting room screen with token selection.
- [ ] Build active turn screen with roll, buy, auction, trade, mortgage, build, and end-turn controls.
- [ ] Build inactive turn screen with player money, deeds, pending decisions, and trade requests.
- [ ] Build property detail screen with rent ladder and mortgage status.
- [ ] Build trade builder with money and property selection.
- [ ] Keep all buttons large enough for one-handed phone use.

Acceptance:

- A player can complete an entire game using only their phone after joining.
- Private decisions are not exposed on the TV until submitted.

## Milestone 6: Thai Visual And Audio Direction

- [ ] Create visual direction doc with retro Thai toy-box color tokens, typography, icon style, board materials, character rules, print texture, and motion rules.
- [ ] Use Thai-display-friendly fonts such as `Noto Sans Thai`, with a more decorative Thai font only for title treatment if readable.
- [ ] Build title-screen key art that reads like a bright Thai board-game box lid: yellow title block, cyan field, red border, rainbow stripes, mascot lineup, board inset, and starburst callouts.
- [ ] Build original anime-inspired player mascots with color-coded outfits and token identities.
- [ ] Build property deed cards with Thai toy-package paper, stamp graphics, district color, rent ladder, and ownership state.
- [ ] Add custom icons for salary, tax, transport, utilities, house, hotel, luck, auction, and trade.
- [ ] Add audio stingers for dice, purchase, rent, lucky card, bankruptcy, auction countdown, and win.
- [ ] Add reduced-motion and muted-audio settings.

Acceptance:

- Screenshots immediately read as a retro Thai board-game box come alive on TV, not a generic finance dashboard.
- The UI remains readable without decorative assets loaded.

## Milestone 7: Game Flow Polish

- [ ] Add start menu, room lobby, rules preset selection, and game length selection.
- [ ] Add timed mode with final net-worth ranking.
- [ ] Add auction countdown and bid UI.
- [ ] Add trade negotiation flow with accept, reject, and revise.
- [ ] Add end-game winner ceremony with ranking, assets, and replay/new-room actions.
- [ ] Add pause menu and host controls.

Acceptance:

- A full 2 to 4 player game can run from lobby to winner ceremony without developer intervention.

## Milestone 8: Google TV Optimization

- [ ] Test on Chrome desktop at 3840 x 2160 and 1920 x 1080.
- [ ] Test browser performance with 2 to 6 phone clients connected.
- [ ] Keep Phaser render loop stable at 60 FPS where possible and avoid heavy DOM reflow during animations.
- [ ] Add optional Android TV wrapper only if browser launch is inconvenient.
- [ ] Ensure TV remote can open host, create room, pause, and return to lobby.
- [ ] Keep all gameplay controls on phones, not the TV remote.

Acceptance:

- The game is comfortable on a TCL 75 inch 4K screen.
- TV remote use is minimal and never required for per-turn choices.

## Milestone 9: Playtesting And Balancing

- [ ] Run solo automated simulations for 1,000 games to catch impossible states.
- [ ] Run 2-player, 4-player, and 6-player local playtests.
- [ ] Record average game time, bankruptcies, auction frequency, trade frequency, and cash starvation points.
- [ ] Tune property prices, rent ladders, salary, tax, card effects, and house costs.
- [ ] Add a `family` rules preset and a `fast party` preset.

Acceptance:

- Four players can finish a fast game in 45 to 60 minutes.
- The game has enough comeback moments without feeling random or unfair.

## Milestone 10: Release Package

- [ ] Add production build scripts.
- [ ] Add LAN hosting instructions.
- [ ] Add optional local server launcher script for Windows.
- [ ] Add deployment option for a small cloud server if cross-network play is needed.
- [ ] Add README with TV setup, phone join flow, and troubleshooting.

Acceptance:

- A non-developer can start the server, open the TV URL, and play with phones on the same Wi-Fi.

## Best Technical Choice

Use Phaser for the board, tokens, dice, effects, and camera because this is a 2D board game with animation and TV presentation needs. Use React DOM overlays for text-heavy UI because Thai text, modals, QR codes, and phone controls are easier to make crisp and responsive outside the canvas. Keep rules in a pure package so the game can be tested, balanced, and simulated without opening a browser.

Use Socket.IO first. It is reliable for local Wi-Fi rooms, reconnects, and room broadcasts. WebRTC is not needed for the first version because phones only send small control events and receive small state updates.

## Visual North Star

The TV should feel like a playable 1990s Thai board-game box:

- Opening screen resembles a giant toy box lid: red border, yellow title area, cyan lower field, rainbow swoosh, mascot lineup, and board preview inset.
- Large central board uses chunky illustrated tiles with black outlines and saturated district colors.
- Current player is highlighted with arcade-like glow, sticker labels, and camera focus.
- Deed cards feel like toy-package cards mixed with Thai title papers, using seals, stamps, and bright color bands.
- Luck cards feel like a mix of lottery slip, temple-fair coupon, official notice, and collectible card.
- Money UI is crisp and playful, not realistic banknote copying.
- Motion is snappy and celebratory: dice bounce, token hops, starbursts, stamp slams, and quick fanfare hits.
- Reading-heavy decisions stay calmer on phones so the TV can remain theatrical.

## Risks

- Local Wi-Fi discovery can be inconsistent across home routers, so QR codes should use the TV's reachable LAN IP and also show a manual URL.
- Thai text can become too small on TV if dense property details are shown everywhere, so the TV should show summaries and phones should show details.
- Rules can sprawl quickly, so the pure reducer and test suite must be built before visual polish.
- Copying Monopoly too closely creates legal and visual identity risk, so names, layout, icons, and card text must be original.

## First Build Slice

The first real demo should be small but magical:

1. TV creates room and shows QR code.
2. Two phones join.
3. TV shows a Thai-themed board with two tokens.
4. Player 1 taps `ทอยลูกเต๋า` on phone.
5. TV animates dice and token movement.
6. Phone offers `ซื้อโฉนด` for an unowned property.
7. TV shows purchase celebration and updated owner marker.
8. Player 2 lands on it and pays rent.

This slice proves the hardest parts: TV/phone connection, rule authority, Thai board presentation, and satisfying turn feel.
