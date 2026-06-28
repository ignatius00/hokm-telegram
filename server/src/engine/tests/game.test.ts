import { describe, it, expect } from "vitest";
import {
  startNewRound,
  chooseTrump,
  discard,
  startDrawTurn,
  drawChoice,
  finalPick,
  playCard,
  sanitizeState,
  isValidMove,
} from "../game";
import { Card, GameState, PlayerIndex, Suit } from "../types";
import { RANK_VALUES } from "../deck";
import { Rank } from "../types";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal game state with custom hands for trick-taking tests. */
function trickTakingState(opts: {
  hand0: Card[];
  hand1: Card[];
  trump: Suit;
  hakem?: PlayerIndex;
  activePlayer?: PlayerIndex;
  currentTrick?: GameState["currentTrick"];
  trickHistory?: GameState["trickHistory"];
  roundScores?: [number, number];
  matchScores?: [number, number];
}): GameState {
  const hakem = opts.hakem ?? 0;
  const active = opts.activePlayer ?? 0;
  return {
    players: [
      { hand: opts.hand0, tricksWon: opts.roundScores?.[0] ?? 0, isHakem: hakem === 0, name: "P0" },
      { hand: opts.hand1, tricksWon: opts.roundScores?.[1] ?? 0, isHakem: hakem === 1, name: "P1" },
    ],
    phase: "trick_taking",
    hakem,
    trumpSuit: opts.trump,
    stack: [],
    currentTrick: opts.currentTrick ?? { player1Card: null, player2Card: null, leader: active, winner: null },
    trickHistory: opts.trickHistory ?? [],
    matchScores: opts.matchScores ?? [0, 0],
    roundScores: opts.roundScores ?? [0, 0],
    activePlayer: active,
    drawnCard: null,
    finalDrawnCards: null,
    turnNumber: 0,
  };
}

/** Build a card shorthand: "As" = Ace of spades, "10h" = 10 of hearts, etc. */
function c(code: string): Card {
  const suitMap: Record<string, Suit> = {
    s: "spades", h: "hearts", d: "diamonds", c: "clubs",
  };
  const rankStr = code.slice(0, -1);
  const suitStr = code.slice(-1);
  if (!suitMap[suitStr]) throw new Error(`Bad suit in code: ${code}`);
  return { rank: rankStr as Rank, suit: suitMap[suitStr] };
}

