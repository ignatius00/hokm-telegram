import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SanitizedGameState,
  GamePhase,
  Suit,
  PlayerIndex,
  Card,
  ServerMessage,
} from "../types";

// ── Connection states ──────────────────────────────────────────────────────

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

// ── Game state exposed by the hook ─────────────────────────────────────────

export interface GameHookState {
  connectionState: ConnectionState;
  roomCode: string | null;
  playerIndex: PlayerIndex | null;
  opponentName: string | null;
  countdown: number | null;
  game: SanitizedGameState | null;
  drawnCard: Card | null;
  finalCards: [Card, Card] | null;
  lastTrickResult: { winner: PlayerIndex; score: [number, number] } | null;
  lastRoundResult: {
    winner: PlayerIndex;
    tricks: [number, number];
    matchScore: [number, number];
  } | null;
  gameOver: { matchWinner: PlayerIndex; finalScore: [number, number] } | null;
  error: string | null;
  isOpponentDrawing: boolean;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useGameSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const roomCodeRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const nameRef = useRef<string | null>(null);

  const [state, setState] = useState<GameHookState>({
    connectionState: "disconnected",
    roomCode: null,
    playerIndex: null,
    opponentName: null,
    countdown: null,
    game: null,
    drawnCard: null,
    finalCards: null,
    lastTrickResult: null,
    lastRoundResult: null,
    gameOver: null,
    error: null,
    isOpponentDrawing: false,
  });

  // ── Connect ─────────────────────────────────────────────────────────────

