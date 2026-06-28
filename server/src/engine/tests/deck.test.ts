import { describe, it, expect } from "vitest";
import { createDeck, drawCards, shuffleDeck, RANK_VALUES } from "../deck";
import { Rank, Suit } from "../types";

describe("createDeck", () => {
  it("creates a 52-card deck", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
  });

  it("has all 4 suits with 13 ranks each", () => {
    const deck = createDeck();
    const suits = new Set(deck.map((c) => c.suit));
    expect(suits.size).toBe(4);

    for (const suit of ["spades", "hearts", "diamonds", "clubs"] as Suit[]) {
      const cardsOfSuit = deck.filter((c) => c.suit === suit);
      expect(cardsOfSuit).toHaveLength(13);
    }
  });

  it("has no duplicate cards", () => {
    const deck = createDeck();
    const keys = deck.map((c) => `${c.rank}-${c.suit}`);
    expect(new Set(keys).size).toBe(52);
  });
});

describe("shuffleDeck", () => {
  it("preserves all cards", () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    expect(shuffled).toHaveLength(52);
    // Same set of cards (sorted comparison)
    const sortKey = (c: { rank: Rank; suit: Suit }) => `${c.suit}-${c.rank}`;
    expect([...shuffled].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))).toEqual(
      [...deck].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
    );
  });

  it("actually shuffles (order changes with high probability)", () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    // With 52 cards the chance of same order is 1/52! ≈ 0
    const sameOrder = deck.every(
      (c, i) => c.rank === shuffled[i].rank && c.suit === shuffled[i].suit
    );
    expect(sameOrder).toBe(false);
  });
});

describe("drawCards", () => {
  it("draws the requested number of cards", () => {
    const deck = createDeck();
    const { drawn, remaining } = drawCards(deck, 5);
    expect(drawn).toHaveLength(5);
    expect(remaining).toHaveLength(47);
  });

  it("returns all cards accounted for", () => {
    const deck = createDeck();
    const { drawn, remaining } = drawCards(deck, 13);
    expect([...drawn, ...remaining]).toEqual(deck);
  });

  it("drawn cards come from the top of the deck", () => {
    const deck = createDeck();
    const { drawn } = drawCards(deck, 3);
    expect(drawn).toEqual(deck.slice(0, 3));
  });
});

describe("RANK_VALUES", () => {
  it("has 2 as lowest and A as highest", () => {
    expect(RANK_VALUES["2"]).toBe(2);
    expect(RANK_VALUES["A"]).toBe(14);
  });

  it("is strictly increasing in rank order", () => {
    const ranks: Rank[] = [
      "2", "3", "4", "5", "6", "7", "8", "9", "10",
      "J", "Q", "K", "A",
    ];
    for (let i = 1; i < ranks.length; i++) {
      expect(RANK_VALUES[ranks[i]]).toBeGreaterThan(RANK_VALUES[ranks[i - 1]]);
    }
  });
});
