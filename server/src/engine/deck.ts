import { Card, Rank, Suit } from "./types";

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS: Rank[] = [
  "2", "3", "4", "5", "6", "7", "8", "9", "10",
  "J", "Q", "K", "A",
];

// Card rank value for comparison (2=lowest, A=highest)
export const RANK_VALUES: Record<Rank, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8,
  "9": 9, "10": 10, "J": 11, "Q": 12, "K": 13, "A": 14,
};

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return shuffleDeck(deck);
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Remove and return the top N cards from the deck
export function drawCards(deck: Card[], count: number): {
  drawn: Card[];
  remaining: Card[];
} {
  return {
    drawn: deck.slice(0, count),
    remaining: deck.slice(count),
  };
}

// Compare two cards in the same suit (higher wins)
export function compareCards(a: Card, b: Card): number {
  return RANK_VALUES[a.rank] - RANK_VALUES[b.rank];
}

// Determine trick winner
// card1 = player 0's card, card2 = player 1's card
export function evaluateTrick(
  card1: Card,
  card2: Card,
  leadSuit: Suit,
  trumpSuit: Suit,
  leader: 0 | 1
): 0 | 1 {
  const card1IsTrump = card1.suit === trumpSuit;
  const card2IsTrump = card2.suit === trumpSuit;

  // Both trump → higher trump wins
  if (card1IsTrump && card2IsTrump) {
    return compareCards(card1, card2) > 0 ? 0 : 1;
  }

  // Only one is trump → trump wins
  if (card1IsTrump) return 0;
  if (card2IsTrump) return 1;

  // No trump → higher card of led suit wins
  const card1FollowsSuit = card1.suit === leadSuit;
  const card2FollowsSuit = card2.suit === leadSuit;

  if (card1FollowsSuit && card2FollowsSuit) {
    return compareCards(card1, card2) > 0 ? 0 : 1;
  }

  // If only one follows suit, that one wins
  if (card1FollowsSuit) return 0;
  if (card2FollowsSuit) return 1;

  // Neither follows suit and no trump → leader wins (shouldn't happen)
  return leader;
}
