# 🚀 การติดตั้งและ Deploy

เกมนี้มี 3 ส่วน:

| ส่วน | ชนิด | Deploy ที่ไหนได้ |
| --- | --- | --- |
| `apps/tv` (จอกระดาน) | **เว็บ static** (Vite SPA) | Cloudflare Pages / Netlify / Vercel / static host ใดก็ได้ |
| `apps/phone` (จอยมือถือ) | **เว็บ static** (Vite SPA) | เหมือนกับ TV |
| `apps/server` (เซิร์ฟเวอร์เกม) | **Node.js ที่รันค้าง + WebSocket + เก็บ state ในหน่วยความจำ + ลูป `setInterval`** | ⚠️ ต้องเป็น host ที่รัน Node ค้างได้ — **ไม่ใช่** CF Pages |

> **หัวใจ:** ตัวหน้าเว็บ deploy บน Cloudflare Pages ได้สบาย แต่ **เซิร์ฟเวอร์เกม deploy บน CF Pages ไม่ได้** (เหตุผลด้านล่าง) ต้องแยกไปไว้ที่ host ที่รัน Node แบบ persistent ได้

---

## 🐳 ตัวเลือก A+ — Docker one-shot (แนะนำสำหรับ Ubuntu ที่บ้าน) ⭐

รันทั้ง 3 ส่วน (server + TV + phone) ใน **คอนเทนเนอร์เดียว** คำสั่งเดียวจบ ไม่ต้องตั้ง env อะไรเลย

### ความต้องการ
- ติดตั้ง Docker + Docker Compose (`sudo apt install docker.io docker-compose-plugin` หรือ Docker Engine ทางการ)

### รัน
```bash
git clone <repo> && cd monopoly-tv-game
docker compose up -d --build
```

แค่นั้น! เปิดทีวีไปที่ **`http://<ip-เครื่อง-ubuntu>:5173`**

หา IP เครื่อง Ubuntu:
```bash
hostname -I        # เช่น 192.168.1.50
```

| พอร์ต | บริการ |
| --- | --- |
| `5173` | จอกระดาน (เปิดบนทีวี) |
| `5174` | จอยมือถือ (สแกน QR จากทีวีเปิดเอง) |
| `4000` | เซิร์ฟเวอร์เกม |

> **ทำไมไม่ต้องตั้ง env:** หน้าเว็บหา server จาก `window.location.hostname:4000` เอง — เปิดทีวีด้วย IP ไหน มือถือก็ต่อ IP นั้น ทุกพอร์ตถูก publish จากคอนเทนเนอร์เดียวกัน

### คำสั่งที่ใช้บ่อย
```bash
docker compose logs -f          # ดู log
docker compose restart          # รีสตาร์ต
docker compose down             # หยุด
docker compose up -d --build    # อัปเดตโค้ดใหม่แล้ว build+รันใหม่
```

### เปิดให้เครื่องอื่นในวงเข้าถึง (Firewall)
ถ้า Ubuntu เปิด ufw:
```bash
sudo ufw allow 5173,5174,4000/tcp
```

### เปิดทีวี/มือถืออัตโนมัติเมื่อบูตเครื่อง
`restart: unless-stopped` ใน `docker-compose.yml` ทำให้คอนเทนเนอร์กลับมาเองหลังรีบูต Ubuntu — เปิดเครื่องปุ๊บพร้อมเล่น

> รายละเอียดการตั้งค่าฝั่งทีวี (Google TV / HDMI / Cast) และบอท ดู [SETUP-TCL-GOOGLE-TV.md](SETUP-TCL-GOOGLE-TV.md)

---

## 🅰️ ตัวเลือก A — เล่นในบ้าน (LAN) แบบไม่ใช้ Docker

เหมาะถ้าไม่อยากลง Docker เร็วสุด ฟรี ไม่ต้องใช้อินเทอร์เน็ต

### โหมดพัฒนา
```bash
npm install
npm run dev
```

