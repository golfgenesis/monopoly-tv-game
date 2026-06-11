import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import QRCode from "qrcode";
import { io, type Socket } from "socket.io-client";
import {
  Banknote,
  BookOpen,
  Bot,
  Building2,
  Crown,
  Hammer,
  History,
  Home,
  Landmark,
  Minus,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  Settings,
  Sparkles,
  Timer,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
  Zap
} from "lucide-react";
import { BOARD, GROUPS, type GameState, type OwnableTile, type Player, type Tile } from "@siamsetthi/rules";
import type { ClientToServerEvents, ServerToClientEvents } from "@siamsetthi/shared";
import "./styles.css";

const serverUrl = import.meta.env.VITE_SERVER_URL ?? `http://${window.location.hostname}:4000`;

/* ----------------------------- TV stage scaling --------------------------- */

// The whole TV UI is authored at a fixed 1920×1080 design canvas and scaled
// uniformly to fill the screen. This keeps the layout identical and crisp on a
// 1080p preview, a 4K 75" TV, and a desktop browser, and makes couch-distance
// readability predictable. `zoom` (< 1) pulls content inward on TVs that overscan.
const DESIGN_W = 1920;
const DESIGN_H = 1080;

function useStageScale(zoom: number): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const compute = () => {
      const fit = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
      setScale(fit * zoom);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [zoom]);
  return scale;
}

/* ------------------------------ settings store ---------------------------- */

interface TvSettings {
  sound: boolean;
  motion: boolean;
  /** Overscan compensation: 0.85–1.0 of fitted scale. */
  zoom: number;
}
const SETTINGS_KEY = "siamsetthi.tv.settings";
const DEFAULT_SETTINGS: TvSettings = { sound: true, motion: true, zoom: 0.98 };

function loadSettings(): TvSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<TvSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
function saveSettings(s: TvSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/* -------------------------------- audio fx -------------------------------- */

// Tiny synthesized stinger engine — no asset files, retro arcade blips that
// suit the 90s toy-box mood. All sounds are gated behind the sound setting.
type Stinger = "dice" | "buy" | "rent" | "card" | "jail" | "win" | "turn" | "bust";

const audio = (() => {
  let ctx: AudioContext | null = null;
  let enabled = true;

  function ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }

  function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number): void {
    const ac = ctx;
    if (!ac) return;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime + start);
    g.gain.setValueAtTime(0.0001, ac.currentTime + start);
    g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(ac.currentTime + start);
    osc.stop(ac.currentTime + start + dur + 0.02);
  }

  const recipes: Record<Stinger, () => void> = {
    dice: () => {
      for (let i = 0; i < 4; i += 1) tone(180 + i * 20, i * 0.05, 0.05, "square", 0.12);
    },
    buy: () => {
      tone(523, 0, 0.1, "triangle", 0.18);
      tone(784, 0.09, 0.16, "triangle", 0.18);
    },
    rent: () => {
      tone(330, 0, 0.12, "sawtooth", 0.14);
      tone(247, 0.1, 0.18, "sawtooth", 0.14);
    },
    card: () => {
      tone(660, 0, 0.08, "sine", 0.16);
      tone(880, 0.08, 0.14, "sine", 0.16);
    },
    jail: () => {
      tone(196, 0, 0.18, "sawtooth", 0.16);
      tone(147, 0.16, 0.26, "sawtooth", 0.16);
    },
    bust: () => {
      tone(220, 0, 0.2, "sawtooth", 0.18);
      tone(165, 0.18, 0.22, "sawtooth", 0.18);
      tone(110, 0.36, 0.4, "sawtooth", 0.18);
    },
    turn: () => tone(587, 0, 0.1, "triangle", 0.12),
    win: () => {
      const notes = [523, 659, 784, 1047];
      notes.forEach((n, i) => tone(n, i * 0.13, 0.22, "triangle", 0.2));
    }
  };

  return {
    setEnabled(v: boolean) {
      enabled = v;
    },
    unlock() {
      ensure();
    },
    play(name: Stinger) {
      if (!enabled) return;
      if (!ensure()) return;
      recipes[name]();
    }
  };
})();

/** Map a game log tone/keyword to a stinger. */
function stingerForEvent(message: string, tone: string): Stinger | null {
  if (/ล้มละลาย/.test(message)) return "bust";
  if (/คุก/.test(message)) return "jail";
  if (/ซื้อ|ชนะประมูล/.test(message)) return "buy";
  if (/ค่าเช่า|เสีย|จ่าย/.test(message)) return "rent";
  if (/การ์ด/.test(message)) return "card";
  if (/เศรษฐีที่ยิ่งใหญ่/.test(message)) return "win";
  if (tone === "turn") return "turn";
  return null;
}

/* ----------------------------- board geometry ---------------------------- */

type Side = "top" | "bottom" | "left" | "right" | "corner";

function positionFor(index: number): { col: number; row: number; side: Side } {
  if (index === 0) return { col: 11, row: 11, side: "corner" };
  if (index <= 9) return { col: 11 - index, row: 11, side: "bottom" };
  if (index === 10) return { col: 1, row: 11, side: "corner" };
  if (index <= 19) return { col: 1, row: 21 - index, side: "left" };
  if (index === 20) return { col: 1, row: 1, side: "corner" };
  if (index <= 29) return { col: index - 19, row: 1, side: "top" };
  if (index === 30) return { col: 11, row: 1, side: "corner" };
  return { col: 11, row: index - 29, side: "right" };
}

/* --------------------------------- helpers -------------------------------- */

