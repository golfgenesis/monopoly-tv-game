# เศรษฐีสยาม TV Game

เกมเศรษฐีไทยแบบคลาสสิกยุค 90 แต่ทำเป็น UI ทันสมัยสำหรับทีวี 4K โดยให้มือถือของผู้เล่นแต่ละคนเป็น controller

## Run

```bash
npm install
npm run dev
```

Dev URLs:

- TV host: `http://localhost:5173`
- Phone controller: `http://localhost:5174`
- Realtime server: `http://localhost:4000`

On this machine's current LAN, Vite detected:

- TV host for Google TV: `http://192.168.1.65:5173`
- Phone controller base: `http://192.168.1.65:5174`

Your IP can change after restarting the router or computer. If it changes, read the `Network:` URL printed by `npm run dev`.

## How To Play On TCL Google TV

1. Keep the computer running `npm run dev`.
2. Make sure the TCL Google TV and all phones are on the same Wi-Fi network.
3. On the TCL Google TV, open a browser app.
4. Go to the TV host URL, for example `http://192.168.1.65:5173`.
5. The TV will create a room automatically and show a QR code plus a room code.
6. Each player scans the QR code with their phone.
7. Each player enters a name, chooses a token/color, and taps `เข้าร่วม`.
8. When at least 2 players have joined, press `เริ่มเกม` on the TV.
9. Players use their phones to tap `ทอยลูกเต๋า`, `ซื้อโฉนด`, `ข้าม`, and `จบตา`.

## If The TV Cannot Open The URL

- Confirm the TV and computer are on the same Wi-Fi.
- Use the computer's LAN IP, not `localhost`, on the TV.
- Allow Node.js through Windows Firewall if prompted.
- Try opening `http://192.168.1.65:5173` from a phone first. If the phone cannot open it, the TV will not either.
- If the computer IP changed, restart `npm run dev` and use the new `Network:` URL.

## Gameplay (Phone Controller)

1. On the TV, the room is created automatically — note the 5-character room code.
2. Each player opens the phone URL, picks a character + color, types a name, and taps `เข้าร่วมเกม`.
3. With 2–6 players in, press `เริ่มเกม` on the TV.
4. On your turn the phone shows the right action:
   - `ทอยลูกเต๋า` — roll (rolling doubles lets you roll again; three doubles sends you to jail).
   - `ซื้อ / ข้าม` — buy the deed you landed on, or pass.
   - `จบตาของฉัน` — end your turn.
   - In jail: roll for doubles, pay `฿500`, or use a `บัตรพ้นโทษ` card.
5. The `จัดการ` tab lets you build houses/hotels (once you own a whole color group), sell them back, and mortgage / redeem deeds for cash.
6. The `เทรด` tab lets you offer your deeds + cash to another player in exchange for theirs; the other player accepts or rejects on their phone.
7. Declining to buy a deed (`ข้าม`) sends it to an **auction** — every player bids in turn until one remains, and the high bidder buys it.
8. Last player standing wins — the TV shows the winner and a net-worth ranking.

## Implemented

- TV room creation + QR/room-code join, 2–6 players.
- 40-tile Bangkok board with 8 color groups, 4 transport, 2 utilities, 4 corners.
- Server-authoritative dice + card draws, per-turn think timer with AFK auto-advance.
- Salary on passing start, buyable deeds, rent that scales with monopolies + houses/hotels.
- Chance (`ดวง`) and Community (`งานบุญ`) card decks.
- Jail: go-to-jail, doubles escape, pay/`บัตรพ้นโทษ`.
- Houses & hotels with even-build rule, mortgages with redemption interest.
- Property auctions when a deed is declined (ascending, turn-based bidding).
- Player-to-player trading (deeds + cash) with accept/reject.
- Bankruptcy with asset transfer to the creditor, and win detection.
- Polished 4K-ready TV UI (board, player dock, turn panel + timer, card/auction/trade modals, asset/history overlays) and a full phone controller.

## Still Planned

- Original mascot art and production board illustrations.
- Android TV wrapper if browser launch is inconvenient.