### โหมด production บนเครื่องในบ้าน (เสถียรกว่า dev)
```bash
npm run build                                  # typecheck + build ทุกตัว
npm start --workspace @siamsetthi/server       # เซิร์ฟเวอร์เกม (รันค้าง, พอร์ต 4000)
npx serve apps/tv/dist -l 5173                 # เสิร์ฟไฟล์ static ของ TV
npx serve apps/phone/dist -l 5174              # เสิร์ฟไฟล์ static ของมือถือ
```

> `apps/server` รันด้วย `tsx` (TypeScript ตรงๆ) ไม่มีขั้น bundle — `npm start` = `tsx src/index.ts` ตั้งพอร์ตได้ด้วย `PORT=4000`

จากนั้นบนทีวีและมือถือใช้ **IP ของเครื่องในบ้าน** (เช่น `http://192.168.1.50:5173`) — รายละเอียดการตั้งบน TCL Google TV ดู [SETUP-TCL-GOOGLE-TV.md](SETUP-TCL-GOOGLE-TV.md)

เคล็ดลับ: ใช้มินิพีซีต่อ HDMI กับทีวีเปิด Chrome คีออสก์ + ตั้ง Static IP ในเราเตอร์ → เปิดทีวีปุ๊บเล่นได้เลย

---

## 🅱️ ตัวเลือก B — เล่นข้ามเน็ต (deploy จริง)

ต้องแยก deploy 2 อย่าง: **(1) เซิร์ฟเวอร์เกม** + **(2) หน้าเว็บ 2 ตัว**

```
[ผู้เล่นทุกที่]  ──https──►  CF Pages: tv + phone (static)
                              │  (เว็บโหลดเสร็จ เปิด WebSocket ไป...)
                              └──wss──►  Node host: apps/server (Render/Railway/Fly/VPS)
```

### 1) Deploy เซิร์ฟเวอร์เกม (เลือก host ที่รัน Node ค้างได้)

ตัวเลือกที่ใช้ได้: **Render · Railway · Fly.io · Heroku · VPS (ของตัวเอง)** — ขอแค่รองรับ Node + WebSocket + กระบวนการรันค้าง

ตัวอย่าง **Render** (Web Service):
- Build command: `npm install`
- Start command: `npm start --workspace @siamsetthi/server`
- ตั้งให้ฟังพอร์ตจาก env `PORT` (โค้ดอ่าน `process.env.PORT` อยู่แล้ว)
- ต้องรองรับ **WebSocket** (Render รองรับ) และให้บริการผ่าน **HTTPS/WSS** อัตโนมัติ
- จด URL ที่ได้ เช่น `https://siam-setthi-server.onrender.com`

> CORS ฝั่งเซิร์ฟเวอร์ตั้ง `origin: "*"` อยู่แล้ว ใช้ข้ามโดเมนได้ทันที (จะล็อกให้แคบลงก็แก้ใน `apps/server/src/index.ts`)

### 2) Deploy หน้าเว็บ TV + Phone บน Cloudflare Pages

สร้าง **2 โปรเจกต์ CF Pages** จาก repo เดียวกัน:

**โปรเจกต์ TV**
| ตั้งค่า | ค่า |
| --- | --- |
| Build command | `npm install && npm run build --workspace @siamsetthi/tv` |
| Build output directory | `apps/tv/dist` |
| Environment variables | `VITE_SERVER_URL=https://siam-setthi-server.onrender.com`  ·  `VITE_PHONE_URL=https://<โดเมนหน้า phone ของคุณ>` |

**โปรเจกต์ Phone**
| ตั้งค่า | ค่า |
| --- | --- |
| Build command | `npm install && npm run build --workspace @siamsetthi/phone` |
| Build output directory | `apps/phone/dist` |
| Environment variables | `VITE_SERVER_URL=https://siam-setthi-server.onrender.com` |

> ทั้ง `VITE_SERVER_URL` และ `VITE_PHONE_URL` ถูกอ่าน **ตอน build** (Vite ฝังค่าเข้าไฟล์) — เปลี่ยนค่าแล้วต้อง **rebuild/redeploy** ใหม่

### ข้อควรระวังสำคัญ ⚠️

