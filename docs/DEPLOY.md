# 🚀 การติดตั้งและ Deploy

**สถาปัตยกรรมใหม่ (single-origin):** เซิร์ฟเวอร์เกมเสิร์ฟทุกอย่างบน **พอร์ตเดียว** —
จอกระดาน (TV) ที่ `/`, จอยมือถือที่ `/phone`, และ Socket.IO ที่ `/socket.io` ทั้งหมดอยู่ที่
origin เดียวกัน หน้าเว็บต่อ WebSocket กลับหา origin ตัวเองอัตโนมัติ

> ผลที่ได้: เปิดออกเน็ตผ่าน **โดเมนเดียว** ได้ทันที (เช่น Cloudflare Tunnel) เป็น `wss://`
> ไม่มีปัญหา mixed-content และ **ไม่ต้อง publish พอร์ตหลายตัว**

| ส่วน | เดิม | ตอนนี้ |
| --- | --- | --- |
| TV + phone + server | 3 พอร์ต (5173/5174/4000) | **1 พอร์ต** (server เสิร์ฟ static เอง) |

---

## ☁️ ตัวเลือกที่แนะนำ — Cloudflare Tunnel (เล่นข้ามเน็ต, พอร์ตไม่ชนอะไรเลย) ⭐

รันทั้งเกม + ตัว tunnel ด้วย `docker compose` โดย **ไม่เปิดพอร์ตบน host เลย** —
`cloudflared` คุยกับเกมผ่าน Docker network ภายใน จึงไม่มีทางชนพอร์ตของบริการอื่นบนเครื่อง

### ความต้องการ
- Docker + Docker Compose (Ubuntu: `sudo apt install docker.io docker-compose-plugin` หรือ Docker Engine ทางการ)
- Cloudflare Tunnel + **token** (Zero Trust → Networks → Tunnels → สร้าง tunnel → คัดลอก token)
- โดเมนที่เพิ่มไว้ใน Cloudflare (สำหรับตั้ง public hostname)

### รัน (3 ขั้น)
```bash
git clone https://github.com/golfgenesis/monopoly-tv-game.git
cd monopoly-tv-game

# 1) ใส่ token ลง .env  (ไฟล์นี้ถูก gitignore ไว้ — ปลอดภัย ไม่หลุดขึ้น git)
cp .env.example .env
$EDITOR .env          # วาง TUNNEL_TOKEN=eyJ...

# 2) build + รัน (เกม + tunnel)
docker compose up -d --build
```

**3) ผูก hostname เข้ากับบริการ** (ทำครั้งเดียวใน Cloudflare Dashboard):
Zero Trust → **Networks → Tunnels → (tunnel ของคุณ) → Public Hostname → Add**
- **Subdomain/Domain:** เลือกโดเมนของคุณ (เช่น `monopoly.example.com`)
- **Service:** `HTTP`  →  `localhost:3308`

> `cloudflared` รันใน network namespace เดียวกับ container เกม (`network_mode: service:app`
> ใน `docker-compose.yml`) ดังนั้น `localhost:3308` = ตัวเกมโดยตรง — **ค่า port ต้องตรงกัน**
> ระหว่าง dashboard (`localhost:3308`) กับ `PORT` ใน compose

เท่านั้น! เปิด **`https://monopoly.example.com`** บนทีวี, สแกน QR → มือถือเด้งไป `https://monopoly.example.com/phone/?room=...` เอง

> **ทำไมพอร์ตไม่ชน:** `docker-compose.yml` ไม่ได้ `publish` พอร์ตใดๆ ออก host เลย
> เกมฟังอยู่ที่ `3308` **ภายใน** container namespace → บนเครื่อง Ubuntu ไม่มีพอร์ตใหม่ถูกเปิดเลย

### คำสั่งที่ใช้บ่อย
```bash
docker compose logs -f app          # log เกม
docker compose logs -f cloudflared  # log tunnel (ดูว่าต่อ edge สำเร็จ)
docker compose restart              # รีสตาร์ต
docker compose down                 # หยุด
docker compose up -d --build        # อัปเดตโค้ดใหม่แล้ว build+รันใหม่
```

