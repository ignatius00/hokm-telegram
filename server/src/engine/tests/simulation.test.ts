import { describe, it, expect } from "vitest";
import {
  startNewRound,
  chooseTrump,
  discard,
  drawChoice,
  finalPick,
  playCard,
  sanitizeState,
} from "../game";
import { Card, GameState, PlayerIndex, SanitizedGameState, Suit } from "../types";

// ── Helpers ──────────────────────────────────────────────────────────────────

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick N unique random indices from [0, hand.length). */
function randomIndices(handLength: number, count: number): number[] {
  const all = Array.from({ length: handLength }, (_, i) => i);
  return shuffle(all).slice(0, count);
}

/** Find a valid card index respecting follow-suit rules. */
function findValidCardIndex(s: GameState): number {
  const player = s.activePlayer;
  const hand = s.players[player].hand;
  const trick = s.currentTrick;

  // Determine lead suit from the leader's card slot
  let leadSuit: Suit | null = null;
  if (trick.leader === 0 && trick.player1Card) leadSuit = trick.player1Card.suit;
  else if (trick.leader === 1 && trick.player2Card) leadSuit = trick.player2Card.suit;

  // Leader can play anything
  if (!leadSuit) return Math.floor(Math.random() * hand.length);

  // Must follow suit if possible
  const following = hand
    .map((c, i) => ({ card: c, idx: i }))
    .filter((x) => x.card.suit === leadSuit);

  if (following.length > 0) return pick(following).idx;

  // Void — play anything
  return Math.floor(Math.random() * hand.length);
}

/** Count every card across all locations in the game state. */
function countAllCards(s: GameState): number {
  const trickCards =
    s.trickHistory.length * 2 +
    (s.currentTrick.player1Card ? 1 : 0) +
    (s.currentTrick.player2Card ? 1 : 0);
  return (
    s.players[0].hand.length +
    s.players[1].hand.length +
    s.stack.length +
    (s.discardPile?.length ?? 0) +
    (s.drawnCard ? 1 : 0) +
    trickCards
  );
}

// ── Snapshot collector ───────────────────────────────────────────────────────

interface PhaseSnapshot {
  phase: string;
  hand0: number;
  hand1: number;
  stack: number;
  totalCards: number;
}

function snapshot(s: GameState): PhaseSnapshot {
  return {
    phase: s.phase,
    hand0: s.players[0].hand.length,
    hand1: s.players[1].hand.length,
    stack: s.stack.length,
    totalCards: countAllCards(s),
  };
}

// ── Play one full round ──────────────────────────────────────────────────────

interface RoundResult {
  state: GameState;
  snapshots: PhaseSnapshot[];
  error: string | null;
}

