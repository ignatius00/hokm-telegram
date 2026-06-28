import { IncomingMessage } from "http";
import { URL } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { GameSession } from "./game-session";
import {
  Room,
  PlayerSlot,
  createRoom,
  joinRoom,
  getRoom,
  removePlayer,
  markRoomPlaying,
  markRoomFinished,
  getStats,
  touchRoom,
} from "./room-manager";
import {
  ClientMessage,
  msgRoomJoined,
  msgOpponentJoined,
  msgOpponentLeft,
  msgCountdown,
  msgGameStart,
  msgTrumpChosen,
  msgYourTurn,
  msgDrawnCard,
  msgFinalCards,
  msgOpponentDrew,
  msgCardPlayed,
  msgForcedCard,
  msgTrickResult,
  msgRoundResult,
  msgNewRound,
  msgGameOver,
  msgTimeout,
  msgForfeit,
  msgStateUpdate,
  msgError,
  msgPong,
} from "./protocol";
import { PlayerIndex } from "../engine/types";

// ── Config ─────────────────────────────────────────────────────────────────

// Read lazily so tests can set env vars before any connection
function getReconnectTimeout(): number {
  return parseInt(process.env.RECONNECT_TIMEOUT ?? "60", 10) * 1000;
}

// ── Maps ───────────────────────────────────────────────────────────────────

// ws → room + player metadata
interface WsMeta {
  roomCode: string;
  playerIndex: PlayerIndex;
  telegramId: string;
}

const wsMeta = new WeakMap<WebSocket, WsMeta>();

// roomCode → GameSession
const sessions = new Map<string, GameSession>();

// roomCode:playerIndex → reconnect timer
const reconnectTimers = new Map<string, NodeJS.Timeout>();

// ── Helpers ────────────────────────────────────────────────────────────────

function sendTo(ws: WebSocket | null, message: string): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(message);
    } catch {
      // Ignore send errors (socket may be closing)
    }
  }
}

function broadcastToRoom(room: Room, message: string): void {
  sendTo(room.players[0].ws, message);
  sendTo(room.players[1].ws, message);
}

function getOpponentWs(room: Room, playerIndex: PlayerIndex): WebSocket | null {
  const oppIndex = (1 - playerIndex) as PlayerIndex;
  return room.players[oppIndex].ws;
}

// ── Setup ──────────────────────────────────────────────────────────────────

export function setupWebSocket(
  wss: WebSocketServer,
  port: number
): void {
  wss.on("connection", (ws, req) => {
    handleConnection(ws, req, port);
  });
}

function handleConnection(ws: WebSocket, req: IncomingMessage, port: number): void {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  const roomParam = url.searchParams.get("room");
  const userId = url.searchParams.get("userId");
  const name = url.searchParams.get("name");

  if (!userId || !name) {
    sendTo(ws, msgError("userId and name are required", "MISSING_PARAMS"));
    ws.close();
    return;
  }

  let roomCode: string;
  let playerIndex: PlayerIndex;

  if (roomParam) {
    // ── Join existing room ──────────────────────────────────────────────
    const result = joinRoom(roomParam, ws, userId, name);
    if (!result.success) {
      sendTo(ws, msgError(result.error!, "JOIN_FAILED"));
      ws.close();
      return;
    }
    roomCode = roomParam;
    playerIndex = result.playerIndex!;

    const room = getRoom(roomCode)!;
    const opponentName = room.players[0].name || null;
    sendTo(ws, msgRoomJoined(playerIndex, opponentName, roomCode));
    sendTo(room.players[0].ws, msgOpponentJoined(name));
  } else {
    // ── Create new room ─────────────────────────────────────────────────
    const result = createRoom(ws, userId, name);
    roomCode = result.roomCode;
    playerIndex = 0;
    sendTo(ws, msgRoomJoined(playerIndex, null, roomCode));
  }

  wsMeta.set(ws, { roomCode, playerIndex, telegramId: userId });

  // Cancel any reconnect timer for this player
  const reconnectKey = `${roomCode}:${playerIndex}`;
  const existingTimer = reconnectTimers.get(reconnectKey);
  if (existingTimer) {
    clearTimeout(existingTimer);
    reconnectTimers.delete(reconnectKey);
  }

  // ── If room now has 2 players → start game ─────────────────────────────
  const room = getRoom(roomCode);
  if (room && room.players[0].ws && room.players[1].ws && room.state === "waiting") {
    startCountdownAndGame(room);
  }

  // ── Message handler ────────────────────────────────────────────────────
  ws.on("message", (data) => {
    handleMessage(ws, data.toString());
  });

  // ── Disconnect handler ────────────────────────────────────────────────
  ws.on("close", () => {
    handleDisconnect(ws);
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
  });
}