- **Mixed content:** เมื่อหน้าเว็บเสิร์ฟผ่าน `https://` (CF Pages บังคับ https) เบราว์เซอร์จะ **ห้ามต่อ `ws://`** ต้องเป็น **`wss://` (TLS)** เท่านั้น → เซิร์ฟเวอร์ต้องอยู่หลัง HTTPS (Render/Railway/Fly จัดให้อัตโนมัติ; ถ้าเป็น VPS ต้องตั้ง reverse proxy + cert เอง เช่น Caddy/Nginx)
- **QR / ลิงก์เข้าห้องบนทีวี:** ตั้ง `VITE_PHONE_URL` ให้ชี้โดเมนหน้า phone ที่ deploy ไว้ ไม่งั้น QR จะชี้ `:5174` ของ host ทีวี (ผิดสำหรับ public)
- **เซิร์ฟเวอร์เก็บ state ในหน่วยความจำ:** ถ้าเซิร์ฟเวอร์รีสตาร์ต/สเกลหลาย instance → ห้องหาย/กระจายคนละเครื่อง สำหรับงานปาร์ตี้ทั่วไปให้รัน **instance เดียว** ก็พอ (ถ้าจะสเกลจริงต้องย้าย state ออกไป Redis/Durable Objects)

---

## ❓ Cloudflare Pages ได้ไหม — สรุปตรงๆ

| ส่วน | CF Pages | เพราะอะไร |
| --- | --- | --- |
| `apps/tv`, `apps/phone` | ✅ **ได้เลย** | เป็นเว็บ static ธรรมดา |
| `apps/server` | ❌ **ไม่ได้ (ตามที่เขียนตอนนี้)** | ต้องการ Node รันค้าง, WebSocket แบบ Socket.IO, ลูป `setInterval`, และ state ในหน่วยความจำ — CF Pages/Workers เป็น serverless อายุสั้น รัน Socket.IO server ไม่ได้ |

### อยากอยู่บน Cloudflare ล้วน ๆ?
ทำได้แต่ต้อง **เขียนเซิร์ฟเวอร์ใหม่** เป็น **Cloudflare Workers + Durable Objects**:
- 1 ห้อง = 1 Durable Object (เก็บ `GameState`)
- ใช้ **WebSocket ดิบ** ของ Workers แทน Socket.IO (เปลี่ยนฝั่ง client เป็น `WebSocket` ปกติด้วย)
- ใช้ **Durable Object Alarms** แทน `setInterval` สำหรับตัวจับเวลา/ขับบอท
- ตรรกะเกมใน `packages/rules` **นำกลับมาใช้ได้ทั้งหมด** (เป็น pure function อยู่แล้ว) — แก้แค่ชั้น transport

นี่เป็นงานพอสมควร แต่ `reduceGameState` ที่แยกออกมาเป็น pure ทำให้พอร์ตได้ไม่ยาก ถ้าต้องการแนวนี้บอกได้ จะร่างให้

### ทางที่ง่ายสุดสำหรับเล่นข้ามเน็ต
**หน้าเว็บ → Cloudflare Pages** + **เซิร์ฟเวอร์ → Render/Railway/Fly (ฟรีทียร์มีพอเล่น)** ตามตัวเลือก B ด้านบน

---

## สรุปสั้น

- เล่นในบ้าน บน Ubuntu/Linux → **`docker compose up -d --build`** (ตัวเลือก A+) คำสั่งเดียวจบ ⭐
- ไม่อยากใช้ Docker → `npm run dev` บนเครื่องในบ้าน (ตัวเลือก A)
- อยากให้เพื่อนต่างที่เข้าเล่น → **CF Pages (หน้าเว็บ) + Render/Railway/Fly (เซิร์ฟเวอร์)** ตั้ง `VITE_SERVER_URL` + `VITE_PHONE_URL` ให้ถูก และต้องเป็น `wss://`
- CF Pages อย่างเดียวทั้งระบบ → ต้องรื้อเซิร์ฟเวอร์ไปเป็น Workers + Durable Objects ก่อน