/** Count all 52 cards across hands + stack + discard pile + drawnCard + trick history. */
function countAllCards(s: GameState): number {
  const trickCards = s.trickHistory.length * 2 +
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

/** Find the index of a valid card to play (follows suit if required). */
function findValidCardIndex(s: GameState): number {
  const player = s.activePlayer;
  const hand = s.players[player].hand;
  const trick = s.currentTrick;

  // Determine lead suit from the leader's card slot
  let leadSuit: Suit | null = null;
  if (trick.leader === 0 && trick.player1Card) leadSuit = trick.player1Card.suit;
  else if (trick.leader === 1 && trick.player2Card) leadSuit = trick.player2Card.suit;

  // If we're the leader (no lead suit yet), play index 0
  if (!leadSuit) return 0;

  // Must follow suit if we can
  const suitIdx = hand.findIndex((c) => c.suit === leadSuit);
  if (suitIdx >= 0) return suitIdx;

  // Void in led suit — play anything
  return 0;
}

/** Run a full round from deal through all 13 tricks, returning final state. */
function playFullRound(hakem: PlayerIndex = 0): GameState {
  let s = startNewRound("Alice", "Bob", hakem);

  // Trump
  s = chooseTrump(s, "spades");

  // Discard: hakem 3, other 2
  s = discard(s, s.hakem, [0, 1, 2]);
  s = discard(s, (1 - s.hakem) as PlayerIndex, [0, 1]);

  // Drawing: 19 drawChoice calls (each processes 2 cards)
  for (let i = 0; i < 19; i++) {
    expect(s.phase).toBe("drawing");
    expect(s.drawnCard).not.toBeNull();
    s = drawChoice(s, i % 2 === 0 ? "keep" : "pass");
  }

  expect(s.phase).toBe("final_pick");

  // Final pick
  s = finalPick(s, s.hakem, 0);
  s = finalPick(s, (1 - s.hakem) as PlayerIndex, 0);
  expect(s.phase).toBe("trick_taking");

  // Play 13 tricks
  for (let trick = 0; trick < 13 && s.phase === "trick_taking"; trick++) {
    s = playCard(s, findValidCardIndex(s));
    if (s.phase === "trick_taking") {
      s = playCard(s, findValidCardIndex(s));
    }
  }

  return s;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 1: startNewRound
// ═══════════════════════════════════════════════════════════════════════════════

describe("startNewRound", () => {
  it("creates a valid initial state", () => {
    const s = startNewRound("Alice", "Bob", 0);
    expect(s.phase).toBe("trump_selection");
    expect(s.trumpSuit).toBeNull();
    expect(s.hakem).toBe(0);
    expect(s.activePlayer).toBe(0);
    expect(s.currentTrick).toEqual({ player1Card: null, player2Card: null, leader: 0, winner: null });
    expect(s.trickHistory).toEqual([]);
    expect(s.roundScores).toEqual([0, 0]);
    expect(s.turnNumber).toBe(0);
    expect(s.drawnCard).toBeNull();
    expect(s.finalDrawnCards).toBeNull();
  });

  it("deals exactly 5 cards to each player", () => {
    const s = startNewRound("Alice", "Bob", 0);
    expect(s.players[0].hand).toHaveLength(5);
    expect(s.players[1].hand).toHaveLength(5);
  });

  it("stack has exactly 42 cards", () => {
    const s = startNewRound("Alice", "Bob", 0);
    expect(s.stack).toHaveLength(42);
  });

  it("phase is trump_selection", () => {
    const s = startNewRound("Alice", "Bob", 0);
    expect(s.phase).toBe("trump_selection");
  });

  it("hakem is set correctly for player 0", () => {
    const s = startNewRound("Alice", "Bob", 0);
    expect(s.hakem).toBe(0);
    expect(s.players[0].isHakem).toBe(true);
    expect(s.players[1].isHakem).toBe(false);
  });

  it("hakem is set correctly for player 1", () => {
    const s = startNewRound("Alice", "Bob", 1);
    expect(s.hakem).toBe(1);
    expect(s.players[0].isHakem).toBe(false);
    expect(s.players[1].isHakem).toBe(true);
  });

  it("match scores carry over from previous rounds", () => {
    const s = startNewRound("Alice", "Bob", 0, [3, 5]);
    expect(s.matchScores).toEqual([3, 5]);
  });

  it("match scores default to [0, 0]", () => {
    const s = startNewRound("Alice", "Bob", 0);
    expect(s.matchScores).toEqual([0, 0]);
  });

  it("total cards are accounted for (5 + 5 + 42 = 52)", () => {
    const s = startNewRound("Alice", "Bob", 0);
    const total = s.players[0].hand.length + s.players[1].hand.length + s.stack.length;
    expect(total).toBe(52);
  });

  it("no duplicate cards between hands and stack", () => {
    const s = startNewRound("Alice", "Bob", 0);
    const all = [...s.players[0].hand, ...s.players[1].hand, ...s.stack];
    const keys = all.map((c) => `${c.rank}-${c.suit}`);
    expect(new Set(keys).size).toBe(52);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 2: chooseTrump
// ═══════════════════════════════════════════════════════════════════════════════

describe("chooseTrump", () => {
  it("hakem can choose trump", () => {
    const s = startNewRound("Alice", "Bob", 0);
    const s2 = chooseTrump(s, "hearts");
    expect(s2.trumpSuit).toBe("hearts");
  });

  it("non-hakem gets an error", () => {
    const s = startNewRound("Alice", "Bob", 0);
    expect(() => chooseTrump({ ...s, activePlayer: 1 }, "hearts")).toThrow("Only the hakem can choose trump");
  });

  it("sets trumpSuit correctly for each suit", () => {
    const suits: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
    for (const suit of suits) {
      const s = startNewRound("Alice", "Bob", 0);
      const s2 = chooseTrump(s, suit);
      expect(s2.trumpSuit).toBe(suit);
    }
  });

  it("advances phase to discarding", () => {
    const s = startNewRound("Alice", "Bob", 0);
    const s2 = chooseTrump(s, "spades");
    expect(s2.phase).toBe("discarding");
  });

  it("rejects when not in trump_selection phase", () => {
    const s = startNewRound("Alice", "Bob", 0);
    const s2 = chooseTrump(s, "spades");
    expect(() => chooseTrump(s2, "hearts")).toThrow("Not in trump_selection phase");
  });

  it("player names are preserved", () => {
    const s = startNewRound("Alice", "Bob", 0);
    const s2 = chooseTrump(s, "spades");
    expect(s2.players[0].name).toBe("Alice");
    expect(s2.players[1].name).toBe("Bob");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 3: discard
// ═══════════════════════════════════════════════════════════════════════════════

describe("discard", () => {
  function readyToDiscard() {
    const s = startNewRound("Alice", "Bob", 0);
    return chooseTrump(s, "spades");
  }

  it("hakem discards 3 cards → hand size goes from 5 to 2", () => {
    const s = readyToDiscard();
    const s2 = discard(s, 0, [0, 1, 2]);
    expect(s2.players[0].hand).toHaveLength(2);
  });

  it("other discards 2 cards → hand size goes from 5 to 3", () => {
    const s = readyToDiscard();
    const s2 = discard(s, 1, [0, 1]);
    expect(s2.players[1].hand).toHaveLength(3);
  });

  it("hakem discarding wrong count throws error", () => {
    const s = readyToDiscard();
    expect(() => discard(s, 0, [0, 1])).toThrow("Must discard exactly 3 cards");
    expect(() => discard(s, 0, [0, 1, 2, 3])).toThrow("Must discard exactly 3 cards");
  });

  it("other discarding wrong count throws error", () => {
    const s = readyToDiscard();
    expect(() => discard(s, 1, [0])).toThrow("Must discard exactly 2 cards");
    expect(() => discard(s, 1, [0, 1, 2])).toThrow("Must discard exactly 2 cards");
  });

  it("duplicate indices throw error", () => {
    const s = readyToDiscard();
    expect(() => discard(s, 0, [0, 0, 1])).toThrow("Duplicate card indices");
  });

  it("out of range indices throw error", () => {
    const s = readyToDiscard();
    expect(() => discard(s, 0, [0, 1, 99])).toThrow("Invalid card index: 99");
  });

  it("negative indices throw error", () => {
    const s = readyToDiscard();
    expect(() => discard(s, 1, [-1, 0])).toThrow("Invalid card index: -1");
  });

  it("after both discard, phase advances to drawing", () => {
    const s = readyToDiscard();
    let s2 = discard(s, 0, [0, 1, 2]);
    expect(s2.phase).toBe("discarding");
    s2 = discard(s2, 1, [0, 1]);
    expect(s2.phase).toBe("drawing");
  });

  it("discarded cards are no longer in hand", () => {
    const s = readyToDiscard();
    const originalHand = [...s.players[0].hand];
    const discardedCards = [originalHand[0], originalHand[1], originalHand[2]];
    const s2 = discard(s, 0, [0, 1, 2]);
    for (const dc of discardedCards) {
      expect(s2.players[0].hand).not.toContainEqual(dc);
    }
  });

  it("throws if player already discarded", () => {
    const s = readyToDiscard();
    const s2 = discard(s, 0, [0, 1, 2]);
    expect(() => discard(s2, 0, [0, 1, 2])).toThrow("Player has already discarded");
  });

  it("accepts discard even if phase advanced (concurrent discard support)", () => {
    // Both players discard in parallel — the second player's discard can
    // arrive after the first player's discard has already advanced the phase
    // to "drawing".  The engine should still accept it.
    const s = startNewRound("Alice", "Bob", 0);
    const afterTrump = chooseTrump(s, "hearts");
    // Simulate: player 0 discarded first, phase advanced to drawing
    const afterP0 = discard(afterTrump, 0, [0, 1, 2]);
    // Player 1's discard should still work even though phase is now "drawing"
    const afterP1 = discard(afterP0, 1, [0, 1]);
    expect(afterP1.players[1].hand).toHaveLength(3);
    expect(afterP1.phase).toBe("drawing");
  });

  it("preserves all 52 cards (hands + stack + discard pile + drawnCard)", () => {
    const s = readyToDiscard();
    let s2 = discard(s, 0, [0, 1, 2]);
    s2 = discard(s2, 1, [0, 1]);
    // After both discard, startDrawTurn already drew 1 card into drawnCard
    expect(countAllCards(s2)).toBe(52);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 4: drawing phase
// ═══════════════════════════════════════════════════════════════════════════════

describe("drawing phase", () => {
  function readyToDraw() {
    let s = startNewRound("Alice", "Bob", 0);
    s = chooseTrump(s, "spades");
    s = discard(s, 0, [0, 1, 2]);
    s = discard(s, 1, [0, 1]);
    return s;
  }

  it("after discard, phase is drawing with drawnCard set", () => {
    const s = readyToDraw();
    expect(s.phase).toBe("drawing");
    expect(s.drawnCard).not.toBeNull();
    // startDrawTurn already drew 1 card, so stack = 41
    expect(s.stack).toHaveLength(41);
  });

  it("keep action: drawnCard added to hand, next stack card discarded", () => {
    const s = readyToDraw();
    const drawnCard = s.drawnCard!;
    const stackBefore = s.stack.length;
    const s2 = drawChoice(s, "keep");
    // Active player's hand should contain the drawn card
    expect(s2.players[0].hand).toContainEqual(drawnCard);
    // Stack decreased by 2 total (1 for next card + 1 for next startDrawTurn)
    // except on the last turn which goes to final_pick
    if (s2.phase === "drawing") {
      expect(s2.stack.length).toBe(stackBefore - 2);
    }
  });

  it("pass action: drawnCard discarded, next card forced into hand", () => {
    const s = readyToDraw();
    // drawnCard = s.stack[0] was already pulled by startDrawTurn
    // Next card in drawChoice = the current top of stack = s.stack[0]
    const nextCard = s.stack[0];
    const s2 = drawChoice(s, "pass");
    // Active player should have the next card forced into hand
    expect(s2.players[0].hand).toContainEqual(nextCard);
  });

  it("stack decreases by 2 each turn (while still in drawing)", () => {
    const s = readyToDraw();
    const stackBefore = s.stack.length;
    const s2 = drawChoice(s, "keep");
    if (s2.phase === "drawing") {
      expect(s2.stack.length).toBe(stackBefore - 2);
    }
  });

  it("active player switches after each turn", () => {
    const s = readyToDraw();
    expect(s.activePlayer).toBe(0);
    const s2 = drawChoice(s, "keep");
    if (s2.phase === "drawing") {
      expect(s2.activePlayer).toBe(1);
    }
  });

  it("after 19 turns, 4 cards remain and phase is final_pick", () => {
    let s = readyToDraw();
    for (let i = 0; i < 19; i++) {
      expect(s.phase).toBe("drawing");
      expect(s.drawnCard).not.toBeNull();
      s = drawChoice(s, i % 2 === 0 ? "keep" : "pass");
    }
    expect(s.phase).toBe("final_pick");
    expect(s.stack).toHaveLength(4);
  });

  it("hakem has 12 cards, other has 12 cards at end of drawing", () => {
    let s = readyToDraw();
    for (let i = 0; i < 19; i++) {
      s = drawChoice(s, "keep");
    }
    expect(s.players[s.hakem].hand).toHaveLength(12);
    expect(s.players[(1 - s.hakem) as PlayerIndex].hand).toHaveLength(12);
  });

  it("rejects drawChoice when drawnCard is null", () => {
    const s = readyToDraw();
    const noDrawn = { ...s, drawnCard: null };
    expect(() => drawChoice(noDrawn, "keep")).toThrow("No drawn card to act on");
  });

  it("rejects drawChoice when not in drawing phase", () => {
    const s = startNewRound("Alice", "Bob", 0);
    expect(() => drawChoice(s, "keep")).toThrow("Not in drawing phase");
  });

  it("total cards preserved through all drawing turns", () => {
    let s = readyToDraw();
    for (let i = 0; i < 19; i++) {
      s = drawChoice(s, i % 2 === 0 ? "keep" : "pass");
    }
    expect(countAllCards(s)).toBe(52);
  });

  it("alternating keep/pass works through entire drawing phase", () => {
    let s = readyToDraw();
    for (let i = 0; i < 19; i++) {
      expect(s.phase).toBe("drawing");
      s = drawChoice(s, "pass");
    }
    expect(s.phase).toBe("final_pick");
    expect(s.stack).toHaveLength(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 5: final pick
// ═══════════════════════════════════════════════════════════════════════════════

describe("final pick", () => {
  function readyToFinalPick() {
    let s = startNewRound("Alice", "Bob", 0);
    s = chooseTrump(s, "spades");
    s = discard(s, 0, [0, 1, 2]);
    s = discard(s, 1, [0, 1]);
    for (let i = 0; i < 19; i++) {
      s = drawChoice(s, "keep");
    }
    return s;
  }

  it("each player draws 2 cards from remaining 4", () => {
    let s = readyToFinalPick();
    expect(s.stack).toHaveLength(4);
    s = finalPick(s, s.hakem, 0);
    expect(s.stack).toHaveLength(2);
    s = finalPick(s, (1 - s.hakem) as PlayerIndex, 0);
    expect(s.stack).toHaveLength(0);
  });

  it("player chooses 1 to keep, other discarded", () => {
    let s = readyToFinalPick();
    const hakem = s.hakem;
    s = finalPick(s, hakem, 1);
    expect(s.players[hakem].hand).toHaveLength(13);
  });

  it("after both pick, each player has 13 cards", () => {
    let s = readyToFinalPick();
    const hakem = s.hakem;
    const other = (1 - hakem) as PlayerIndex;
    s = finalPick(s, hakem, 0);
    s = finalPick(s, other, 1);
    expect(s.players[0].hand).toHaveLength(13);
    expect(s.players[1].hand).toHaveLength(13);
  });

  it("phase advances to trick_taking", () => {
    let s = readyToFinalPick();
    const hakem = s.hakem;
    s = finalPick(s, hakem, 0);
    s = finalPick(s, (1 - hakem) as PlayerIndex, 0);
    expect(s.phase).toBe("trick_taking");
  });

  it("hakem is active player for first trick", () => {
    let s = readyToFinalPick();
    const hakem = s.hakem;
    s = finalPick(s, hakem, 0);
    s = finalPick(s, (1 - hakem) as PlayerIndex, 0);
    expect(s.activePlayer).toBe(hakem);
  });

  it("invalid keepIndex (not 0 or 1) throws error", () => {
    const s = readyToFinalPick();
    expect(() => finalPick(s, s.hakem, 2 as any)).toThrow("keepIndex must be 0 or 1");
    expect(() => finalPick(s, s.hakem, -1 as any)).toThrow("keepIndex must be 0 or 1");
  });

  it("throws if not in final_pick phase", () => {
    const s = startNewRound("Alice", "Bob", 0);
    expect(() => finalPick(s, 0, 0)).toThrow("Not in final_pick phase");
  });

  it("hakem must pick first", () => {
    const s = readyToFinalPick();
    const other = (1 - s.hakem) as PlayerIndex;
    expect(() => finalPick(s, other, 0)).toThrow("Hakem must pick first");
  });

  it("player cannot pick twice", () => {
    let s = readyToFinalPick();
    s = finalPick(s, s.hakem, 0);
    expect(() => finalPick(s, s.hakem, 0)).toThrow("Player has already picked");
  });

  it("total cards preserved through final pick", () => {
    let s = readyToFinalPick();
    s = finalPick(s, s.hakem, 0);
    s = finalPick(s, (1 - s.hakem) as PlayerIndex, 1);
    expect(countAllCards(s)).toBe(52);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 6: trick-taking - follow suit
// ═══════════════════════════════════════════════════════════════════════════════

describe("trick-taking - follow suit", () => {
  it("leader can play any card", () => {
    const s = trickTakingState({
      hand0: [c("2s"), c("Kh"), c("3d"), c("Ac")],
      hand1: [c("As"), c("Qh"), c("4d"), c("Kc")],
      trump: "hearts",
    });
    // Leader plays a diamond even though they have other suits
    const s2 = playCard(s, 2);
    expect(s2.currentTrick.player1Card).toEqual(c("3d"));
  });

  it("follower must follow suit if they have it", () => {
    const s = trickTakingState({
      hand0: [c("3s"), c("Kh"), c("4d"), c("Ac")],
      hand1: [c("As"), c("Qh"), c("5d"), c("Kc")],
      trump: "hearts",
      activePlayer: 0,
    });
    // P0 leads spades
    const s2 = playCard(s, 0);
    // P1 has spades, must follow — try playing hearts (index 1) → should fail
    expect(() => playCard(s2, 1)).toThrow("Must follow suit: spades");
  });

  it("follower who is void in led suit can play anything", () => {
    const s = trickTakingState({
      hand0: [c("3s"), c("Kh"), c("4d"), c("Ac")],
      hand1: [c("Qh"), c("5d"), c("Kc"), c("10h")],
      trump: "hearts",
      activePlayer: 0,
    });
    // P0 leads spades
    const s2 = playCard(s, 0);
    // P1 has no spades → can play hearts (index 0)
    const s3 = playCard(s2, 0);
    // After both cards, trick is in history
    expect(s3.trickHistory[0].player2Card).toEqual(c("Qh"));
  });

  it("playing off-suit when you have the led suit throws error", () => {
    const s = trickTakingState({
      hand0: [c("3s"), c("Kh"), c("4d")],
      hand1: [c("As"), c("Qh"), c("5d")],
      trump: "clubs",
      activePlayer: 0,
    });
    const s2 = playCard(s, 0); // P0 leads 3 of spades
    // P1 has spades (As) but tries to play hearts
    expect(() => playCard(s2, 1)).toThrow("Must follow suit: spades");
  });

  it("rejects invalid card index", () => {
    const s = trickTakingState({
      hand0: [c("3s"), c("Kh")],
      hand1: [c("As"), c("Qh")],
      trump: "clubs",
    });
    expect(() => playCard(s, 5)).toThrow("Invalid card index: 5");
  });

  it("rejects playCard when not in trick_taking phase", () => {
    const s = startNewRound("Alice", "Bob", 0);
    expect(() => playCard(s, 0)).toThrow("Not in trick_taking phase");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 7: trick-taking - winning tricks
// ═══════════════════════════════════════════════════════════════════════════════

describe("trick-taking - winning tricks", () => {
  it("higher card of led suit wins (no trump involvement)", () => {
    const s = trickTakingState({
      hand0: [c("Ks"), c("3h")],
      hand1: [c("As"), c("4h")],
      trump: "diamonds",
      activePlayer: 0,
    });
    let s2 = playCard(s, 0);  // P0 leads K of spades
    s2 = playCard(s2, 0);     // P1 plays A of spades
    // A beats K → P1 wins, trick is now in history
    expect(s2.trickHistory[0].winner).toBe(1);
    expect(s2.players[1].tricksWon).toBe(1);
  });

  it("trump beats non-trump", () => {
    const s = trickTakingState({
      hand0: [c("Ks"), c("3h")],
      hand1: [c("2d"), c("4h")],
      trump: "diamonds",
      activePlayer: 0,
    });
    let s2 = playCard(s, 0);  // P0 leads K of spades
    s2 = playCard(s2, 0);     // P1 plays 2 of diamonds (trump)
    // Trump beats non-trump → P1 wins
    expect(s2.trickHistory[0].winner).toBe(1);
  });

  it("higher trump beats lower trump", () => {
    const s = trickTakingState({
      hand0: [c("Ad"), c("3h")],
      hand1: [c("2d"), c("4h")],
      trump: "diamonds",
      activePlayer: 0,
    });
    let s2 = playCard(s, 0);  // P0 leads A of diamonds (trump)
    s2 = playCard(s2, 0);     // P1 plays 2 of diamonds (trump)
    // A beats 2 → P0 wins
    expect(s2.trickHistory[0].winner).toBe(0);
    expect(s2.players[0].tricksWon).toBe(1);
  });

  it("trick winner leads next trick", () => {
    const s = trickTakingState({
      hand0: [c("Ks"), c("3h")],
      hand1: [c("As"), c("4h")],
      trump: "diamonds",
      activePlayer: 0,
    });
    let s2 = playCard(s, 0);  // P0 leads K of spades
    s2 = playCard(s2, 0);     // P1 plays A of spades → P1 wins
    expect(s2.currentTrick.leader).toBe(1); // P1 leads next
    expect(s2.activePlayer).toBe(1);
  });

  it("trick history is recorded correctly", () => {
    const s = trickTakingState({
      hand0: [c("Ks"), c("3h")],
      hand1: [c("As"), c("4h")],
      trump: "diamonds",
      activePlayer: 0,
    });
    let s2 = playCard(s, 0);
    s2 = playCard(s2, 0);
    expect(s2.trickHistory).toHaveLength(1);
    expect(s2.trickHistory[0].player1Card).toEqual(c("Ks"));
    expect(s2.trickHistory[0].player2Card).toEqual(c("As"));
    expect(s2.trickHistory[0].winner).toBe(1);
    expect(s2.trickHistory[0].leader).toBe(0);
  });

  it("currentTrick is cleared after trick completes", () => {
    const s = trickTakingState({
      hand0: [c("Ks"), c("3h")],
      hand1: [c("As"), c("4h")],
      trump: "diamonds",
      activePlayer: 0,
    });
    let s2 = playCard(s, 0);
    s2 = playCard(s2, 0);
    // New trick should be empty (except leader)
    expect(s2.currentTrick.player1Card).toBeNull();
    expect(s2.currentTrick.player2Card).toBeNull();
  });

  it("follower wins when they follow suit with higher card", () => {
    const s = trickTakingState({
      hand0: [c("2s"), c("3h")],
      hand1: [c("Ks"), c("4h")],
      trump: "clubs",
      activePlayer: 0,
    });
    let s2 = playCard(s, 0);  // P0 leads 2 of spades
    s2 = playCard(s2, 0);     // P1 plays K of spades
    expect(s2.trickHistory[0].winner).toBe(1);
  });

  it("leader wins when follower plays lower card of same suit", () => {
    const s = trickTakingState({
      hand0: [c("As"), c("3h")],
      hand1: [c("2s"), c("4h")],
      trump: "clubs",
      activePlayer: 0,
    });
    let s2 = playCard(s, 0);  // P0 leads A of spades
    s2 = playCard(s2, 0);     // P1 plays 2 of spades
    expect(s2.trickHistory[0].winner).toBe(0);
  });

  it("multiple tricks accumulate in history", () => {
    const s = trickTakingState({
      hand0: [c("As"), c("2h"), c("Ks")],
      hand1: [c("2s"), c("Ah"), c("Qs")],
      trump: "clubs",
      activePlayer: 0,
    });
    // Trick 1: P0 leads As, P1 plays 2s → P0 wins
    let s2 = playCard(s, 0);
    s2 = playCard(s2, 0);
    expect(s2.trickHistory).toHaveLength(1);
    expect(s2.trickHistory[0].winner).toBe(0);

    // Trick 2: P0 leads 2h, P1 plays Ah → P1 wins
    s2 = playCard(s2, 0);
    s2 = playCard(s2, 0);
    expect(s2.trickHistory).toHaveLength(2);
    expect(s2.trickHistory[1].winner).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 8: round and match completion
// ═══════════════════════════════════════════════════════════════════════════════

describe("round and match completion", () => {
  /** Build a state where P0 has 6 tricks and needs 1 more to win. */
  function almostDoneState(winner: PlayerIndex = 0): GameState {
    const roundScores: [number, number] = winner === 0 ? [6, 0] : [0, 6];
    return trickTakingState({
      hand0: [c("As"), c("3h")],
      hand1: [c("2s"), c("4h")],
      trump: "hearts",
      activePlayer: 0,
      roundScores,
      matchScores: [0, 0],
    });
  }

  it("first to 7 tricks wins the round", () => {
    let s = almostDoneState(0);
    s = playCard(s, 0); // P0 leads As
    s = playCard(s, 0); // P1 plays 2s → P0 wins trick #7
    expect(s.roundScores[0]).toBe(7);
    expect(s.phase).toBe("round_over");
  });

  it("match score updates when round is won", () => {
    let s = almostDoneState(0);
    s = playCard(s, 0);
    s = playCard(s, 0);
    expect(s.matchScores).toEqual([1, 0]);
  });

  it("phase goes to round_over when round ends", () => {
    let s = almostDoneState(0);
    s = playCard(s, 0);
    s = playCard(s, 0);
    expect(s.phase).toBe("round_over");
  });

  it("phase goes to game_over when match score reaches 7", () => {
    let s = almostDoneState(0);
    // Set match score to 6 so this round win triggers game over
    s = { ...s, matchScores: [6, 0] };
    s = playCard(s, 0);
    s = playCard(s, 0);
    expect(s.matchScores[0]).toBe(7);
    expect(s.phase).toBe("game_over");
  });

  it("player 1 winning a round also works", () => {
    const s2 = trickTakingState({
      hand0: [c("2s"), c("3h")],
      hand1: [c("As"), c("4h")],
      trump: "hearts",
      activePlayer: 0,
      roundScores: [0, 6],
    });
    let s3 = playCard(s2, 0); // P0 leads 2s
    s3 = playCard(s3, 0);     // P1 plays As → P1 wins trick #7
    expect(s3.roundScores[1]).toBe(7);
    expect(s3.phase).toBe("round_over");
    expect(s3.matchScores).toEqual([0, 1]);
  });

  it("round_over state has correct scores", () => {
    let s = almostDoneState(0);
    s = playCard(s, 0);
    s = playCard(s, 0);
    expect(s.roundScores[0]).toBe(7);
    expect(s.roundScores[1]).toBe(0);
    expect(s.matchScores[0]).toBe(1);
  });

  it("can continue after round_over by starting new round", () => {
    let s = almostDoneState(0);
    s = playCard(s, 0);
    s = playCard(s, 0);
    expect(s.phase).toBe("round_over");
    // Start new round with loser as hakem
    const loser = s.roundScores[0] >= 7 ? 1 : 0;
    const s2 = startNewRound("Alice", "Bob", loser, s.matchScores);
    expect(s2.phase).toBe("trump_selection");
    expect(s2.hakem).toBe(loser);
    expect(s2.matchScores).toEqual(s.matchScores);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 9: full game simulation
// ═══════════════════════════════════════════════════════════════════════════════

describe("full game simulation", () => {
  it("plays through an entire round verifying all phase transitions", () => {
    let s = startNewRound("Alice", "Bob", 0);

    // Phase 1: trump_selection
    expect(s.phase).toBe("trump_selection");
    expect(s.players[0].hand).toHaveLength(5);
    expect(s.players[1].hand).toHaveLength(5);
    expect(s.stack).toHaveLength(42);

    // Phase 2: choose trump
    s = chooseTrump(s, "hearts");
    expect(s.phase).toBe("discarding");

    // Phase 3: discard
    s = discard(s, 0, [0, 1, 2]);
    expect(s.players[0].hand).toHaveLength(2);
    s = discard(s, 1, [0, 1]);
    expect(s.players[1].hand).toHaveLength(3);
    expect(s.phase).toBe("drawing");
    // After discard, startDrawTurn drew 1 card
    expect(s.drawnCard).not.toBeNull();

    // Phase 4: drawing (19 drawChoice calls)
    for (let i = 0; i < 19; i++) {
      expect(s.phase).toBe("drawing");
      expect(s.drawnCard).not.toBeNull();
      s = drawChoice(s, i % 2 === 0 ? "keep" : "pass");
    }
    expect(s.phase).toBe("final_pick");
    expect(s.players[0].hand).toHaveLength(12);
    expect(s.players[1].hand).toHaveLength(12);
    expect(s.stack).toHaveLength(4);

    // Phase 5: final pick
    s = finalPick(s, s.hakem, 0);
    expect(s.players[s.hakem].hand).toHaveLength(13);
    s = finalPick(s, (1 - s.hakem) as PlayerIndex, 1);
    expect(s.players[0].hand).toHaveLength(13);
    expect(s.players[1].hand).toHaveLength(13);
    expect(s.stack).toHaveLength(0);
    expect(s.phase).toBe("trick_taking");

    // Phase 6: trick-taking (13 tricks)
    let totalTricks = 0;
    for (let trick = 0; trick < 13 && s.phase === "trick_taking"; trick++) {
      s = playCard(s, findValidCardIndex(s)); // leader plays
      if (s.phase === "trick_taking") {
        s = playCard(s, findValidCardIndex(s)); // follower plays
      }
      totalTricks++;
    }

    // Verify round is complete
    expect(s.trickHistory.length).toBeGreaterThanOrEqual(7);
    expect(s.roundScores[0] + s.roundScores[1]).toBeGreaterThanOrEqual(7);
    expect(["round_over", "game_over"]).toContain(s.phase);

    // Remaining cards are accounted for (hands may or may not be empty)
    expect(countAllCards(s)).toBe(52);
  });

  it("preserves 52 total cards throughout entire round", () => {
    let s = startNewRound("Alice", "Bob", 0);
    s = chooseTrump(s, "diamonds");
    s = discard(s, 0, [0, 1, 2]);
    s = discard(s, 1, [0, 1]);

    for (let i = 0; i < 19; i++) {
      s = drawChoice(s, "keep");
    }
    s = finalPick(s, s.hakem, 0);
    s = finalPick(s, (1 - s.hakem) as PlayerIndex, 0);

    for (let t = 0; t < 13 && s.phase === "trick_taking"; t++) {
      s = playCard(s, findValidCardIndex(s));
      if (s.phase === "trick_taking") s = playCard(s, findValidCardIndex(s));
    }

    // All 52 cards accounted for
    expect(countAllCards(s)).toBe(52);
  });

  it("works with hakem = 1", () => {
    let s = startNewRound("Alice", "Bob", 1);
    expect(s.hakem).toBe(1);
    s = chooseTrump(s, "clubs");
    s = discard(s, 1, [0, 1, 2]); // hakem (P1) discards 3
    s = discard(s, 0, [0, 1]);     // other (P0) discards 2
    expect(s.players[1].hand).toHaveLength(2);
    expect(s.players[0].hand).toHaveLength(3);

    for (let i = 0; i < 19; i++) {
      s = drawChoice(s, "keep");
    }
    s = finalPick(s, 1, 0);
    s = finalPick(s, 0, 0);
    expect(s.players[0].hand).toHaveLength(13);
    expect(s.players[1].hand).toHaveLength(13);
  });

  it("match scores persist across multiple rounds", () => {
    let s = startNewRound("Alice", "Bob", 0, [2, 3]);
    s = chooseTrump(s, "spades");
    s = discard(s, 0, [0, 1, 2]);
    s = discard(s, 1, [0, 1]);
    for (let i = 0; i < 19; i++) s = drawChoice(s, "keep");
    s = finalPick(s, 0, 0);
    s = finalPick(s, 1, 0);
    for (let t = 0; t < 13 && s.phase === "trick_taking"; t++) {
      s = playCard(s, findValidCardIndex(s));
      if (s.phase === "trick_taking") s = playCard(s, findValidCardIndex(s));
    }
    // Match scores should have the base [2, 3] plus the round winner
    expect(s.matchScores[0] + s.matchScores[1]).toBe(6); // 2 + 3 + 1
  });

  it("complete 3-round mini-match from scratch", () => {
    // Simulate 3 rounds, alternating hakem
    let matchScores: [number, number] = [0, 0];
    let hakem: PlayerIndex = 0;

    for (let round = 0; round < 3; round++) {
      let s = startNewRound("Alice", "Bob", hakem, matchScores);
      s = chooseTrump(s, "hearts");
      s = discard(s, s.hakem, [0, 1, 2]);
      s = discard(s, (1 - s.hakem) as PlayerIndex, [0, 1]);
      for (let i = 0; i < 19; i++) s = drawChoice(s, "keep");
      s = finalPick(s, s.hakem, 0);
      s = finalPick(s, (1 - s.hakem) as PlayerIndex, 0);
      for (let t = 0; t < 13 && s.phase === "trick_taking"; t++) {
        s = playCard(s, findValidCardIndex(s));
        if (s.phase === "trick_taking") s = playCard(s, findValidCardIndex(s));
      }

      expect(["round_over", "game_over"]).toContain(s.phase);
      expect(s.trickHistory.length).toBeGreaterThanOrEqual(7);
      expect(s.roundScores[0] + s.roundScores[1]).toBeGreaterThanOrEqual(7);
      matchScores = s.matchScores;
      // Loser becomes next hakem
      hakem = s.roundScores[0] >= 7 ? 1 : 0;
    }

    expect(matchScores[0] + matchScores[1]).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 10: sanitizeState
// ═══════════════════════════════════════════════════════════════════════════════

describe("sanitizeState", () => {
  it("opponent hand is hidden (only count shown)", () => {
    const s = startNewRound("Alice", "Bob", 0);
    const view = sanitizeState(s, 0);
    expect(typeof view.opponentHandCount).toBe("number");
    expect(view.opponentHandCount).toBe(5);
    // Should not contain opponent's actual cards
    expect(view).not.toHaveProperty("opponentHand");
  });

  it("your hand is fully visible", () => {
    const s = startNewRound("Alice", "Bob", 0);
    const view = sanitizeState(s, 0);
    expect(view.yourHand).toHaveLength(5);
    expect(view.yourHand).toEqual(s.players[0].hand);
  });

  it("player 1's view shows their own hand", () => {
    const s = startNewRound("Alice", "Bob", 0);
    const view = sanitizeState(s, 1);
    expect(view.yourHand).toEqual(s.players[1].hand);
    expect(view.opponentHandCount).toBe(5);
  });

  it("all public info is present", () => {
    let s = startNewRound("Alice", "Bob", 0);
    s = chooseTrump(s, "hearts");
    const view = sanitizeState(s, 0);
    expect(view.phase).toBe("discarding");
    expect(view.trumpSuit).toBe("hearts");
    expect(view.hakem).toBe(0);
    expect(view.yourPlayerIndex).toBe(0);
    expect(view.stackCount).toBe(42);
    expect(view.matchScores).toEqual([0, 0]);
    expect(view.roundScores).toEqual([0, 0]);
    expect(view.isYourTurn).toBe(true);
    expect(view.activePlayer).toBe(0);
  });

  it("isYourTurn is false when it's opponent's turn", () => {
    const s = trickTakingState({
      hand0: [c("3s"), c("Kh")],
      hand1: [c("As"), c("Qh")],
      trump: "hearts",
      activePlayer: 1,
    });
    const view = sanitizeState(s, 0);
    expect(view.isYourTurn).toBe(false);
  });

  it("isYourTurn is true when it's your turn", () => {
    const s = trickTakingState({
      hand0: [c("3s"), c("Kh")],
      hand1: [c("As"), c("Qh")],
      trump: "hearts",
      activePlayer: 0,
    });
    const view = sanitizeState(s, 0);
    expect(view.isYourTurn).toBe(true);
  });

  it("trick history is visible", () => {
    const trick = {
      player1Card: c("Ks"),
      player2Card: c("As"),
      leader: 0 as PlayerIndex,
      winner: 1 as PlayerIndex,
    };
    const s = trickTakingState({
      hand0: [c("3h")],
      hand1: [c("4h")],
      trump: "hearts",
      trickHistory: [trick],
    });
    const view = sanitizeState(s, 0);
    expect(view.trickHistory).toHaveLength(1);
    expect(view.trickHistory[0]).toEqual(trick);
  });

  it("drawnCard is visible to the correct player during drawing", () => {
    let s = startNewRound("Alice", "Bob", 0);
    s = chooseTrump(s, "hearts");
    s = discard(s, 0, [0, 1, 2]);
    s = discard(s, 1, [0, 1]);
    const view = sanitizeState(s, 0);
    expect(view.drawnCard).not.toBeNull();
    expect(view.drawnCard).toEqual(s.drawnCard);
  });

  it("opponent hand count decreases as game progresses", () => {
    const s = trickTakingState({
      hand0: [c("As"), c("Kh")],
      hand1: [c("2s")],
      trump: "hearts",
      activePlayer: 0,
    });
    const view = sanitizeState(s, 0);
    expect(view.opponentHandCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BONUS: isValidMove
// ═══════════════════════════════════════════════════════════════════════════════

describe("isValidMove", () => {
  it("returns true for valid chooseTrump", () => {
    const s = startNewRound("Alice", "Bob", 0);
    expect(isValidMove(s, { type: "chooseTrump", suit: "hearts" })).toBe(true);
  });

  it("returns false for invalid chooseTrump (wrong phase)", () => {
    const s = startNewRound("Alice", "Bob", 0);
    const s2 = chooseTrump(s, "hearts");
    expect(isValidMove(s2, { type: "chooseTrump", suit: "spades" })).toBe(false);
  });

  it("returns true for valid discard", () => {
    const s = startNewRound("Alice", "Bob", 0);
    const s2 = chooseTrump(s, "hearts");
    expect(isValidMove(s2, { type: "discard", playerIndex: 0, cardIndices: [0, 1, 2] })).toBe(true);
  });

  it("returns false for invalid discard (wrong count)", () => {
    const s = startNewRound("Alice", "Bob", 0);
    const s2 = chooseTrump(s, "hearts");
    expect(isValidMove(s2, { type: "discard", playerIndex: 0, cardIndices: [0, 1] })).toBe(false);
  });

  it("returns true for valid playCard", () => {
    const s = trickTakingState({
      hand0: [c("3s")],
      hand1: [c("As")],
      trump: "hearts",
    });
    expect(isValidMove(s, { type: "playCard", cardIndex: 0 })).toBe(true);
  });

  it("returns false for invalid playCard (wrong phase)", () => {
    const s = startNewRound("Alice", "Bob", 0);
    expect(isValidMove(s, { type: "playCard", cardIndex: 0 })).toBe(false);
  });
});