// ── Game start countdown ───────────────────────────────────────────────────

function startCountdownAndGame(room: Room): void {
  let seconds = 3;

  const tick = () => {
    broadcastToRoom(room, msgCountdown(seconds));
    seconds--;
    if (seconds > 0) {
      setTimeout(tick, 1000);
    } else {
      // Start the game
      markRoomPlaying(room.roomCode);

      const session = new GameSession(
        room.players[0].name,
        room.players[1].name
      );
      sessions.set(room.roomCode, session);

      // Wire up session events
      wireSessionEvents(session, room);

      // Send game_start to both players
      const s0 = session.getStateForPlayer(0);
      const s1 = session.getStateForPlayer(1);
      sendTo(room.players[0].ws, msgGameStart(s0));
      sendTo(room.players[1].ws, msgGameStart(s1));

      session.start();
    }
  };

  tick();
}

// ── Wire GameSession events → WebSocket messages ───────────────────────────

function wireSessionEvents(session: GameSession, room: Room): void {
  session.on("state_change", (event) => {
    const ws = room.players[event.playerIndex].ws;
    sendTo(ws, msgStateUpdate(event.state));
  });

  session.on("turn_change", (event) => {
    const ws = room.players[event.playerIndex].ws;
    sendTo(ws, msgYourTurn(event.phase));

    // In drawing phase, send the drawn card to the active player
    const gs = session.getState();
    if (event.phase === "drawing" && gs.drawnCard) {
      sendTo(ws, msgDrawnCard(gs.drawnCard));
    }

    // In final_pick phase, send the 2 drawn cards
    if (event.phase === "final_pick" && gs.finalDrawnCards) {
      sendTo(ws, msgFinalCards(gs.finalDrawnCards));
    }

    // Notify opponent it's not their turn
    const oppWs = getOpponentWs(room, event.playerIndex);
    // (opponent gets state_update via state_change event)
  });

  session.on("trick_complete", (event) => {
    const msg = msgTrickResult(event.winner, event.score);
    sendTo(room.players[0].ws, msg);
    sendTo(room.players[1].ws, msg);
  });

  session.on("round_complete", (event) => {
    const msg = msgRoundResult(event.winner, event.tricks, event.matchScore);
    sendTo(room.players[0].ws, msg);
    sendTo(room.players[1].ws, msg);
  });

  session.on("match_complete", (event) => {
    const msg = msgGameOver(event.matchWinner, event.finalScore);
    sendTo(room.players[0].ws, msg);
    sendTo(room.players[1].ws, msg);
    markRoomFinished(room.roomCode);
  });

  session.on("timeout", (event) => {
    const msg = msgTimeout(event.playerIndex);
    sendTo(room.players[0].ws, msg);
    sendTo(room.players[1].ws, msg);
  });
}

// ── Message routing ────────────────────────────────────────────────────────

