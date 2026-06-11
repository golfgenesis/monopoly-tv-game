import {
  BOARD,
  CHANCE_DECK,
  COMMUNITY_DECK,
  GROUPS,
  GO_INDEX,
  JAIL_INDEX,
  isOwnable
} from "./board";
import type {
  CardEffect,
  GameAction,
  GameEvent,
  GameState,
  GroupId,
  OwnableTile,
  Player,
  Tile
} from "./types";

const STARTING_MONEY = 15000;
const JAIL_FINE = 500;
const TURN_SECONDS = 30;
const MAX_BUILD = 5; // 5 === hotel

export function createInitialState(roomCode: string): GameState {
  return {
    roomCode,
    phase: "lobby",
    players: [],
    currentPlayerId: null,
    dice: null,
    rollCount: 0,
    isDoubles: false,
    doublesCount: 0,
    canRoll: false,
    hasRolled: false,
    pendingPurchaseTileId: null,
    ownership: {},
    buildings: {},
    mortgaged: {},
    activeCard: null,
    auction: null,
    trade: null,
    events: [{ id: cryptoId(), message: `สร้างห้อง ${roomCode} แล้ว`, tone: "info" }],
    winnerId: null,
    turnEndsAt: null,
    turnSeconds: TURN_SECONDS
  };
}

/** Deep-ish clone so the complex actions can mutate a draft safely. */
function clone(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, properties: [...p.properties] })),
    ownership: { ...state.ownership },
    buildings: { ...state.buildings },
    mortgaged: { ...state.mortgaged },
    auction: state.auction
      ? { ...state.auction, order: [...state.auction.order], passed: [...state.auction.passed] }
      : null,
    trade: state.trade
      ? {
          ...state.trade,
          offerProps: [...state.trade.offerProps],
          requestProps: [...state.trade.requestProps]
        }
      : null,
    events: [...state.events]
  };
}

