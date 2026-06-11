import cors from "cors";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import {
  BOARD,
  createInitialState,
  isOwnable,
  reduceGameState,
  type GameAction,
  type GameState,
  type OwnableTile
} from "@siamsetthi/rules";
import type { ClientToServerEvents, InterServerEvents, ServerToClientEvents, SocketData } from "@siamsetthi/shared";

interface Room {
  state: GameState;
  /** Epoch ms after which the current bot actor may act (paced "thinking"). */
  botActAt: number;
  /** The actor on the clock last tick — detects when it switches to a bot. */
  lastActorId: string | null;
}

const TURN_MS = 30_000; // think time per turn
const AUTO_STEP_MS = 1_500; // fast-forward AFK / bankrupt turns
const BOT_DELAY_MS = 1_200; // pause between bot actions so the table can watch
const BOT_CASH_RESERVE = 1_500; // cash a bot tries to keep on hand

const BOT_ROSTER = [
  { name: "บอทเฮง", token: "🤖" },
  { name: "บอทรวย", token: "🐯" },
  { name: "บอทเก่ง", token: "🦊" },
  { name: "บอทมั่งมี", token: "🐼" },
  { name: "บอทโชคดี", token: "🐶" }
];
const BOT_COLORS = ["#a855f7", "#14b8a6", "#f43f5e", "#84cc16", "#fb923c"];

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
    const room: Room = { state: createInitialState(roomCode), botActAt: 0, lastActorId: null };
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

  socket.on("rejoinRoom", (payload) => {
    const roomCode = payload.roomCode.trim().toUpperCase();
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit("errorMessage", "ห้องนี้ปิดไปแล้ว เริ่มใหม่ได้เลย");
      return;
    }
    const player = room.state.players.find((p) => p.id === payload.playerId);
    if (!player) {
      socket.emit("errorMessage", "ไม่พบผู้เล่นเดิมในห้องนี้");
      return;
    }
    socket.data.roomCode = roomCode;
    socket.data.playerId = player.id;
    socket.data.role = "phone";
    socket.join(roomCode);
    socket.emit("joined", { playerId: player.id, roomCode, state: room.state });
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

  socket.on("hostAddBot", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    if (room.state.phase !== "lobby" || room.state.players.length >= 6) return;
    const usedColors = new Set(room.state.players.map((p) => p.color));
    const botCount = room.state.players.filter((p) => p.isBot).length;
    const roster = BOT_ROSTER[botCount % BOT_ROSTER.length];
    const color = BOT_COLORS.find((c) => !usedColors.has(c)) ?? BOT_COLORS[botCount % BOT_COLORS.length];
    room.state = reduceGameState(room.state, {
      type: "addPlayer",
      player: {
        id: `bot-${createId()}`,
        name: roster.name,
        token: roster.token,
        color,
        avatar: "bot",
        isBot: true
      }
    });
    broadcast(payload.roomCode);
  });

  socket.on("hostRemoveBot", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    room.state = reduceGameState(room.state, { type: "removeBot" });
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

// Game heartbeat: drive bots at their own pace, and fast-forward AFK or
// bankrupt humans so the game never stalls.
setInterval(() => {
  const now = Date.now();
  for (const [roomCode, room] of rooms) {
    const state = room.state;
    if (state.phase !== "playing") continue;

    const actorId = currentActorId(state);
    // Fresh "thinking" window whenever the actor on the clock changes.
    if (actorId !== room.lastActorId) {
      room.lastActorId = actorId;
      room.botActAt = now + BOT_DELAY_MS;
    }

    const actor = actorId ? state.players.find((p) => p.id === actorId) : undefined;
    if (actor?.isBot) {
      if (now >= room.botActAt) {
        botStep(room, roomCode);
        room.botActAt = Date.now() + BOT_DELAY_MS;
      }
      continue; // bots manage their own turns; skip the human AFK timeout
    }

    // Human (or empty) actor: keep the AFK / bankrupt fast-forward.
    if (!state.turnEndsAt) continue;
    const current = state.players.find((p) => p.id === state.currentPlayerId);
    if (current?.status === "bankrupt" || now >= state.turnEndsAt) {
      autoStep(room, roomCode);
    }
  }
}, 500);

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

/* --------------------------------- bot AI --------------------------------- */

/** Whoever is on the clock right now: auction bidder, trade recipient, or turn player. */
function currentActorId(state: GameState): string | null {
  if (state.auction) return state.auction.currentBidderId;
  if (state.trade) return state.trade.toId;
  return state.currentPlayerId;
}

function ownablesInGroup(group: OwnableTile["group"]): OwnableTile[] {
  return BOARD.filter((t): t is OwnableTile => isOwnable(t) && t.group === group);
}

/** Apply one bot decision and broadcast. Called at most once per BOT_DELAY_MS. */
function botStep(room: Room, roomCode: string): void {
  const action = decideBotAction(room.state);
  if (!action) return;
  room.state = reduceGameState(room.state, action);
  stampTurn(room, TURN_MS);
  broadcast(roomCode);
}

function decideBotAction(state: GameState): GameAction | null {
  // --- Auction: the bot is the current bidder ---
  if (state.auction) {
    const a = state.auction;
    const bot = state.players.find((p) => p.id === a.currentBidderId);
    if (!bot) return null;
    const tile = BOARD.find((t) => t.id === a.tileId);
    if (!tile || !isOwnable(tile)) return { type: "passAuction", playerId: bot.id };
    const ownsSome = ownablesInGroup(tile.group).some((t) => state.ownership[t.id] === bot.id);
    const maxWilling = Math.min(bot.money, ownsSome ? Math.round(tile.price * 1.25) : tile.price);
    const bid = a.highBid + 100;
    return bid <= maxWilling
      ? { type: "bidAuction", playerId: bot.id, amount: bid }
      : { type: "passAuction", playerId: bot.id };
  }

  // --- Trade: the bot is the recipient. Accept only fair, affordable offers. ---
  if (state.trade) {
    const t = state.trade;
    const bot = state.players.find((p) => p.id === t.toId);
    if (!bot) return null;
    const value = (ids: string[]) =>
      ids.reduce((sum, id) => {
        const tile = BOARD.find((x) => x.id === id);
        return sum + (tile && isOwnable(tile) && !state.mortgaged[id] ? tile.price : 0);
      }, 0);
    const received = value(t.offerProps) + t.offerCash;
    const given = value(t.requestProps) + t.requestCash;
    const accept = bot.money >= t.requestCash && received >= given;
    return { type: "respondTrade", playerId: bot.id, accept };
  }

  // --- The bot's own turn ---
  const bot = state.players.find((p) => p.id === state.currentPlayerId);
  if (!bot || !bot.isBot) return null;

  if (bot.inJail && state.canRoll) {
    if (bot.jailCards > 0) return { type: "useJailCard", playerId: bot.id };
    if (bot.money > 4000) return { type: "payJail", playerId: bot.id };
    return { type: "rollDice", playerId: bot.id, dice: [rollDie(), rollDie()], draw: Math.random() };
  }

  if (state.pendingPurchaseTileId) {
    const tile = BOARD.find((t) => t.id === state.pendingPurchaseTileId);
    if (tile && isOwnable(tile)) {
      const ownsSome = ownablesInGroup(tile.group).some((t) => state.ownership[t.id] === bot.id);
      const reserve = ownsSome ? 300 : BOT_CASH_RESERVE;
      if (bot.money - tile.price >= reserve) return { type: "buyTile", playerId: bot.id };
    }
    return { type: "skipBuy", playerId: bot.id };
  }

  if (state.canRoll) {
    return { type: "rollDice", playerId: bot.id, dice: [rollDie(), rollDie()], draw: Math.random() };
  }

  // Turn resolved → develop a monopoly if flush, otherwise end the turn.
  return botBuildAction(state, bot) ?? { type: "endTurn", playerId: bot.id };
}

/** Build one house on a fully-owned colour group, keeping a cash cushion. */
function botBuildAction(state: GameState, bot: GameState["players"][number]): GameAction | null {
  if (bot.money < 3000) return null;
  const groups = new Set<OwnableTile["group"]>();
  for (const id of bot.properties) {
    const tile = BOARD.find((t) => t.id === id);
    if (tile && isOwnable(tile) && tile.kind === "property") groups.add(tile.group);
  }
  for (const group of groups) {
    const members = ownablesInGroup(group).filter((t) => t.kind === "property");
    if (members.length === 0) continue;
    if (!members.every((t) => state.ownership[t.id] === bot.id)) continue;
    if (members.some((t) => state.mortgaged[t.id])) continue;
    const min = Math.min(...members.map((t) => state.buildings[t.id] ?? 0));
    if (min >= 5) continue; // already maxed (hotels everywhere)
    const target = members.find((t) => (state.buildings[t.id] ?? 0) === min);
    if (!target || bot.money - target.houseCost < 2500) continue;
    return { type: "buildHouse", playerId: bot.id, tileId: target.id };
  }
  return null;
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