function handleMessage(ws: WebSocket, raw: string): void {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    sendTo(ws, msgError("Invalid JSON", "PARSE_ERROR"));
    return;
  }

  if (msg.type === "ping") {
    sendTo(ws, msgPong());
    return;
  }

  const meta = wsMeta.get(ws);
  if (!meta) {
    sendTo(ws, msgError("Not connected to a room", "NO_ROOM"));
    return;
  }

  const { roomCode, playerIndex } = meta;
  const room = getRoom(roomCode);
  if (!room) {
    sendTo(ws, msgError("Room not found", "ROOM_NOT_FOUND"));
    return;
  }

  const session = sessions.get(roomCode);
  if (!session) {
    sendTo(ws, msgError("No active game session", "NO_SESSION"));
    return;
  }

  touchRoom(roomCode);

  try {
    // Turn validation: most actions require it to be the player's turn
    const activePlayer = session.getActivePlayer();
    const isYourTurn = activePlayer === playerIndex;

    switch (msg.type) {
      case "choose_trump": {
        if (!isYourTurn) throw new Error("Not your turn");
        const prevPhase = session.getPhase();
        session.chooseTrump(msg.suit);
        // Broadcast trump_chosen to both
        const room2 = getRoom(roomCode)!;
        broadcastToRoom(room2, msgTrumpChosen(msg.suit));
        break;
      }

      case "discard":
        // Discarding is parallel — both players can discard simultaneously
        session.discard(playerIndex, msg.cardIndices);
        break;

      case "draw_choice": {
        if (!isYourTurn) throw new Error("Not your turn");
        const handBefore = session.getState().players[playerIndex].hand.map(c => `${c.rank}-${c.suit}`);
        session.drawChoice(msg.action);
        // If player passed, send them the forced card
        if (msg.action === "pass") {
          const handAfter = session.getState().players[playerIndex].hand;
          const forcedCard = handAfter.find(c => !handBefore.includes(`${c.rank}-${c.suit}`));
          if (forcedCard) {
            sendTo(ws, msgForcedCard(forcedCard));
          }
        }
        // Notify opponent that a card was drawn
        const room3 = getRoom(roomCode)!;
        const oppWs3 = room3.players[(1 - playerIndex) as PlayerIndex].ws;
        sendTo(oppWs3, msgOpponentDrew());
        break;
      }

      case "final_pick": {
        if (!isYourTurn) throw new Error("Not your turn");
        session.finalPick(playerIndex, msg.keepIndex as 0 | 1);
        break;
      }

      case "play_card": {
        if (!isYourTurn) throw new Error("Not your turn");
        const card = session.getState().players[playerIndex].hand[msg.cardIndex];
        const prevTrickCount = session.getState().trickHistory.length;
        session.playCard(playerIndex, msg.cardIndex);
        // Broadcast card_played to both
        if (card) {
          const room4 = getRoom(roomCode)!;
          broadcastToRoom(room4, msgCardPlayed(playerIndex, card));
        }
        break;
      }

      case "ready":
        // Ready is handled differently now — game starts via countdown
        break;

      default:
        sendTo(ws, msgError("Unknown message type", "UNKNOWN_TYPE"));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid move";
    sendTo(ws, msgError(message, "INVALID_MOVE"));
  }
}

// ── Disconnect handling ────────────────────────────────────────────────────

function handleDisconnect(ws: WebSocket): void {
  const meta = wsMeta.get(ws);
  if (!meta) return;

  const { roomCode, playerIndex } = meta;
  const room = getRoom(roomCode);
  if (!room) return;

  if (room.state === "playing") {
    // Notify opponent
    const oppWs = getOpponentWs(room, playerIndex);
    sendTo(oppWs, msgOpponentLeft());

    // Remove the player slot (marks ws as null)
    removePlayer(roomCode, playerIndex);

    // Start reconnect timer
    const key = `${roomCode}:${playerIndex}`;
    const timer = setTimeout(() => {
      reconnectTimers.delete(key);
      const r = getRoom(roomCode);
      if (r && r.state === "playing" && r.players[playerIndex].ws === null) {
        // Player didn't reconnect — forfeit
        const winner = (1 - playerIndex) as PlayerIndex;
        sendTo(r.players[winner].ws, msgForfeit(playerIndex));

        const session = sessions.get(roomCode);
        if (session) {
          session.destroy();
          sessions.delete(roomCode);
        }
        markRoomFinished(roomCode);
      }
    }, getReconnectTimeout());
    reconnectTimers.set(key, timer);
  } else {
    // Waiting state — just remove player
    removePlayer(roomCode, playerIndex);
    const oppWs = room.players[(1 - playerIndex) as PlayerIndex].ws;
    if (oppWs) {
      sendTo(oppWs, msgOpponentLeft());
    }
  }

  wsMeta.delete(ws);
}

// ── Cleanup ────────────────────────────────────────────────────────────────

export function cleanupSessions(): void {
  for (const [code, session] of sessions) {
    const room = getRoom(code);
    if (!room || room.state === "finished") {
      session.destroy();
      sessions.delete(code);
    }
  }
}
