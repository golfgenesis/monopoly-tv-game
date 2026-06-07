import { describe, expect, it } from "vitest";
import { createInitialState, reduceGameState } from "../src";
import type { GameState } from "../src";

function twoPlayerGame(): GameState {
  let state = createInitialState("ABCDE");
  state = reduceGameState(state, {
    type: "addPlayer",
    player: { id: "p1", name: "แดง", token: "รถ", color: "#ef4444", avatar: "pond" }
  });
  state = reduceGameState(state, {
    type: "addPlayer",
    player: { id: "p2", name: "ฟ้า", token: "เรือ", color: "#0ea5e9", avatar: "mind" }
  });
  return reduceGameState(state, { type: "startGame" });
}

describe("เศรษฐีสยาม board rules", () => {
  it("offers an unowned tile then lets the current player buy it", () => {
    let state = twoPlayerGame();
    // [1,2] from GO → position 3 = สำเพ็ง (฿300)
    state = reduceGameState(state, { type: "rollDice", playerId: "p1", dice: [1, 2], draw: 0 });
    expect(state.pendingPurchaseTileId).toBe("sampheng");
    expect(state.canRoll).toBe(false); // not doubles

    state = reduceGameState(state, { type: "buyTile", playerId: "p1" });
    expect(state.ownership["sampheng"]).toBe("p1");
    expect(state.players[0].money).toBe(15000 - 300);
  });

  it("prevents a non-current player from rolling", () => {
    const state = twoPlayerGame();
    const unchanged = reduceGameState(state, { type: "rollDice", playerId: "p2", dice: [1, 2], draw: 0 });
    expect(unchanged.dice).toBeNull();
    expect(unchanged.players[1].position).toBe(0);
  });

  it("charges rent to the visitor and pays the owner", () => {
    let state = twoPlayerGame();
    state = reduceGameState(state, { type: "rollDice", playerId: "p1", dice: [1, 2], draw: 0 });
    state = reduceGameState(state, { type: "buyTile", playerId: "p1" });
    state = reduceGameState(state, { type: "endTurn", playerId: "p1" });

    expect(state.currentPlayerId).toBe("p2");
    state = reduceGameState(state, { type: "rollDice", playerId: "p2", dice: [1, 2], draw: 0 });
    // base rent for สำเพ็ง is 40 (p1 does not own the whole group)
    expect(state.players[1].money).toBe(15000 - 40);
    expect(state.players[0].money).toBe(15000 - 300 + 40);
  });

  it("grants another roll on doubles", () => {
    let state = twoPlayerGame();
    // [2,2] doubles → position 4 = ภาษีที่ดิน (฿1,000)
    state = reduceGameState(state, { type: "rollDice", playerId: "p1", dice: [2, 2], draw: 0 });
    expect(state.isDoubles).toBe(true);
    expect(state.canRoll).toBe(true);
    expect(state.players[0].money).toBe(15000 - 1000);
  });

  it("doubles rent when an owner holds the full color group, with no houses", () => {
    const base = twoPlayerGame();
    const owned: GameState = {
      ...base,
      currentPlayerId: "p2",
      ownership: { banglamphu: "p1", sampheng: "p1" },
      players: base.players.map((p) =>
        p.id === "p1" ? { ...p, properties: ["banglamphu", "sampheng"] } : p
      )
    };
    const state = reduceGameState(owned, { type: "rollDice", playerId: "p2", dice: [1, 2], draw: 0 });
    expect(state.players[1].money).toBe(15000 - 80); // 40 base × 2 monopoly
  });

  it("enforces whole-group ownership and even building for houses", () => {
    const base = twoPlayerGame();
    const owned: GameState = {
      ...base,
      currentPlayerId: "p1",
      ownership: { banglamphu: "p1", sampheng: "p1" },
      players: base.players.map((p) =>
        p.id === "p1" ? { ...p, properties: ["banglamphu", "sampheng"], money: 20000 } : p
      )
    };
    const first = reduceGameState(owned, { type: "buildHouse", playerId: "p1", tileId: "banglamphu" });
    expect(first.buildings["banglamphu"]).toBe(1);
    expect(first.players[0].money).toBe(20000 - 500); // old group house cost

    // even-build rule: cannot add a 2nd house to banglamphu before sampheng has 1
    const blocked = reduceGameState(first, { type: "buildHouse", playerId: "p1", tileId: "banglamphu" });
    expect(blocked.buildings["banglamphu"]).toBe(1);
  });

  it("opens an auction when a player declines to buy, and awards the high bidder", () => {
    let state = twoPlayerGame();
    state = reduceGameState(state, { type: "rollDice", playerId: "p1", dice: [1, 2], draw: 0 });
    expect(state.pendingPurchaseTileId).toBe("sampheng");

    state = reduceGameState(state, { type: "skipBuy", playerId: "p1" });
    expect(state.auction?.tileId).toBe("sampheng");
    expect(state.auction?.currentBidderId).toBe("p1");

    state = reduceGameState(state, { type: "passAuction", playerId: "p1" });
    expect(state.auction?.currentBidderId).toBe("p2");

    state = reduceGameState(state, { type: "bidAuction", playerId: "p2", amount: 100 });
    expect(state.auction).toBeNull();
    expect(state.ownership["sampheng"]).toBe("p2");
    expect(state.players[1].money).toBe(15000 - 100);
  });

  it("executes an accepted property-for-cash trade", () => {
    const base = twoPlayerGame();
    const staged: GameState = {
      ...base,
      currentPlayerId: "p1",
      ownership: { banglamphu: "p1" },
      players: base.players.map((p) => (p.id === "p1" ? { ...p, properties: ["banglamphu"] } : p))
    };
    let state = reduceGameState(staged, {
      type: "proposeTrade",
      playerId: "p1",
      toId: "p2",
      offerProps: ["banglamphu"],
      offerCash: 0,
      requestProps: [],
      requestCash: 500
    });
    expect(state.trade?.toId).toBe("p2");

    state = reduceGameState(state, { type: "respondTrade", playerId: "p2", accept: true });
    expect(state.trade).toBeNull();
    expect(state.ownership["banglamphu"]).toBe("p2");
    expect(state.players[0].money).toBe(15000 + 500);
    expect(state.players[1].money).toBe(15000 - 500);
  });

  it("sends a player to jail when landing on go-to-jail", () => {
    const base = twoPlayerGame();
    // GOTOJAIL is at index 30; move there directly via a card-free path is hard,
    // so place the player one step away and roll a 1.
    const staged: GameState = {
      ...base,
      currentPlayerId: "p1",
      players: base.players.map((p) => (p.id === "p1" ? { ...p, position: 29 } : p))
    };
    const state = reduceGameState(staged, { type: "rollDice", playerId: "p1", dice: [1, 0] as [number, number], draw: 0 });
    expect(state.players[0].inJail).toBe(true);
  });
});
