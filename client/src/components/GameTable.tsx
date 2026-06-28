import React, { useCallback, useMemo, useState } from "react";
import type { SanitizedGameState, Card as CardType, PlayerIndex, Suit, Rank } from "../types";
import { SUIT_SYMBOLS } from "../types";
import { Card } from "./Card";
import { TrickArea } from "./TrickArea";
import { TrumpSelector } from "./TrumpSelector";
import { DrawingPhase } from "./DrawingPhase";
import { FinalPick } from "./FinalPick";
import { GameOver } from "./GameOver";
import { Scores } from "./Scores";
import styles from "./GameTable.module.css";

// ── Hand sorting ──────────────────────────────────────────────────────────

const RANK_VALUES: Record<Rank, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8,
  "9": 9, "10": 10, "J": 11, "Q": 12, "K": 13, "A": 14,
};

// Alternating black → red → black → red
const SUIT_ORDER: Record<Suit, number> = {
  spades: 0,    // black
  hearts: 1,    // red
  clubs: 2,     // black
  diamonds: 3,  // red
};

function sortHand(hand: CardType[]): CardType[] {
  return [...hand].sort((a, b) => {
    const suitDiff = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    if (suitDiff !== 0) return suitDiff;
    return RANK_VALUES[a.rank] - RANK_VALUES[b.rank];
  });
}

interface GameTableProps {
  game: SanitizedGameState;
  drawnCard: CardType | null;
  forcedCard: CardType | null;
  finalCards: [CardType, CardType] | null;
  gameOver: { matchWinner: PlayerIndex; finalScore: [number, number] } | null;
  lastRoundResult: {
    winner: PlayerIndex;
    tricks: [number, number];
    matchScore: [number, number];
  } | null;
  isOpponentDrawing: boolean;
  error: string | null;
  onChooseTrump: (suit: Suit) => void;
  onDiscard: (indices: number[]) => void;
  onDrawChoice: (action: "keep" | "pass") => void;
  onFinalPick: (index: 0 | 1) => void;
  onPlayCard: (index: number) => void;
}

