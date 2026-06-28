import { EventEmitter } from "events";
import {
  Card,
  GamePhase,
  GameState,
  PlayerIndex,
  Rank,
  SanitizedGameState,
  Suit,
  RANK_VALUES,
  startNewRound,
  chooseTrump as engineChooseTrump,
  discard as engineDiscard,
  drawChoice as engineDrawChoice,
  finalPick as engineFinalPick,
  playCard as enginePlayCard,
  sanitizeState,
  startDrawTurn,
} from "../engine";

// ── Event payloads ─────────────────────────────────────────────────────────

export interface StateChangeEvent {
  playerIndex: PlayerIndex;
  state: SanitizedGameState;
}

export interface TurnChangeEvent {
  playerIndex: PlayerIndex;
  phase: GamePhase;
}

export interface TrickCompleteEvent {
  winner: PlayerIndex;
  cards: [Card, Card];
  score: [number, number];
}

export interface RoundCompleteEvent {
  winner: PlayerIndex;
  tricks: [number, number];
  matchScore: [number, number];
}

export interface MatchCompleteEvent {
  matchWinner: PlayerIndex;
  finalScore: [number, number];
}

export interface TimeoutEvent {
  playerIndex: PlayerIndex;
}

// ── Typed emitter interface ────────────────────────────────────────────────

interface GameSessionEvents {
  state_change: (event: StateChangeEvent) => void;
  turn_change: (event: TurnChangeEvent) => void;
  trick_complete: (event: TrickCompleteEvent) => void;
  round_complete: (event: RoundCompleteEvent) => void;
  match_complete: (event: MatchCompleteEvent) => void;
  timeout: (event: TimeoutEvent) => void;
}

export declare interface GameSession {
  on<U extends keyof GameSessionEvents>(event: U, listener: GameSessionEvents[U]): this;
  emit<U extends keyof GameSessionEvents>(event: U, ...args: Parameters<GameSessionEvents[U]>): boolean;
}

// ── GameSession ────────────────────────────────────────────────────────────

export class GameSession extends EventEmitter {
  private state: GameState;
  private turnTimer: NodeJS.Timeout | null = null;
  private turnTimeoutMs: number;
  private playerNames: [string, string];
  private _destroyed = false;

  constructor(player1Name: string, player2Name: string) {
    super();
    this.playerNames = [player1Name, player2Name];
    this.turnTimeoutMs = parseInt(process.env.TURN_TIMEOUT ?? "60", 10) * 1000;
    this.state = startNewRound(player1Name, player2Name, 0);
  }

  // ── Public API ──────────────────────────────────────────────────────────

  start(): void {
    this.emitStateToBoth();
    this.emitTurnChange(this.state.activePlayer);
  }

  chooseTrump(suit: Suit): void {
    this.state = engineChooseTrump(this.state, suit);
    this.emitStateToBoth();
    // Discarding phase: both players discard in parallel, no turn_change needed
  }

  discard(playerIndex: PlayerIndex, cardIndices: number[]): void {
    const prevPhase = this.state.phase;
    this.state = engineDiscard(this.state, playerIndex, cardIndices);
    this.emitStateToBoth();

    // If phase advanced to drawing (both discarded), start the first draw turn
    if (prevPhase === "discarding" && this.state.phase === "drawing") {
      // Engine's discard already called startDrawTurn internally — just notify clients
      this.emitTurnChange(this.state.activePlayer);
    }
  }

  drawChoice(action: "keep" | "pass"): void {
    this.clearTurnTimer();
    this.state = engineDrawChoice(this.state, action);
    this.emitStateToBoth();

    if (this.state.phase === "final_pick") {
      this.startFinalPickInternal();
    } else if (this.state.phase === "drawing") {
      // Engine's drawChoice already called startDrawTurn internally — just notify clients
      this.emitTurnChange(this.state.activePlayer);
    }
  }

  finalPick(playerIndex: PlayerIndex, keepIndex: 0 | 1): void {
    this.clearTurnTimer();
    this.state = engineFinalPick(this.state, playerIndex, keepIndex);
    this.emitStateToBoth();

    if (this.state.phase === "trick_taking") {
      // Both picked, first trick starts with hakem
      this.emitTurnChange(this.state.activePlayer);
    } else if (this.state.phase === "final_pick") {
      // Other player's turn to pick
      this.emitTurnChange(this.state.activePlayer);
    }
  }

  playCard(playerIndex: PlayerIndex, cardIndex: number): void {
    this.clearTurnTimer();

    const prevTrickCount = this.state.trickHistory.length;
    const prevPhase = this.state.phase;
    const roundScoresBefore = [...this.state.roundScores] as [number, number];
    const matchScoresBefore = [...this.state.matchScores] as [number, number];

    this.state = enginePlayCard(this.state, cardIndex);

    // First card played — just switch turns
    if (this.state.trickHistory.length === prevTrickCount) {
      this.emitStateToBoth();
      this.emitTurnChange(this.state.activePlayer);
      return;
    }

    // Trick completed — emit trick_complete, then check phase transitions
    const completedTrick = this.state.trickHistory[this.state.trickHistory.length - 1];
    const trickCards: [Card, Card] = [
      completedTrick.player1Card!,
      completedTrick.player2Card!,
    ];
    const winner = completedTrick.winner!;

    this.emit("trick_complete", {
      winner,
      cards: trickCards,
      score: [...this.state.roundScores] as [number, number],
    });

    this.emitStateToBoth();

    // Check phase transitions
    if (this.state.phase === "round_over" || this.state.phase === "game_over") {
      const roundWinner = this.state.roundScores[0] > this.state.roundScores[1] ? 0 : 1;

      this.emit("round_complete", {
        winner: roundWinner as PlayerIndex,
        tricks: [...this.state.roundScores] as [number, number],
        matchScore: [...this.state.matchScores] as [number, number],
      });

      if (this.state.phase === "game_over") {
        const matchWinner = this.state.matchScores[0] >= 7 ? 0 : 1;
        this.emit("match_complete", {
          matchWinner: matchWinner as PlayerIndex,
          finalScore: [...this.state.matchScores] as [number, number],
        });
      } else {
        // Start next round after delay
        setTimeout(() => this.startNewRoundInternal(), 2000);
      }
    } else {
      // Round continues — winner leads next trick
      this.emitTurnChange(this.state.activePlayer);
    }
  }