### อยากเล่น LAN ด้วย (นอกจาก tunnel)
แก้ `docker-compose.yml` เอา comment ออกที่ `ports:` แล้วเลือกพอร์ต host ที่ว่าง เช่น `18080:3308`
จากนั้นเปิดทีวีที่ `http://<ip-ubuntu>:18080` ได้ (ตรวจพอร์ตว่างด้วย `ss -tlnp`)

---

## 🐳 ตัวเลือก B — Docker LAN ล้วน (ไม่ใช้ tunnel)

อยากเล่นในบ้านอย่างเดียว เปิดพอร์ต host ตัวเดียว:

```bash
# แก้ docker-compose.yml: เอา comment ออกที่ ports: - "18080:3308"
docker compose up -d --build
# เปิดทีวี:  http://<ip-ubuntu>:18080     (มือถือสแกน QR เด้งไป /phone เอง)
hostname -I   # หา ip เครื่อง
```

ถ้า ufw เปิดอยู่: `sudo ufw allow 18080/tcp`

---

## 🅰️ ตัวเลือก A — Dev / ไม่ใช้ Docker

```bash
npm install
npm run dev     # server:4000 · TV:5173 · phone:5174 (Vite proxy /socket.io ให้อัตโนมัติ)
```

โหมด production บนเครื่องในบ้าน (พอร์ตเดียว เหมือน Docker):
```bash
npm run build                              # typecheck + build TV & phone → dist
npm start --workspace @siamsetthi/server   # เสิร์ฟทุกอย่างที่ :4000 (ตั้ง PORT ได้)
# เปิดทีวี http://<ip>:4000 · มือถือ http://<ip>:4000/phone
```

---

## 🔄 Auto-Deploy (push แล้วอัปเดตเองบน Ubuntu)

ตั้งให้ Ubuntu **poll `origin/main` ทุก ~5 นาที** เจอ commit ใหม่ก็ `git pull` + `docker compose up -d --build`
ผ่าน **systemd timer** (แพตเทิร์นเดียวกับงาน `f:\home`)

```bash
cd /path/to/monopoly-tv-game
sudo bash scripts/install-auto-deploy.sh          # ติดตั้ง
sudo bash scripts/install-auto-deploy.sh --status # ดูสถานะ
sudo bash scripts/install-auto-deploy.sh --now    # deploy ทันที
tail -f scripts/auto-deploy.log
```
- ปลอดภัย: ข้าม deploy ถ้า working tree สกปรก หรือ local ahead; lock กันยิงซ้ำ; pull `--ff-only`; log หมุนที่ 5 MB
- deploy ด้วย `docker compose up -d --build` โดยปริยาย — เปลี่ยนได้ด้วย env `AUTO_DEPLOY_CMD`
- `.env` ไม่อยู่ใน git → สร้างครั้งเดียวบนเครื่องแล้วอยู่ถาวร (auto-deploy ไม่แตะ)

---

## 🅲 ตัวเลือก C — Split deploy (หน้าเว็บ CDN + server แยก)

ยังทำได้ถ้าต้องการ: ตั้ง env ตอน build ให้หน้าเว็บชี้ไป server คนละที่
- `VITE_SERVER_URL` = origin ของ Socket.IO server (ต้องเป็น `https/wss`)
- `VITE_PHONE_URL` = origin ของหน้า phone (สำหรับ QR บนทีวี)

ค่าเริ่มต้น (ไม่ตั้ง env) = **same-origin** เหมาะกับ single-origin/Docker/tunnel ข้างบน

> เซิร์ฟเวอร์เก็บ state ในหน่วยความจำ → รัน **instance เดียว** (ห้อง = in-memory) เพียงพอสำหรับปาร์ตี้
> ห้องที่ว่าง+ไม่มีคนต่อเกิน 30 นาที ระบบเก็บกวาดทิ้งเอง (กัน memory leak)

---

## สรุปสั้น

- **เล่นข้ามเน็ต + พอร์ตไม่ชน** → Cloudflare Tunnel: `.env` + `docker compose up -d --build` + ตั้ง public hostname → `http://localhost:3308` ⭐
- เล่น LAN → เปิด `ports: 18080:3308` ใน compose
- dev → `npm run dev`
