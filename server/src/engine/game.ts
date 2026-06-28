import {
  Card,
  GameState,
  GamePhase,
  PlayerIndex,
  PlayerState,
  Rank,
  SanitizedGameState,
  Suit,
  Trick,
} from "./types";
import { compareCards, createDeck, drawCards, evaluateTrick } from "./deck";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createEmptyTrick(leader: PlayerIndex): Trick {
  return { player1Card: null, player2Card: null, leader, winner: null };
}

function getTrickLeadSuit(trick: Trick): Suit | null {
  // Check the leader's card slot first
  if (trick.leader === 0 && trick.player1Card) return trick.player1Card.suit;
  if (trick.leader === 1 && trick.player2Card) return trick.player2Card.suit;
  // Fallback: check either slot (for cases where leader info is stale)
  if (trick.player1Card) return trick.player1Card.suit;
  if (trick.player2Card) return trick.player2Card.suit;
  return null;
}

function otherPlayer(p: PlayerIndex): PlayerIndex {
  return (1 - p) as PlayerIndex;
}

function removeCardsByIndices(hand: Card[], indices: number[]): Card[] {
  const indexSet = new Set(indices);
  return hand.filter((_, i) => !indexSet.has(i));
}

function isValidCardIndex(hand: Card[], index: number): boolean {
  return index >= 0 && index < hand.length;
}

function mustFollowSuit(hand: Card[], leadSuit: Suit): boolean {
  return hand.some((c) => c.suit === leadSuit);
}

// ── startDrawTurn ────────────────────────────────────────────────────────────

export function startDrawTurn(state: GameState): GameState {
  if (state.phase !== "drawing") return state;
  if (state.stack.length < 2) return state;

  const { drawn, remaining } = drawCards(state.stack, 1);
  return { ...state, drawnCard: drawn[0], stack: remaining };
}

// ── startNewRound ────────────────────────────────────────────────────────────

export function startNewRound(
  player1Name: string,
  player2Name: string,
  hakem: PlayerIndex,
  matchScores?: [number, number]
): GameState {
  const deck = createDeck();
  const p1Draw = drawCards(deck, 5);
  const p2Draw = drawCards(p1Draw.remaining, 5);

  const players: [PlayerState, PlayerState] = [
    { hand: p1Draw.drawn, tricksWon: 0, isHakem: hakem === 0, name: player1Name },
    { hand: p2Draw.drawn, tricksWon: 0, isHakem: hakem === 1, name: player2Name },
  ];

  return {
    players,
    phase: "trump_selection",
    hakem,
    trumpSuit: null,
    stack: p2Draw.remaining,
    currentTrick: createEmptyTrick(hakem),
    trickHistory: [],
    matchScores: matchScores ?? [0, 0],
    roundScores: [0, 0],
    activePlayer: hakem,
    drawnCard: null,
    finalDrawnCards: null,
    turnNumber: 0,
    discarded: [false, false],
    discardPile: [],
  };
}

// ── chooseTrump ──────────────────────────────────────────────────────────────

export function chooseTrump(state: GameState, suit: Suit): GameState {
  if (state.phase !== "trump_selection") {
    throw new Error("Not in trump_selection phase");
  }
  if (state.activePlayer !== state.hakem) {
    throw new Error("Only the hakem can choose trump");
  }

  return {
    ...state,
    trumpSuit: suit,
    phase: "discarding",
    discarded: [false, false],
  };
}

// ── discard ──────────────────────────────────────────────────────────────────

export function discard(
  state: GameState,
  playerIndex: PlayerIndex,
  cardIndices: number[]
): GameState {
  // Note: no strict phase guard here. Both players discard in parallel; the
  // second player's discard can arrive after the first player's discard has
  // already advanced the phase to "drawing".  The discarded[] flag prevents
  // double-discards regardless of current phase.
  if (state.discarded && state.discarded[playerIndex]) {
    throw new Error("Player has already discarded");
  }

  const required = playerIndex === state.hakem ? 3 : 2;
  if (cardIndices.length !== required) {
    throw new Error(`Must discard exactly ${required} cards`);
  }

  // Validate indices
  const hand = state.players[playerIndex].hand;
  const unique = new Set(cardIndices);
  if (unique.size !== cardIndices.length) {
    throw new Error("Duplicate card indices");
  }
  for (const idx of cardIndices) {
    if (!isValidCardIndex(hand, idx)) {
      throw new Error(`Invalid card index: ${idx}`);
    }
  }

  // Remove cards from hand, add to discard pile
  const discardedCards = cardIndices.map((i) => hand[i]);
  const newHand = removeCardsByIndices(hand, cardIndices);
  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[playerIndex] = { ...newPlayers[playerIndex], hand: newHand };

  const newDiscarded = [...(state.discarded ?? [false, false])] as [boolean, boolean];
  newDiscarded[playerIndex] = true;
  const allDone = newDiscarded[0] && newDiscarded[1];

  const newState: GameState = {
    ...state,
    players: newPlayers,
    discarded: newDiscarded,
    discardPile: [...(state.discardPile ?? []), ...discardedCards],
  };

  // Both done → advance to drawing and start first draw turn
  if (allDone) {
    const s = { ...newState, phase: "drawing" as GamePhase };
    return startDrawTurn(s);
  }

  return newState;
}

