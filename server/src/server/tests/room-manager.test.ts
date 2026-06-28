import { describe, it, expect, beforeEach, vi } from "vitest";
import { WebSocket } from "ws";
import {
  createRoom,
  joinRoom,
  getRoom,
  removePlayer,
  cleanupStaleRooms,
  markRoomPlaying,
  markRoomFinished,
  touchRoom,
  generateRoomCode,
  getStats,
} from "../room-manager";

// ── Helpers ────────────────────────────────────────────────────────────────

const AMBIGUOUS = /[0O1IL]/;

function fakeWs(): WebSocket {
  return { readyState: WebSocket.OPEN } as unknown as WebSocket;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("room-manager", () => {
  // ── Code generation ──────────────────────────────────────────────────────

  describe("generateRoomCode", () => {
    it("returns a 6-character string", () => {
      const code = generateRoomCode();
      expect(code).toHaveLength(6);
    });

    it("returns uppercase alphanumeric characters only", () => {
      const code = generateRoomCode();
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
    });

    it("does not contain ambiguous characters (0, O, 1, I, L)", () => {
      // Generate 100 codes to build confidence
      for (let i = 0; i < 100; i++) {
        const code = generateRoomCode();
        expect(code).not.toMatch(AMBIGUOUS);
      }
    });

    it("generates unique codes across calls", () => {
      const codes = new Set<string>();
      for (let i = 0; i < 50; i++) {
        codes.add(generateRoomCode());
      }
      // With 31^6 possible codes, 50 should almost certainly be unique
      expect(codes.size).toBe(50);
    });
  });

  // ── createRoom ───────────────────────────────────────────────────────────

  describe("createRoom", () => {
    it("returns a valid room with 6-char code", () => {
      const ws = fakeWs();
      const { roomCode, room } = createRoom(ws, "tg_001", "Alice");

      expect(roomCode).toHaveLength(6);
      expect(room.roomCode).toBe(roomCode);
      expect(room.state).toBe("waiting");
      expect(room.players[0].ws).toBe(ws);
      expect(room.players[0].telegramId).toBe("tg_001");
      expect(room.players[0].name).toBe("Alice");
      expect(room.players[1].ws).toBeNull();
      expect(room.gameState).toBeNull();
      expect(room.createdAt).toBeInstanceOf(Date);
      expect(room.lastActivity).toBeInstanceOf(Date);
    });

    it("registers the room so getRoom finds it", () => {
      const { roomCode } = createRoom(fakeWs(), "tg_002", "Bob");
      const room = getRoom(roomCode);
      expect(room).not.toBeNull();
      expect(room!.roomCode).toBe(roomCode);
    });
  });

  // ── joinRoom ─────────────────────────────────────────────────────────────

  describe("joinRoom", () => {
    it("adds the second player and returns playerIndex 1", () => {
      const { roomCode } = createRoom(fakeWs(), "tg_010", "Alice");
      const result = joinRoom(roomCode, fakeWs(), "tg_011", "Bob");

      expect(result.success).toBe(true);
      expect(result.playerIndex).toBe(1);
      expect(result.error).toBeUndefined();
    });

    it("updates the room player slot", () => {
      const { roomCode } = createRoom(fakeWs(), "tg_020", "Alice");
      const ws2 = fakeWs();
      joinRoom(roomCode, ws2, "tg_021", "Bob");

      const room = getRoom(roomCode)!;
      expect(room.players[1].ws).toBe(ws2);
      expect(room.players[1].telegramId).toBe("tg_021");
      expect(room.players[1].name).toBe("Bob");
    });

    it("fails when room is full", () => {
      const { roomCode } = createRoom(fakeWs(), "tg_030", "Alice");
      joinRoom(roomCode, fakeWs(), "tg_031", "Bob");
      const result = joinRoom(roomCode, fakeWs(), "tg_032", "Charlie");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Room is full");
    });

    it("fails when room does not exist", () => {
      const result = joinRoom("NOPE00", fakeWs(), "tg_040", "Dave");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Room not found");
    });

    it("fails when room is not in waiting state", () => {
      const { roomCode } = createRoom(fakeWs(), "tg_050", "Alice");
      markRoomPlaying(roomCode);

      const result = joinRoom(roomCode, fakeWs(), "tg_051", "Bob");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Room is not accepting players");
    });

    it("fails when player is already in the room", () => {
      const { roomCode } = createRoom(fakeWs(), "tg_060", "Alice");
      const result = joinRoom(roomCode, fakeWs(), "tg_060", "Alice");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Already in this room");
    });
  });

  // ── getRoom ──────────────────────────────────────────────────────────────

  describe("getRoom", () => {
    it("returns null for nonexistent room", () => {
      expect(getRoom("XXXXXX")).toBeNull();
    });

    it("returns the room object by code", () => {
      const { roomCode, room } = createRoom(fakeWs(), "tg_070", "Eve");
      const found = getRoom(roomCode);
      expect(found).toBe(room); // same reference
    });
  });

  // ── removePlayer ─────────────────────────────────────────────────────────

  describe("removePlayer", () => {
    it("sets the player slot ws to null", () => {
      const { roomCode } = createRoom(fakeWs(), "tg_080", "Alice");
      joinRoom(roomCode, fakeWs(), "tg_081", "Bob");

      removePlayer(roomCode, 0);
      const room = getRoom(roomCode)!;
      expect(room.players[0].ws).toBeNull();
    });

    it("keeps room alive if other player is still connected", () => {
      const { roomCode } = createRoom(fakeWs(), "tg_090", "Alice");
      joinRoom(roomCode, fakeWs(), "tg_091", "Bob");

      removePlayer(roomCode, 0);
      expect(getRoom(roomCode)).not.toBeNull();
    });

    it("deletes room when waiting and both players leave", () => {
      const { roomCode } = createRoom(fakeWs(), "tg_100", "Alice");
      joinRoom(roomCode, fakeWs(), "tg_101", "Bob");

      removePlayer(roomCode, 0);
      removePlayer(roomCode, 1);
      expect(getRoom(roomCode)).toBeNull();
    });

    it("keeps room when playing even if both players disconnect", () => {
      const { roomCode } = createRoom(fakeWs(), "tg_110", "Alice");
      joinRoom(roomCode, fakeWs(), "tg_111", "Bob");
      markRoomPlaying(roomCode);

      removePlayer(roomCode, 0);
      removePlayer(roomCode, 1);
      // Playing rooms are kept for reconnection
      expect(getRoom(roomCode)).not.toBeNull();
    });
  });

  // ── cleanupStaleRooms ────────────────────────────────────────────────────

  describe("cleanupStaleRooms", () => {
    it("removes waiting rooms older than 30 minutes", () => {
      const { roomCode } = createRoom(fakeWs(), "tg_120", "Alice");
      const room = getRoom(roomCode)!;

      // Backdate the lastActivity
      room.lastActivity = new Date(Date.now() - 31 * 60 * 1000);

      const removed = cleanupStaleRooms();
      expect(removed).toBeGreaterThanOrEqual(1);
      expect(getRoom(roomCode)).toBeNull();
    });

    it("removes finished rooms older than 5 minutes", () => {
      const { roomCode } = createRoom(fakeWs(), "tg_130", "Alice");
      markRoomFinished(roomCode);
      const room = getRoom(roomCode)!;
      room.lastActivity = new Date(Date.now() - 6 * 60 * 1000);

      const removed = cleanupStaleRooms();
      expect(removed).toBeGreaterThanOrEqual(1);
      expect(getRoom(roomCode)).toBeNull();
    });

    it("keeps fresh rooms", () => {
      const { roomCode } = createRoom(fakeWs(), "tg_140", "Alice");

      const removed = cleanupStaleRooms();
      // Our room should still be there
      expect(getRoom(roomCode)).not.toBeNull();
    });

    it("keeps playing rooms that are not stale", () => {
      const { roomCode } = createRoom(fakeWs(), "tg_150", "Alice");
      joinRoom(roomCode, fakeWs(), "tg_151", "Bob");
      markRoomPlaying(roomCode);

      expect(getRoom(roomCode)).not.toBeNull();
      cleanupStaleRooms();
      expect(getRoom(roomCode)).not.toBeNull();
    });
  });

  // ── getStats ─────────────────────────────────────────────────────────────

  describe("getStats", () => {
    it("returns correct counts", () => {
      const before = getStats();

      const { roomCode: rc1 } = createRoom(fakeWs(), "tg_160", "Alice");
      joinRoom(rc1, fakeWs(), "tg_161", "Bob");
      markRoomPlaying(rc1);

      const { roomCode: rc2 } = createRoom(fakeWs(), "tg_170", "Charlie");

      const stats = getStats();
      expect(stats.totalRooms).toBeGreaterThanOrEqual(before.totalRooms + 2);
      expect(stats.activeGames).toBeGreaterThanOrEqual(before.activeGames + 1);
      expect(stats.playersOnline).toBeGreaterThanOrEqual(before.playersOnline + 3);
    });
  });

  // ── Multiple rooms ───────────────────────────────────────────────────────

  describe("multiple rooms", () => {
    it("can create and manage multiple rooms simultaneously", () => {
      const r1 = createRoom(fakeWs(), "tg_200", "Alice");
      const r2 = createRoom(fakeWs(), "tg_210", "Bob");
      const r3 = createRoom(fakeWs(), "tg_220", "Charlie");

      // All codes should be different
      const codes = new Set([r1.roomCode, r2.roomCode, r3.roomCode]);
      expect(codes.size).toBe(3);

      // All rooms should be retrievable
      expect(getRoom(r1.roomCode)).not.toBeNull();
      expect(getRoom(r2.roomCode)).not.toBeNull();
      expect(getRoom(r3.roomCode)).not.toBeNull();
    });
  });
});
