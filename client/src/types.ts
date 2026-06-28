// ── Card types ─────────────────────────────────────────────────────────────

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

export type Rank =
  | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10"
  | "J" | "Q" | "K" | "A";

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type PlayerIndex = 0 | 1;

export type GamePhase =
  | "trump_selection"
  | "discarding"
  | "drawing"
  | "final_pick"
  | "trick_taking"
  | "round_over"
  | "game_over";

export interface Trick {
  player1Card: Card | null;
  player2Card: Card | null;
  leader: PlayerIndex;
  winner: PlayerIndex | null;
}

// ── Sanitized state from server ────────────────────────────────────────────

export interface SanitizedGameState {
  yourHand: Card[];
  opponentHandCount: number;
  phase: GamePhase;
  trumpSuit: Suit | null;
  hakem: PlayerIndex;
  yourPlayerIndex: PlayerIndex;
  stackCount: number;
  currentTrick: Trick;
  trickHistory: Trick[];
  matchScores: [number, number];
  roundScores: [number, number];
  isYourTurn: boolean;
  drawnCard: Card | null;
  finalDrawnCards: [Card, Card] | null;
  activePlayer: PlayerIndex;
}

// ── Server messages ────────────────────────────────────────────────────────

export interface RoomJoinedMsg {
  type: "room_joined";
  playerIndex: PlayerIndex;
  opponentName: string | null;
  roomCode: string;
}

export interface OpponentJoinedMsg {
  type: "opponent_joined";
  name: string;
}

export interface OpponentLeftMsg {
  type: "opponent_left";
}

export interface CountdownMsg {
  type: "countdown";
  seconds: number;
}

export interface GameStartMsg {
  type: "game_start";
  state: SanitizedGameState;
}

export interface TrumpChosenMsg {
  type: "trump_chosen";
  suit: Suit;
}

export interface YourTurnMsg {
  type: "your_turn";
  phase: GamePhase;
}

export interface DrawnCardMsg {
  type: "drawn_card";
  card: Card;
}

export interface FinalCardsMsg {
  type: "final_cards";
  cards: [Card, Card];
}

export interface ForcedCardMsg {
  type: "forced_card";
  card: Card;
}

export interface OpponentDrewMsg {
  type: "opponent_drew";
}

export interface CardPlayedMsg {
  type: "card_played";
  playerIndex: PlayerIndex;
  card: Card;
}

export interface TrickResultMsg {
  type: "trick_result";
  winner: PlayerIndex;
  score: [number, number];
}

export interface RoundResultMsg {
  type: "round_result";
  winner: PlayerIndex;
  tricks: [number, number];
  matchScore: [number, number];
}

export interface NewRoundMsg {
  type: "new_round";
  hakem: PlayerIndex;
  state: SanitizedGameState;
}

export interface GameOverMsg {
  type: "game_over";
  matchWinner: PlayerIndex;
  finalScore: [number, number];
}

export interface StateUpdateMsg {
  type: "state_update";
  state: SanitizedGameState;
}

export interface ErrorMsg {
  type: "error";
  message: string;
  code: string;
}

export interface PongMsg {
  type: "pong";
}

export type ServerMessage =
  | RoomJoinedMsg
  | OpponentJoinedMsg
  | OpponentLeftMsg
  | CountdownMsg
  | GameStartMsg
  | TrumpChosenMsg
  | YourTurnMsg
  | DrawnCardMsg
  | FinalCardsMsg
  | ForcedCardMsg
  | OpponentDrewMsg
  | CardPlayedMsg
  | TrickResultMsg
  | RoundResultMsg
  | NewRoundMsg
  | GameOverMsg
  | StateUpdateMsg
  | ErrorMsg
  | PongMsg;

// ── Suit display helpers ───────────────────────────────────────────────────

export const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

export const SUIT_COLORS: Record<Suit, string> = {
  spades: "#1a1a1a",
  hearts: "#dc2626",
  diamonds: "#dc2626",
  clubs: "#1a1a1a",
};

export const RANK_DISPLAY: Record<Rank, string> = {
  "2": "۲",
  "3": "۳",
  "4": "۴",
  "5": "۵",
  "6": "۶",
  "7": "۷",
  "8": "۸",
  "9": "۹",
  "10": "۱۰",
  J: "J",
  Q: "Q",
  K: "K",
  A: "A",
};

export const SUIT_NAMES_FA: Record<Suit, string> = {
  spades: "پیک",
  hearts: "دل",
  diamonds: "خشت",
  clubs: "گشنیز",
};