function houseCounts(state: GameState, player: Player): { houses: number; hotels: number } {
  let houses = 0;
  let hotels = 0;
  for (const tileId of player.properties) {
    const n = state.buildings[tileId] ?? 0;
    if (n === 5) hotels += 1;
    else houses += n;
  }
  return { houses, hotels };
}

function netWorth(state: GameState, player: Player): number {
  let worth = player.money;
  for (const tileId of player.properties) {
    const tile = BOARD.find((t) => t.id === tileId) as OwnableTile | undefined;
    if (!tile) continue;
    if (!state.mortgaged[tileId]) worth += tile.price;
    const n = state.buildings[tileId] ?? 0;
    worth += n * tile.houseCost;
  }
  return worth;
}

/* ----------------------------------- app ---------------------------------- */

type OverlayKind = "assets" | "history" | "hint" | "settings" | "rules";

function App() {
  const [socket, setSocket] = useState<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [overlay, setOverlay] = useState<null | OverlayKind>(null);
  const [connected, setConnected] = useState(false);
  const [settings, setSettings] = useState<TvSettings>(loadSettings);
  const lastCardId = useRef<string | null>(null);
  const [cardFlash, setCardFlash] = useState(false);
  const lastEventId = useRef<string | null>(null);
  const lastRollCount = useRef(0);
  const [rolling, setRolling] = useState(false);

  const scale = useStageScale(settings.zoom);

  const updateSettings = useCallback((patch: Partial<TvSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  // Keep the audio engine in sync with the sound setting.
  useEffect(() => {
    audio.setEnabled(settings.sound);
  }, [settings.sound]);

  // Reflect the reduced-motion setting on the document for CSS to key off.
  useEffect(() => {
    document.documentElement.dataset.motion = settings.motion ? "on" : "off";
  }, [settings.motion]);

  // Unlock the AudioContext on the first user gesture (browser autoplay policy).
  useEffect(() => {
    const unlock = () => audio.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const joinUrl = useMemo(() => {
    if (!roomCode) return "";
    // LAN default: phone app on the same host at :5174. For a public deploy set
    // VITE_PHONE_URL to the phone app's deployed origin (e.g. https://play.example.com).
    const base = import.meta.env.VITE_PHONE_URL ?? `http://${window.location.hostname}:5174`;
    return `${base.replace(/\/+$/, "")}/?room=${roomCode}`;
  }, [roomCode]);

  useEffect(() => {
    const next: Socket<ServerToClientEvents, ClientToServerEvents> = io(serverUrl);
    setSocket(next);
    next.on("connect", () => {
      setConnected(true);
      next.emit("createRoom");
    });
    next.on("disconnect", () => setConnected(false));
    next.on("roomCreated", ({ roomCode: rc, state: s }) => {
      setRoomCode(rc);
      setState(s);
    });
    next.on("roomState", ({ state: s }) => setState(s));
    next.on("errorMessage", (m) => console.warn(m));
    return () => {
      next.disconnect();
    };
  }, []);

  // Play a stinger for the newest game event (skips the backlog on first load).
  useEffect(() => {
    const latest = state?.events[0];
    if (!latest) return;
    if (lastEventId.current === null) {
      lastEventId.current = latest.id;
      return;
    }
    if (latest.id !== lastEventId.current) {
      lastEventId.current = latest.id;
      const stinger = stingerForEvent(latest.message, latest.tone);
      if (stinger) audio.play(stinger);
    }
  }, [state?.events]);

  // Trigger the dice tumble + sound on every fresh roll.
  useEffect(() => {
    const rc = state?.rollCount ?? 0;
    if (rc === lastRollCount.current) return;
    const isFirst = lastRollCount.current === 0;
    lastRollCount.current = rc;
    if (isFirst || !state?.dice) return;
    audio.play("dice");
    if (!settings.motion) return;
    setRolling(true);
    const t = setTimeout(() => setRolling(false), 620);
    return () => clearTimeout(t);
  }, [state?.rollCount, settings.motion]);

  useEffect(() => {
    if (!joinUrl) return;
    QRCode.toDataURL(joinUrl, { margin: 1, width: 420, color: { dark: "#0b1220", light: "#ffffff" } }).then(setQrDataUrl);
  }, [joinUrl]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Flash the drawn card for a few seconds.
  useEffect(() => {
    const id = state?.activeCard?.id ?? null;
    if (id && id !== lastCardId.current) {
      lastCardId.current = id;
      setCardFlash(true);
      const t = setTimeout(() => setCardFlash(false), 5200);
      return () => clearTimeout(t);
    }
    if (!id) lastCardId.current = null;
  }, [state?.activeCard?.id]);

  const players = state?.players ?? [];
  const currentPlayer = players.find((p) => p.id === state?.currentPlayerId) ?? null;
  const phase = state?.phase ?? "lobby";

  const remaining = state?.turnEndsAt ? Math.max(0, Math.ceil((state.turnEndsAt - now) / 1000)) : null;
  const timerPct = remaining != null && state ? Math.max(0, Math.min(100, (remaining / state.turnSeconds) * 100)) : 0;

  return (
    <div className="tv-viewport">
      <div className="tv-stage" style={{ width: DESIGN_W, height: DESIGN_H, transform: `scale(${scale})` }}>
        <div className="tv-root">
          <div className="starfield" aria-hidden />
          <div className="aurora" aria-hidden />

          <SideMenu onOverlay={setOverlay} settings={settings} onToggleSound={() => updateSettings({ sound: !settings.sound })} />

          <main className="tv-layout">
            <section className="board-area">
              <Board state={state} motion={settings.motion} rolling={rolling} />
              <PlayerDock state={state} />
            </section>

            <aside className="rail">
              <InvitePanel
                roomCode={roomCode}
                qrDataUrl={qrDataUrl}
                joinUrl={joinUrl}
                players={players.length}
                connected={connected}
              />

              <TurnPanel
                phase={phase}
                currentPlayer={currentPlayer}
                dice={state?.dice ?? null}
                isDoubles={state?.isDoubles ?? false}
                remaining={remaining}
                timerPct={timerPct}
                rolling={rolling}
              />

              <ControlPanel
                phase={phase}
                canStart={Boolean(socket && roomCode && players.length >= 2)}
                botCount={players.filter((p) => p.isBot).length}
                canAddBot={Boolean(socket && roomCode) && players.length < 6}
                onAddBot={() => roomCode && socket?.emit("hostAddBot", { roomCode })}
                onRemoveBot={() => roomCode && socket?.emit("hostRemoveBot", { roomCode })}
                onStart={() => roomCode && socket?.emit("hostStartGame", { roomCode })}
                onReset={() => roomCode && socket?.emit("hostResetGame", { roomCode })}
                onOverlay={setOverlay}
              />
            </aside>
          </main>

          {cardFlash && state?.activeCard && !state?.auction && !state?.trade ? <CardModal card={state.activeCard} /> : null}

          {state?.auction ? <AuctionModal state={state} /> : null}
          {state?.trade ? <TradeModal state={state} /> : null}

          {phase === "finished" ? <WinnerModal players={players} winnerId={state?.winnerId ?? null} state={state} /> : null}

          {overlay ? (
            <Overlay kind={overlay} state={state} settings={settings} onUpdate={updateSettings} onClose={() => setOverlay(null)} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- panels --------------------------------- */

function SideMenu({
  onOverlay,
  settings,
  onToggleSound
}: {
  onOverlay: (o: OverlayKind) => void;
  settings: TvSettings;
  onToggleSound: () => void;
}) {
  return (
    <nav className="side-menu" aria-label="เมนู">
      <button type="button" onClick={() => onOverlay("settings")}>
        <Settings size={26} />
        <span>ตั้งค่า</span>
      </button>
      <button type="button" onClick={() => onOverlay("rules")}>
        <BookOpen size={26} />
        <span>กติกา</span>
      </button>
      <button type="button" onClick={onToggleSound} title={settings.sound ? "ปิดเสียง" : "เปิดเสียง"}>
        {settings.sound ? <Volume2 size={26} /> : <VolumeX size={26} />}
        <span>{settings.sound ? "เสียงเปิด" : "เสียงปิด"}</span>
      </button>
      <div className="sticker sticker-map">
        บ้าน
        <br />
        เรือน
        <br />
        ที่ดิน
      </div>
      <div className="sticker sticker-new">
        เกมเศรษฐี
        <br />
        ฉบับใหม่
        <br />
        <small>สนุกกว่าเดิม!</small>
      </div>
    </nav>
  );
}

function InvitePanel({
  roomCode,
  qrDataUrl,
  joinUrl,
  players,
  connected
}: {
  roomCode: string | null;
  qrDataUrl: string;
  joinUrl: string;
  players: number;
  connected: boolean;
}) {
  return (
    <div className="panel invite-panel">
      <div className="ribbon" aria-hidden />
      <span className={`conn-pill${connected ? " on" : ""}`} title={connected ? "เซิร์ฟเวอร์ออนไลน์" : "ออฟไลน์"}>
        {connected ? <Wifi size={18} /> : <WifiOff size={18} />}
        {connected ? "ออนไลน์" : "ออฟไลน์"}
      </span>
      <header className="invite-head">
        <Sparkles className="spark" size={30} />
        <div>
          <h2>เชิญเพื่อนมาเล่น!</h2>
          <p>สแกน QR Code หรือใส่รหัสห้อง</p>
        </div>
      </header>
      <div className="invite-body">
        {qrDataUrl ? <img className="qr" src={qrDataUrl} alt="QR code" /> : <div className="qr loading" />}
        <div className="room-box">
          <span>รหัสห้อง</span>
          <strong>{roomCode ?? "·····"}</strong>
          <small>
            <Users size={18} /> ผู้เล่น {players} / 6
          </small>
        </div>
      </div>
      <div className="join-strip">
        <span>🌐 เข้าเล่นที่</span>
        <strong>{joinUrl ? joinUrl.replace(/^https?:\/\//, "") : "กำลังสร้างห้อง..."}</strong>
      </div>
    </div>
  );
}

function TurnPanel({
  phase,
  currentPlayer,
  dice,
  isDoubles,
  remaining,
  timerPct,
  rolling
}: {
  phase: GameState["phase"];
  currentPlayer: Player | null;
  dice: [number, number] | null;
  isDoubles: boolean;
  remaining: number | null;
  timerPct: number;
  rolling: boolean;
}) {
  const status =
    phase === "lobby"
      ? "รอผู้เล่นเข้าห้องให้ครบแล้วเริ่มเกม"
      : phase === "finished"
        ? "จบเกมแล้ว"
        : currentPlayer?.inJail
          ? "ติดอยู่ในคุก 🚧"
          : dice
            ? `ทอยได้ ${dice[0]} + ${dice[1]}${isDoubles ? " (แต้มคู่!)" : ""}`
            : "กำลังทอยลูกเต๋า...";

  return (
    <div className="panel turn-panel">
      <div className="turn-head">
        <span>ตาของ</span>
        {currentPlayer ? (
          <div className="turn-player">
            <Avatar player={currentPlayer} size={66} />
            <div>
              <h3 style={{ color: currentPlayer.color }}>{currentPlayer.name}</h3>
              <p>{status}</p>
            </div>
          </div>
        ) : (
          <div className="turn-player">
            <div className="avatar avatar-empty">?</div>
            <div>
              <h3>รอผู้เล่น</h3>
              <p>{status}</p>
            </div>
          </div>
        )}
      </div>

      <div className={`dice-area${rolling ? " rolling" : ""}`}>
        <Die value={dice?.[0] ?? 1} color="red" rolling={rolling} />
        <Die value={dice?.[1] ?? 1} color="blue" rolling={rolling} />
        <div className="dice-total">
          <span>รวม</span>
          <strong>{rolling ? "?" : dice ? dice[0] + dice[1] : "—"}</strong>
        </div>
      </div>

      <div className="timer">
        <div className="timer-track">
          <span style={{ width: `${timerPct}%` }} />
        </div>
        <em>
          <Timer size={18} /> เวลาคิด {remaining != null ? remaining : "—"}
        </em>
      </div>
    </div>
  );
}

function ControlPanel({
  phase,
  canStart,
  botCount,
  canAddBot,
  onAddBot,
  onRemoveBot,
  onStart,
  onReset,
  onOverlay
}: {
  phase: GameState["phase"];
  canStart: boolean;
  botCount: number;
  canAddBot: boolean;
  onAddBot: () => void;
  onRemoveBot: () => void;
  onStart: () => void;
  onReset: () => void;
  onOverlay: (o: OverlayKind) => void;
}) {
  if (phase === "lobby") {
    return (
      <div className="panel control-panel">
        <div className="bot-row">
          <button className="bot-btn" onClick={onAddBot} disabled={!canAddBot} autoFocus>
            <Bot size={22} /> เพิ่มบอท
          </button>
          <button className="bot-btn ghost" onClick={onRemoveBot} disabled={botCount === 0}>
            <Minus size={20} /> ลบบอท ({botCount})
          </button>
        </div>
        <button className="start-button" disabled={!canStart} onClick={onStart}>
          <Play size={24} /> เริ่มเกม
        </button>
        <p className="control-hint">
          {canStart
            ? "พร้อมแล้ว! กดเริ่มเกมได้เลย"
            : "เล่นคนเดียว? กด “เพิ่มบอท” 🤖 ให้ครบ 2 คนขึ้นไป"}
        </p>
      </div>
    );
  }

  if (phase === "finished") {
    return (
      <div className="panel control-panel">
        <button className="start-button" onClick={onReset}>
          <RotateCcw size={24} /> เริ่มเกมใหม่
        </button>
        <p className="control-hint">เล่นอีกรอบกับผู้เล่นชุดเดิม</p>
      </div>
    );
  }

  return (
    <div className="panel control-panel actions">
      <button onClick={() => onOverlay("assets")}>
        <Banknote size={28} />
        ดูทรัพย์สิน
      </button>
      <button onClick={() => onOverlay("hint")}>
        <Repeat size={28} />
        แลกเปลี่ยน
      </button>
      <button onClick={() => onOverlay("hint")}>
        <Landmark size={28} />
        จำนอง
      </button>
      <button onClick={() => onOverlay("hint")}>
        <Hammer size={28} />
        สร้างบ้าน
      </button>
      <button onClick={() => onOverlay("history")}>
        <History size={28} />
        ประวัติ
      </button>
    </div>
  );
}

/* ---------------------------------- board --------------------------------- */

function Board({ state, motion, rolling }: { state: GameState | null; motion: boolean; rolling: boolean }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<(HTMLDivElement | null)[]>([]);
  return (
    <div className="board-frame">
      <div className="board" ref={boardRef}>
        {BOARD.map((tile, index) => (
          <TileCell
            key={tile.id}
            tile={tile}
            index={index}
            state={state}
            registerRef={(el) => {
              tileRefs.current[index] = el;
            }}
          />
        ))}
        <BoardCenter state={state} rolling={rolling} />
        <TokenLayer state={state} motion={motion} boardRef={boardRef} tileRefs={tileRefs} />
      </div>
    </div>
  );
}

function TileCell({
  tile,
  index,
  state,
  registerRef
}: {
  tile: Tile;
  index: number;
  state: GameState | null;
  registerRef: (el: HTMLDivElement | null) => void;
}) {
  const { col, row, side } = positionFor(index);
  const owner = state?.players.find((p) => state.ownership[tile.id] === p.id) ?? null;
  const pending = state?.pendingPurchaseTileId === tile.id;
  const buildings = state?.buildings[tile.id] ?? 0;
  const mortgaged = state?.mortgaged[tile.id] ?? false;
  const price = "price" in tile ? tile.price : null;

  const groupColor = "group" in tile ? GROUPS[tile.group].color : tile.accent;

  if (side === "corner") {
    return (
      <div ref={registerRef} className="tile corner" style={{ gridColumn: col, gridRow: row }} data-kind={tile.kind}>
        <span className="corner-icon">{tile.icon}</span>
        <strong>{tile.name}</strong>
        {tile.kind === "start" ? <small>฿2,000</small> : null}
      </div>
    );
  }

  return (
    <div
      ref={registerRef}
      className={`tile edge edge-${side}${pending ? " pending" : ""}${mortgaged ? " mortgaged" : ""}`}
      style={{ gridColumn: col, gridRow: row, ["--accent" as string]: groupColor }}
    >
      <div className={`band band-${side}`}>
        {buildings > 0 ? (
          <div className="buildings">
            {buildings === 5 ? (
              <span className="hotel" title="โรงแรม">
                🏨
              </span>
            ) : (
              Array.from({ length: buildings }).map((_, i) => <span key={i} className="house" />)
            )}
          </div>
        ) : null}
      </div>
      <div className="tile-body">
        <span className="tile-icon">{tile.icon}</span>
        <strong className="tile-name">{tile.name}</strong>
        {price != null ? <small className="tile-price">฿{price.toLocaleString()}</small> : null}
      </div>
      {owner ? <span className="owner-flag" style={{ background: owner.color }} /> : null}
      {mortgaged ? <span className="mortgage-tag">จำนอง</span> : null}
    </div>
  );
}

/**
 * Animated token overlay. Tokens are positioned absolutely over the board and
 * step tile-by-tile around the ring on normal dice moves (and glide directly on
 * teleports / jail). Measuring real tile elements keeps it aligned at any scale.
 */
function TokenLayer({
  state,
  motion,
  boardRef,
  tileRefs
}: {
  state: GameState | null;
  motion: boolean;
  boardRef: React.RefObject<HTMLDivElement | null>;
  tileRefs: React.RefObject<(HTMLDivElement | null)[]>;
}) {
  const players = state?.players ?? [];
  const [centers, setCenters] = useState<{ x: number; y: number; w: number }[]>([]);
  const [display, setDisplay] = useState<Record<string, number>>({});
  const displayRef = useRef<Record<string, number>>({});

  const playerCount = players.length;
  const posKey = players.map((p) => `${p.id}:${p.position}:${p.status}`).join("|");

  const measure = useCallback(() => {
    const arr = (tileRefs.current ?? []).map((el) =>
      el
        ? { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2, w: el.offsetWidth }
        : { x: 0, y: 0, w: 0 }
    );
    setCenters((prev) => {
      // Avoid needless re-renders when nothing moved.
      if (prev.length === arr.length && prev.every((c, i) => c.x === arr[i].x && c.y === arr[i].y && c.w === arr[i].w)) {
        return prev;
      }
      return arr;
    });
  }, [tileRefs]);

  // Measure tile centers (layout coords, scale-independent). Re-measure whenever
  // the board can reshape: player dock grows, a move happens, fonts settle, or
  // the window resizes.
  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (boardRef.current) ro.observe(boardRef.current);
    const t = window.setTimeout(measure, 600);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [measure, boardRef, playerCount, posKey]);

  // Step each token toward its target position.
  useEffect(() => {
    if (!state) return;
    const N = BOARD.length;
    let id = 0;
    const tick = () => {
      const prev = displayRef.current;
      const next = { ...prev };
      let changed = false;
      let unsettled = false;
      for (const p of players) {
        const target = p.position;
        const cur = next[p.id];
        if (cur === undefined) {
          next[p.id] = target;
          changed = true;
          continue;
        }
        if (cur === target) continue;
        const forward = (((target - cur) % N) + N) % N;
        next[p.id] = motion && forward >= 1 && forward <= 12 ? (cur + 1) % N : target;
        changed = true;
        if (next[p.id] !== target) unsettled = true;
      }
      for (const pid of Object.keys(next)) {
        if (!players.some((p) => p.id === pid)) {
          delete next[pid];
          changed = true;
        }
      }
      if (changed) {
        displayRef.current = next;
        setDisplay(next);
      }
      if (!unsettled && id) {
        clearInterval(id);
        id = 0;
      }
    };
    id = window.setInterval(tick, 160);
    tick();
    return () => {
      if (id) clearInterval(id);
    };
  }, [posKey, motion, state]);

  if (!state || centers.length !== BOARD.length) return null;

  // Group tokens by their current displayed tile to cluster them.
  const groups = new Map<number, Player[]>();
  for (const p of players) {
    if (p.status === "bankrupt") continue;
    const idx = display[p.id] ?? p.position;
    const list = groups.get(idx) ?? [];
    list.push(p);
    groups.set(idx, list);
  }

  const nodes: React.ReactNode[] = [];
  for (const [idx, list] of groups) {
    const c = centers[idx];
    if (!c) continue;
    const size = Math.max(16, Math.min(c.w * 0.46, 34));
    list.forEach((p, i) => {
      const ox = ((i % 3) - 1) * size * 0.62;
      const oy = (Math.floor(i / 3) - (list.length > 3 ? 0.5 : 0)) * size * 0.62;
      const isCurrent = state.currentPlayerId === p.id && state.phase === "playing";
      nodes.push(
        <span
          key={p.id}
          className={`piece${isCurrent ? " current" : ""}${p.inJail ? " jailed" : ""}`}
          style={{
            left: c.x + ox,
            top: c.y + oy,
            width: size,
            height: size,
            fontSize: size * 0.56,
            background: p.color,
            transition: motion ? "left .16s linear, top .16s linear" : "none"
          }}
          title={p.name}
        >
          {p.token}
        </span>
      );
    });
  }

  return <div className="token-layer">{nodes}</div>;
}

function BoardCenter({ state, rolling }: { state: GameState | null; rolling: boolean }) {
  const dice = state?.dice;
  return (
    <div className="board-center">
      <div className="rainbow" aria-hidden />
      <div className="skyline" aria-hidden>
        <span className="b1" />
        <span className="b2" />
        <span className="b3" />
        <span className="b4" />
        <span className="b5" />
        <span className="temple" />
      </div>
      <div className="logo">
        <h1>
          เศรษฐี
          <br />
          สยาม
        </h1>
        <strong>เกมซื้อขายที่ดินของคนไทย</strong>
      </div>
      <div className={`center-dice${rolling ? " rolling" : ""}`}>
        <Die value={dice?.[0] ?? 3} color="red" rolling={rolling} />
        <Die value={dice?.[1] ?? 5} color="blue" rolling={rolling} />
      </div>
      <div className="center-stats">
        <span>
          <Users size={18} /> {state?.players.length ?? 0}/6
        </span>
        <span>
          <Crown size={18} /> {state?.phase === "playing" ? "กำลังเล่น" : state?.phase === "finished" ? "จบเกม" : "รอเริ่ม"}
        </span>
      </div>
    </div>
  );
}

/* --------------------------------- dock ----------------------------------- */

function PlayerDock({ state }: { state: GameState | null }) {
  const players = state?.players ?? [];
  const leaderId = players.length
    ? [...players].sort((a, b) => netWorth(state!, b) - netWorth(state!, a))[0]?.id
    : null;

  if (!players.length) {
    return (
      <div className="player-dock">
        <div className="player-card ghost">
          <Users size={26} /> สแกน QR เพื่อเข้าห้อง — รอผู้เล่น
        </div>
      </div>
    );
  }

  return (
    <div className="player-dock" data-count={players.length}>
      {players.map((player) => {
        const { houses, hotels } = houseCounts(state!, player);
        const current = state?.currentPlayerId === player.id;
        return (
          <div
            key={player.id}
            className={`player-card${current ? " current" : ""}${player.status === "bankrupt" ? " bankrupt" : ""}`}
            style={{ ["--player" as string]: player.color }}
          >
            <Avatar player={player} size={58} star={leaderId === player.id} />
            <div className="player-meta">
              <strong>{player.name}</strong>
              <em>฿{player.money.toLocaleString()}</em>
              <div className="chips">
                {player.isBot ? <span className="bot-tag">🤖 บอท</span> : null}
                <span>
                  <Home size={15} /> {houses}
                </span>
                <span>
                  <Building2 size={15} /> {hotels}
                </span>
                {player.inJail ? <span className="jail-chip">🚧 คุก</span> : null}
                {player.status === "bankrupt" ? <span className="bust-chip">ล้มละลาย</span> : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Avatar({ player, size, star }: { player: Player; size: number; star?: boolean }) {
  return (
    <div className="avatar" style={{ width: size, height: size, ["--player" as string]: player.color }}>
      <span style={{ fontSize: size * 0.46 }}>{player.token}</span>
      {star ? <span className="avatar-star">★</span> : null}
    </div>
  );
}

/* ---------------------------------- dice ---------------------------------- */

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8]
};

function Die({ value, color, rolling }: { value: number; color: "red" | "blue"; rolling?: boolean }) {
  const v = Math.max(1, Math.min(6, value));
  const pips = PIPS[v];
  return (
    <span className={`die die-${color}${rolling ? " rolling" : ""}`} aria-label={`ลูกเต๋า ${v}`}>
      {Array.from({ length: 9 }).map((_, i) => (
        <i key={i} className={pips.includes(i) ? "on" : ""} />
      ))}
    </span>
  );
}

/* --------------------------------- modals --------------------------------- */

function CardModal({ card }: { card: NonNullable<GameState["activeCard"]> }) {
  return (
    <div className="card-modal-wrap">
      <div className={`card-modal tone-${card.tone}`}>
        <span className="card-kicker">
          {card.tone === "good" ? "✨ การ์ดโชคดี" : card.tone === "bad" ? "⚠️ การ์ดเคราะห์" : "🃏 การ์ดดวง"}
        </span>
        <div className="card-icon">{card.tone === "good" ? "🎉" : card.tone === "bad" ? "⚠️" : "🃏"}</div>
        <p>{card.text}</p>
      </div>
    </div>
  );
}

function AuctionModal({ state }: { state: GameState }) {
  const a = state.auction!;
  const tile = BOARD.find((t) => t.id === a.tileId) as OwnableTile;
  const byId = (id: string | null) => state.players.find((p) => p.id === id) ?? null;
  const high = byId(a.highBidderId);
  const current = byId(a.currentBidderId);
  return (
    <div className="card-modal-wrap">
      <div className="auction-modal">
        <span className="card-kicker">🔨 ประมูลทรัพย์สิน</span>
        <div className="auction-tile" style={{ borderColor: tile.accent }}>
          <span className="auction-tile-icon">{tile.icon}</span>
          <div>
            <strong>{tile.name}</strong>
            <small>
              {GROUPS[tile.group].name} · ราคาตั้ง ฿{tile.price.toLocaleString()}
            </small>
          </div>
        </div>
        <div className="auction-bid">
          <span>ราคาสูงสุดตอนนี้</span>
          <strong>{a.highBid > 0 ? `฿${a.highBid.toLocaleString()}` : "ยังไม่มีผู้เสนอ"}</strong>
          {high ? <em style={{ color: high.color }}>โดย {high.name}</em> : null}
        </div>
        <div className="auction-players">
          {a.order.map((id) => {
            const p = byId(id);
            if (!p) return null;
            const passed = a.passed.includes(id);
            return (
              <span key={id} className={`abadge${passed ? " passed" : ""}${a.currentBidderId === id ? " turn" : ""}`}>
                <span className="token" style={{ background: p.color }}>
                  {p.token}
                </span>
                {p.name}
                {a.highBidderId === id ? " 👑" : ""}
                {passed ? " ✖" : ""}
              </span>
            );
          })}
        </div>
        <p className="auction-hint">
          ตาเสนอราคาของ <strong style={{ color: current?.color }}>{current?.name}</strong> — เลือกบนมือถือ
        </p>
      </div>
    </div>
  );
}

function TradeModal({ state }: { state: GameState }) {
  const t = state.trade!;
  const byId = (id: string) => state.players.find((p) => p.id === id);
  const from = byId(t.fromId);
  const to = byId(t.toId);
  const nameOf = (id: string) => BOARD.find((x) => x.id === id)?.name ?? id;
  if (!from || !to) return null;
  const side = (props: string[], cash: number) => (
    <ul>
      {props.map((id) => (
        <li key={id}>📜 {nameOf(id)}</li>
      ))}
      {cash > 0 ? <li>💵 ฿{cash.toLocaleString()}</li> : null}
      {!props.length && !cash ? <li className="none">— ไม่มี —</li> : null}
    </ul>
  );
  return (
    <div className="card-modal-wrap">
      <div className="trade-modal">
        <span className="card-kicker">🤝 ข้อเสนอแลกเปลี่ยน</span>
        <div className="trade-cols">
          <div className="trade-col" style={{ borderColor: from.color }}>
            <header>
              <span className="token" style={{ background: from.color }}>
                {from.token}
              </span>
              {from.name} ให้
            </header>
            {side(t.offerProps, t.offerCash)}
          </div>
          <div className="trade-arrow">⇄</div>
          <div className="trade-col" style={{ borderColor: to.color }}>
            <header>
              <span className="token" style={{ background: to.color }}>
                {to.token}
              </span>
              {to.name} ให้
            </header>
            {side(t.requestProps, t.requestCash)}
          </div>
        </div>
        <p className="auction-hint">
          <strong style={{ color: to.color }}>{to.name}</strong> กำลังพิจารณา — ตอบรับหรือปฏิเสธบนมือถือ
        </p>
      </div>
    </div>
  );
}

function WinnerModal({
  players,
  winnerId,
  state
}: {
  players: Player[];
  winnerId: string | null;
  state: GameState | null;
}) {
  const winner = players.find((p) => p.id === winnerId);
  const ranked = state ? [...players].sort((a, b) => netWorth(state, b) - netWorth(state, a)) : players;
  return (
    <div className="card-modal-wrap">
      <div className="winner-modal">
        <Crown size={56} className="crown" />
        <h2>เศรษฐีที่ยิ่งใหญ่!</h2>
        {winner ? (
          <div className="winner-row">
            <Avatar player={winner} size={84} star />
            <strong style={{ color: winner.color }}>{winner.name}</strong>
          </div>
        ) : null}
        <ol className="rank">
          {ranked.map((p, i) => (
            <li key={p.id}>
              <span>{i + 1}.</span>
              <span className="token" style={{ background: p.color }}>
                {p.token}
              </span>
              <strong>{p.name}</strong>
              <em>฿{netWorth(state!, p).toLocaleString()}</em>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Overlay({
  kind,
  state,
  settings,
  onUpdate,
  onClose
}: {
  kind: OverlayKind;
  state: GameState | null;
  settings: TvSettings;
  onUpdate: (patch: Partial<TvSettings>) => void;
  onClose: () => void;
}) {
  return (
    <div className="overlay-wrap" onClick={onClose}>
      <div className="overlay" onClick={(e) => e.stopPropagation()}>
        <button className="overlay-close" onClick={onClose} aria-label="ปิด">
          <X size={26} />
        </button>
        {kind === "assets" ? <AssetsView state={state} /> : null}
        {kind === "history" ? <HistoryView state={state} /> : null}
        {kind === "hint" ? <HintView /> : null}
        {kind === "rules" ? <RulesView /> : null}
        {kind === "settings" ? <SettingsView settings={settings} onUpdate={onUpdate} /> : null}
      </div>
    </div>
  );
}

function SettingsView({ settings, onUpdate }: { settings: TvSettings; onUpdate: (patch: Partial<TvSettings>) => void }) {
  const zoomPct = Math.round(settings.zoom * 100);
  return (
    <div className="settings-view">
      <h2>
        <Settings size={28} /> ตั้งค่า
      </h2>
      <div className="set-row">
        <div>
          <strong>เสียงเอฟเฟกต์</strong>
          <small>เสียงลูกเต๋า ซื้อขาย และการ์ด</small>
        </div>
        <button className={`toggle${settings.sound ? " on" : ""}`} onClick={() => onUpdate({ sound: !settings.sound })}>
          {settings.sound ? <Volume2 size={22} /> : <VolumeX size={22} />}
          {settings.sound ? "เปิด" : "ปิด"}
        </button>
      </div>
      <div className="set-row">
        <div>
          <strong>แอนิเมชัน</strong>
          <small>การเดินหมากและลูกเต๋า (ปิดเพื่อความนิ่ง)</small>
        </div>
        <button className={`toggle${settings.motion ? " on" : ""}`} onClick={() => onUpdate({ motion: !settings.motion })}>
          <Zap size={22} />
          {settings.motion ? "เปิด" : "ปิด"}
        </button>
      </div>
      <div className="set-row">
        <div>
          <strong>ปรับขอบจอ (Overscan)</strong>
          <small>ถ้าขอบภาพถูกตัดบนทีวี ให้ลดค่าลง — ตอนนี้ {zoomPct}%</small>
        </div>
        <div className="zoom-ctl">
          <button onClick={() => onUpdate({ zoom: Math.max(0.85, Math.round((settings.zoom - 0.01) * 100) / 100) })}>
            <Minus size={20} />
          </button>
          <strong>{zoomPct}%</strong>
          <button onClick={() => onUpdate({ zoom: Math.min(1, Math.round((settings.zoom + 0.01) * 100) / 100) })}>
            <Plus size={20} />
          </button>
        </div>
      </div>
      <p className="set-note">การตั้งค่าจะถูกจำไว้ในเครื่องนี้โดยอัตโนมัติ</p>
    </div>
  );
}

function RulesView() {
  return (
    <div className="rules-view">
      <h2>
        <BookOpen size={28} /> กติกาการเล่น
      </h2>
      <ol className="rules-list">
        <li>
          <span className="rn">1</span>
          <div>
            <strong>ทอยลูกเต๋า แล้วเดินตามแต้ม</strong>
            ผู้เล่นผลัดกันทอยลูกเต๋า 2 ลูกบนมือถือ แล้วหมากจะเดินรอบกระดานตามเข็มนาฬิกา ทอย
            <em>แต้มคู่</em> ได้ทอยซ้ำ — แต่ครบ 3 ครั้งติดถูกส่งเข้าคุก
          </div>
        </li>
        <li>
          <span className="rn">2</span>
          <div>
            <strong>ซื้อที่ดิน หรือเปิดประมูล</strong>
            ตกช่องที่ยังไม่มีเจ้าของ เลือก <em>ซื้อ</em> หรือ <em>ข้าม</em> — ถ้าข้าม ทุกคนจะร่วมประมูลแข่งราคากัน
          </div>
        </li>
        <li>
          <span className="rn">3</span>
          <div>
            <strong>เก็บค่าเช่า</strong>
            ใครตกช่องที่เราเป็นเจ้าของต้องจ่ายค่าเช่า — ถือครบทั้งโซนสีเดียวกันค่าเช่าเพิ่มเป็น 2 เท่า
          </div>
        </li>
        <li>
          <span className="rn">4</span>
          <div>
            <strong>สร้างบ้านและโรงแรม</strong>
            ถือครบทั้งโซนสี สร้างบ้านได้ (สร้างเฉลี่ยทั่วโซน) ยิ่งมีบ้าน-โรงแรมค่าเช่ายิ่งพุ่ง
          </div>
        </li>
        <li>
          <span className="rn">5</span>
          <div>
            <strong>การ์ดดวง &amp; งานบุญ</strong>
            ตกช่อง <em>ดวง</em> หรือ <em>งานบุญ</em> เปิดการ์ดรับโชคหรือจ่ายเคราะห์
          </div>
        </li>
        <li>
          <span className="rn">6</span>
          <div>
            <strong>จำนอง &amp; แลกเปลี่ยน</strong>
            ขัดสนเงินสด จำนองโฉนดเอาเงินด่วน หรือยื่นข้อเสนอแลกที่ดิน+เงินกับเพื่อนได้บนมือถือ
          </div>
        </li>
        <li>
          <span className="rn">7</span>
          <div>
            <strong>ผ่านช่องเงินเดือน</strong>
            เดินผ่านหรือหยุดที่ช่องเริ่ม รับเงินเดือน ฿2,000 ทุกครั้ง
          </div>
        </li>
        <li>
          <span className="rn">🏆</span>
          <div>
            <strong>ผู้ชนะ</strong>
            ใครจ่ายหนี้ไม่ไหวถือว่าล้มละลาย เหลือคนสุดท้ายในเกม = เศรษฐีที่ยิ่งใหญ่!
          </div>
        </li>
      </ol>
    </div>
  );
}

function AssetsView({ state }: { state: GameState | null }) {
  const players = state?.players ?? [];
  return (
    <div className="assets-view">
      <h2>
        <Banknote size={28} /> ทรัพย์สินผู้เล่น
      </h2>
      <div className="assets-grid">
        {players.map((p) => {
          const props = p.properties
            .map((id) => BOARD.find((t) => t.id === id) as OwnableTile | undefined)
            .filter(Boolean) as OwnableTile[];
          return (
            <div key={p.id} className="assets-col" style={{ ["--player" as string]: p.color }}>
              <header>
                <span className="token" style={{ background: p.color }}>
                  {p.token}
                </span>
                <strong>{p.name}</strong>
                <em>฿{p.money.toLocaleString()}</em>
              </header>
              <ul>
                {props.length ? (
                  props.map((t) => (
                    <li key={t.id} style={{ borderColor: t.accent }}>
                      <span>{t.icon} {t.name}</span>
                      <small>
                        {state?.mortgaged[t.id] ? "จำนอง" : `฿${t.price.toLocaleString()}`}
                        {(state?.buildings[t.id] ?? 0) > 0
                          ? state!.buildings[t.id] === 5
                            ? " · 🏨"
                            : ` · 🏠×${state!.buildings[t.id]}`
                          : ""}
                      </small>
                    </li>
                  ))
                ) : (
                  <li className="empty">ยังไม่มีโฉนด</li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoryView({ state }: { state: GameState | null }) {
  return (
    <div className="history-view">
      <h2>
        <History size={28} /> ประวัติการเล่น
      </h2>
      <ul>
        {(state?.events ?? []).map((e) => (
          <li key={e.id} className={`ev ev-${e.tone}`}>
            {e.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function HintView() {
  return (
    <div className="hint-view">
      <h2>
        <Hammer size={28} /> ทำรายการบนมือถือ
      </h2>
      <p>
        การ <strong>สร้างบ้าน</strong>, <strong>จำนอง</strong> และ <strong>ซื้อ-ขายโฉนด</strong> ทำได้จากมือถือของผู้เล่น
        — เปิดแท็บ "จัดการ" บนเครื่องของคุณในตาของคุณ
      </p>
      <ul className="hint-list">
        <li>
          <Hammer size={20} /> สร้างบ้าน/โรงแรม ได้เมื่อถือครบทั้งโซนสีเดียวกัน
        </li>
        <li>
          <Landmark size={20} /> จำนองโฉนดเพื่อรับเงินสดด่วน (ต้องรื้อบ้านก่อน)
        </li>
        <li>
          <Repeat size={20} /> ค่าเช่าจะเพิ่มเมื่อมีบ้านและถือครบโซน
        </li>
      </ul>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
