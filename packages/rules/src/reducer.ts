import { BOARD } from "./board";
import type { GameAction, GameEvent, GameState, OwnableTile, Player, Tile } from "./types";

const STARTING_MONEY = 8000;

export function createInitialState(roomCode: string): GameState {
  return {
    roomCode,
    phase: "lobby",
    players: [],
    currentPlayerId: null,
    dice: null,
    canRoll: true,
    pendingPurchaseTileId: null,
    ownership: {},
    events: [{ id: cryptoId(), message: `สร้างห้อง ${roomCode} แล้ว`, tone: "info" }],
    winnerId: null
  };
}

export function reduceGameState(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "addPlayer":
      if (state.phase !== "lobby" || state.players.some((player) => player.id === action.player.id)) {
        return state;
      }
      return {
        ...state,
        players: [
          ...state.players,
          {
            ...action.player,
            money: STARTING_MONEY,
            position: 0,
            properties: [],
            status: "active"
          }
        ],
        events: pushEvent(state, `${action.player.name} เข้าห้องแล้ว`, "good")
      };

    case "startGame": {
      if (state.phase !== "lobby" || state.players.length < 2) {
        return state;
      }
      return {
        ...state,
        phase: "playing",
        currentPlayerId: state.players[0]?.id ?? null,
        canRoll: true,
        events: pushEvent(state, `เริ่มเกม ตาแรกของ ${state.players[0]?.name}`, "turn")
      };
    }

    case "rollDice": {
      if (state.phase !== "playing" || !state.canRoll || state.currentPlayerId !== action.playerId) {
        return state;
      }
      const player = currentPlayer(state);
      if (!player) {
        return state;
      }
      const steps = action.dice[0] + action.dice[1];
      const oldPosition = player.position;
      const newPosition = (oldPosition + steps) % BOARD.length;
      const passedStart = oldPosition + steps >= BOARD.length;
      const landedTile = BOARD[newPosition];
      let money = player.money + (passedStart ? salary() : 0);
      let pendingPurchaseTileId: string | null = null;
      let ownership = { ...state.ownership };
      const events: GameEvent[] = [];

      if (passedStart) {
        events.push(event(`${player.name} ผ่านรับเงินเดือน +${salary().toLocaleString()}฿`, "good"));
      }

      if (isOwnable(landedTile)) {
        const ownerId = state.ownership[landedTile.id];
        if (!ownerId) {
          pendingPurchaseTileId = landedTile.id;
          events.push(event(`${player.name} มาถึง ${landedTile.name} ซื้อได้ในราคา ${landedTile.price.toLocaleString()}฿`, "info"));
        } else if (ownerId !== player.id) {
          const owner = state.players.find((candidate) => candidate.id === ownerId);
          money -= landedTile.rent;
          events.push(event(`${player.name} จ่ายค่าเช่า ${landedTile.rent.toLocaleString()}฿ ให้ ${owner?.name ?? "เจ้าของ"}`, "bad"));
          if (owner) {
            state = updatePlayer(state, owner.id, { money: owner.money + landedTile.rent });
          }
        } else {
          events.push(event(`${player.name} แวะทรัพย์สินของตัวเอง: ${landedTile.name}`, "info"));
        }
      } else if (landedTile.kind === "tax") {
        money -= landedTile.amount;
        events.push(event(`${player.name} จ่าย ${landedTile.name} ${landedTile.amount.toLocaleString()}฿`, "bad"));
      } else if (landedTile.kind === "chance") {
        const bonus = action.dice[0] % 2 === 0 ? 500 : -300;
        money += bonus;
        events.push(event(bonus > 0 ? `${player.name} ดวงดี รับเงินพิเศษ 500฿` : `${player.name} เจอบัตรเสียค่าธรรมเนียม 300฿`, bonus > 0 ? "good" : "bad"));
      } else if (landedTile.kind === "rest") {
        events.push(event(`${player.name} พักหนึ่งจังหวะที่ ${landedTile.name}`, "info"));
      }

      const updatedPlayer: Partial<Player> = {
        position: newPosition,
        money,
        status: money < 0 ? "bankrupt" : player.status
      };

      const nextState = updatePlayer(
        {
          ...state,
          dice: action.dice,
          canRoll: false,
          pendingPurchaseTileId,
          ownership
        },
        player.id,
        updatedPlayer
      );

      return {
        ...nextState,
        events: [...events, ...state.events].slice(0, 8)
      };
    }

    case "buyTile": {
      if (state.currentPlayerId !== action.playerId || !state.pendingPurchaseTileId) {
        return state;
      }
      const player = currentPlayer(state);
      const tile = BOARD.find((candidate) => candidate.id === state.pendingPurchaseTileId);
      if (!player || !tile || !isOwnable(tile) || player.money < tile.price) {
        return state;
      }
      return {
        ...updatePlayer(state, player.id, {
          money: player.money - tile.price,
          properties: [...player.properties, tile.id]
        }),
        ownership: { ...state.ownership, [tile.id]: player.id },
        pendingPurchaseTileId: null,
        events: pushEvent(state, `${player.name} ซื้อโฉนด ${tile.name} สำเร็จ`, "good")
      };
    }

    case "skipBuy":
      if (state.currentPlayerId !== action.playerId) {
        return state;
      }
      return {
        ...state,
        pendingPurchaseTileId: null,
        events: pushEvent(state, `${currentPlayer(state)?.name ?? "ผู้เล่น"} ขอผ่านการซื้อ`, "info")
      };

    case "endTurn": {
      if (state.phase !== "playing" || state.currentPlayerId !== action.playerId || state.pendingPurchaseTileId) {
        return state;
      }
      const next = nextActivePlayer(state);
      return {
        ...state,
        currentPlayerId: next?.id ?? null,
        canRoll: true,
        dice: null,
        phase: next ? "playing" : "finished",
        winnerId: next ? null : state.players.find((player) => player.status === "active")?.id ?? null,
        events: pushEvent(state, next ? `ถึงตา ${next.name}` : "จบเกม", "turn")
      };
    }
  }
}

function currentPlayer(state: GameState): Player | undefined {
  return state.players.find((player) => player.id === state.currentPlayerId);
}

function updatePlayer(state: GameState, playerId: string, patch: Partial<Player>): GameState {
  return {
    ...state,
    players: state.players.map((player) => (player.id === playerId ? { ...player, ...patch } : player))
  };
}

function nextActivePlayer(state: GameState): Player | undefined {
  const currentIndex = state.players.findIndex((player) => player.id === state.currentPlayerId);
  const players = state.players.filter((player) => player.status === "active");
  if (players.length <= 1) {
    return undefined;
  }
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const candidate = state.players[(currentIndex + offset) % state.players.length];
    if (candidate?.status === "active") {
      return candidate;
    }
  }
  return undefined;
}

function isOwnable(tile: Tile): tile is OwnableTile {
  return tile.kind === "property" || tile.kind === "transport" || tile.kind === "utility";
}

function salary(): number {
  const startTile = BOARD[0];
  return startTile.kind === "start" ? startTile.salary : 2000;
}

function pushEvent(state: GameState, message: string, tone: GameEvent["tone"]): GameEvent[] {
  return [event(message, tone), ...state.events].slice(0, 8);
}

function event(message: string, tone: GameEvent["tone"]): GameEvent {
  return { id: cryptoId(), message, tone };
}

function cryptoId(): string {
  return Math.random().toString(36).slice(2, 10);
}
