// Suits
export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

// Ranks in order from low to high
export type Rank =
  | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10"
  | "J" | "Q" | "K" | "A";

// A single card
export interface Card {
  rank: Rank;
  suit: Suit;
}

// Game phases in order
export type GamePhase =
  | "trump_selection" // Hakem chooses trump
  | "discarding"      // Both players discard
  | "drawing"         // Alternating draw turns
  | "final_pick"      // Each picks 1 of 2 remaining cards
  | "trick_taking"    // Playing out 13 tricks
  | "round_over"      // One round complete
  | "game_over";      // Match over (7 rounds won)

// A single trick (2 cards played)
export interface Trick {
  player1Card: Card | null;
  player2Card: Card | null;
  leader: PlayerIndex;
  winner: PlayerIndex | null;
}

export type PlayerIndex = 0 | 1;

// One player's visible state
export interface PlayerState {
  hand: Card[];
  tricksWon: number;
  isHakem: boolean;
  name: string;
}

// Full game state (server-side, contains all info)
export interface GameState {
  players: [PlayerState, PlayerState];
  phase: GamePhase;
  hakem: PlayerIndex;
  trumpSuit: Suit | null;
  stack: Card[];
  currentTrick: Trick;
  trickHistory: Trick[];
  matchScores: [number, number];   // rounds won by each player
  roundScores: [number, number];   // tricks won this round
  activePlayer: PlayerIndex;
  drawnCard: Card | null;          // card currently drawn (drawing phase)
  finalDrawnCards: [Card, Card] | null; // final pick phase
  turnNumber: number;
  // Internal tracking (not sent to clients)
  discarded?: [boolean, boolean];  // whether each player has discarded
  discardPile?: Card[];            // for debugging / audit
  finalPickDone?: [boolean, boolean]; // whether each player has picked
}

// What each client sees (no hidden info)
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
