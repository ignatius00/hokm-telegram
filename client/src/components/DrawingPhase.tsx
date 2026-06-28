import React from "react";
import type { Card as CardType } from "../types";
import { Card } from "./Card";
import styles from "./DrawingPhase.module.css";

interface DrawingPhaseProps {
  drawnCard: CardType | null;
  isYourTurn: boolean;
  stackCount: number;
  isOpponentDrawing: boolean;
  onKeep: () => void;
  onPass: () => void;
}

export const DrawingPhase: React.FC<DrawingPhaseProps> = ({
  drawnCard,
  isYourTurn,
  stackCount,
  isOpponentDrawing,
  onKeep,
  onPass,
}) => {
  if (!isYourTurn && isOpponentDrawing) {
    return (
      <div className={styles.overlay}>
        <div className={styles.waitingPanel}>
          <div className={styles.spinner}>
            <div className={styles.dot} />
            <div className={styles.dot} />
            <div className={styles.dot} />
          </div>
          <p className={styles.waitingText}>حریف در حال انتخاب...</p>
        </div>
      </div>
    );
  }

  if (!isYourTurn || !drawnCard) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.stackInfo}>
          <span className={styles.stackCount}>{stackCount}</span>
          <span className={styles.stackLabel}>کارت باقیمانده</span>
        </div>
        <p className={styles.instruction}>کارت کشیده شده:</p>
        <div className={styles.cardRow}>
          <Card card={drawnCard} />
        </div>
        <div className={styles.actions}>
          <button className={styles.btnKeep} onClick={onKeep}>
            ✅ نگه دار
          </button>
          <button className={styles.btnPass} onClick={onPass}>
            ❌ رد کن
          </button>
        </div>
        <p className={styles.hint}>
          اگر رد کنی، کارت بعدی اجباری می‌شود
        </p>
      </div>
    </div>
  );
};

export default DrawingPhase;
