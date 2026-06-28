import React, { useEffect, useState } from "react";
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

  // Score pop animation
  const [myScorePop, setMyScorePop] = useState(false);
  const [oppScorePop, setOppScorePop] = useState(false);
  const [prevScores, setPrevScores] = useState(roundScores);

  useEffect(() => {
    const myScore = roundScores[yourPlayerIndex];
    const oppScore = roundScores[(1 - yourPlayerIndex) as PlayerIndex];
    const prevMy = prevScores[yourPlayerIndex];
    const prevOpp = prevScores[(1 - yourPlayerIndex) as PlayerIndex];

    if (myScore !== prevMy) {
      setMyScorePop(true);
      setTimeout(() => setMyScorePop(false), 500);
    }
    if (oppScore !== prevOpp) {
      setOppScorePop(true);
      setTimeout(() => setOppScorePop(false), 500);
    }
    setPrevScores(roundScores);
  }, [roundScores, yourPlayerIndex, prevScores]);

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
      {/* Trump badge with breathing glow */}
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
          <div className={styles.statsPanel}>
            {/* My score */}
            <div className={styles.statItem}>
              <span className={`${styles.statValue} ${myScorePop ? styles.scorePop : ""}`}>
                {roundScores[yourPlayerIndex]}
              </span>
              <span className={styles.statLabel}>شما</span>
            </div>
            <div className={styles.statDivider} />
            {/* Trick count */}
            <div className={styles.statItem}>
              <span className={styles.statValue}>{trickHistoryCount}</span>
              <span className={styles.statLabel}>ترفند</span>
            </div>
            <div className={styles.statDivider} />
            {/* Opponent score */}
            <div className={styles.statItem}>
              <span className={`${styles.statValue} ${oppScorePop ? styles.scorePop : ""}`}>
                {roundScores[(1 - yourPlayerIndex) as PlayerIndex]}
              </span>
              <span className={styles.statLabel}>حریف</span>
            </div>
          </div>
        </div>
        <div className={styles.mySlot}>
          {myCard && (
            <Card card={myCard} small className={styles.playedCard} />
          )}
        </div>
      </div>
    </div>
  );
};

export default TrickArea;