export function reduceGameState(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "addPlayer": {
      if (state.phase !== "lobby" || state.players.some((p) => p.id === action.player.id)) {
        return state;
      }
      const next = clone(state);
      next.players.push({
        ...action.player,
        isBot: action.player.isBot ?? false,
        money: STARTING_MONEY,
        position: 0,
        properties: [],
        status: "active",
        inJail: false,
        jailTurns: 0,
        jailCards: 0
      });
      log(next, `${action.player.name} เข้าห้องแล้ว`, "good");
      return next;
    }

    case "removeBot": {
      if (state.phase !== "lobby") return state;
      const lastBotIndex = [...state.players].reverse().findIndex((p) => p.isBot);
      if (lastBotIndex === -1) return state;
      const idx = state.players.length - 1 - lastBotIndex;
      const next = clone(state);
      const [removed] = next.players.splice(idx, 1);
      if (removed) log(next, `${removed.name} ออกจากห้อง`, "info");
      return next;
    }

    case "startGame": {
      if (state.phase !== "lobby" || state.players.length < 2) {
        return state;
      }
      const next = clone(state);
      next.phase = "playing";
      next.currentPlayerId = next.players[0]?.id ?? null;
      next.canRoll = true;
      next.hasRolled = false;
      next.doublesCount = 0;
      next.dice = null;
      log(next, `เริ่มเกม! ตาแรกของ ${next.players[0]?.name}`, "turn");
      return next;
    }

    case "resetGame": {
      const next = clone(state);
      next.phase = "lobby";
      next.players = next.players.map((p) => ({
        ...p,
        money: STARTING_MONEY,
        position: 0,
        properties: [],
        status: "active",
        inJail: false,
        jailTurns: 0,
        jailCards: 0
      }));
      next.ownership = {};
      next.buildings = {};
      next.mortgaged = {};
      next.currentPlayerId = null;
      next.dice = null;
      next.canRoll = false;
      next.hasRolled = false;
      next.doublesCount = 0;
      next.pendingPurchaseTileId = null;
      next.activeCard = null;
      next.auction = null;
      next.trade = null;
      next.winnerId = null;
      next.events = [{ id: cryptoId(), message: "เริ่มเกมใหม่ รอผู้เล่นพร้อม", tone: "info" }];
      return next;
    }

    case "rollDice":
      return handleRoll(state, action.playerId, action.dice, action.draw);

    case "buyTile": {
      if (state.currentPlayerId !== action.playerId || !state.pendingPurchaseTileId) {
        return state;
      }
      const next = clone(state);
      const player = byId(next, action.playerId);
      const tile = BOARD.find((t) => t.id === next.pendingPurchaseTileId);
      if (!player || !tile || !isOwnable(tile) || player.money < tile.price) {
        return state;
      }
      player.money -= tile.price;
      player.properties.push(tile.id);
      next.ownership[tile.id] = player.id;
      next.pendingPurchaseTileId = null;
      log(next, `${player.name} ซื้อ ${tile.name} ในราคา ฿${tile.price.toLocaleString()}`, "good");
      return next;
    }

    case "skipBuy": {
      if (state.currentPlayerId !== action.playerId || !state.pendingPurchaseTileId) {
        return state;
      }
      const next = clone(state);
      const player = byId(next, action.playerId);
      const tileId = state.pendingPurchaseTileId;
      next.pendingPurchaseTileId = null;
      log(next, `${player?.name ?? "ผู้เล่น"} ไม่ซื้อ — เปิดประมูล!`, "info");
      openAuction(next, tileId);
      return next;
    }

    case "bidAuction":
      return handleBid(state, action.playerId, action.amount);

    case "passAuction":
      return handlePass(state, action.playerId);

    case "proposeTrade":
      return handlePropose(state, action);

    case "respondTrade":
      return handleRespond(state, action.playerId, action.accept);

    case "buildHouse":
      return handleBuild(state, action.playerId, action.tileId, +1);

    case "sellHouse":
      return handleBuild(state, action.playerId, action.tileId, -1);

    case "mortgage":
      return handleMortgage(state, action.playerId, action.tileId, true);

    case "unmortgage":
      return handleMortgage(state, action.playerId, action.tileId, false);

    case "payJail": {
      if (state.currentPlayerId !== action.playerId) return state;
      const next = clone(state);
      const player = byId(next, action.playerId);
      if (!player || !player.inJail || player.money < JAIL_FINE) return state;
      player.money -= JAIL_FINE;
      player.inJail = false;
      player.jailTurns = 0;
      log(next, `${player.name} จ่ายค่าประกัน ฿${JAIL_FINE} ออกจากคุก`, "info");
      return next;
    }

    case "useJailCard": {
      if (state.currentPlayerId !== action.playerId) return state;
      const next = clone(state);
      const player = byId(next, action.playerId);
      if (!player || !player.inJail || player.jailCards < 1) return state;
      player.jailCards -= 1;
      player.inJail = false;
      player.jailTurns = 0;
      log(next, `${player.name} ใช้บัตรพ้นโทษออกจากคุก`, "good");
      return next;
    }

    case "dismissCard": {
      if (!state.activeCard) return state;
      const next = clone(state);
      next.activeCard = null;
      return next;
    }

    case "endTurn":
      return handleEndTurn(state, action.playerId);

    default:
      return state;
  }
}

/* ----------------------------- core handlers ----------------------------- */

