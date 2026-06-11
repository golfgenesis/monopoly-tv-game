# 🏗️ สถาปัตยกรรม เศรษฐีสยาม

เอกสารสำหรับนักพัฒนา — อธิบายโครงสร้าง, การไหลของข้อมูล, และจุดสำคัญในการดูแล/ต่อยอด

---

## ภาพรวม

```
┌──────────────┐   playerAction    ┌───────────────┐   reduceGameState   ┌──────────────┐
│ 📱 phone (x6)│ ────────────────► │ 🔌 server      │ ──────────────────► │ packages/    │
│  controller  │                   │ Express + IO   │   (pure reducer)    │   rules      │
└──────────────┘ ◄──── roomState ─ │ ห้อง = state    │ ◄────── state ───── └──────────────┘
                                   └───────────────┘
       ▲                                  │ roomState (broadcast)
       │                                  ▼
       │                           ┌──────────────┐
       └─────────── สแกน QR ────── │ 📺 tv host    │  วาดกระดาน/หมาก/โมดัล
                                   └──────────────┘
```

**หลักการ:** เซิร์ฟเวอร์เป็นเจ้าของ state ของแต่ละห้องแต่เพียงผู้เดียว ทุก client ส่งแค่ *action* แล้วรับ *state* กลับมาทั้งก้อน ตรรกะเกมทั้งหมดอยู่ใน reducer บริสุทธิ์ที่ไม่พึ่ง React/DOM/Socket — เทสต์และจำลองได้โดยไม่ต้องเปิดเบราว์เซอร์

---

## โครงสร้าง workspace (npm workspaces)

| แพ็กเกจ | ชื่อ | หน้าที่ |
| --- | --- | --- |
| `packages/rules` | `@siamsetthi/rules` | reducer + กระดาน + การ์ด + ชนิดข้อมูล (pure TS) |
| `packages/shared` | `@siamsetthi/shared` | ชนิด event ของ Socket.IO (client↔server) |
| `apps/server` | `@siamsetthi/server` | Express + Socket.IO, ถือ `Map<roomCode, {state}>` |
| `apps/tv` | `@siamsetthi/tv` | React จอกระดาน (Vite, พอร์ต 5173) |
| `apps/phone` | `@siamsetthi/phone` | React จอยมือถือ (Vite, พอร์ต 5174) |

---

## โมเดล state (`packages/rules/src/types.ts`)

`GameState` เป็น object เดียวที่ serialize ได้ ครอบคลุมทั้งเกม:

- `phase`: `"lobby" | "playing" | "finished"`
- `players[]`: เงิน, ตำแหน่ง, โฉนดที่ถือ, สถานะคุก/ล้มละลาย, บัตรพ้นโทษ
- `ownership` / `buildings` / `mortgaged`: แมปสถานะต่อช่อง (key = tileId)
- `dice`, `rollCount`, `isDoubles`, `doublesCount`, `canRoll`, `hasRolled`
- `pendingPurchaseTileId`, `activeCard`, `auction`, `trade`: สถานะ interrupt ระหว่างตา
- `events[]`: log 10 รายการล่าสุด (ทีวีใช้เล่นเสียง + แสดงประวัติ)
- `turnEndsAt`, `turnSeconds`: ตัวจับเวลา (เซิร์ฟเวอร์ประทับ epoch ms)

> `rollCount` ถูกบวกทุกครั้งที่ประมวลผลการทอย ใช้เป็นสัญญาณ trigger แอนิเมชันลูกเต๋า/หมากฝั่งทีวี (ค่าเต๋าซ้ำกันได้ จึงเชื่อ value อย่างเดียวไม่ได้)

---

## reducer (`packages/rules/src/reducer.ts`)

ฟังก์ชันเดียว `reduceGameState(state, action) → state` แบบ pure (clone แล้ว mutate draft, ไม่แตะ state เดิม) จัดการทุก action:

`addPlayer · removeBot · startGame · resetGame · rollDice · buyTile · skipBuy · buildHouse · sellHouse · mortgage · unmortgage · payJail · useJailCard · dismissCard · bidAuction · passAuction · proposeTrade · respondTrade · endTurn`

