import React, { useEffect, useMemo } from "react";
import WebApp from "@twa-dev/sdk";
import { useGameSocket } from "./hooks/useGameSocket";
import { Lobby } from "./components/Lobby";
import { GameTable } from "./components/GameTable";
import styles from "./App.module.css";

const App: React.FC = () => {
  // ── Telegram WebApp init ──────────────────────────────────────────────

  useEffect(() => {
    try {
      WebApp.ready();
      WebApp.expand();
      // Set header color to match felt
      WebApp.setHeaderColor("#0f2d1a");
      WebApp.setBackgroundColor("#0f2d1a");
    } catch {
      // Not running inside Telegram — that's fine for dev
    }
  }, []);

  // ── Telegram user info ────────────────────────────────────────────────

  const tgUser = useMemo(() => {
    try {
      const u = WebApp.initDataUnsafe?.user;
      if (u) {
        return {
          id: String(u.id),
          name: [u.first_name, u.last_name].filter(Boolean).join(" "),
        };
      }
    } catch {
      // Not in Telegram
    }
    return null;
  }, []);

  // ── Game socket ───────────────────────────────────────────────────────

  const {
    connectionState,
    roomCode,
    playerIndex,
    opponentName,
    countdown,
    game,
    drawnCard,
    forcedCard,
    finalCards,
    lastTrickResult,
    lastRoundResult,
    gameOver,
    error,
    isOpponentDrawing,
    createRoom,
    joinRoom,
    chooseTrump,
    discard,
    drawChoice,
    finalPick,
    playCard,
  } = useGameSocket();

  // ── Derive lobby vs game view ─────────────────────────────────────────

  const inGame = game !== null;

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className={styles.app}>
      {!inGame ? (
        <Lobby
          connectionState={connectionState}
          roomCode={roomCode}
          opponentName={opponentName}
          countdown={countdown}
          error={error}
          onCreateRoom={(userId, name) =>
            createRoom(tgUser?.id ?? userId, tgUser?.name ?? name)
          }
          onJoinRoom={(code, userId, name) =>
            joinRoom(code, tgUser?.id ?? userId, tgUser?.name ?? name)
          }
        />
      ) : (
        <GameTable
          game={game}
          drawnCard={drawnCard}
          forcedCard={forcedCard}
          finalCards={finalCards}
          gameOver={gameOver}
          lastRoundResult={lastRoundResult}
          isOpponentDrawing={isOpponentDrawing}
          error={error}
          onChooseTrump={chooseTrump}
          onDiscard={discard}
          onDrawChoice={drawChoice}
          onFinalPick={finalPick}
          onPlayCard={playCard}
        />
      )}
    </div>
  );
};

export default App;