function handleRoll(
  state: GameState,
  playerId: string,
  dice: [number, number],
  draw: number
): GameState {
  if (
    state.phase !== "playing" ||
    !state.canRoll ||
    state.currentPlayerId !== playerId ||
    state.pendingPurchaseTileId ||
    state.auction ||
    state.trade
  ) {
    return state;
  }
  const next = clone(state);
  const player = byId(next, playerId);
  if (!player) return state;

  next.dice = dice;
  next.rollCount += 1;
  next.activeCard = null;
  const steps = dice[0] + dice[1];
  const isDoubles = dice[0] === dice[1];
  next.isDoubles = isDoubles;
  next.hasRolled = true;

  // --- In jail: rolling is an escape attempt ---
  if (player.inJail) {
    if (isDoubles) {
      player.inJail = false;
      player.jailTurns = 0;
      log(next, `${player.name} ทอยได้แต้มคู่ ${dice[0]}-${dice[1]} ออกจากคุก!`, "good");
      advanceAndResolve(next, player, steps, draw);
    } else {
      player.jailTurns += 1;
      if (player.jailTurns >= 3) {
        log(next, `${player.name} ครบ 3 ตา จ่ายค่าประกัน ฿${JAIL_FINE}`, "bad");
        charge(next, player, JAIL_FINE, null);
        if (player.status === "active") {
          player.inJail = false;
          player.jailTurns = 0;
          advanceAndResolve(next, player, steps, draw);
        }
      } else {
        log(next, `${player.name} ทอย ${dice[0]}-${dice[1]} ยังออกจากคุกไม่ได้`, "info");
      }
    }
    next.canRoll = false; // jail attempt never grants another roll
    return finalizeRoll(next);
  }

  // --- Normal roll ---
  if (isDoubles) {
    next.doublesCount += 1;
    if (next.doublesCount >= 3) {
      log(next, `${player.name} ทอยแต้มคู่ 3 ครั้งซ้อน โดนจับเข้าคุก!`, "bad");
      sendToJail(next, player);
      next.canRoll = false;
      return finalizeRoll(next);
    }
  }

  advanceAndResolve(next, player, steps, draw, true);
  // Doubles → roll again (unless that roll sent them to jail or bankrupt).
  next.canRoll = isDoubles && player.status === "active" && !player.inJail;
  return finalizeRoll(next);
}

/** Move `steps` forward, award salary on passing GO, then resolve the tile. */
function advanceAndResolve(
  next: GameState,
  player: Player,
  steps: number,
  draw: number,
  announceMove = false
): void {
  const from = player.position;
  const to = (from + steps) % BOARD.length;
  if (from + steps >= BOARD.length) {
    player.money += salary();
    log(next, `${player.name} ผ่านช่องเงินเดือน +฿${salary().toLocaleString()}`, "good");
  }
  player.position = to;
  if (announceMove) {
    log(next, `${player.name} ทอยได้ ${steps} เดินไป ${BOARD[to].name}`, "turn");
  }
  resolveLanding(next, player, to, draw, steps);
}

function resolveLanding(
  next: GameState,
  player: Player,
  position: number,
  draw: number,
  diceSum: number
): void {
  const tile = BOARD[position];

  if (isOwnable(tile)) {
    const ownerId = next.ownership[tile.id];
    if (!ownerId) {
      next.pendingPurchaseTileId = tile.id;
    } else if (ownerId !== player.id) {
      const owner = byId(next, ownerId);
      if (owner && !next.mortgaged[tile.id]) {
        const rent = computeRent(next, tile, ownerId, diceSum);
        log(next, `${player.name} จ่ายค่าเช่า ${tile.name} ฿${rent.toLocaleString()} ให้ ${owner.name}`, "bad");
        charge(next, player, rent, ownerId);
      } else {
        log(next, `${player.name} แวะ ${tile.name} (จำนองอยู่ ไม่ต้องจ่าย)`, "info");
      }
    }
    return;
  }

  switch (tile.kind) {
    case "tax":
      log(next, `${player.name} เสีย ${tile.name} ฿${tile.amount.toLocaleString()}`, "bad");
      charge(next, player, tile.amount, null);
      return;
    case "chance":
    case "community": {
      const deck = tile.kind === "chance" ? CHANCE_DECK : COMMUNITY_DECK;
      const card = deck[Math.min(deck.length - 1, Math.floor(draw * deck.length))];
      next.activeCard = card;
      log(next, `${player.name} เปิดการ์ด${tile.kind === "chance" ? "ดวง" : "งานบุญ"}: ${card.text}`, card.tone === "bad" ? "bad" : card.tone === "good" ? "good" : "info");
      applyCard(next, player, card, draw);
      return;
    }
    case "gotojail":
      log(next, `${player.name} ถูกส่งเข้าคุก!`, "bad");
      sendToJail(next, player);
      return;
    case "jail":
    case "parking":
    case "start":
    default:
      return;
  }
}

