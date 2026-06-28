import { WebSocket } from "ws";
import { GameState, PlayerIndex } from "../engine/types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PlayerSlot {
  ws: WebSocket | null;
  telegramId: string;
  name: string;
  ready: boolean;
}

export interface Room {
  roomCode: string;
  players: [PlayerSlot, PlayerSlot];
  gameState: GameState | null;
  state: "waiting" | "playing" | "finished";
  createdAt: Date;
  lastActivity: Date;
}

export interface JoinResult {
  success: boolean;
  playerIndex?: PlayerIndex;
  error?: string;
}

export interface CreateResult {
  roomCode: string;
  room: Room;
}

export interface Stats {
  totalRooms: number;
  activeGames: number;
  playersOnline: number;
}

// ── Room store ───────────────────────────────────────────────────────────────

const rooms = new Map<string, Room>();

// ── Code generation ──────────────────────────────────────────────────────────

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateRoomCode(): string {
  let code: string;
  do {
    code = "";
    for (let i = 0; i < 6; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  } while (rooms.has(code));
  return code;
}

// ── Room operations ──────────────────────────────────────────────────────────

export function createRoom(
  creatorWs: WebSocket,
  creatorTelegramId: string,
  creatorName: string
): CreateResult {
  const roomCode = generateRoomCode();
  const now = new Date();

  const room: Room = {
    roomCode,
    players: [
      { ws: creatorWs, telegramId: creatorTelegramId, name: creatorName, ready: false },
      { ws: null, telegramId: "", name: "", ready: false },
    ],
    gameState: null,
    state: "waiting",
    createdAt: now,
    lastActivity: now,
  };

  rooms.set(roomCode, room);
  return { roomCode, room };
}

export function joinRoom(
  roomCode: string,
  ws: WebSocket,
  telegramId: string,
  name: string
): JoinResult {
  const room = rooms.get(roomCode);
  if (!room) {
    return { success: false, error: "Room not found" };
  }

  // Check if player is reconnecting (same telegramId, slot ws is null)
  for (let i = 0; i < room.players.length; i++) {
    const slot = room.players[i];
    if (slot.telegramId === telegramId) {
      // Reconnection: same player, their slot ws was set to null on disconnect
      if (slot.ws === null) {
        slot.ws = ws;
        slot.ready = false;
        room.lastActivity = new Date();
        return { success: true, playerIndex: i as PlayerIndex };
      }
      return { success: false, error: "Already in this room" };
    }
  }

  if (room.state !== "waiting") {
    return { success: false, error: "Room is not accepting players" };
  }

  // Player 1 joins as slot 1
  const slot = room.players[1];
  if (slot.ws !== null) {
    return { success: false, error: "Room is full" };
  }

  slot.ws = ws;
  slot.telegramId = telegramId;
  slot.name = name;
  slot.ready = false;
  room.lastActivity = new Date();

  return { success: true, playerIndex: 1 };
}

export function getRoom(roomCode: string): Room | null {
  return rooms.get(roomCode) ?? null;
}

export function removePlayer(roomCode: string, playerIndex: PlayerIndex): void {
  const room = rooms.get(roomCode);
  if (!room) return;

  const slot = room.players[playerIndex];
  slot.ws = null;
  room.lastActivity = new Date();

  if (room.state === "playing") {
    // Player disconnected during game — room stays for reconnection
    // The game handler layer will manage the reconnect timeout
  } else if (room.state === "waiting") {
    // If both slots are empty, delete the room
    if (room.players[0].ws === null && room.players[1].ws === null) {
      rooms.delete(roomCode);
    }
  }
}

export function markRoomPlaying(roomCode: string): void {
  const room = rooms.get(roomCode);
  if (room) {
    room.state = "playing";
    room.lastActivity = new Date();
  }
}

export function markRoomFinished(roomCode: string): void {
  const room = rooms.get(roomCode);
  if (room) {
    room.state = "finished";
    room.lastActivity = new Date();
  }
}

export function touchRoom(roomCode: string): void {
  const room = rooms.get(roomCode);
  if (room) {
    room.lastActivity = new Date();
  }
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

export function cleanupStaleRooms(): number {
  const now = Date.now();
  let removed = 0;

  for (const [code, room] of rooms) {
    const age = now - room.lastActivity.getTime();

    // Inactive waiting/playing rooms: 30 minutes
    if (room.state !== "finished" && age > 30 * 60 * 1000) {
      rooms.delete(code);
      removed++;
      continue;
    }

    // Finished rooms: 5 minutes
    if (room.state === "finished" && age > 5 * 60 * 1000) {
      rooms.delete(code);
      removed++;
    }
  }

  return removed;
}

// ── Stats ────────────────────────────────────────────────────────────────────

export function getStats(): Stats {
  let activeGames = 0;
  let playersOnline = 0;

  for (const room of rooms.values()) {
    if (room.state === "playing") activeGames++;
    for (const slot of room.players) {
      if (slot.ws !== null) playersOnline++;
    }
  }

  return { totalRooms: rooms.size, activeGames, playersOnline };
}
