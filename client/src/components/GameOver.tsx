import React from "react";
import type { PlayerIndex } from "../types";
import styles from "./GameOver.module.css";

interface GameOverProps {
  matchWinner: PlayerIndex;
  finalScore: [number, number];
  yourPlayerIndex: PlayerIndex;
  lastRoundResult?: {
    winner: PlayerIndex;
    tricks: [number, number];
    matchScore: [number, number];
  } | null;
  onPlayAgain?: () => void;
}

export const GameOver: React.FC<GameOverProps> = ({
  matchWinner,
  finalScore,
  yourPlayerIndex,
  lastRoundResult,
  onPlayAgain,
}) => {
  const youWon = matchWinner === yourPlayerIndex;
  const myScore = finalScore[yourPlayerIndex];
  const oppScore = finalScore[(1 - yourPlayerIndex) as PlayerIndex];

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.trophy}>{youWon ? "🏆" : "😔"}</div>
        <h2 className={styles.title}>
          {youWon ? "برنده شدید!" : "بازی را باختید"}
        </h2>
        <div className={styles.scoreBoard}>
          <div className={styles.scoreRow}>
            <span className={styles.scoreLabel}>شما</span>
            <span
              className={styles.scoreVal}
              style={{ color: youWon ? "var(--accent-gold)" : "var(--text-secondary)" }}
            >
              {myScore}
            </span>
          </div>
          <span className={styles.vs}>—</span>
          <div className={styles.scoreRow}>
            <span className={styles.scoreLabel}>حریف</span>
            <span
              className={styles.scoreVal}
              style={{ color: !youWon ? "var(--accent-gold)" : "var(--text-secondary)" }}
            >
              {oppScore}
            </span>
          </div>
        </div>

        {lastRoundResult && (
          <div className={styles.roundDetail}>
            <span className={styles.roundDetailLabel}>ترفندهای آخرین دور:</span>
            <span>
              {lastRoundResult.tricks[yourPlayerIndex]} - {lastRoundResult.tricks[(1 - yourPlayerIndex) as PlayerIndex]}
            </span>
          </div>
        )}

        {onPlayAgain && (
          <button className={styles.playAgainBtn} onClick={onPlayAgain}>
            🔄 بازی جدید
          </button>
        )}
      </div>
    </div>
  );
};

export default GameOver;
