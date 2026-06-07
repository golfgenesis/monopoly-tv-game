import cors from "cors";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createInitialState, reduceGameState, type GameAction, type GameState } from "@siamsetthi/rules";
import type { ClientToServerEvents, InterServerEvents, ServerToClientEvents, SocketData } from "@siamsetthi/shared";

interface Room {
  state: GameState;
}

const rooms = new Map<string, Room>();
const app = express();
app.use(cors());

app.get("/health", (_request, response) => {
  response.json({ ok: true, rooms: rooms.size });
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
  cors: {
    origin: "*"
  }
});

io.on("connection", (socket) => {
  socket.on("createRoom", () => {
    const roomCode = createRoomCode();
    const room = { state: createInitialState(roomCode) };
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
    if (room.state.players.length >= 6) {
      socket.emit("errorMessage", "ห้องเต็มแล้ว");
      return;
    }
    const playerId = createId();
    room.state = reduceGameState(room.state, {
      type: "addPlayer",
      player: {
        id: playerId,
        name: payload.name.trim().slice(0, 18) || `ผู้เล่น ${room.state.players.length + 1}`,
        token: payload.token,
        color: payload.color
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
    if (!room) {
      socket.emit("errorMessage", "ไม่พบห้อง");
      return;
    }
    room.state = reduceGameState(room.state, { type: "startGame" });
    broadcast(payload.roomCode);
  });

  socket.on("playerAction", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) {
      socket.emit("errorMessage", "ไม่พบห้อง");
      return;
    }
    const action = normalizeAction(payload.playerId, payload.action);
    room.state = reduceGameState(room.state, action);
    broadcast(payload.roomCode);
  });
});

const port = Number(process.env.PORT ?? 4000);
httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Siam Setthi server listening on http://0.0.0.0:${port}`);
});

function broadcast(roomCode: string): void {
  const room = rooms.get(roomCode);
  if (room) {
    io.to(roomCode).emit("roomState", { state: room.state });
  }
}

function normalizeAction(playerId: string, action: GameAction): GameAction {
  if (action.type === "rollDice") {
    return { type: "rollDice", playerId, dice: [rollDie(), rollDie()] };
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
    const code = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    if (!rooms.has(code)) {
      return code;
    }
  }
  throw new Error("Could not allocate room code");
}

function createId(): string {
  return Math.random().toString(36).slice(2, 10);
}
