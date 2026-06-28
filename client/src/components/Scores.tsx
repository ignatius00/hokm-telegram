import React from "react";
import type { PlayerIndex } from "../types";
import styles from "./Scores.module.css";

interface ScoresProps {
  matchScores: [number, number];
  yourPlayerIndex: PlayerIndex;
  visible: boolean;
  onClose: () => void;
}

export const Scores: React.FC<ScoresProps> = ({
  matchScores,
  yourPlayerIndex,
  visible,
  onClose,
}) => {
  if (!visible) return null;

  const myWins = matchScores[yourPlayerIndex];
  const oppWins = matchScores[(1 - yourPlayerIndex) as PlayerIndex];

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>امتیازات کلی</h3>
        <p className={styles.subtitle}>اولین نفر به ۷ برد</p>

        <div className={styles.bars}>
          <div className={styles.barRow}>
            <span className={styles.barLabel}>شما</span>
            <div className={styles.barTrack}>
              <div
                className={styles.barFill}
                style={{ width: `${(myWins / 7) * 100}%` }}
              />
            </div>
            <span className={styles.barValue}>{myWins}</span>
          </div>
          <div className={styles.barRow}>
            <span className={styles.barLabel}>حریف</span>
            <div className={styles.barTrack}>
              <div
                className={`${styles.barFill} ${styles.barFillOpp}`}
                style={{ width: `${(oppWins / 7) * 100}%` }}
              />
            </div>
            <span className={styles.barValue}>{oppWins}</span>
          </div>
        </div>

        <button className={styles.closeBtn} onClick={onClose}>
          بستن
        </button>
      </div>
    </div>
  );
};

export default Scores;
