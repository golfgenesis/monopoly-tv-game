import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import QRCode from "qrcode";
import { io, type Socket } from "socket.io-client";
import { Crown, Dice5, Play, QrCode, Sparkles, Users } from "lucide-react";
import { BOARD, type GameState, type OwnableTile } from "@siamsetthi/rules";
import type { ClientToServerEvents, ServerToClientEvents } from "@siamsetthi/shared";
import "./styles.css";

const serverUrl = import.meta.env.VITE_SERVER_URL ?? `http://${window.location.hostname}:4000`;

function App() {
  const [socket, setSocket] = useState<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const joinUrl = useMemo(() => {
    if (!roomCode) return "";
    return `http://${window.location.hostname}:5174/?room=${roomCode}`;
  }, [roomCode]);

  useEffect(() => {
    const nextSocket: Socket<ServerToClientEvents, ClientToServerEvents> = io(serverUrl);
    setSocket(nextSocket);
    nextSocket.emit("createRoom");
    nextSocket.on("roomCreated", ({ roomCode: nextRoomCode, state: nextState }) => {
      setRoomCode(nextRoomCode);
      setState(nextState);
    });
    nextSocket.on("roomState", ({ state: nextState }) => setState(nextState));
    nextSocket.on("errorMessage", (message) => console.warn(message));
    return () => {
      nextSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!joinUrl) return;
    QRCode.toDataURL(joinUrl, { margin: 1, width: 360, color: { dark: "#101828", light: "#ffffff" } }).then(setQrDataUrl);
  }, [joinUrl]);

  const currentPlayer = state?.players.find((player) => player.id === state.currentPlayerId);

  return (
    <main className="tv-shell">
      <section className="stage">
        <header className="top-bar">
          <div className="brand-lockup">
            <div className="brand-mark">ศ</div>
            <div>
              <h1>เศรษฐีสยาม</h1>
              <p>Modern TV board game, classic Thai 90s rules</p>
            </div>
          </div>
          <div className="status-pill">
            <Sparkles size={20} />
            {state?.phase === "playing" ? `ตาของ ${currentPlayer?.name ?? "-"}` : "รอผู้เล่นเข้าห้อง"}
          </div>
        </header>

        <div className="play-layout">
          <Board state={state} />

          <aside className="control-rail">
            <div className="room-card">
              <div className="card-title">
                <QrCode size={22} />
                Join Room
              </div>
              <div className="room-code">{roomCode ?? "----"}</div>
              {qrDataUrl ? <img className="qr" src={qrDataUrl} alt="QR code for phone controllers" /> : <div className="qr loading" />}
              <p className="join-url">{joinUrl || "กำลังสร้างห้อง..."}</p>
            </div>

            <div className="action-card">
              <button
                className="start-button"
                disabled={!socket || !roomCode || (state?.players.length ?? 0) < 2 || state?.phase !== "lobby"}
                onClick={() => roomCode && socket?.emit("hostStartGame", { roomCode })}
              >
                <Play size={22} />
                เริ่มเกม
              </button>
              <div className="dice-readout">
                <Dice5 size={24} />
                <span>{state?.dice ? `${state.dice[0]} + ${state.dice[1]}` : "รอลูกเต๋า"}</span>
              </div>
            </div>

            <Players state={state} />
          </aside>
        </div>

        <EventTicker state={state} />
      </section>
    </main>
  );
}

function Board({ state }: { state: GameState | null }) {
  return (
    <div className="board-wrap">
      <div className="board">
        {BOARD.map((tile, index) => {
          const owner = state?.players.find((player) => state.ownership[tile.id] === player.id);
          const playersHere = state?.players.filter((player) => player.position === index) ?? [];
          return (
            <div
              className={`tile tile-${index} ${state?.pendingPurchaseTileId === tile.id ? "pending" : ""}`}
              key={tile.id}
              style={{ "--accent": tile.accent } as React.CSSProperties}
            >
              <div className="tile-band" />
              <span className="tile-kind">{tile.kind === "property" ? (tile as OwnableTile).district : tile.kind}</span>
              <strong>{tile.name}</strong>
              {"price" in tile ? <small>{tile.price.toLocaleString()}฿</small> : null}
              {owner ? <div className="owner-dot" style={{ background: owner.color }} /> : null}
              <div className="token-stack">
                {playersHere.map((player) => (
                  <span key={player.id} className="token" style={{ background: player.color }}>
                    {player.token}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
        <div className="center-panel">
          <div className="rainbow-line" />
          <h2>ซื้อโฉนด เก็บค่าเช่า ลุ้นดวง</h2>
          <p>มือถือคือ controller ของผู้เล่นแต่ละคน</p>
          <div className="center-stats">
            <span><Users size={18} /> {state?.players.length ?? 0}/6</span>
            <span><Crown size={18} /> {state?.phase === "playing" ? "กำลังเล่น" : "Lobby"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Players({ state }: { state: GameState | null }) {
  return (
    <div className="players-card">
      <div className="card-title">
        <Users size={22} />
        ผู้เล่น
      </div>
      <div className="player-list">
        {(state?.players ?? []).map((player) => (
          <div className={`player-row ${state?.currentPlayerId === player.id ? "current" : ""}`} key={player.id}>
            <span className="player-token" style={{ background: player.color }}>{player.token}</span>
            <div>
              <strong>{player.name}</strong>
              <small>{player.money.toLocaleString()}฿ · {player.properties.length} โฉนด</small>
            </div>
          </div>
        ))}
        {!state?.players.length ? <p className="empty">สแกน QR เพื่อเข้าห้อง</p> : null}
      </div>
    </div>
  );
}

function EventTicker({ state }: { state: GameState | null }) {
  return (
    <div className="event-ticker">
      {(state?.events ?? []).slice(0, 4).map((event) => (
        <div className={`event event-${event.tone}`} key={event.id}>{event.message}</div>
      ))}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
