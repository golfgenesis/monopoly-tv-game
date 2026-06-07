import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { io, type Socket } from "socket.io-client";
import {
  Banknote,
  Check,
  Dice5,
  DoorOpen,
  Gavel,
  Hammer,
  Home,
  KeyRound,
  Landmark,
  LogIn,
  Repeat,
  ShoppingBag,
  SkipForward,
  Sparkles,
  Trophy,
  Undo2,
  X
} from "lucide-react";
import {
  BOARD,
  GROUPS,
  type GameAction,
  type GameState,
  type GroupId,
  type OwnableTile,
  type Player
} from "@siamsetthi/rules";
import type { ClientToServerEvents, ServerToClientEvents } from "@siamsetthi/shared";
import "./styles.css";

const serverUrl = import.meta.env.VITE_SERVER_URL ?? `http://${window.location.hostname}:4000`;

interface Character {
  key: string;
  emoji: string;
  color: string;
  name: string;
}

const CHARACTERS: Character[] = [
  { key: "pond", emoji: "🧑", color: "#22c55e", name: "ปอนด์" },
  { key: "mind", emoji: "👩", color: "#ef4444", name: "มายด์" },
  { key: "gan", emoji: "🧑‍💼", color: "#3b82f6", name: "กันต์" },
  { key: "aom", emoji: "👧", color: "#eab308", name: "ออม" },
  { key: "tao", emoji: "🧔", color: "#8b5cf6", name: "เต้ย" },
  { key: "fah", emoji: "👩‍🦰", color: "#ec4899", name: "ฟ้า" }
];

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#0ea5e9", "#3b82f6", "#8b5cf6", "#ec4899"];

/* ------------------------------- build rules ------------------------------ */

function membersOf(group: GroupId): OwnableTile[] {
  return BOARD.filter((t): t is OwnableTile => "group" in t && t.group === group);
}

function canBuild(state: GameState, playerId: string, tile: OwnableTile, player: Player): boolean {
  if (tile.kind !== "property") return false;
  if (state.ownership[tile.id] !== playerId) return false;
  const group = membersOf(tile.group);
  if (!group.every((t) => state.ownership[t.id] === playerId)) return false;
  if (group.some((t) => state.mortgaged[t.id])) return false;
  const current = state.buildings[tile.id] ?? 0;
  if (current >= 5) return false;
  const min = Math.min(...group.map((t) => state.buildings[t.id] ?? 0));
  if (current !== min) return false;
  return player.money >= tile.houseCost;
}

function canSell(state: GameState, tile: OwnableTile): boolean {
  if (tile.kind !== "property") return false;
  const current = state.buildings[tile.id] ?? 0;
  if (current <= 0) return false;
  const group = membersOf(tile.group);
  const max = Math.max(...group.map((t) => state.buildings[t.id] ?? 0));
  return current === max;
}

/** A property is tradeable only when its whole color group has no buildings. */
function tradeable(state: GameState, tileId: string): boolean {
  const tile = BOARD.find((t) => t.id === tileId) as OwnableTile | undefined;
  if (!tile || !("group" in tile)) return false;
  return membersOf(tile.group).every((t) => (state.buildings[t.id] ?? 0) === 0);
}

function tileName(id: string): string {
  return BOARD.find((t) => t.id === id)?.name ?? id;
}