export const GameTable: React.FC<GameTableProps> = ({
  game,
  drawnCard,
  forcedCard,
  finalCards,
  gameOver,
  lastRoundResult,
  isOpponentDrawing,
  error,
  onChooseTrump,
  onDiscard,
  onDrawChoice,
  onFinalPick,
  onPlayCard,
}) => {
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [showScores, setShowScores] = useState(false);

  const myIndex = game.yourPlayerIndex;
  const oppIndex = (1 - myIndex) as PlayerIndex;
  const isMyTurn = game.isYourTurn;

  // Sort hand by suit (black-red alternating) then by rank, keeping original indices
  const sortedEntries = useMemo(() => {
    return game.yourHand
      .map((card, originalIndex) => ({ card, originalIndex }))
      .sort((a, b) => {
        const suitDiff = SUIT_ORDER[a.card.suit] - SUIT_ORDER[b.card.suit];
        if (suitDiff !== 0) return suitDiff;
        return RANK_VALUES[a.card.rank] - RANK_VALUES[b.card.rank];
      });
  }, [game.yourHand]);

  // ── Card selection for discarding ─────────────────────────────────────

  const toggleSelect = useCallback(
    (index: number) => {
      setSelectedIndices((prev) =>
        prev.includes(index)
          ? prev.filter((i) => i !== index)
          : [...prev, index]
      );
    },
    []
  );

  const handleDiscard = useCallback(() => {
    const required = myIndex === game.hakem ? 3 : 2;
    if (selectedIndices.length === required) {
      onDiscard(selectedIndices);
      setSelectedIndices([]);
    }
  }, [selectedIndices, myIndex, game.hakem, onDiscard]);

  // ── Determine if card is playable (follow suit) ──────────────────────

  const isCardPlayable = useCallback(
    (card: CardType, index: number): boolean => {
      if (game.phase !== "trick_taking" || !isMyTurn) return false;

      const trick = game.currentTrick;
      let leadSuit: string | null = null;
      if (trick.leader === 0 && trick.player1Card)
        leadSuit = trick.player1Card.suit;
      else if (trick.leader === 1 && trick.player2Card)
        leadSuit = trick.player2Card.suit;

      // First card of trick — anything goes
      if (!leadSuit) return true;

      // Must follow suit if possible
      const hasLedSuit = sortedEntries.some((e) => e.card.suit === leadSuit);
      if (hasLedSuit) return card.suit === leadSuit;

      return true;
    },
    [game]
  );

  // ── Phase-specific status text ───────────────────────────────────────

  const getStatusText = (): string => {
    switch (game.phase) {
      case "trump_selection":
        return isMyTurn ? "نوبت شماست: حکم را انتخاب کنید" : "حریف در حال انتخاب حکم...";
      case "discarding":
        return `کارت رد کنید (${myIndex === game.hakem ? 3 : 2} کارت)`;
      case "drawing":
        return isMyTurn ? "نوبت شماست" : "نوبت حریف";
      case "final_pick":
        return isMyTurn ? "یک کارت انتخاب کنید" : "حریف در حال انتخاب...";
      case "trick_taking":
        return isMyTurn ? "نوبت شماست: یک کارت بازی کنید" : "نوبت حریف";
      case "round_over":
        return "پایان دور";
      case "game_over":
        return "پایان بازی";
      default:
        return "";
    }
  };

  return (
    <div className={styles.table}>
      {/* ── Top: Opponent hand ──────────────────────────────────────── */}
      <div className={styles.opponentArea}>
        <div className={styles.playerInfo}>
          <span className={styles.playerTag}>
            {myIndex === 0 ? "بازیکن ۲" : "بازیکن ۱"}
          </span>
          {!isMyTurn && game.phase === "trick_taking" && (
            <span className={styles.turnDot} />
          )}
        </div>
        <div className={styles.handRow}>
          {Array.from({ length: game.opponentHandCount }).map((_, i) => (
            <Card key={i} faceDown small className={styles.oppCard} />
          ))}
        </div>
      </div>

      {/* ── Center: Trick area ──────────────────────────────────────── */}
      <TrickArea
        currentTrick={game.currentTrick}
        roundScores={game.roundScores}
        matchScores={game.matchScores}
        trumpSuit={game.trumpSuit}
        yourPlayerIndex={myIndex}
        trickHistoryCount={game.trickHistory.length}
      />

      {/* ── Status bar ──────────────────────────────────────────────── */}
      <div className={styles.statusBar}>
        <button className={styles.scoresBtn} onClick={() => setShowScores(true)}>
          📊 امتیازات
        </button>
        <span className={styles.statusText}>{getStatusText()}</span>
        <span className={styles.stackBadge}>
          {game.stackCount > 0 ? `${game.stackCount} 🃏` : ""}
        </span>
      </div>

      {/* ── Bottom: Your hand ───────────────────────────────────────── */}
      <div className={styles.myArea}>
        <div className={styles.handRow}>
          {sortedEntries.map(({ card, originalIndex }, i) => {
            const isSelected = selectedIndices.includes(originalIndex);
            const playable =
              game.phase === "trick_taking"
                ? isCardPlayable(card, originalIndex)
                : game.phase === "discarding"
                ? true
                : false;

            return (
              <Card
                key={`${card.rank}-${card.suit}-${originalIndex}`}
                card={card}
                selected={isSelected}
                playable={
                  game.phase === "discarding"
                    ? true
                    : game.phase === "trick_taking"
                    ? true
                    : false
                }
                onClick={() => {
                  if (game.phase === "discarding") {
                    toggleSelect(originalIndex);
                  } else if (game.phase === "trick_taking" && isMyTurn && isCardPlayable(card, originalIndex)) {
                    onPlayCard(originalIndex);
                  }
                }}
                className={styles.myCard}
              />
            );
          })}
        </div>
      </div>

      {/* ── Discard confirm button ──────────────────────────────────── */}
      {game.phase === "discarding" && (
        <div className={styles.discardBar}>
          <span className={styles.discardCount}>
            {selectedIndices.length} / {myIndex === game.hakem ? 3 : 2}
          </span>
          <button
            className={styles.discardBtn}
            disabled={selectedIndices.length !== (myIndex === game.hakem ? 3 : 2)}
            onClick={handleDiscard}
          >
            تأیید رد کردن
          </button>
        </div>
      )}

      {/* ── Error toast ─────────────────────────────────────────────── */}
      {error && (
        <div className={styles.errorToast}>{error}</div>
      )}

      {/* ── Phase overlays ──────────────────────────────────────────── */}
      {game.phase === "trump_selection" && isMyTurn && (
        <TrumpSelector onSelect={(suit) => onChooseTrump(suit)} />
      )}

      {(game.phase === "drawing" || forcedCard) && (
        <DrawingPhase
          drawnCard={drawnCard}
          forcedCard={forcedCard}
          isYourTurn={isMyTurn}
          stackCount={game.stackCount}
          isOpponentDrawing={isOpponentDrawing}
          onKeep={() => onDrawChoice("keep")}
          onPass={() => onDrawChoice("pass")}
        />
      )}

      {game.phase === "final_pick" && isMyTurn && finalCards && (
        <FinalPick cards={finalCards} onPick={onFinalPick} />
      )}

      {/* ── Game over overlay ───────────────────────────────────────── */}
      {gameOver && (
        <GameOver
          matchWinner={gameOver.matchWinner}
          finalScore={gameOver.finalScore}
          yourPlayerIndex={myIndex}
          lastRoundResult={lastRoundResult}
        />
      )}

      {/* ── Scores overlay ──────────────────────────────────────────── */}
      <Scores
        matchScores={game.matchScores}
        yourPlayerIndex={myIndex}
        visible={showScores}
        onClose={() => setShowScores(false)}
      />
    </div>
  );
};

export default GameTable;