> ผู้เล่นมีฟิลด์ `isBot` (ตั้งตอน `addPlayer`) บอทเป็น "ผู้เล่น" ปกติใน state ทุกประการ — ต่างแค่ **ตัวขับการตัดสินใจอยู่ที่เซิร์ฟเวอร์** ไม่ใช่มือถือ reducer ไม่รู้จักบอทเป็นพิเศษ จึงเทสต์/จำลองได้เหมือนเดิม

จุดที่ต้องระวังเวลาแก้:
- **ความเป็นเจ้าของตา:** action ส่วนใหญ่เช็ก `currentPlayerId === playerId` ก่อนเสมอ
- **เงินติดลบ → ล้มละลาย:** ทุกการหักเงินผ่าน `charge()` ซึ่งจัดการล้มละลาย + โอนทรัพย์ให้เจ้าหนี้
- **even build/sell:** `handleBuild` บังคับสร้าง/ขายเฉลี่ยทั่วโซน
- **ค่าเช่า:** `computeRent` แยกกรณี ที่ดิน(บันได ×) / ขนส่ง(นับช่อง) / สาธารณูปโภค(×แต้มเต๋า) และคืน 0 ถ้าจำนอง

---

## เซิร์ฟเวอร์ (`apps/server/src/index.ts`)

- `createRoom` (จากทีวี) → สร้างห้อง + รหัส 5 ตัว → emit `roomCreated`
- `joinRoom` (จากมือถือ) → สร้าง playerId → reduce `addPlayer` → emit `joined` + broadcast
- `rejoinRoom` (จากมือถือหลังหลุด) → ผูก socket กับ playerId เดิมในห้อง → emit `joined` (ทำงานได้แม้เกมเริ่มแล้ว)
- `playerAction` → `normalizeAction` (เขียนทับ playerId + **สุ่มเต๋า/การ์ดฝั่งเซิร์ฟเวอร์**) → reduce → broadcast
- `hostAddBot` / `hostRemoveBot` (จากทีวี) → เพิ่ม/ลบผู้เล่นบอทในล็อบบี้
- **หัวใจเกม** (`setInterval` ทุก 0.5 วิ):
  - ถ้า "ผู้ที่ต้องเล่นตอนนี้" (`currentActorId` = ผู้ทอย/ผู้ประมูล/ผู้รับเทรด) เป็น **บอท** → `botStep` ตัดสินใจ 1 อย่าง เว้นจังหวะ `BOT_DELAY_MS` (~1.2 วิ) ต่อการกระทำ
  - ถ้าเป็น **คน** → ใช้ `autoStep` เดิม (ตาหมดเวลา/ล้มละลายค้าง = เล่นแทนให้) เกมจึงไม่ค้าง

**Bot AI** (`decideBotAction`): ฮิวริสติกล้วน อ่าน `GameState` แล้วคืน `GameAction` หนึ่งตัว — ทอย, ซื้อถ้าเงินเหลือเกินสำรอง (ยอมจ่ายแพงขึ้นถ้าใกล้ครบโซน), ประมูลไม่เกินมูลค่าที่ตั้งไว้, สร้างบ้านบนโซนที่ถือครบเมื่อเงินเหลือ, จัดการคุก, และรับเทรดเฉพาะที่คุ้มค่า (มูลค่าที่ได้ ≥ ที่ให้ และจ่ายไหว) บอทไม่เป็นฝ่ายยื่นเทรดเอง

**ความปลอดภัย:** การสุ่มเต๋าและการ์ดเกิดที่เซิร์ฟเวอร์เท่านั้น (`normalizeAction` + `autoStep`) ค่าที่มือถือส่งมาถูกทิ้ง — โกงค่าเงิน/เต๋าผ่าน client ไม่ได้

---

## ฝั่งทีวี (`apps/tv/src/main.tsx`)

ประเด็นที่ออกแบบเพื่อจอ 75″ 4K โดยเฉพาะ:

### 1. Scale-to-fit stage
UI ทั้งหมดวาดบนผืนคงที่ **1920×1080** (`.tv-stage`) แล้ว `transform: scale()` ให้พอดีจอแบบยูนิฟอร์ม (`useStageScale`) — เลย์เอาต์เหมือนกันเป๊ะทุกความละเอียด ต่างแค่ตัวคูณ ค่า `zoom` (<1) เผื่อขอบ overscan ของทีวี ปรับได้ในตั้งค่า

