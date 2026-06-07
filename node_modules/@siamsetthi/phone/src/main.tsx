import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { io, type Socket } from "socket.io-client";
import { Banknote, Dice5, Home, LogIn, ShoppingBag, SkipForward } from "lucide-react";
import { BOARD, type GameAction, type GameState, type OwnableTile } from "@siamsetthi/rules";
import type { ClientToServerEvents, ServerToClientEvents } from "@siamsetthi/shared";
import "./styles.css";

const serverUrl = import.meta.env.VITE_SERVER_URL ?? `http://${window.location.hostname}:4000`;
const tokenOptions = ["รถ", "เรือ", "หมวก", "บ้าน", "ดาว", "ถุง"];
const colorOptions = ["#ef4444", "#0ea5e9", "#22c55e", "#f97316", "#8b5cf6", "#ec4899"];

function ControllerApp() {
  const [socket, setSocket] = useState<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [roomCode, setRoomCode] = useState(new URLSearchParams(window.location.search).get("room") ?? "");
  const [name, setName] = useState("");
  const [token, setToken] = useState(tokenOptions[0]);
  const [color, setColor] = useState(colorOptions[0]);
  const [playerId, setPlayerId] = useState("");
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const nextSocket: Socket<ServerToClientEvents, ClientToServerEvents> = io(serverUrl);
    setSocket(nextSocket);
    nextSocket.on("joined", (payload) => {
      setPlayerId(payload.playerId);
      setRoomCode(payload.roomCode);
      setState(payload.state);
      setError("");
    });
    nextSocket.on("roomState", ({ state: nextState }) => setState(nextState));
    nextSocket.on("errorMessage", setError);
    return () => {
      nextSocket.disconnect();
    };
  }, []);

  const player = state?.players.find((candidate) => candidate.id === playerId);
  const currentPlayer = state?.players.find((candidate) => candidate.id === state.currentPlayerId);
  const isMyTurn = Boolean(state && playerId && state.currentPlayerId === playerId);
  const pendingTile = state?.pendingPurchaseTileId ? BOARD.find((tile) => tile.id === state.pendingPurchaseTileId) : null;
  const myTile = player ? BOARD[player.position] : null;

  const myProperties = useMemo(() => {
    if (!player) return [];
    return player.properties.map((tileId) => BOARD.find((tile) => tile.id === tileId)).filter(Boolean);
  }, [player]);

  function joinRoom() {
    socket?.emit("joinRoom", {
      roomCode: roomCode.trim().toUpperCase(),
      name: name.trim() || "เศรษฐีใหม่",
      token,
      color
    });
  }

  function send(action: GameAction) {
    if (!socket || !state || !playerId) return;
    socket.emit("playerAction", { roomCode: state.roomCode, playerId, action });
  }

  if (!playerId || !player) {
    return (
      <main className="phone-shell join-screen">
        <section className="join-card">
          <div className="mini-brand">ศ</div>
          <h1>เข้าห้องเศรษฐีสยาม</h1>
          <label>
            รหัสห้อง
            <input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} maxLength={6} placeholder="ABCD" />
          </label>
          <label>
            ชื่อผู้เล่น
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={18} placeholder="ชื่อของคุณ" />
          </label>
          <div className="option-grid">
            {tokenOptions.map((option) => (
              <button className={token === option ? "selected" : ""} key={option} onClick={() => setToken(option)}>
                {option}
              </button>
            ))}
          </div>
          <div className="color-grid">
            {colorOptions.map((option) => (
              <button
                aria-label={`เลือกสี ${option}`}
                className={color === option ? "selected" : ""}
                key={option}
                onClick={() => setColor(option)}
                style={{ background: option }}
              />
            ))}
          </div>
          <button className="primary" onClick={joinRoom}>
            <LogIn size={22} />
            เข้าร่วม
          </button>
          {error ? <p className="error">{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="phone-shell">
      <header className="player-header">
        <div className="avatar" style={{ background: player.color }}>{player.token}</div>
        <div>
          <h1>{player.name}</h1>
          <p>{state?.phase === "playing" ? `ตอนนี้: ${currentPlayer?.name}` : "รอเริ่มเกมจากทีวี"}</p>
        </div>
      </header>

      <section className="money-card">
        <span><Banknote size={22} /> เงินสด</span>
        <strong>{player.money.toLocaleString()}฿</strong>
      </section>

      <section className={`turn-card ${isMyTurn ? "active" : ""}`}>
        <p className="overline">{isMyTurn ? "ถึงตาคุณแล้ว" : "รอเพื่อนเล่น"}</p>
        <h2>{myTile?.name ?? "Lobby"}</h2>
        <p>{state?.dice ? `ลูกเต๋าล่าสุด ${state.dice[0]} + ${state.dice[1]}` : "เกมเศรษฐีไทยคลาสสิก กดจากมือถือ เล่นบนทีวี"}</p>

        <div className="action-grid">
          <button className="primary" disabled={!isMyTurn || !state?.canRoll} onClick={() => send({ type: "rollDice", playerId, dice: [1, 1] })}>
            <Dice5 size={24} />
            ทอยลูกเต๋า
          </button>
          <button disabled={!isMyTurn || !pendingTile} onClick={() => send({ type: "buyTile", playerId })}>
            <ShoppingBag size={22} />
            ซื้อโฉนด
          </button>
          <button disabled={!isMyTurn || !pendingTile} onClick={() => send({ type: "skipBuy", playerId })}>
            <SkipForward size={22} />
            ข้าม
          </button>
          <button disabled={!isMyTurn || Boolean(pendingTile) || state?.canRoll} onClick={() => send({ type: "endTurn", playerId })}>
            จบตา
          </button>
        </div>
      </section>

      {pendingTile && isMyTurn && "price" in pendingTile ? (
        <section className="deed-card" style={{ "--accent": pendingTile.accent } as React.CSSProperties}>
          <span>โฉนดพร้อมขาย</span>
          <h2>{pendingTile.name}</h2>
          <p>{(pendingTile as OwnableTile).district}</p>
          <div className="deed-row"><span>ราคา</span><strong>{pendingTile.price.toLocaleString()}฿</strong></div>
          <div className="deed-row"><span>ค่าเช่า</span><strong>{pendingTile.rent.toLocaleString()}฿</strong></div>
        </section>
      ) : null}

      <section className="property-list">
        <h2><Home size={20} /> โฉนดของคุณ</h2>
        {myProperties.length ? (
          myProperties.map((tile) => tile && (
            <div className="property-row" key={tile.id} style={{ "--accent": tile.accent } as React.CSSProperties}>
              <span>{tile.name}</span>
              {"rent" in tile ? <strong>{tile.rent.toLocaleString()}฿</strong> : null}
            </div>
          ))
        ) : (
          <p>ยังไม่มีโฉนด ลุ้นซื้อช่องแรกให้ได้</p>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<ControllerApp />);