  getStateForPlayer(playerIndex: PlayerIndex): SanitizedGameState {
    return sanitizeState(this.state, playerIndex);
  }

  getActivePlayer(): PlayerIndex {
    return this.state.activePlayer;
  }

  getPhase(): GamePhase {
    return this.state.phase;
  }

  getState(): GameState {
    return this.state;
  }

  destroy(): void {
    this._destroyed = true;
    this.clearTurnTimer();
    this.removeAllListeners();
  }

  // ── Internal helpers ────────────────────────────────────────────────────

  private emitStateToBoth(): void {
    const s0 = sanitizeState(this.state, 0);
    const s1 = sanitizeState(this.state, 1);
    this.emit("state_change", { playerIndex: 0, state: s0 });
    this.emit("state_change", { playerIndex: 1, state: s1 });
  }

  private emitTurnChange(playerIndex: PlayerIndex): void {
    this.emit("turn_change", { playerIndex, phase: this.state.phase });
    this.startTurnTimer(playerIndex);
  }

  private startDrawTurnInternal(): void {
    this.state = startDrawTurn(this.state);
    const activePlayer = this.state.activePlayer;
    this.emitStateToBoth();
    this.emitTurnChange(activePlayer);
  }

  private startFinalPickInternal(): void {
    // Hakem goes first — the engine already sets activePlayer to hakem
    this.emitTurnChange(this.state.activePlayer);
  }

  private startNewRoundInternal(): void {
    if (this._destroyed) return;
    const loserAsHakem: PlayerIndex = this.state.roundScores[0] >= 7 ? 1 : 0;
    this.state = startNewRound(
      this.playerNames[0],
      this.playerNames[1],
      loserAsHakem,
      this.state.matchScores
    );
    this.emitStateToBoth();
    this.emitTurnChange(this.state.activePlayer);
  }

  // ── Turn timer ──────────────────────────────────────────────────────────

  private startTurnTimer(playerIndex: PlayerIndex): void {
    this.clearTurnTimer();
    if (this._destroyed) return;

    this.turnTimer = setTimeout(() => {
      if (this._destroyed) return;
      this.emit("timeout", { playerIndex });
      this.autoPlay(playerIndex);
    }, this.turnTimeoutMs);
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  private autoPlay(playerIndex: PlayerIndex): void {
    if (this._destroyed) return;
    if (this.state.activePlayer !== playerIndex) return;

    try {
      switch (this.state.phase) {
        case "trump_selection":
          this.autoChooseTrump(playerIndex);
          break;
        case "discarding":
          this.autoDiscard(playerIndex);
          break;
        case "drawing":
          this.drawChoice("pass");
          break;
        case "final_pick":
          this.finalPick(playerIndex, 0);
          break;
        case "trick_taking":
          this.autoPlayCard(playerIndex);
          break;
      }
    } catch {
      // Auto-play failed — game is in an unexpected state
    }
  }

  private autoChooseTrump(playerIndex: PlayerIndex): void {
    // Pick the suit the player has the most of
    const hand = this.state.players[playerIndex].hand;
    const suitCounts: Record<Suit, number> = {
      spades: 0,
      hearts: 0,
      diamonds: 0,
      clubs: 0,
    };
    for (const card of hand) {
      suitCounts[card.suit]++;
    }
    // Find the suit with the most cards (break ties by preference order)
    const suits: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
    let bestSuit: Suit = suits[0];
    let bestCount = -1;
    for (const suit of suits) {
      if (suitCounts[suit] > bestCount) {
        bestCount = suitCounts[suit];
        bestSuit = suit;
      }
    }
    this.chooseTrump(bestSuit);
  }

  private autoDiscard(playerIndex: PlayerIndex): void {
    const hand = this.state.players[playerIndex].hand;
    const required = playerIndex === this.state.hakem ? 3 : 2;

    // Sort hand by rank value (ascending) and pick the lowest N indices
    const indexed = hand.map((card, i) => ({
      index: i,
      value: RANK_VALUES[card.rank],
    }));
    indexed.sort((a, b) => a.value - b.value);

    const indices = indexed.slice(0, required).map((x) => x.index);
    this.discard(playerIndex, indices);
  }

  private autoPlayCard(playerIndex: PlayerIndex): void {
    const hand = this.state.players[playerIndex].hand;
    const trick = this.state.currentTrick;

    // Determine lead suit
    let leadSuit: Suit | null = null;
    if (trick.leader === 0 && trick.player1Card) {
      leadSuit = trick.player1Card.suit;
    } else if (trick.leader === 1 && trick.player2Card) {
      leadSuit = trick.player2Card.suit;
    }

    if (leadSuit) {
      // Must follow suit if possible
      const followIndex = hand.findIndex((c) => c.suit === leadSuit);
      if (followIndex >= 0) {
        this.playCard(playerIndex, followIndex);
        return;
      }
    }

    // Play first card in hand
    this.playCard(playerIndex, 0);
  }
}