function applyCard(next: GameState, player: Player, card: CardEffect, draw: number): void {
  switch (card.kind) {
    case "gain":
      player.money += card.amount ?? 0;
      return;
    case "pay":
      charge(next, player, card.amount ?? 0, null);
      return;
    case "jailCard":
      player.jailCards += 1;
      return;
    case "gotoJail":
      sendToJail(next, player);
      return;
    case "collectEach": {
      const amount = card.amount ?? 0;
      for (const other of next.players) {
        if (other.id === player.id || other.status !== "active") continue;
        charge(next, other, amount, player.id);
      }
      return;
    }
    case "payEach": {
      const amount = card.amount ?? 0;
      const recipients = next.players.filter((o) => o.id !== player.id && o.status === "active");
      const total = amount * recipients.length;
      if (player.money < total) {
        charge(next, player, total, null);
        return;
      }
      for (const other of recipients) {
        player.money -= amount;
        other.money += amount;
      }
      return;
    }
    case "moveTo": {
      const target = card.target ?? GO_INDEX;
      if (card.awardSalary && target <= player.position) {
        player.money += salary();
        log(next, `${player.name} ผ่านช่องเงินเดือน +฿${salary().toLocaleString()}`, "good");
      }
      player.position = target;
      // Resolve the destination (won't be another card tile in our decks).
      resolveLanding(next, player, target, draw, 0);
      return;
    }
  }
}

function handleBuild(state: GameState, playerId: string, tileId: string, delta: 1 | -1): GameState {
  if (state.currentPlayerId !== playerId) return state;
  const tile = BOARD.find((t) => t.id === tileId);
  if (!tile || tile.kind !== "property") return state;
  const next = clone(state);
  const player = byId(next, playerId);
  if (!player || next.ownership[tileId] !== playerId) return state;
  if (!ownsWholeGroup(next, playerId, tile.group)) return state;
  if (groupMortgaged(next, tile.group)) return state;

  const current = next.buildings[tileId] ?? 0;
  const groupTiles = membersOf(tile.group);

  if (delta === 1) {
    if (current >= MAX_BUILD) return state;
    // even build: only build on the lowest tiles in the group
    const min = Math.min(...groupTiles.map((t) => next.buildings[t.id] ?? 0));
    if (current !== min) return state;
    if (player.money < tile.houseCost) return state;
    player.money -= tile.houseCost;
    next.buildings[tileId] = current + 1;
    const label = current + 1 === MAX_BUILD ? "โรงแรม" : `บ้านหลังที่ ${current + 1}`;
    log(next, `${player.name} สร้าง${label}ที่ ${tile.name}`, "good");
  } else {
    if (current <= 0) return state;
    const max = Math.max(...groupTiles.map((t) => next.buildings[t.id] ?? 0));
    if (current !== max) return state;
    next.buildings[tileId] = current - 1;
    player.money += Math.round(tile.houseCost / 2);
    log(next, `${player.name} ขายสิ่งปลูกสร้างที่ ${tile.name} คืน ฿${Math.round(tile.houseCost / 2).toLocaleString()}`, "info");
  }
  return next;
}

function handleMortgage(state: GameState, playerId: string, tileId: string, on: boolean): GameState {
  if (state.currentPlayerId !== playerId) return state;
  const tile = BOARD.find((t) => t.id === tileId);
  if (!tile || !isOwnable(tile)) return state;
  const next = clone(state);
  const player = byId(next, playerId);
  if (!player || next.ownership[tileId] !== playerId) return state;

  if (on) {
    if (next.mortgaged[tileId]) return state;
    // Cannot mortgage if the group still has buildings.
    if (membersOf(tile.group).some((t) => (next.buildings[t.id] ?? 0) > 0)) return state;
    next.mortgaged[tileId] = true;
    player.money += tile.mortgage;
    log(next, `${player.name} จำนอง ${tile.name} รับ ฿${tile.mortgage.toLocaleString()}`, "info");
  } else {
    if (!next.mortgaged[tileId]) return state;
    const cost = Math.round(tile.mortgage * 1.1);
    if (player.money < cost) return state;
    player.money -= cost;
    next.mortgaged[tileId] = false;
    log(next, `${player.name} ไถ่ถอน ${tile.name} จ่าย ฿${cost.toLocaleString()}`, "info");
  }
  return next;
}

