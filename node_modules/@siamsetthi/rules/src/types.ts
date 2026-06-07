export type TileKind =
  | "start"
  | "property"
  | "transport"
  | "utility"
  | "chance"
  | "community"
  | "tax"
  | "jail"
  | "gotojail"
  | "parking";

export type PlayerStatus = "active" | "bankrupt";

/** Color group keys for ownable property sets. */
export type GroupId =
  | "old"
  | "china"
  | "tour"
  | "biz"
  | "shop"
  | "finance"
  | "lux"
  | "hiso"
  | "transport"
  | "utility";

export interface BaseTile {
  id: string;
  name: string;
  kind: TileKind;
  /** Hex accent used for the tile color band / theme. */
  accent: string;
  /** Short emoji/glyph icon shown on the tile. */
  icon?: string;
}

export interface OwnableTile extends BaseTile {
  kind: "property" | "transport" | "utility";
  group: GroupId;
  price: number;
  /** Rent ladder: [base, 1 house, 2, 3, 4, hotel]. For transport/utility see reducer. */
  rent: [number, number, number, number, number, number];
  /** Cost to add one house (or the hotel) on this tile. */
  houseCost: number;
  /** Amount returned when mortgaging (price / 2). */
  mortgage: number;
}

export interface TaxTile extends BaseTile {
  kind: "tax";
  amount: number;
}

export interface ChanceTile extends BaseTile {
  kind: "chance" | "community";
}

export interface StartTile extends BaseTile {
  kind: "start";
  salary: number;
}

export interface CornerTile extends BaseTile {
  kind: "jail" | "gotojail" | "parking";
}

export type Tile = OwnableTile | TaxTile | ChanceTile | StartTile | CornerTile;

export interface Player {
  id: string;
  name: string;
  token: string;
  color: string;
  /** Avatar key for the portrait shown on TV (see AVATARS). */
  avatar: string;
  money: number;
  position: number;
  properties: string[];
  status: PlayerStatus;
  inJail: boolean;
  /** How many turns spent in jail this stint. */
  jailTurns: number;
  /** "Get out of jail" cards held. */
  jailCards: number;
}

export type CardEffectKind =
  | "gain"
  | "pay"
  | "moveTo"
  | "gotoJail"
  | "collectEach"
  | "payEach"
  | "jailCard";

export interface CardEffect {
  id: string;
  text: string;
  tone: "good" | "bad" | "info";
  kind: CardEffectKind;
  /** Money amount for gain/pay/collectEach/payEach. */
  amount?: number;
  /** Destination tile index for moveTo. */
  target?: number;
  /** When moving, whether passing start grants salary. */
  awardSalary?: boolean;
}

export interface GameEvent {
  id: string;
  message: string;
  tone: "info" | "good" | "bad" | "turn";
}

export interface AuctionState {
  tileId: string;
  highBid: number;
  highBidderId: string | null;
  /** Whose turn it is to bid or pass. */
  currentBidderId: string;
  /** Active player ids in bidding order. */
  order: string[];
  /** Players who have passed (out of this auction). */
  passed: string[];
}

export interface TradeState {
  fromId: string;
  toId: string;
  offerProps: string[];
  offerCash: number;
  requestProps: string[];
  requestCash: number;
}

export interface GameState {
  roomCode: string;
  phase: "lobby" | "playing" | "finished";
  players: Player[];
  currentPlayerId: string | null;
  dice: [number, number] | null;
  isDoubles: boolean;
  doublesCount: number;
  canRoll: boolean;
  hasRolled: boolean;
  pendingPurchaseTileId: string | null;
  /** Owner id per tile id. */
  ownership: Record<string, string>;
  /** House count per tile id: 0-4 houses, 5 = hotel. */
  buildings: Record<string, number>;
  /** Mortgaged tiles. */
  mortgaged: Record<string, boolean>;
  /** Card currently shown to the table (after drawing chance/community). */
  activeCard: CardEffect | null;
  /** Active auction for a declined property, if any. */
  auction: AuctionState | null;
  /** Pending trade proposal awaiting a response, if any. */
  trade: TradeState | null;
  events: GameEvent[];
  winnerId: string | null;
  /** Epoch ms when the current turn auto-advances. Stamped by the server. */
  turnEndsAt: number | null;
  turnSeconds: number;
}

export type GameAction =
  | {
      type: "addPlayer";
      player: Pick<Player, "id" | "name" | "token" | "color" | "avatar">;
    }
  | { type: "startGame" }
  | { type: "resetGame" }
  | { type: "rollDice"; playerId: string; dice: [number, number]; draw: number }
  | { type: "buyTile"; playerId: string }
  | { type: "skipBuy"; playerId: string }
  | { type: "buildHouse"; playerId: string; tileId: string }
  | { type: "sellHouse"; playerId: string; tileId: string }
  | { type: "mortgage"; playerId: string; tileId: string }
  | { type: "unmortgage"; playerId: string; tileId: string }
  | { type: "payJail"; playerId: string }
  | { type: "useJailCard"; playerId: string }
  | { type: "dismissCard"; playerId: string }
  | { type: "bidAuction"; playerId: string; amount: number }
  | { type: "passAuction"; playerId: string }
  | {
      type: "proposeTrade";
      playerId: string;
      toId: string;
      offerProps: string[];
      offerCash: number;
      requestProps: string[];
      requestCash: number;
    }
  | { type: "respondTrade"; playerId: string; accept: boolean }
  | { type: "endTurn"; playerId: string };
