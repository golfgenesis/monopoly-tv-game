import cors from "cors";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createInitialState, reduceGameState, type GameAction, type GameState } from "@siamsetthi/rules";
import type { ClientToServerEvents, InterServerEvents, ServerToClientEvents, SocketData } from "@siamsetthi/shared";

interface Room {
  state: GameState;
}

const TURN_MS = 30_000; // think time per turn
const AUTO_STEP_MS = 1_500; // fast-forward AFK / bankrupt turns

const rooms = new Map<string, Room>();
const app = express();
app.use(cors());

app.get("/health", (_request, response) => {
  response.json({ ok: true, rooms: rooms.size });
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
  cors: { origin: "*" }
});

io.on("connection", (socket) => {
  socket.on("createRoom", () => {
    const roomCode = createRoomCode();
    const room: Room = { state: createInitialState(roomCode) };
    rooms.set(roomCode, room);
    socket.data.roomCode = roomCode;
    socket.data.role = "tv";
    socket.join(roomCode);
    socket.emit("roomCreated", { roomCode, state: room.state });
  });

  socket.on("joinRoom", (payload) => {
    const roomCode = payload.roomCode.trim().toUpperCase();
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit("errorMessage", "ไม่พบห้องนี้ ลองเช็ครหัสอีกครั้ง");
      return;
    }
    if (room.state.phase !== "lobby") {
      socket.emit("errorMessage", "เกมเริ่มไปแล้ว ไม่สามารถเข้าร่วมได้");
      return;
    }
    if (room.state.players.length >= 6) {
      socket.emit("errorMessage", "ห้องเต็มแล้ว (สูงสุด 6 คน)");
      return;
    }
    const playerId = createId();
    room.state = reduceGameState(room.state, {
      type: "addPlayer",
      player: {
        id: playerId,
        name: payload.name.trim().slice(0, 18) || `ผู้เล่น ${room.state.players.length + 1}`,
        token: payload.token,
        color: payload.color,
        avatar: payload.avatar
      }
    });
    socket.data.roomCode = roomCode;
    socket.data.playerId = playerId;
    socket.data.role = "phone";
    socket.join(roomCode);
    socket.emit("joined", { playerId, roomCode, state: room.state });
    broadcast(roomCode);
  });

  socket.on("hostStartGame", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return socket.emit("errorMessage", "ไม่พบห้อง");
    room.state = reduceGameState(room.state, { type: "startGame" });
    stampTurn(room, TURN_MS);
    broadcast(payload.roomCode);
  });

  socket.on("hostResetGame", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    room.state = reduceGameState(room.state, { type: "resetGame" });
    room.state.turnEndsAt = null;
    broadcast(payload.roomCode);
  });

  socket.on("playerAction", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return socket.emit("errorMessage", "ไม่พบห้อง");
    const action = normalizeAction(payload.playerId, payload.action);
    room.state = reduceGameState(room.state, action);
    stampTurn(room, TURN_MS);
    broadcast(payload.roomCode);
  });
});

// Turn timer: fast-forward AFK or bankrupt players so the game never stalls.
setInterval(() => {
  const now = Date.now();
  for (const [roomCode, room] of rooms) {
    const state = room.state;
    if (state.phase !== "playing" || !state.turnEndsAt) continue;
    const current = state.players.find((p) => p.id === state.currentPlayerId);
    const bankruptStuck = current?.status === "bankrupt";
    if (bankruptStuck || now >= state.turnEndsAt) {
      autoStep(room, roomCode);
    }
  }
}, 1000);

const port = Number(process.env.PORT ?? 4000);
httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Siam Setthi server listening on http://0.0.0.0:${port}`);
});

function autoStep(room: Room, roomCode: string): void {
  const state = room.state;
  const playerId = state.currentPlayerId;
  if (!playerId) return;
  const current = state.players.find((p) => p.id === playerId);

  let action: GameAction;
  if (state.auction) {
    // Auto-pass whoever is on the clock in the auction.
    action = { type: "passAuction", playerId: state.auction.currentBidderId };
  } else if (state.trade) {
    // Auto-reject a trade the recipient ignored.
    action = { type: "respondTrade", playerId: state.trade.toId, accept: false };
  } else if (current?.status === "bankrupt") {
    action = { type: "endTurn", playerId };
  } else if (state.pendingPurchaseTileId) {
    action = { type: "skipBuy", playerId };
  } else if (state.canRoll) {
    action = { type: "rollDice", playerId, dice: [rollDie(), rollDie()], draw: Math.random() };
  } else {
    action = { type: "endTurn", playerId };
  }

  const actedActor = action.playerId;
  room.state = reduceGameState(state, action);
  // Whoever must act next: auction bidder, trade recipient, or the turn player.
  const next = room.state;
  const nextActor = next.auction
    ? next.auction.currentBidderId
    : next.trade
      ? next.trade.toId
      : next.currentPlayerId;
  // A different actor is now on the clock → give them a full think window.
  // Same actor still pending → they're AFK, so fast-forward.
  const fresh = !nextActor || nextActor !== actedActor;
  stampTurn(room, fresh ? TURN_MS : AUTO_STEP_MS);
  broadcast(roomCode);
}

function stampTurn(room: Room, ms: number): void {
  if (room.state.phase === "playing" && room.state.currentPlayerId) {
    room.state.turnEndsAt = Date.now() + ms;
  } else {
    room.state.turnEndsAt = null;
  }
}

function broadcast(roomCode: string): void {
  const room = rooms.get(roomCode);
  if (room) {
    io.to(roomCode).emit("roomState", { state: room.state });
  }
}

function normalizeAction(playerId: string, action: GameAction): GameAction {
  if (action.type === "rollDice") {
    return { type: "rollDice", playerId, dice: [rollDie(), rollDie()], draw: Math.random() };
  }
  if ("playerId" in action) {
    return { ...action, playerId } as GameAction;
  }
  return action;
}

function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

function createRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    if (!rooms.has(code)) {
      return code;
    }
  }
  throw new Error("Could not allocate room code");
}

function createId(): string {
  return Math.random().toString(36).slice(2, 10);
}