// ── drawChoice ───────────────────────────────────────────────────────────────

export function drawChoice(
  state: GameState,
  action: "keep" | "pass"
): GameState {
  if (state.phase !== "drawing") {
    throw new Error("Not in drawing phase");
  }
  // Guard: both players must have discarded before drawing
  if (state.discarded && (!state.discarded[0] || !state.discarded[1])) {
    throw new Error("Both players must discard before drawing");
  }
  if (state.drawnCard === null) {
    throw new Error("No drawn card to act on — call startDrawTurn first");
  }
  if (state.stack.length === 0) {
    throw new Error("Stack is empty");
  }

  const player = state.activePlayer;
  const drawnCard = state.drawnCard;
  const { drawn: nextDrawn, remaining } = drawCards(state.stack, 1);
  const nextCard = nextDrawn[0];

  let keptCard: Card;
  let discardedCard: Card;

  if (action === "keep") {
    keptCard = drawnCard;
    discardedCard = nextCard;
  } else {
    keptCard = nextCard;
    discardedCard = drawnCard;
  }

  // Update player's hand
  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[player] = {
    ...newPlayers[player],
    hand: [...newPlayers[player].hand, keptCard],
  };

  const base: GameState = {
    ...state,
    players: newPlayers,
    stack: remaining,
    drawnCard: null,
    discardPile: [...(state.discardPile ?? []), discardedCard],
  };

  // Stack reached 4 → final pick phase
  if (remaining.length === 4) {
    return {
      ...base,
      phase: "final_pick",
      finalPickDone: [false, false],
      finalDrawnCards: null,
      activePlayer: state.hakem,
    };
  }

  // Otherwise switch player and start next draw turn
  return startDrawTurn({ ...base, activePlayer: otherPlayer(player) });
}

// ── finalPick ────────────────────────────────────────────────────────────────

export function finalPick(
  state: GameState,
  playerIndex: PlayerIndex,
  keepIndex: 0 | 1
): GameState {
  if (state.phase !== "final_pick") {
    throw new Error("Not in final_pick phase");
  }
  if (keepIndex !== 0 && keepIndex !== 1) {
    throw new Error("keepIndex must be 0 or 1");
  }

  const pickDone = state.finalPickDone ?? [false, false];
  if (pickDone[playerIndex]) {
    throw new Error("Player has already picked");
  }

  // First picker must be hakem; second picker must be the other
  if (!pickDone[0] && !pickDone[1] && playerIndex !== state.hakem) {
    throw new Error("Hakem must pick first");
  }

  let finalCards = state.finalDrawnCards;

  // Draw 2 cards for this player if not already set
  if (!finalCards) {
    if (state.stack.length < 2) {
      throw new Error("Not enough cards in stack for final pick");
    }
    const { drawn, remaining } = drawCards(state.stack, 2);
    finalCards = [drawn[0], drawn[1]];
    state = { ...state, stack: remaining };
  }

  const keptCard = finalCards[keepIndex];
  const discardedCard = finalCards[1 - keepIndex];

  // Update player's hand
  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[playerIndex] = {
    ...newPlayers[playerIndex],
    hand: [...newPlayers[playerIndex].hand, keptCard],
  };

  const newPickDone = [...pickDone] as [boolean, boolean];
  newPickDone[playerIndex] = true;
  const bothDone = newPickDone[0] && newPickDone[1];

  const base: GameState = {
    ...state,
    players: newPlayers,
    finalPickDone: newPickDone,
    discardPile: [...(state.discardPile ?? []), discardedCard],
  };

  if (bothDone) {
    // Both picked → start trick taking
    return {
      ...base,
      phase: "trick_taking",
      finalDrawnCards: null,
      activePlayer: state.hakem,
      currentTrick: createEmptyTrick(state.hakem),
    };
  }

  // Other player picks next
  return {
    ...base,
    finalDrawnCards: null, // reset so next player draws fresh
    activePlayer: otherPlayer(playerIndex),
  };
}

// ── playCard ─────────────────────────────────────────────────────────────────

