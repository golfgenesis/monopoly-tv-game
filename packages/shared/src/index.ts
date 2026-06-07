import type { GameAction, GameState } from "@siamsetthi/rules";

export interface ServerToClientEvents {
  roomCreated: (payload: { roomCode: string; state: GameState }) => void;
  roomState: (payload: { state: GameState }) => void;
  joined: (payload: { playerId: string; roomCode: string; state: GameState }) => void;
  errorMessage: (message: string) => void;
}

export interface ClientToServerEvents {
  createRoom: () => void;
  joinRoom: (payload: {
    roomCode: string;
    name: string;
    token: string;
    color: string;
    avatar: string;
  }) => void;
  hostStartGame: (payload: { roomCode: string }) => void;
  hostResetGame: (payload: { roomCode: string }) => void;
  playerAction: (payload: { roomCode: string; playerId: string; action: GameAction }) => void;
}

export interface InterServerEvents {}

export interface SocketData {
  roomCode?: string;
  playerId?: string;
  role?: "tv" | "phone";
}
