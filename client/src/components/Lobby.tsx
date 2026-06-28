import React, { useState } from "react";
import styles from "./Lobby.module.css";

interface LobbyProps {
  connectionState: string;
  roomCode: string | null;
  opponentName: string | null;
  countdown: number | null;
  error: string | null;
  onCreateRoom: (userId: string, name: string) => void;
  onJoinRoom: (roomCode: string, userId: string, name: string) => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  connectionState,
  roomCode,
  opponentName,
  countdown,
  error,
  onCreateRoom,
  onJoinRoom,
}) => {
  const [mode, setMode] = useState<"menu" | "create" | "join">("menu");
  const [joinCode, setJoinCode] = useState("");
  const [playerName, setPlayerName] = useState("");

  const userId = `tg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const handleCreate = () => {
    const name = playerName.trim() || "بازیکن";
    onCreateRoom(userId, name);
    setMode("create");
  };

  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) return;
    const name = playerName.trim() || "بازیکن";
    onJoinRoom(code, userId, name);
  };

  // ── Countdown overlay ─────────────────────────────────────────────────

  if (countdown !== null) {
    return (
      <div className={styles.overlay}>
        <div className={styles.countdown}>
          <div className={styles.countdownNumber}>{countdown}</div>
          <div className={styles.countdownLabel}>شروع بازی...</div>
        </div>
      </div>
    );
  }

  // ── Waiting for opponent ──────────────────────────────────────────────

  if (mode === "create" && roomCode && !opponentName) {
    return (
      <div className={styles.container}>
        <div className={styles.logo}>حکم</div>
        <div className={styles.waitingCard}>
          <div className={styles.roomCodeLabel}>کد اتاق</div>
          <div className={styles.roomCode}>{roomCode}</div>
          <button
            className={styles.copyBtn}
            onClick={() => navigator.clipboard?.writeText(roomCode)}
          >
            📋 کپی کد
          </button>
          <div className={styles.spinner}>
            <div className={styles.dot} />
            <div className={styles.dot} />
            <div className={styles.dot} />
          </div>
          <p className={styles.waitingText}>در انتظار حریف...</p>
          <p className={styles.hint}>کد را برای دوستتان بفرستید</p>
        </div>
      </div>
    );
  }

  // ── Opponent joined (waiting for game start) ──────────────────────────

  if (opponentName && !countdown && roomCode) {
    return (
      <div className={styles.container}>
        <div className={styles.logo}>حکم</div>
        <div className={styles.readyCard}>
          <p className={styles.opponentName}>{opponentName} پیوست!</p>
          <div className={styles.spinner}>
            <div className={styles.dot} />
            <div className={styles.dot} />
            <div className={styles.dot} />
          </div>
          <p className={styles.waitingText}>آماده‌سازی بازی...</p>
        </div>
      </div>
    );
  }

  // ── Main menu / Join screen ───────────────────────────────────────────

  return (
    <div className={styles.container}>
      <div className={styles.logo}>حکم</div>
      <div className={styles.subtitle}>بازی کارتی دو نفره</div>

      {error && <div className={styles.error}>{error}</div>}

      {mode === "menu" && (
        <div className={styles.menu}>
          <input
            className={styles.nameInput}
            placeholder="نام شما"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            maxLength={20}
          />
          <button className={styles.btnPrimary} onClick={handleCreate}>
            🎮 ساخت اتاق جدید
          </button>
          <button
            className={styles.btnSecondary}
            onClick={() => setMode("join")}
          >
            🔗 پیوستن به اتاق
          </button>
        </div>
      )}

      {mode === "join" && (
        <div className={styles.menu}>
          <input
            className={styles.nameInput}
            placeholder="نام شما"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            maxLength={20}
          />
          <input
            className={styles.codeInput}
            placeholder="کد اتاق (۶ حرف)"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
            dir="ltr"
            autoFocus
          />
          <button
            className={styles.btnPrimary}
            onClick={handleJoin}
            disabled={joinCode.trim().length !== 6}
          >
            ✅ پیوستن
          </button>
          <button
            className={styles.btnGhost}
            onClick={() => {
              setMode("menu");
              setJoinCode("");
            }}
          >
            ← بازگشت
          </button>
        </div>
      )}

      {connectionState === "connecting" && (
        <div className={styles.connectingOverlay}>
          <div className={styles.spinner}>
            <div className={styles.dot} />
            <div className={styles.dot} />
            <div className={styles.dot} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Lobby;