export function playCard(state: GameState, cardIndex: number): GameState {
  if (state.phase !== "trick_taking") {
    throw new Error("Not in trick_taking phase");
  }

  const player = state.activePlayer;
  const hand = state.players[player].hand;

  if (!isValidCardIndex(hand, cardIndex)) {
    throw new Error(`Invalid card index: ${cardIndex}`);
  }

  // Follow-suit rule
  const leadSuit = getTrickLeadSuit(state.currentTrick);
  const isFirstCard = leadSuit === null;

  if (!isFirstCard) {
    const hasLedSuit = mustFollowSuit(hand, leadSuit!);
    if (hasLedSuit && hand[cardIndex].suit !== leadSuit) {
      throw new Error(`Must follow suit: ${leadSuit}`);
    }
  }

  const card = hand[cardIndex];
  const newHand = removeCardsByIndices(hand, [cardIndex]);

  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[player] = { ...newPlayers[player], hand: newHand };

  // Place card in trick
  let trick = { ...state.currentTrick };
  if (player === 0) {
    trick = { ...trick, player1Card: card };
  } else {
    trick = { ...trick, player2Card: card };
  }

  // First card → switch player, wait for opponent
  if (isFirstCard) {
    return {
      ...state,
      players: newPlayers,
      currentTrick: trick,
      activePlayer: otherPlayer(player),
      turnNumber: state.turnNumber + 1,
    };
  }

  // Second card → trick complete
  const leaderCard = trick.leader === 0 ? trick.player1Card! : trick.player2Card!;
  const leadSuitForEval = leaderCard.suit;
  const trump = state.trumpSuit!;
  const winner = evaluateTrick(
    trick.player1Card!,
    trick.player2Card!,
    leadSuitForEval,
    trump,
    trick.leader
  );

  const completedTrick: Trick = { ...trick, winner };

  const newPlayersAfterTrick = [...newPlayers] as [PlayerState, PlayerState];
  newPlayersAfterTrick[winner] = {
    ...newPlayersAfterTrick[winner],
    tricksWon: newPlayersAfterTrick[winner].tricksWon + 1,
  };

  const newRoundScores: [number, number] = [...state.roundScores] as [number, number];
  newRoundScores[winner] += 1;

  const newTrickHistory = [...state.trickHistory, completedTrick];

  // Check if round is over (7 tricks)
  if (newRoundScores[winner] >= 7) {
    const newMatchScores: [number, number] = [...state.matchScores] as [number, number];
    newMatchScores[winner] += 1;

    const roundState: GameState = {
      ...state,
      players: newPlayersAfterTrick,
      currentTrick: createEmptyTrick(winner),
      trickHistory: newTrickHistory,
      roundScores: newRoundScores,
      matchScores: newMatchScores,
      activePlayer: winner,
      turnNumber: state.turnNumber + 1,
    };

    // Match over (best of 13, first to 7 round wins)
    if (newMatchScores[winner] >= 7) {
      return { ...roundState, phase: "game_over" };
    }

    return { ...roundState, phase: "round_over" };
  }

  // Round continues — winner leads next trick
  return {
    ...state,
    players: newPlayersAfterTrick,
    currentTrick: createEmptyTrick(winner),
    trickHistory: newTrickHistory,
    roundScores: newRoundScores,
    activePlayer: winner,
    turnNumber: state.turnNumber + 1,
  };
}

// ── sanitizeState ────────────────────────────────────────────────────────────

export function sanitizeState(
  state: GameState,
  forPlayer: PlayerIndex
): SanitizedGameState {
  const you = state.players[forPlayer];
  const opp = state.players[otherPlayer(forPlayer)];

  return {
    yourHand: you.hand,
    opponentHandCount: opp.hand.length,
    phase: state.phase,
    trumpSuit: state.trumpSuit,
    hakem: state.hakem,
    yourPlayerIndex: forPlayer,
    stackCount: state.stack.length,
    currentTrick: state.currentTrick,
    trickHistory: state.trickHistory,
    matchScores: state.matchScores,
    roundScores: state.roundScores,
    isYourTurn: state.activePlayer === forPlayer,
    drawnCard: state.drawnCard,
    finalDrawnCards: state.finalDrawnCards,
    activePlayer: state.activePlayer,
  };
}

// ── isValidMove ──────────────────────────────────────────────────────────────

export function isValidMove(
  state: GameState,
  action:
    | { type: "chooseTrump"; suit: Suit }
    | { type: "discard"; playerIndex: PlayerIndex; cardIndices: number[] }
    | { type: "drawChoice"; action: "keep" | "pass" }
    | { type: "finalPick"; playerIndex: PlayerIndex; keepIndex: 0 | 1 }
    | { type: "playCard"; cardIndex: number }
): boolean {
  try {
    switch (action.type) {
      case "chooseTrump":
        chooseTrump(state, action.suit);
        return true;

      case "discard":
        discard(state, action.playerIndex, action.cardIndices);
        return true;

      case "drawChoice":
        drawChoice(state, action.action);
        return true;

      case "finalPick":
        finalPick(state, action.playerIndex, action.keepIndex);
        return true;

      case "playCard":
        playCard(state, action.cardIndex);
        return true;

      default:
        return false;
    }
  } catch {
    return false;
  }
}