function handleEndTurn(state: GameState, playerId: string): GameState {
  if (
    state.phase !== "playing" ||
    state.currentPlayerId !== playerId ||
    state.pendingPurchaseTileId ||
    state.auction ||
    state.trade ||
    state.canRoll // doubles pending → must roll again
  ) {
    // Allow the server's auto-advance to end a bankrupt player's turn regardless.
    const cur = state.players.find((p) => p.id === state.currentPlayerId);
    if (!(cur && cur.status === "bankrupt")) {
      return state;
    }
  }
  const next = clone(state);

  const active = next.players.filter((p) => p.status === "active");
  if (active.length <= 1) {
    next.phase = "finished";
    next.winnerId = active[0]?.id ?? null;
    next.currentPlayerId = null;
    next.canRoll = false;
    next.turnEndsAt = null;
    log(next, `🏆 ${active[0]?.name ?? "ไม่มีผู้ชนะ"} คือเศรษฐีที่ยิ่งใหญ่!`, "turn");
    return next;
  }

  const nextPlayer = nextActivePlayer(next);
  next.currentPlayerId = nextPlayer?.id ?? null;
  next.canRoll = true;
  next.hasRolled = false;
  next.dice = null;
  next.isDoubles = false;
  next.doublesCount = 0;
  next.pendingPurchaseTileId = null;
  next.activeCard = null;
  if (nextPlayer) {
    log(next, `ถึงตา ${nextPlayer.name}`, "turn");
  }
  return next;
}

/* -------------------------------- auctions -------------------------------- */

function openAuction(next: GameState, tileId: string): void {
  const curIdx = next.players.findIndex((p) => p.id === next.currentPlayerId);
  const order: string[] = [];
  for (let o = 0; o < next.players.length; o += 1) {
    const p = next.players[(curIdx + o) % next.players.length];
    if (p && p.status === "active") order.push(p.id);
  }
  if (order.length === 0) {
    next.auction = null;
    return;
  }
  const tile = BOARD.find((t) => t.id === tileId);
  next.auction = { tileId, highBid: 0, highBidderId: null, currentBidderId: order[0], order, passed: [] };
  log(next, `เปิดประมูล ${tile?.name ?? tileId} — เริ่มที่ ${byId(next, order[0])?.name}`, "turn");
}

function handleBid(state: GameState, playerId: string, amount: number): GameState {
  const a = state.auction;
  if (!a || a.currentBidderId !== playerId || amount <= a.highBid) return state;
  const next = clone(state);
  const player = byId(next, playerId);
  if (!player || player.money < amount) return state;
  next.auction!.highBid = amount;
  next.auction!.highBidderId = playerId;
  log(next, `${player.name} ประมูล ฿${amount.toLocaleString()}`, "info");
  advanceAuction(next);
  return next;
}

function handlePass(state: GameState, playerId: string): GameState {
  const a = state.auction;
  if (!a || a.currentBidderId !== playerId) return state;
  const next = clone(state);
  const player = byId(next, playerId);
  next.auction!.passed.push(playerId);
  log(next, `${player?.name ?? "ผู้เล่น"} พับประมูล`, "info");
  advanceAuction(next);
  return next;
}

function advanceAuction(next: GameState): void {
  const a = next.auction;
  if (!a) return;
  const remaining = a.order.filter((id) => !a.passed.includes(id));
  if (remaining.length === 0) {
    log(next, "ไม่มีใครเสนอราคา ทรัพย์ยังว่างอยู่", "info");
    next.auction = null;
    return;
  }
  if (remaining.length === 1 && a.highBidderId === remaining[0]) {
    awardAuction(next);
    return;
  }
  const startIdx = a.order.indexOf(a.currentBidderId);
  for (let o = 1; o <= a.order.length; o += 1) {
    const cand = a.order[(startIdx + o) % a.order.length];
    if (!a.passed.includes(cand)) {
      a.currentBidderId = cand;
      break;
    }
  }
}