  const connect = useCallback(
    (params: { room?: string; userId: string; name: string }) => {
      // Store for reconnect
      userIdRef.current = params.userId;
      nameRef.current = params.name;
      roomCodeRef.current = params.room ?? null;

      setState((s) => ({ ...s, connectionState: "connecting", error: null }));

      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const host = window.location.host;
      const qs = new URLSearchParams();
      if (params.room) qs.set("room", params.room);
      qs.set("userId", params.userId);
      qs.set("name", params.name);

      const url = `${proto}://${host}/ws?${qs.toString()}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setState((s) => ({ ...s, connectionState: "connected" }));
        // Start ping interval
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 25000);
      };

      ws.onmessage = (ev) => {
        try {
          const msg: ServerMessage = JSON.parse(ev.data);
          handleMessage(msg);
        } catch {
          // ignore non-JSON
        }
      };

      ws.onclose = () => {
        if (pingRef.current) clearInterval(pingRef.current);
        // Auto-reconnect if we have credentials
        if (userIdRef.current && nameRef.current) {
          setState((s) => ({ ...s, connectionState: "reconnecting" }));
          reconnectRef.current = setTimeout(() => {
            connect({
              room: roomCodeRef.current ?? undefined,
              userId: userIdRef.current!,
              name: nameRef.current!,
            });
          }, 2000);
        } else {
          setState((s) => ({ ...s, connectionState: "disconnected" }));
        }
      };

      ws.onerror = () => {
        // onclose will fire after this
      };
    },
    []
  );

  // ── Disconnect ──────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    if (reconnectRef.current) clearTimeout(reconnectRef.current);
    if (pingRef.current) clearInterval(pingRef.current);
    userIdRef.current = null;
    nameRef.current = null;
    roomCodeRef.current = null;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setState({
      connectionState: "disconnected",
      roomCode: null,
      playerIndex: null,
      opponentName: null,
      countdown: null,
      game: null,
      drawnCard: null,
      finalCards: null,
      lastTrickResult: null,
      lastRoundResult: null,
      gameOver: null,
      error: null,
      isOpponentDrawing: false,
    });
  }, []);

  // ── Send helpers ────────────────────────────────────────────────────────

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const createRoom = useCallback(
    (userId: string, name: string) => {
      connect({ userId, name });
    },
    [connect]
  );

  const joinRoom = useCallback(
    (roomCode: string, userId: string, name: string) => {
      connect({ room: roomCode, userId, name });
    },
    [connect]
  );

  const chooseTrump = useCallback(
    (suit: Suit) => {
      send({ type: "choose_trump", suit });
    },
    [send]
  );

  const discard = useCallback(
    (cardIndices: number[]) => {
      send({ type: "discard", cardIndices });
    },
    [send]
  );

  const drawChoice = useCallback(
    (action: "keep" | "pass") => {
      send({ type: "draw_choice", action });
      setState((s) => ({ ...s, drawnCard: null }));
    },
    [send]
  );

  const finalPick = useCallback(
    (keepIndex: 0 | 1) => {
      send({ type: "final_pick", keepIndex });
      setState((s) => ({ ...s, finalCards: null }));
    },
    [send]
  );

  const playCard = useCallback(
    (cardIndex: number) => {
      send({ type: "play_card", cardIndex });
    },
    [send]
  );

  // ── Message handler ─────────────────────────────────────────────────────

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "room_joined":
        setState((s) => ({
          ...s,
          roomCode: msg.roomCode,
          playerIndex: msg.playerIndex,
          opponentName: msg.opponentName,
        }));
        roomCodeRef.current = msg.roomCode;
        break;

      case "opponent_joined":
        setState((s) => ({ ...s, opponentName: msg.name }));
        break;

      case "opponent_left":
        setState((s) => ({
          ...s,
          opponentName: null,
          error: "حریف از بازی خارج شد",
        }));
        break;

      case "countdown":
        setState((s) => ({ ...s, countdown: msg.seconds }));
        break;

      case "game_start":
        setState((s) => ({
          ...s,
          countdown: null,
          game: msg.state,
          error: null,
          drawnCard: null,
          finalCards: null,
          lastTrickResult: null,
          lastRoundResult: null,
          gameOver: null,
        }));
        break;

      case "trump_chosen":
        // State update will follow
        break;

      case "your_turn":
        // The state_update carries isYourTurn; this just confirms
        break;

      case "drawn_card":
        setState((s) => ({
          ...s,
          drawnCard: msg.card,
          isOpponentDrawing: false,
        }));
        break;

      case "final_cards":
        setState((s) => ({ ...s, finalCards: msg.cards }));
        break;

      case "opponent_drew":
        setState((s) => ({ ...s, isOpponentDrawing: true }));
        break;

      case "card_played":
        // State update will follow with the new trick state
        break;

      case "trick_result":
        setState((s) => ({
          ...s,
          lastTrickResult: { winner: msg.winner, score: msg.score },
        }));
        break;

      case "round_result":
        setState((s) => ({
          ...s,
          lastRoundResult: {
            winner: msg.winner,
            tricks: msg.tricks,
            matchScore: msg.matchScore,
          },
        }));
        break;

      case "new_round":
        setState((s) => ({
          ...s,
          game: msg.state,
          drawnCard: null,
          finalCards: null,
          lastTrickResult: null,
          lastRoundResult: null,
          gameOver: null,
          isOpponentDrawing: false,
        }));
        break;

      case "game_over":
        setState((s) => ({
          ...s,
          gameOver: {
            matchWinner: msg.matchWinner,
            finalScore: msg.finalScore,
          },
        }));
        break;

      case "state_update":
        setState((s) => ({
          ...s,
          game: msg.state,
          isOpponentDrawing:
            msg.state.phase === "drawing" && !msg.state.isYourTurn
              ? true
              : msg.state.isYourTurn
              ? false
              : s.isOpponentDrawing,
        }));
        break;

      case "error":
        setState((s) => ({ ...s, error: msg.message }));
        // Auto-clear error after 4s
        setTimeout(() => {
          setState((s) =>
            s.error === msg.message ? { ...s, error: null } : s
          );
        }, 4000);
        break;

      case "pong":
        break;
    }
  }, []);

  // ── Cleanup on unmount ──────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (pingRef.current) clearInterval(pingRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    createRoom,
    joinRoom,
    chooseTrump,
    discard,
    drawChoice,
    finalPick,
    playCard,
  };
}
