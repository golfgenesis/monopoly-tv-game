import { describe, expect, it } from "vitest";
import { createInitialState, reduceGameState } from "../src";

describe("classic Thai economic board rules", () => {
  it("starts with two players and lets the current player buy an unowned property", () => {
    let state = createInitialState("ABCD");
    state = reduceGameState(state, { type: "addPlayer", player: { id: "p1", name: "แดง", token: "รถ", color: "#ef4444" } });
    state = reduceGameState(state, { type: "addPlayer", player: { id: "p2", name: "ฟ้า", token: "เรือ", color: "#0ea5e9" } });
    state = reduceGameState(state, { type: "startGame" });
    state = reduceGameState(state, { type: "rollDice", playerId: "p1", dice: [1, 2] });

    expect(state.pendingPurchaseTileId).toBe("market-2");
    state = reduceGameState(state, { type: "buyTile", playerId: "p1" });
    expect(state.ownership["market-2"]).toBe("p1");
    expect(state.players[0].money).toBe(7300);
  });

  it("prevents a non-current player from rolling", () => {
    let state = createInitialState("ABCD");
    state = reduceGameState(state, { type: "addPlayer", player: { id: "p1", name: "แดง", token: "รถ", color: "#ef4444" } });
    state = reduceGameState(state, { type: "addPlayer", player: { id: "p2", name: "ฟ้า", token: "เรือ", color: "#0ea5e9" } });
    state = reduceGameState(state, { type: "startGame" });
    const unchanged = reduceGameState(state, { type: "rollDice", playerId: "p2", dice: [1, 2] });

    expect(unchanged.dice).toBeNull();
    expect(unchanged.players[1].position).toBe(0);
  });
});