function CashStepper({
  label,
  value,
  max,
  onChange
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const step = 100;
  return (
    <div className="cash-stepper">
      <span>{label}</span>
      <div className="stepper">
        <button onClick={() => onChange(Math.max(0, value - step))}>−</button>
        <strong>฿{value.toLocaleString()}</strong>
        <button onClick={() => onChange(Math.min(max, value + step))}>+</button>
      </div>
    </div>
  );
}

/* ---------------------------------- app ----------------------------------- */

function ControllerApp() {
  const [socket, setSocket] = useState<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [roomCode, setRoomCode] = useState(new URLSearchParams(window.location.search).get("room") ?? "");
  const [name, setName] = useState("");
  const [character, setCharacter] = useState<Character>(CHARACTERS[0]);
  const [color, setColor] = useState(CHARACTERS[0].color);
  const [playerId, setPlayerId] = useState("");
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"play" | "manage" | "trade">("play");
  // Trade builder draft
  const [tradeTarget, setTradeTarget] = useState("");
  const [giveProps, setGiveProps] = useState<string[]>([]);
  const [giveCash, setGiveCash] = useState(0);
  const [wantProps, setWantProps] = useState<string[]>([]);
  const [wantCash, setWantCash] = useState(0);

  useEffect(() => {
    const next: Socket<ServerToClientEvents, ClientToServerEvents> = io(serverUrl);
    setSocket(next);
    next.on("joined", (payload) => {
      setPlayerId(payload.playerId);
      setRoomCode(payload.roomCode);
      setState(payload.state);
      setError("");
    });
    next.on("roomState", ({ state: s }) => setState(s));
    next.on("errorMessage", setError);
    return () => {
      next.disconnect();
    };
  }, []);

  const player = state?.players.find((p) => p.id === playerId) ?? null;
  const currentPlayer = state?.players.find((p) => p.id === state.currentPlayerId) ?? null;
  const isMyTurn = Boolean(state && playerId && state.currentPlayerId === playerId && state.phase === "playing");
  const pendingTile = state?.pendingPurchaseTileId
    ? (BOARD.find((t) => t.id === state.pendingPurchaseTileId) as OwnableTile | undefined)
    : null;
  const myTile = player ? BOARD[player.position] : null;

  const myProps = useMemo(() => {
    if (!player) return [] as OwnableTile[];
    return player.properties
      .map((id) => BOARD.find((t) => t.id === id) as OwnableTile | undefined)
      .filter(Boolean) as OwnableTile[];
  }, [player]);

  function joinRoom() {
    socket?.emit("joinRoom", {
      roomCode: roomCode.trim().toUpperCase(),
      name: name.trim() || character.name,
      token: character.emoji,
      color,
      avatar: character.key
    });
  }

  function send(action: GameAction) {
    if (!socket || !state || !playerId) return;
    socket.emit("playerAction", { roomCode: state.roomCode, playerId, action });
  }

  /* ------------------------------ join screen ----------------------------- */
  if (!playerId || !player) {
    return (
      <main className="phone join-screen">
        <div className="join-card">
          <div className="brand">
            <span className="brand-logo">ศ</span>
            <div>
              <h1>เศรษฐีสยาม</h1>
              <p>คอนโทรลเลอร์ผู้เล่น</p>
            </div>
          </div>

          <label className="field">
            <span>รหัสห้อง (ดูบนทีวี)</span>
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="ABCDE"
              inputMode="text"
              autoCapitalize="characters"
            />
          </label>

          <label className="field">
            <span>ชื่อเล่น</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={18} placeholder={character.name} />
          </label>

          <div className="field">
            <span>เลือกตัวละคร</span>
            <div className="char-grid">
              {CHARACTERS.map((c) => (
                <button
                  key={c.key}
                  className={`char${character.key === c.key ? " selected" : ""}`}
                  style={{ ["--c" as string]: c.color }}
                  onClick={() => {
                    setCharacter(c);
                    setColor(c.color);
                  }}
                >
                  <span className="char-face">{c.emoji}</span>
                  <small>{c.name}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>สีประจำตัว</span>
            <div className="color-grid">
              {COLORS.map((c) => (
                <button
                  key={c}
                  aria-label={`สี ${c}`}
                  className={`swatch${color === c ? " selected" : ""}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          <button className="btn primary big" onClick={joinRoom} disabled={!roomCode.trim()}>
            <LogIn size={22} /> เข้าร่วมเกม
          </button>
          {error ? <p className="error">{error}</p> : null}
        </div>
      </main>
    );
  }

  /* -------------------------------- in game ------------------------------- */
  const finished = state?.phase === "finished";
  const winner = state?.players.find((p) => p.id === state.winnerId);
  const waiting = state?.phase === "lobby";

  // Time-sensitive interrupts take over the screen.
  const incomingTrade = state?.trade && state.trade.toId === playerId ? state.trade : null;
  const outgoingTrade = state?.trade && state.trade.fromId === playerId ? state.trade : null;
  const myAuction = state?.auction && state.auction.order.includes(playerId) ? state.auction : null;

  const others = (state?.players ?? []).filter((p) => p.id !== playerId && p.status === "active");
  const target = tradeTarget ? state?.players.find((p) => p.id === tradeTarget) ?? null : null;
  const myTradeProps = myProps.filter((t) => state && tradeable(state, t.id));
  const targetTradeProps = (target?.properties ?? [])
    .map((id) => BOARD.find((t) => t.id === id) as OwnableTile | undefined)
    .filter((t): t is OwnableTile => Boolean(t) && Boolean(state) && tradeable(state!, t!.id));
  const tradeEmpty = giveProps.length === 0 && wantProps.length === 0 && giveCash === 0 && wantCash === 0;
  const canTrade = Boolean(isMyTurn && !pendingTile && !state?.auction && !state?.trade);

  const toggle = (arr: string[], set: (v: string[]) => void, id: string) =>
    set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  function sendTrade() {
    if (!tradeTarget) return;
    send({
      type: "proposeTrade",
      playerId,
      toId: tradeTarget,
      offerProps: giveProps,
      offerCash: giveCash,
      requestProps: wantProps,
      requestCash: wantCash
    });
    setGiveProps([]);
    setWantProps([]);
    setGiveCash(0);
    setWantCash(0);
    setTab("play");
  }

  return (
    <main className="phone" style={{ ["--me" as string]: player.color }}>
      <header className="topbar">
        <div className="me">
          <span className="me-avatar" style={{ background: player.color }}>
            {player.token}
          </span>
          <div>
            <strong>{player.name}</strong>
            <small>
              {finished
                ? "จบเกมแล้ว"
                : waiting
                  ? "รอเริ่มเกมจากทีวี"
                  : isMyTurn
                    ? "ตาของคุณ!"
                    : `ตาของ ${currentPlayer?.name ?? "—"}`}
            </small>
          </div>
        </div>
        <div className="money">
          <Banknote size={18} />฿{player.money.toLocaleString()}
        </div>
      </header>

      {state?.activeCard ? (
        <div className={`card-banner tone-${state.activeCard.tone}`}>
          <Sparkles size={18} />
          <span>{state.activeCard.text}</span>
        </div>
      ) : null}

      {incomingTrade ? (
        <section className="play">
          <div className="trade-incoming">
            <span className="big-kicker">🤝 ข้อเสนอแลกเปลี่ยน</span>
            <h2>{state?.players.find((p) => p.id === incomingTrade.fromId)?.name} เสนอแลกกับคุณ</h2>
            <div className="trade-summary">
              <div className="ts-col get">
                <span>คุณจะได้รับ</span>
                <ul>
                  {incomingTrade.offerProps.map((id) => (
                    <li key={id}>📜 {tileName(id)}</li>
                  ))}
                  {incomingTrade.offerCash > 0 ? <li>💵 ฿{incomingTrade.offerCash.toLocaleString()}</li> : null}
                  {!incomingTrade.offerProps.length && !incomingTrade.offerCash ? (
                    <li className="none">— ไม่มี —</li>
                  ) : null}
                </ul>
              </div>
              <div className="ts-col give">
                <span>คุณจะต้องให้</span>
                <ul>
                  {incomingTrade.requestProps.map((id) => (
                    <li key={id}>📜 {tileName(id)}</li>
                  ))}
                  {incomingTrade.requestCash > 0 ? <li>💵 ฿{incomingTrade.requestCash.toLocaleString()}</li> : null}
                  {!incomingTrade.requestProps.length && !incomingTrade.requestCash ? (
                    <li className="none">— ไม่มี —</li>
                  ) : null}
                </ul>
              </div>
            </div>
            <div className="action-row">
              <button
                className="btn end"
                disabled={player.money < incomingTrade.requestCash}
                onClick={() => send({ type: "respondTrade", playerId, accept: true })}
              >
                <Check size={20} /> ยอมรับ
              </button>
              <button className="btn" onClick={() => send({ type: "respondTrade", playerId, accept: false })}>
                <X size={20} /> ปฏิเสธ
              </button>
            </div>
          </div>
        </section>
      ) : myAuction ? (
        <section className="play">
          <div className="auction-panel">
            <span className="big-kicker">
              <Gavel size={18} /> ประมูลทรัพย์สิน
            </span>
            {(() => {
              const at = BOARD.find((t) => t.id === myAuction.tileId) as OwnableTile;
              const highName = state?.players.find((p) => p.id === myAuction.highBidderId)?.name;
              const curName = state?.players.find((p) => p.id === myAuction.currentBidderId)?.name;
              const myBid = myAuction.currentBidderId === playerId;
              return (
                <>
                  <h2>
                    {at.icon} {at.name}
                  </h2>
                  <div className="auction-now">
                    <span>ราคาสูงสุด</span>
                    <strong>{myAuction.highBid > 0 ? `฿${myAuction.highBid.toLocaleString()}` : "ยังไม่มี"}</strong>
                    {highName ? <em>โดย {highName}</em> : null}
                  </div>
                  {myBid ? (
                    <div className="auction-actions">
                      {[100, 500].map((inc) => {
                        const amt = myAuction.highBid + inc;
                        return (
                          <button
                            key={inc}
                            className="btn primary"
                            disabled={player.money < amt}
                            onClick={() => send({ type: "bidAuction", playerId, amount: amt })}
                          >
                            ประมูล ฿{amt.toLocaleString()}
                          </button>
                        );
                      })}
                      <button className="btn" onClick={() => send({ type: "passAuction", playerId })}>
                        ผ่าน
                      </button>
                    </div>
                  ) : (
                    <p className="waiting-hint">
                      <Sparkles size={18} /> รอ {curName} เสนอราคา...
                    </p>
                  )}
                </>
              );
            })()}
          </div>
        </section>
      ) : outgoingTrade ? (
        <section className="play">
          <div className="status-card">
            <Repeat size={32} />
            <h2>ส่งข้อเสนอแล้ว</h2>
            <p>รอ {state?.players.find((p) => p.id === outgoingTrade.toId)?.name} ตอบรับข้อเสนอ...</p>
          </div>
        </section>
      ) : (
        <>
          <nav className="tabs">
            <button className={tab === "play" ? "active" : ""} onClick={() => setTab("play")}>
              เล่น
            </button>
            <button className={tab === "manage" ? "active" : ""} onClick={() => setTab("manage")}>
              จัดการ ({myProps.length})
            </button>
            <button className={tab === "trade" ? "active" : ""} onClick={() => setTab("trade")}>
              เทรด
            </button>
          </nav>

          {tab === "play" ? (
        <section className="play">
          {finished ? (
            <div className="status-card win">
              <Trophy size={40} />
              <h2>{winner?.id === player.id ? "คุณคือผู้ชนะ! 🎉" : `${winner?.name ?? "—"} ชนะเกม`}</h2>
              <p>ดูสรุปอันดับบนหน้าจอทีวี</p>
            </div>
          ) : waiting ? (
            <div className="status-card">
              <h2>พร้อมแล้ว!</h2>
              <p>รอให้เพื่อนเข้าครบแล้วกด “เริ่มเกม” บนทีวี · ผู้เล่น {state?.players.length}/6</p>
            </div>
          ) : (
            <>
              <div className={`status-card${isMyTurn ? " active" : ""}`}>
                <p className="overline">{isMyTurn ? "ถึงตาคุณแล้ว" : "รอเพื่อนเล่น"}</p>
                <h2>
                  {myTile?.icon} {myTile?.name ?? "—"}
                </h2>
                <p>
                  {state?.dice
                    ? `ลูกเต๋าล่าสุด ${state.dice[0]} + ${state.dice[1]} = ${state.dice[0] + state.dice[1]}`
                    : "รอการทอยลูกเต๋า"}
                  {player.inJail ? " · คุณติดอยู่ในคุก 🚧" : ""}
                </p>
              </div>

              {/* Deed for sale */}
              {isMyTurn && pendingTile ? (
                <div className="deed" style={{ ["--accent" as string]: pendingTile.accent }}>
                  <span className="deed-kicker">โฉนดพร้อมขาย</span>
                  <h3>
                    {pendingTile.icon} {pendingTile.name}
                  </h3>
                  <small>{GROUPS[pendingTile.group].name}</small>
                  <div className="deed-rows">
                    <div>
                      <span>ราคา</span>
                      <strong>฿{pendingTile.price.toLocaleString()}</strong>
                    </div>
                    <div>
                      <span>ค่าเช่าเริ่มต้น</span>
                      <strong>฿{pendingTile.rent[0].toLocaleString()}</strong>
                    </div>
                  </div>
                  <div className="deed-actions">
                    <button
                      className="btn primary"
                      disabled={player.money < pendingTile.price}
                      onClick={() => send({ type: "buyTile", playerId })}
                    >
                      <ShoppingBag size={20} /> ซื้อ ฿{pendingTile.price.toLocaleString()}
                    </button>
                    <button className="btn ghost" onClick={() => send({ type: "skipBuy", playerId })}>
                      <SkipForward size={20} /> ข้าม
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Jail options */}
              {isMyTurn && player.inJail && state?.canRoll ? (
                <div className="action-stack">
                  <button className="btn primary big" onClick={() => send({ type: "rollDice", playerId, dice: [1, 1], draw: 0 })}>
                    <Dice5 size={24} /> ทอยหาแต้มคู่เพื่อออก
                  </button>
                  <div className="action-row">
                    <button
                      className="btn"
                      disabled={player.money < 500}
                      onClick={() => send({ type: "payJail", playerId })}
                    >
                      <KeyRound size={20} /> จ่าย ฿500
                    </button>
                    <button
                      className="btn"
                      disabled={player.jailCards < 1}
                      onClick={() => send({ type: "useJailCard", playerId })}
                    >
                      <DoorOpen size={20} /> ใช้บัตรพ้นโทษ ({player.jailCards})
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Normal roll */}
              {isMyTurn && !player.inJail && state?.canRoll && !pendingTile ? (
                <button className="btn primary big roll" onClick={() => send({ type: "rollDice", playerId, dice: [1, 1], draw: 0 })}>
                  <Dice5 size={28} /> ทอยลูกเต๋า
                </button>
              ) : null}

              {/* End turn */}
              {isMyTurn && !state?.canRoll && !pendingTile ? (
                <button className="btn end big" onClick={() => send({ type: "endTurn", playerId })}>
                  จบตาของฉัน →
                </button>
              ) : null}

              {!isMyTurn ? (
                <div className="waiting-hint">
                  <Sparkles size={18} /> รอ {currentPlayer?.name ?? "ผู้เล่นอื่น"} เล่นให้จบตา แล้วจะถึงตาคุณ
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : tab === "manage" ? (
        <section className="manage">
          {myProps.length === 0 ? (
            <div className="status-card">
              <Home size={32} />
              <h2>ยังไม่มีโฉนด</h2>
              <p>เดินไปช่องที่ดินแล้วกดซื้อในตาของคุณ</p>
            </div>
          ) : (
            myProps.map((tile) => {
              const houses = state?.buildings[tile.id] ?? 0;
              const isMortgaged = state?.mortgaged[tile.id] ?? false;
              const buildable = state && isMyTurn && canBuild(state, playerId, tile, player);
              const sellable = state && isMyTurn && canSell(state, tile);
              const unmortgageCost = Math.round(tile.mortgage * 1.1);
              return (
                <div key={tile.id} className="prop" style={{ ["--accent" as string]: tile.accent }}>
                  <div className="prop-head">
                    <span className="prop-icon">{tile.icon}</span>
                    <div>
                      <strong>{tile.name}</strong>
                      <small>{GROUPS[tile.group].name}</small>
                    </div>
                    <div className="prop-state">
                      {isMortgaged ? (
                        <span className="badge mort">จำนอง</span>
                      ) : houses === 5 ? (
                        <span className="badge hotel">🏨 โรงแรม</span>
                      ) : houses > 0 ? (
                        <span className="badge house">🏠 ×{houses}</span>
                      ) : (
                        <span className="badge">ว่าง</span>
                      )}
                    </div>
                  </div>
                  <div className="prop-actions">
                    {tile.kind === "property" ? (
                      <>
                        <button
                          className="btn sm"
                          disabled={!buildable}
                          onClick={() => send({ type: "buildHouse", playerId, tileId: tile.id })}
                        >
                          <Hammer size={16} /> สร้าง ฿{tile.houseCost.toLocaleString()}
                        </button>
                        <button
                          className="btn sm"
                          disabled={!sellable}
                          onClick={() => send({ type: "sellHouse", playerId, tileId: tile.id })}
                        >
                          <Undo2 size={16} /> ขายคืน
                        </button>
                      </>
                    ) : null}
                    {isMortgaged ? (
                      <button
                        className="btn sm"
                        disabled={!isMyTurn || player.money < unmortgageCost}
                        onClick={() => send({ type: "unmortgage", playerId, tileId: tile.id })}
                      >
                        <Landmark size={16} /> ไถ่ถอน ฿{unmortgageCost.toLocaleString()}
                      </button>
                    ) : (
                      <button
                        className="btn sm"
                        disabled={!isMyTurn || houses > 0}
                        onClick={() => send({ type: "mortgage", playerId, tileId: tile.id })}
                      >
                        <Landmark size={16} /> จำนอง +฿{tile.mortgage.toLocaleString()}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
          {!isMyTurn && myProps.length > 0 ? (
            <p className="manage-hint">* สร้างบ้าน / จำนอง ทำได้เฉพาะในตาของคุณ</p>
          ) : null}
        </section>
      ) : (
        <section className="trade">
          {!canTrade ? (
            <div className="status-card">
              <Repeat size={32} />
              <h2>แลกเปลี่ยน</h2>
              <p>เปิดข้อเสนอแลกเปลี่ยนได้เฉพาะในตาของคุณ (และไม่มีรายการค้างอยู่)</p>
            </div>
          ) : (
            <>
              <div className="trade-build">
                <span className="field-label">เลือกคู่แลกเปลี่ยน</span>
                <div className="target-chips">
                  {others.map((o) => (
                    <button
                      key={o.id}
                      className={`tchip${tradeTarget === o.id ? " sel" : ""}`}
                      style={{ ["--c" as string]: o.color }}
                      onClick={() => {
                        setTradeTarget(o.id);
                        setWantProps([]);
                        setWantCash(0);
                      }}
                    >
                      <span className="token" style={{ background: o.color }}>
                        {o.token}
                      </span>
                      {o.name}
                    </button>
                  ))}
                  {others.length === 0 ? <p className="manage-hint">ไม่มีผู้เล่นอื่น</p> : null}
                </div>
              </div>

              {target ? (
                <>
                  <div className="trade-build">
                    <span className="field-label">คุณให้</span>
                    <div className="pick-list">
                      {myTradeProps.length ? (
                        myTradeProps.map((t) => (
                          <button
                            key={t.id}
                            className={`pick${giveProps.includes(t.id) ? " on" : ""}`}
                            style={{ ["--accent" as string]: t.accent }}
                            onClick={() => toggle(giveProps, setGiveProps, t.id)}
                          >
                            {t.icon} {t.name}
                          </button>
                        ))
                      ) : (
                        <p className="manage-hint">ไม่มีโฉนดที่แลกได้ (ต้องไม่มีบ้านในโซน)</p>
                      )}
                    </div>
                    <CashStepper label="เงินที่ให้" value={giveCash} max={player.money} onChange={setGiveCash} />
                  </div>

                  <div className="trade-build">
                    <span className="field-label">คุณขอจาก {target.name}</span>
                    <div className="pick-list">
                      {targetTradeProps.length ? (
                        targetTradeProps.map((t) => (
                          <button
                            key={t.id}
                            className={`pick${wantProps.includes(t.id) ? " on" : ""}`}
                            style={{ ["--accent" as string]: t.accent }}
                            onClick={() => toggle(wantProps, setWantProps, t.id)}
                          >
                            {t.icon} {t.name}
                          </button>
                        ))
                      ) : (
                        <p className="manage-hint">อีกฝ่ายไม่มีโฉนดที่แลกได้</p>
                      )}
                    </div>
                    <CashStepper label="เงินที่ขอ" value={wantCash} max={target.money} onChange={setWantCash} />
                  </div>

                  <button className="btn primary big" disabled={tradeEmpty} onClick={sendTrade}>
                    <Repeat size={22} /> ส่งข้อเสนอ
                  </button>
                </>
              ) : (
                <p className="manage-hint">เลือกผู้เล่นที่ต้องการแลกเปลี่ยนก่อน</p>
              )}
            </>
          )}
        </section>
      )}
        </>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<ControllerApp />);