function awardAuction(next: GameState): void {
  const a = next.auction;
  if (!a || !a.highBidderId) {
    next.auction = null;
    return;
  }
  const winner = byId(next, a.highBidderId);
  const tile = BOARD.find((t) => t.id === a.tileId);
  if (winner && tile && isOwnable(tile)) {
    winner.money -= a.highBid;
    winner.properties.push(tile.id);
    next.ownership[tile.id] = winner.id;
    log(next, `${winner.name} ชนะประมูล ${tile.name} ที่ ฿${a.highBid.toLocaleString()}!`, "good");
  }
  next.auction = null;
}

/* --------------------------------- trades --------------------------------- */

function validTradeSide(state: GameState, ownerId: string, props: string[]): boolean {
  for (const id of props) {
    if (state.ownership[id] !== ownerId) return false;
    const tile = BOARD.find((t) => t.id === id);
    if (!tile || !isOwnable(tile)) return false;
    // No buildings anywhere in the property's color group.
    if (membersOf(tile.group).some((t) => (state.buildings[t.id] ?? 0) > 0)) return false;
  }
  return true;
}

function handlePropose(state: GameState, action: Extract<GameAction, { type: "proposeTrade" }>): GameState {
  if (state.phase !== "playing" || state.currentPlayerId !== action.playerId) return state;
  if (state.pendingPurchaseTileId || state.auction || state.trade) return state;
  if (action.toId === action.playerId) return state;
  const from = byId(state, action.playerId);
  const to = byId(state, action.toId);
  if (!from || !to || from.status !== "active" || to.status !== "active") return state;
  if (!validTradeSide(state, from.id, action.offerProps)) return state;
  if (!validTradeSide(state, to.id, action.requestProps)) return state;
  const offerCash = Math.max(0, Math.round(action.offerCash));
  const requestCash = Math.max(0, Math.round(action.requestCash));
  if (from.money < offerCash) return state;
  if (
    action.offerProps.length === 0 &&
    action.requestProps.length === 0 &&
    offerCash === 0 &&
    requestCash === 0
  ) {
    return state;
  }
  const next = clone(state);
  next.trade = {
    fromId: from.id,
    toId: to.id,
    offerProps: [...action.offerProps],
    offerCash,
    requestProps: [...action.requestProps],
    requestCash
  };
  log(next, `${from.name} ยื่นข้อเสนอแลกเปลี่ยนให้ ${to.name}`, "turn");
  return next;
}

function handleRespond(state: GameState, playerId: string, accept: boolean): GameState {
  const t = state.trade;
  if (!t || t.toId !== playerId) return state;
  const next = clone(state);
  if (!accept) {
    log(next, `${byId(next, t.toId)?.name ?? "ผู้เล่น"} ปฏิเสธข้อเสนอ`, "bad");
    next.trade = null;
    return next;
  }
  const from = byId(next, t.fromId);
  const to = byId(next, t.toId);
  if (
    !from ||
    !to ||
    !validTradeSide(next, from.id, t.offerProps) ||
    !validTradeSide(next, to.id, t.requestProps) ||
    from.money < t.offerCash ||
    to.money < t.requestCash
  ) {
    log(next, "ข้อเสนอใช้ไม่ได้แล้ว — ยกเลิก", "info");
    next.trade = null;
    return next;
  }
  for (const id of t.offerProps) transferProp(next, id, from, to);
  for (const id of t.requestProps) transferProp(next, id, to, from);
  from.money += t.requestCash - t.offerCash;
  to.money += t.offerCash - t.requestCash;
  log(next, `${from.name} ↔ ${to.name} แลกเปลี่ยนสำเร็จ!`, "good");
  next.trade = null;
  return next;
}

function transferProp(next: GameState, tileId: string, fromP: Player, toP: Player): void {
  fromP.properties = fromP.properties.filter((id) => id !== tileId);
  if (!toP.properties.includes(tileId)) toP.properties.push(tileId);
  next.ownership[tileId] = toP.id;
}

/* ----------------------------- money helpers ----------------------------- */

