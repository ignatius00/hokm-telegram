import React from "react";
import type { Card as CardType } from "../types";
import { Card } from "./Card";
import styles from "./FinalPick.module.css";

interface FinalPickProps {
  cards: [CardType, CardType];
  onPick: (index: 0 | 1) => void;
}

export const FinalPick: React.FC<FinalPickProps> = ({ cards, onPick }) => {
  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <h2 className={styles.title}>انتخاب نهایی</h2>
        <p className={styles.subtitle}>یک کارت انتخاب کنید</p>
        <div className={styles.cardRow}>
          <div className={styles.cardWrap} onClick={() => onPick(0)}>
            <Card card={cards[0]} />
            <span className={styles.pickLabel}>نگه دار</span>
          </div>
          <div className={styles.cardWrap} onClick={() => onPick(1)}>
            <Card card={cards[1]} />
            <span className={styles.pickLabel}>نگه دار</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinalPick;
