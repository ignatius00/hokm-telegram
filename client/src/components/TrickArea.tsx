import React from "react";
import type { Trick, PlayerIndex } from "../types";
import { Card } from "./Card";
import styles from "./TrickArea.module.css";

interface TrickAreaProps {
  currentTrick: Trick;
  roundScores: [number, number];
  matchScores: [number, number];
  trumpSuit: string | null;
  yourPlayerIndex: PlayerIndex;
  trickHistoryCount: number;
}

export const TrickArea: React.FC<TrickAreaProps> = ({
  currentTrick,
  roundScores,
  matchScores,
  trumpSuit,
  yourPlayerIndex,
  trickHistoryCount,
}) => {
  const SUIT_MAP: Record<string, string> = {
    spades: "♠",
    hearts: "♥",
    diamonds: "♦",
    clubs: "♣",
  };

  const suitColor = (s: string) =>
    s === "hearts" || s === "diamonds" ? "var(--card-red)" : "var(--text-primary)";

  // Determine which card is "yours" and which is "opponent's"
  const myCard =
    yourPlayerIndex === 0
      ? currentTrick.player1Card
      : currentTrick.player2Card;
  const oppCard =
    yourPlayerIndex === 0
      ? currentTrick.player2Card
      : currentTrick.player1Card;

  return (
    <div className={styles.area}>
      {/* Trump indicator */}
      {trumpSuit && (
        <div className={styles.trumpBadge}>
          <span className={styles.trumpLabel}>حکم</span>
          <span
            className={styles.trumpSuit}
            style={{ color: suitColor(trumpSuit) }}
          >
            {SUIT_MAP[trumpSuit] ?? trumpSuit}
          </span>
        </div>
      )}

      {/* Play area */}
      <div className={styles.playArea}>
        <div className={styles.oppSlot}>
          {oppCard && (
            <Card card={oppCard} small className={styles.playedCard} />
          )}
        </div>
        <div className={styles.centerInfo}>
          <div className={styles.trickCount}>
            <span>{trickHistoryCount}</span>
            <span className={styles.trickLabel}>ترفند</span>
          </div>
        </div>
        <div className={styles.mySlot}>
          {myCard && (
            <Card card={myCard} small className={styles.playedCard} />
          )}
        </div>
      </div>

      {/* Scores */}
      <div className={styles.scores}>
        <div className={styles.scoreItem}>
          <span className={styles.scoreLabel}>شما</span>
          <span className={styles.scoreValue}>{roundScores[yourPlayerIndex]}</span>
        </div>
        <div className={styles.scoreDivider} />
        <div className={styles.scoreItem}>
          <span className={styles.scoreLabel}>حریف</span>
          <span className={styles.scoreValue}>
            {roundScores[(1 - yourPlayerIndex) as PlayerIndex]}
          </span>
        </div>
      </div>
    </div>
  );
};

export default TrickArea;
