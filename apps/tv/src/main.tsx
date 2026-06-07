import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import QRCode from "qrcode";
import { io, type Socket } from "socket.io-client";
import {
  Banknote,
  BookOpen,
  Building2,
  Crown,
  Hammer,
  History,
  Home,
  Landmark,
  Play,
  Repeat,
  RotateCcw,
  Settings,
  Sparkles,
  Timer,
  Users,
  X
} from "lucide-react";
import { BOARD, GROUPS, type GameState, type OwnableTile, type Player, type Tile } from "@siamsetthi/rules";
import type { ClientToServerEvents, ServerToClientEvents } from "@siamsetthi/shared";
import "./styles.css";

const serverUrl = import.meta.env.VITE_SERVER_URL ?? `http://${window.location.hostname}:4000`;

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

function App() {
  const [socket, setSocket] = useState<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [overlay, setOverlay] = useState<null | "assets" | "history" | "hint">(null);
  const lastCardId = useRef<string | null>(null);
  const [cardFlash, setCardFlash] = useState(false);

  const joinUrl = useMemo(() => {
    if (!roomCode) return "";
    return `http://${window.location.hostname}:5174/?room=${roomCode}`;
  }, [roomCode]);

  useEffect(() => {
    const next: Socket<ServerToClientEvents, ClientToServerEvents> = io(serverUrl);
    setSocket(next);
    next.emit("createRoom");
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
    <div className="tv-root">
      <div className="starfield" aria-hidden />
      <div className="aurora" aria-hidden />

      <SideMenu />

      <main className="tv-layout">
        <section className="board-area">
          <Board state={state} />
          <PlayerDock state={state} />
        </section>

        <aside className="rail">
          <InvitePanel roomCode={roomCode} qrDataUrl={qrDataUrl} joinUrl={joinUrl} players={players.length} />

          <TurnPanel
            phase={phase}
            currentPlayer={currentPlayer}
            dice={state?.dice ?? null}
            isDoubles={state?.isDoubles ?? false}
            remaining={remaining}
            timerPct={timerPct}
          />

          <ControlPanel
            phase={phase}
            canStart={Boolean(socket && roomCode && players.length >= 2)}
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
        <Overlay kind={overlay} state={state} onClose={() => setOverlay(null)} />
      ) : null}
    </div>
  );
}

/* --------------------------------- panels --------------------------------- */

function SideMenu() {
  return (
    <nav className="side-menu" aria-label="เมนู">
      <button type="button">
        <Settings size={26} />
        <span>ตั้งค่า</span>
      </button>
      <button type="button">
        <BookOpen size={26} />
        <span>กติกา</span>
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
  players
}: {
  roomCode: string | null;
  qrDataUrl: string;
  joinUrl: string;
  players: number;
}) {
  return (
    <div className="panel invite-panel">
      <div className="ribbon" aria-hidden />
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
  timerPct
}: {
  phase: GameState["phase"];
  currentPlayer: Player | null;
  dice: [number, number] | null;
  isDoubles: boolean;
  remaining: number | null;
  timerPct: number;
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

      <div className="dice-area">
        <Die value={dice?.[0] ?? 1} color="red" />
        <Die value={dice?.[1] ?? 1} color="blue" />
        <div className="dice-total">
          <span>รวม</span>
          <strong>{dice ? dice[0] + dice[1] : "—"}</strong>
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
  onStart,
  onReset,
  onOverlay
}: {
  phase: GameState["phase"];
  canStart: boolean;
  onStart: () => void;
  onReset: () => void;
  onOverlay: (o: "assets" | "history" | "hint") => void;
}) {
  if (phase === "lobby") {
    return (
      <div className="panel control-panel">
        <button className="start-button" disabled={!canStart} onClick={onStart}>
          <Play size={24} /> เริ่มเกม
        </button>
        <p className="control-hint">{canStart ? "พร้อมแล้ว! กดเริ่มเกมได้เลย" : "ต้องมีผู้เล่นอย่างน้อย 2 คน"}</p>
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

function Board({ state }: { state: GameState | null }) {
  return (
    <div className="board-frame">
      <div className="board">
        {BOARD.map((tile, index) => (
          <TileCell key={tile.id} tile={tile} index={index} state={state} />
        ))}
        <BoardCenter state={state} />
      </div>
    </div>
  );
}

function TileCell({ tile, index, state }: { tile: Tile; index: number; state: GameState | null }) {
  const { col, row, side } = positionFor(index);
  const owner = state?.players.find((p) => state.ownership[tile.id] === p.id) ?? null;
  const here = state?.players.filter((p) => p.position === index && p.status === "active") ?? [];
  const pending = state?.pendingPurchaseTileId === tile.id;
  const buildings = state?.buildings[tile.id] ?? 0;
  const mortgaged = state?.mortgaged[tile.id] ?? false;
  const price = "price" in tile ? tile.price : null;

  const groupColor = "group" in tile ? GROUPS[tile.group].color : tile.accent;

  if (side === "corner") {
    return (
      <div className="tile corner" style={{ gridColumn: col, gridRow: row }} data-kind={tile.kind}>
        <span className="corner-icon">{tile.icon}</span>
        <strong>{tile.name}</strong>
        {tile.kind === "start" ? <small>฿2,000</small> : null}
        <TokenStack players={here} />
      </div>
    );
  }

  return (
    <div
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
      <TokenStack players={here} />
    </div>
  );
}

function TokenStack({ players }: { players: Player[] }) {
  if (!players.length) return null;
  return (
    <div className="token-stack">
      {players.map((p) => (
        <span key={p.id} className="token" style={{ background: p.color }} title={p.name}>
          {p.token}
        </span>
      ))}
    </div>
  );
}

function BoardCenter({ state }: { state: GameState | null }) {
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
      <div className="center-dice">
        <Die value={dice?.[0] ?? 3} color="red" />
        <Die value={dice?.[1] ?? 5} color="blue" />
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

function Die({ value, color }: { value: number; color: "red" | "blue" }) {
  const v = Math.max(1, Math.min(6, value));
  const pips = PIPS[v];
  return (
    <span className={`die die-${color}`} aria-label={`ลูกเต๋า ${v}`}>
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
        <span className="card-kicker">{card.tone === "bad" ? "การ์ดดวง" : "การ์ดดวง"}</span>
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
  onClose
}: {
  kind: "assets" | "history" | "hint";
  state: GameState | null;
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
      </div>
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
