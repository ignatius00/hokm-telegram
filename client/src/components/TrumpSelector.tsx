import React from "react";
import type { Suit } from "../types";
import { SUIT_SYMBOLS, SUIT_NAMES_FA } from "../types";
import styles from "./TrumpSelector.module.css";

interface TrumpSelectorProps {
  onSelect: (suit: Suit) => void;
}

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];

export const TrumpSelector: React.FC<TrumpSelectorProps> = ({ onSelect }) => {
  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <h2 className={styles.title}>انتخاب حکم</h2>
        <p className={styles.subtitle}>خال مورد نظر خود را انتخاب کنید</p>
        <div className={styles.grid}>
          {SUITS.map((suit) => {
            const isRed = suit === "hearts" || suit === "diamonds";
            return (
              <button
                key={suit}
                className={styles.suitBtn}
                onClick={() => onSelect(suit)}
              >
                <span
                  className={styles.suitSymbol}
                  style={{ color: isRed ? "var(--card-red)" : "var(--card-black)" }}
                >
                  {SUIT_SYMBOLS[suit]}
                </span>
                <span className={styles.suitName}>{SUIT_NAMES_FA[suit]}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TrumpSelector;
