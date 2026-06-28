import React from "react";
import type { Card as CardType, Suit } from "../types";
import { SUIT_SYMBOLS, RANK_DISPLAY } from "../types";
import styles from "./Card.module.css";

interface CardProps {
  card?: CardType;
  faceDown?: boolean;
  selected?: boolean;
  playable?: boolean;
  small?: boolean;
  isTrump?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export const Card: React.FC<CardProps> = ({
  card,
  faceDown = false,
  selected = false,
  playable = true,
  small = false,
  isTrump = false,
  onClick,
  className = "",
  style,
}) => {
  if (faceDown || !card) {
    return (
      <div
        className={`${styles.card} ${styles.cardBack} ${small ? styles.small : ""} ${className}`}
        style={style}
      >
        <div className={styles.backPattern}>
          <span className={styles.backSymbol}>ح</span>
        </div>
      </div>
    );
  }

  const isRed = card.suit === "hearts" || card.suit === "diamonds";
  const suitSymbol = SUIT_SYMBOLS[card.suit];
  const rankDisplay = RANK_DISPLAY[card.rank];

  return (
    <div
      className={`
        ${styles.card} ${styles.cardFace}
        ${small ? styles.small : ""}
        ${selected ? styles.selected : ""}
        ${!playable ? styles.disabled : ""}
        ${isTrump && !selected ? styles.trumpGlow : ""}
        ${className}
      `}
      style={style}
      onClick={playable ? onClick : undefined}
    >
      <div className={styles.corner}>
        <span className={styles.rank} style={{ color: isRed ? "var(--card-red)" : "var(--card-black)" }}>
          {rankDisplay}
        </span>
        <span className={styles.suitSmall} style={{ color: isRed ? "var(--card-red)" : "var(--card-black)" }}>
          {suitSymbol}
        </span>
      </div>
      <div className={styles.center}>
        <span className={styles.suitLarge} style={{ color: isRed ? "var(--card-red)" : "var(--card-black)" }}>
          {suitSymbol}
        </span>
      </div>
      <div className={`${styles.corner} ${styles.cornerBottom}`}>
        <span className={styles.rank} style={{ color: isRed ? "var(--card-red)" : "var(--card-black)" }}>
          {rankDisplay}
        </span>
        <span className={styles.suitSmall} style={{ color: isRed ? "var(--card-red)" : "var(--card-black)" }}>
          {suitSymbol}
        </span>
      </div>
    </div>
  );
};

export default Card;