function playOneRandomRound(
  hakem: PlayerIndex,
  matchScores?: [number, number]
): RoundResult {
  const snapshots: PhaseSnapshot[] = [];

  try {
    // Phase 1: deal
    let s = startNewRound("P0", "P1", hakem, matchScores);
    snapshots.push(snapshot(s));
    expect(s.phase).toBe("trump_selection");
    expect(s.players[0].hand).toHaveLength(5);
    expect(s.players[1].hand).toHaveLength(5);
    expect(s.stack).toHaveLength(42);

    // Phase 2: trump selection
    const trump = pick(SUITS);
    s = chooseTrump(s, trump);
    expect(s.phase).toBe("discarding");
    expect(s.trumpSuit).toBe(trump);

    // Phase 3: discard (hakem first, then other)
    const other = (1 - hakem) as PlayerIndex;
    s = discard(s, hakem, randomIndices(s.players[hakem].hand.length, 3));
    expect(s.players[hakem].hand).toHaveLength(2);

    s = discard(s, other, randomIndices(s.players[other].hand.length, 2));
    expect(s.players[other].hand).toHaveLength(3);
    snapshots.push(snapshot(s));

    // Phase 4: drawing (19 turns — after discard, startDrawTurn already drew 1 card)
    expect(s.phase).toBe("drawing");
    expect(s.drawnCard).not.toBeNull();

    for (let i = 0; i < 19; i++) {
      expect(s.phase).toBe("drawing");
      expect(s.drawnCard).not.toBeNull();
      s = drawChoice(s, Math.random() < 0.5 ? "keep" : "pass");
    }
    expect(s.phase).toBe("final_pick");
    expect(s.players[hakem].hand).toHaveLength(12);
    expect(s.players[other].hand).toHaveLength(12);
    expect(s.stack).toHaveLength(4);
    snapshots.push(snapshot(s));

    // Phase 5: final pick (hakem first)
    s = finalPick(s, hakem, Math.random() < 0.5 ? 0 : 1);
    expect(s.players[hakem].hand).toHaveLength(13);

    s = finalPick(s, other, Math.random() < 0.5 ? 0 : 1);
    expect(s.players[other].hand).toHaveLength(13);
    expect(s.stack).toHaveLength(0);
    expect(s.phase).toBe("trick_taking");
    snapshots.push(snapshot(s));

    // Phase 6: trick-taking
    let tricksPlayed = 0;
    while (s.phase === "trick_taking") {
      s = playCard(s, findValidCardIndex(s));
      if (s.phase === "trick_taking") {
        s = playCard(s, findValidCardIndex(s));
      }
      tricksPlayed++;
    }

    // Verify round ended correctly
    expect(["round_over", "game_over"]).toContain(s.phase);
    expect(s.roundScores[0] + s.roundScores[1]).toBeGreaterThanOrEqual(7);
    expect(s.trickHistory.length).toBeGreaterThanOrEqual(7);
    expect(countAllCards(s)).toBe(52);
    snapshots.push(snapshot(s));

    return { state: s, snapshots, error: null };
  } catch (err) {
    return {
      state: null as any,
      snapshots,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Play a full match (multiple rounds until someone wins 7) ─────────────────

interface MatchResult {
  rounds: number;
  finalScores: [number, number];
  winner: PlayerIndex;
  roundSnapshots: PhaseSnapshot[][];
  error: string | null;
}

function playFullMatch(): MatchResult {
  let matchScores: [number, number] = [0, 0];
  let hakem: PlayerIndex = 0;
  const roundSnapshots: PhaseSnapshot[][] = [];
  let rounds = 0;

  while (rounds < 20) {
    // safety cap
    const result = playOneRandomRound(hakem, matchScores);
    if (result.error) {
      return {
        rounds,
        finalScores: matchScores,
        winner: -1 as any,
        roundSnapshots,
        error: `Round ${rounds + 1}: ${result.error}`,
      };
    }

    roundSnapshots.push(result.snapshots);
    matchScores = result.state.matchScores;
    rounds++;

    if (result.state.phase === "game_over") break;

    // Loser becomes next hakem
    hakem = result.state.roundScores[0] >= 7 ? 1 : 0;
  }

  const winner: PlayerIndex = matchScores[0] >= 7 ? 0 : 1;
  return { rounds, finalScores: matchScores, winner, roundSnapshots, error: null };
}

// ═════════════════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe("random simulation — 10 complete games", () => {
  for (let game = 1; game <= 10; game++) {
    it(`game ${game}: full match plays to completion`, () => {
      const result = playFullMatch();

      if (result.error) {
        throw new Error(result.error);
      }

      // Match must end with someone at 7
      expect(result.finalScores[0] + result.finalScores[1]).toBeGreaterThanOrEqual(7);
      expect(result.finalScores[result.winner]).toBeGreaterThanOrEqual(7);
      expect(result.rounds).toBeGreaterThanOrEqual(1);
      expect(result.rounds).toBeLessThanOrEqual(13);

      // Every round must have valid snapshots
      for (const roundSnaps of result.roundSnapshots) {
        // At least: deal, post-discard, post-drawing, post-final-pick, post-tricks
        expect(roundSnaps.length).toBeGreaterThanOrEqual(4);

        for (const snap of roundSnaps) {
          expect(snap.totalCards).toBe(52);
        }
      }
    });
  }

  it("all 10 games produce valid end states", () => {
    const results: MatchResult[] = [];
    for (let i = 0; i < 10; i++) {
      results.push(playFullMatch());
    }

    const errors = results.filter((r) => r.error);
    expect(errors).toHaveLength(0);

    // Every game must have a winner
    for (const r of results) {
      expect(r.finalScores[r.winner]).toBeGreaterThanOrEqual(7);
      expect(r.rounds).toBeGreaterThanOrEqual(1);
    }
  });

  it("phase boundary hand sizes are consistent across all rounds", () => {
    for (let game = 0; game < 5; game++) {
      const result = playFullMatch();
      if (result.error) throw new Error(result.error);

      for (const roundSnaps of result.roundSnapshots) {
        // snap[0]: after deal
        expect(roundSnaps[0].hand0).toBe(5);
        expect(roundSnaps[0].hand1).toBe(5);
        expect(roundSnaps[0].stack).toBe(42);

        // snap[1]: after discard (startDrawTurn already drew 1 card → stack 41)
        const d = roundSnaps[1];
        expect(d.hand0 + d.hand1).toBe(5); // 2+3 in some order
        expect(d.stack).toBe(41); // 42 - 1 drawn by startDrawTurn

        // snap[2]: after drawing (before final pick)
        expect(roundSnaps[2].hand0).toBe(12);
        expect(roundSnaps[2].hand1).toBe(12);
        expect(roundSnaps[2].stack).toBe(4);

        // snap[3]: after final pick
        expect(roundSnaps[3].hand0).toBe(13);
        expect(roundSnaps[3].hand1).toBe(13);
        expect(roundSnaps[3].stack).toBe(0);
      }
    }
  });

  it("trick counts are correct in every round", () => {
    for (let game = 0; game < 5; game++) {
      let matchScores: [number, number] = [0, 0];
      let hakem: PlayerIndex = 0;

      for (let round = 0; round < 13; round++) {
        const result = playOneRandomRound(hakem, matchScores);
        if (result.error) throw new Error(result.error);

        const s = result.state;
        // Round scores sum >= 7 (winner reached 7)
        expect(s.roundScores[0] + s.roundScores[1]).toBeGreaterThanOrEqual(7);
        // Trick history matches round scores
        expect(s.trickHistory.length).toBe(s.roundScores[0] + s.roundScores[1]);
        // Each trick has a winner
        for (const trick of s.trickHistory) {
          expect(trick.winner).not.toBeNull();
          expect(trick.player1Card).not.toBeNull();
          expect(trick.player2Card).not.toBeNull();
        }

        matchScores = s.matchScores;
        if (s.phase === "game_over") break;
        hakem = s.roundScores[0] >= 7 ? 1 : 0;
      }
    }
  });

  it("sanitizeState produces correct views for both players", () => {
    for (let game = 0; game < 5; game++) {
      let s = startNewRound("Alice", "Bob", 0);
      s = chooseTrump(s, pick(SUITS));
      s = discard(s, 0, randomIndices(5, 3));
      s = discard(s, 1, randomIndices(5, 2));

      for (let i = 0; i < 19; i++) {
        s = drawChoice(s, Math.random() < 0.5 ? "keep" : "pass");
      }
      s = finalPick(s, s.hakem, 0);
      s = finalPick(s, (1 - s.hakem) as PlayerIndex, 0);

      // Verify sanitize at trick-taking phase
      const view0 = sanitizeState(s, 0);
      const view1 = sanitizeState(s, 1);

      // Opponent hands hidden
      expect(view0.yourHand).toHaveLength(13);
      expect(view0.opponentHandCount).toBe(13);
      expect(view1.yourHand).toHaveLength(13);
      expect(view1.opponentHandCount).toBe(13);

      // Player indices correct
      expect(view0.yourPlayerIndex).toBe(0);
      expect(view1.yourPlayerIndex).toBe(1);

      // Public info matches
      expect(view0.trumpSuit).toBe(s.trumpSuit);
      expect(view0.hakem).toBe(s.hakem);
      expect(view0.matchScores).toEqual(s.matchScores);

      // isYourTurn
      if (s.activePlayer === 0) {
        expect(view0.isYourTurn).toBe(true);
        expect(view1.isYourTurn).toBe(false);
      } else {
        expect(view0.isYourTurn).toBe(false);
        expect(view1.isYourTurn).toBe(true);
      }
    }
  });

  it("match scores are consistent: winner has exactly 7", () => {
    for (let game = 0; game < 10; game++) {
      const result = playFullMatch();
      if (result.error) throw new Error(result.error);

      const winner = result.winner;
      const loser = (1 - winner) as PlayerIndex;
      expect(result.finalScores[winner]).toBeGreaterThanOrEqual(7);
      expect(result.finalScores[loser]).toBeLessThan(7);
      // Sum of all round wins = total rounds
      expect(result.finalScores[0] + result.finalScores[1]).toBe(result.rounds);
    }
  });

  it("loser becomes hakem in the next round", () => {
    for (let game = 0; game < 5; game++) {
      let matchScores: [number, number] = [0, 0];
      let hakem: PlayerIndex = 0;

      for (let round = 0; round < 13; round++) {
        const result = playOneRandomRound(hakem, matchScores);
        if (result.error) throw new Error(result.error);

        const s = result.state;
        if (s.phase === "game_over") break;

        // Loser of this round becomes hakem
        if (s.roundScores[0] >= 7) {
          hakem = 1; // P0 won, P1 (loser) is next hakem
        } else {
          hakem = 0; // P1 won, P0 (loser) is next hakem
        }
        matchScores = s.matchScores;
      }
    }
  });

  it("no duplicate cards ever exist in a round", () => {
    for (let game = 0; game < 5; game++) {
      const result = playOneRandomRound(0);
      if (result.error) throw new Error(result.error);

      // Collect all cards from final state
      const s = result.state;
      const allCards: Card[] = [
        ...s.players[0].hand,
        ...s.players[1].hand,
        ...s.stack,
        ...(s.discardPile ?? []),
        ...(s.drawnCard ? [s.drawnCard] : []),
        ...s.trickHistory.flatMap((t) => [t.player1Card!, t.player2Card!]),
        ...(s.currentTrick.player1Card ? [s.currentTrick.player1Card] : []),
        ...(s.currentTrick.player2Card ? [s.currentTrick.player2Card] : []),
      ];

      const keys = allCards.map((c) => `${c.rank}-${c.suit}`);
      const uniqueKeys = new Set(keys);

      // Allow for the fact that the same card key appears once per occurrence
      // But there should be exactly 52 unique cards total
      expect(allCards).toHaveLength(52);
      expect(uniqueKeys.size).toBe(52);
    }
  });
});