### 2. หมากเดินจริง (`TokenLayer`)
หมากเป็น overlay วางทับกระดาน วัดพิกัดกลางของแต่ละช่องจาก DOM จริง (`offsetLeft/offsetTop` = พิกัด layout ไม่ขึ้นกับ scale) แล้วเลื่อน **ทีละช่อง** (160ms/ก้าว + CSS transition) บนการเดินปกติ และเลื่อนตรงเมื่อ teleport/เข้าคุก วัดพิกัดใหม่เมื่อตำแหน่งเปลี่ยน/dock เปลี่ยนขนาด/จอ resize (ResizeObserver)

### 3. เสียงสังเคราะห์ (`audio`)
Web Audio API สร้าง stinger สั้นๆ (เต๋า/ซื้อ/ค่าเช่า/การ์ด/คุก/ชนะ) แบบไม่ต้องมีไฟล์เสียง map จาก `events[0]` ล่าสุด → เสียง ปลดล็อก AudioContext ที่ gesture แรก (นโยบาย autoplay) เปิด/ปิดได้ในตั้งค่า

### 4. ตั้งค่า + reduced motion
`TvSettings { sound, motion, zoom }` เก็บใน `localStorage` ปิด `motion` → `[data-motion="off"]` ปิดแอนิเมชันทั้งหมด + หมากเลื่อนตรง

---

## ฝั่งมือถือ (`apps/phone/src/main.tsx`)

- เก็บ session `{roomCode, playerId}` ใน `localStorage` → เมื่อ socket `connect` (รวมถึง reconnect อัตโนมัติของ Socket.IO) ลอง `rejoinRoom` ให้เอง ถ้า session เก่าใช้ไม่ได้ก็เคลียร์เงียบๆ แล้วโชว์หน้าเข้าห้องตามปกติ
- UI สลับตามสถานการณ์: ข้อเสนอเทรดเข้า / ประมูล / รอเทรดตอบกลับ ขึ้นเต็มจอแทนแท็บปกติ (เล่น/จัดการ/เทรด)
- `buzz()` สั่น (navigator.vibrate) ตอนกดแอ็กชัน + จุดสถานะการเชื่อมต่อ

---

## วิธีต่อยอดที่พบบ่อย

| อยากทำ | แก้ที่ไหน |
| --- | --- |
| เพิ่ม/แก้ช่องบนกระดาน | `packages/rules/src/board.ts` (`BOARD`) — ระวังต้องครบ 40 ช่อง และ `positionFor()` ใน tv คาดเลย์เอาต์ 11×11 |
| เพิ่มการ์ดดวง/งานบุญ | `CHANCE_DECK` / `COMMUNITY_DECK` ใน `board.ts` |
| ปรับสมดุล (ราคา/ค่าเช่า/เงินเดือน/ภาษี) | `board.ts` (ตัวเลขช่อง) + ค่าคงที่ใน `reducer.ts` (`STARTING_MONEY`, `JAIL_FINE`, บันได rent ใน `prop()`) |
| เพิ่มกฎ/แอ็กชันใหม่ | เพิ่ม type ใน `types.ts` (`GameAction`) → จัดการใน `reduceGameState` → เพิ่มปุ่มฝั่ง phone → ส่งผ่าน `playerAction` |
| เพิ่มเสียง/แอนิเมชันทีวี | `audio` recipes + `stingerForEvent` ใน `apps/tv/src/main.tsx` |
| ปรับความเก่ง/นิสัยบอท | `decideBotAction` + `botBuildAction` + ค่าคงที่ (`BOT_DELAY_MS`, `BOT_CASH_RESERVE`, `BOT_ROSTER`) ใน `apps/server/src/index.ts` |

**กฎเหล็ก:** อย่าใส่ตรรกะเกมไว้ใน client ใส่ใน `packages/rules` เท่านั้น แล้วเขียนเทสต์ใน `packages/rules/test/` (Vitest) ให้ครอบ branch ใหม่

---

## เทสต์

```bash
npm test          # Vitest — ตรรกะเกม (packages/rules)
npm run build     # typecheck + build ทุก workspace
```

เทสต์ครอบ: ซื้อ/ค่าเช่า/แต้มคู่/ผูกขาดโซน/even build/ประมูล/เทรด/เข้าคุก/`rollCount` มี smoke test ด้วย Playwright (TV 4K + 2 มือถือ + เริ่มเกม + ทอย) ใช้ตรวจ runtime error และพิกัดหมากระหว่างพัฒนา