/** Charge `player` `amount`, paying `creditorId` (or the bank when null). Handles bankruptcy. */
function charge(next: GameState, player: Player, amount: number, creditorId: string | null): void {
  if (amount <= 0) return;
  if (player.money >= amount) {
    player.money -= amount;
    if (creditorId) {
      const creditor = byId(next, creditorId);
      if (creditor) creditor.money += amount;
    }
    return;
  }
  // Not enough cash → bankrupt. Hand over remaining cash, then liquidate assets.
  const creditor = (creditorId ? byId(next, creditorId) : null) ?? null;
  if (creditor) creditor.money += player.money;
  player.money = 0;
  bankrupt(next, player, creditor);
}

function bankrupt(next: GameState, player: Player, creditor: Player | null): void {
  log(next, `💥 ${player.name} ล้มละลาย!`, "bad");
  for (const tileId of [...player.properties]) {
    delete next.buildings[tileId];
    if (creditor) {
      next.ownership[tileId] = creditor.id;
      creditor.properties.push(tileId);
      // Creditor inherits mortgaged status; keep it as-is.
    } else {
      delete next.ownership[tileId];
      delete next.mortgaged[tileId];
    }
  }
  player.properties = [];
  player.money = 0;
  player.status = "bankrupt";
  player.inJail = false;
  if (creditor) {
    log(next, `${creditor.name} รับโอนทรัพย์สินทั้งหมดของ ${player.name}`, "good");
  }
}

/* ----------------------------- rent / groups ----------------------------- */

function computeRent(next: GameState, tile: OwnableTile, ownerId: string, diceSum: number): number {
  if (next.mortgaged[tile.id]) return 0;
  if (tile.kind === "transport") {
    const count = membersOf("transport").filter((t) => next.ownership[t.id] === ownerId).length;
    return tile.rent[Math.max(0, Math.min(3, count - 1))];
  }
  if (tile.kind === "utility") {
    const count = membersOf("utility").filter((t) => next.ownership[t.id] === ownerId).length;
    const mult = count >= 2 ? tile.rent[1] : tile.rent[0];
    return diceSum * mult;
  }
  const houses = next.buildings[tile.id] ?? 0;
  if (houses > 0) return tile.rent[houses];
  const base = tile.rent[0];
  return ownsWholeGroup(next, ownerId, tile.group) ? base * 2 : base;
}

function ownsWholeGroup(next: GameState, playerId: string, group: GroupId): boolean {
  const members = membersOf(group);
  return members.length > 0 && members.every((t) => next.ownership[t.id] === playerId);
}

function groupMortgaged(next: GameState, group: GroupId): boolean {
  return membersOf(group).some((t) => next.mortgaged[t.id]);
}

const GROUP_MEMBERS: Partial<Record<GroupId, OwnableTile[]>> = {};
function membersOf(group: GroupId): OwnableTile[] {
  if (!GROUP_MEMBERS[group]) {
    GROUP_MEMBERS[group] = BOARD.filter(
      (t): t is OwnableTile => isOwnable(t) && t.group === group
    );
  }
  return GROUP_MEMBERS[group]!;
}

/* ----------------------------- misc helpers ------------------------------ */

function sendToJail(next: GameState, player: Player): void {
  player.position = JAIL_INDEX;
  player.inJail = true;
  player.jailTurns = 0;
  next.doublesCount = 0;
}

function byId(state: GameState, id: string | null): Player | undefined {
  return state.players.find((p) => p.id === id);
}

function nextActivePlayer(state: GameState): Player | undefined {
  const currentIndex = state.players.findIndex((p) => p.id === state.currentPlayerId);
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const candidate = state.players[(currentIndex + offset) % state.players.length];
    if (candidate?.status === "active") {
      return candidate;
    }
  }
  return undefined;
}

function salary(): number {
  const startTile = BOARD[GO_INDEX];
  return startTile.kind === "start" ? startTile.salary : 2000;
}

function finalizeRoll(next: GameState): GameState {
  return next;
}

function log(state: GameState, message: string, tone: GameEvent["tone"]): void {
  state.events = [{ id: cryptoId(), message, tone }, ...state.events].slice(0, 10);
}

function cryptoId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export { GROUPS };
export type { Tile };
