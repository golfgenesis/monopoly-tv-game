export type TileKind =
  | "start"
  | "property"
  | "chance"
  | "tax"
  | "transport"
  | "utility"
  | "rest";

export type PlayerStatus = "active" | "bankrupt";

export interface BaseTile {
  id: string;
  name: string;
  kind: TileKind;
  accent: string;
}

export interface OwnableTile extends BaseTile {
  kind: "property" | "transport" | "utility";
  price: number;
  rent: number;
  district: string;
}

export interface MoneyTile extends BaseTile {
  kind: "tax";
  amount: number;
}

export interface ChanceTile extends BaseTile {
  kind: "chance";
}

export interface StartTile extends BaseTile {
  kind: "start";
  salary: number;
}

export interface RestTile extends BaseTile {
  kind: "rest";
}

export type Tile = OwnableTile | MoneyTile | ChanceTile | StartTile | RestTile;

export interface Player {
  id: string;
  name: string;
  token: string;
  color: string;
  money: number;
  position: number;
  properties: string[];
  status: PlayerStatus;
}

export interface GameEvent {
  id: string;
  message: string;
  tone: "info" | "good" | "bad" | "turn";
}

export interface GameState {
  roomCode: string;
  phase: "lobby" | "playing" | "finished";
  players: Player[];
  currentPlayerId: string | null;
  dice: [number, number] | null;
  canRoll: boolean;
  pendingPurchaseTileId: string | null;
  ownership: Record<string, string>;
  events: GameEvent[];
  winnerId: string | null;
}

export type GameAction =
  | { type: "addPlayer"; player: Pick<Player, "id" | "name" | "token" | "color"> }
  | { type: "startGame" }
  | { type: "rollDice"; playerId: string; dice: [number, number] }
  | { type: "buyTile"; playerId: string }
  | { type: "skipBuy"; playerId: string }
  | { type: "endTurn"; playerId: string };
