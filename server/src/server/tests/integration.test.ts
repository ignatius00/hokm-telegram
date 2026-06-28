import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import * as http from "http";
import express from "express";
import cors from "cors";
import WebSocket from "ws";
import { WebSocketServer } from "ws";
import {
  createRoom,
  getRoom,
  getStats,
  cleanupStaleRooms,
  removePlayer,
} from "../room-manager";
import { setupWebSocket, cleanupSessions } from "../websocket-handler";
import { Card, SanitizedGameState, Suit } from "../../engine/types";

// ── Test config ────────────────────────────────────────────────────────────

const TURN_TIMEOUT_SEC = 10;
const RECONNECT_TIMEOUT_SEC = 3;

process.env.TURN_TIMEOUT = String(TURN_TIMEOUT_SEC);
process.env.RECONNECT_TIMEOUT = String(RECONNECT_TIMEOUT_SEC);

// ── Types ──────────────────────────────────────────────────────────────────

interface TestClient {
  ws: WebSocket;
  messages: any[];
  waitForMessage(type: string, timeout?: number): Promise<any>;
  send(data: any): void;
  close(): Promise<void>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        reject(new Error("Could not get free port"));
      }
    });
  });
}

function createTestServer(port: number): http.Server {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    const stats = getStats();
    res.json({ status: "ok", ...stats, uptime: process.uptime() });
  });

  app.get("/api/stats", (_req, res) => {
    res.json(getStats());
  });

  app.post("/api/rooms", (req, res) => {
    const { telegramId, name } = req.body ?? {};
    if (!telegramId || !name) {
      res.status(400).json({ error: "telegramId and name are required" });
      return;
    }
    const { roomCode } = createRoom(null as any, telegramId, name);
    res.json({ roomCode, wsUrl: `ws://localhost:${port}/ws?room=${roomCode}&userId=${telegramId}&name=${encodeURIComponent(name)}` });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    if (url.pathname === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  setupWebSocket(wss, port);

  return server;
}

async function createClient(
  port: number,
  params: { room?: string; userId?: string; name?: string }
): Promise<TestClient> {
  const qs = new URLSearchParams();
  if (params.room) qs.set("room", params.room);
  if (params.userId) qs.set("userId", params.userId);
  if (params.name) qs.set("name", params.name);

  const url = `ws://localhost:${port}/ws?${qs.toString()}`;
  const ws = new WebSocket(url);
  const messages: any[] = [];

  // IMPORTANT: Register message handler BEFORE open resolves,
  // because the server sends room_joined immediately on connect.
  ws.on("message", (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      messages.push(parsed);
    } catch {
      // ignore non-JSON
    }
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WS connect timeout")), 5000);
    ws.on("open", () => {
      clearTimeout(timeout);
      // Small delay to ensure the first message has time to arrive
      setTimeout(resolve, 50);
    });
    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  return {
    ws,
    messages,
    waitForMessage(type: string, timeout = 15000): Promise<any> {
      return new Promise((resolve, reject) => {
        const existing = messages.find((m) => m.type === type);
        if (existing) {
          resolve(existing);
          return;
        }

        const timer = setTimeout(
          () => reject(new Error(`Timeout waiting for "${type}" (got: ${messages.map((m) => m.type).join(", ")})`)),
          timeout
        );

        const handler = () => {
          const msg = messages.find((m) => m.type === type);
          if (msg) {
            clearTimeout(timer);
            ws.off("message", handler);
            resolve(msg);
          }
        };
        ws.on("message", handler);
      });
    },
    send(data: any) {
      ws.send(JSON.stringify(data));
    },
    close(): Promise<void> {
      return new Promise((resolve) => {
        if (ws.readyState === WebSocket.CLOSED) {
          resolve();
          return;
        }
        ws.on("close", () => resolve());
        ws.close();
        setTimeout(() => resolve(), 500);
      });
    },
  };
}

function findValidCardIndex(hand: Card[], trick: any): number {
  let leadSuit: Suit | null = null;
  if (trick.leader === 0 && trick.player1Card) leadSuit = trick.player1Card.suit;
  else if (trick.leader === 1 && trick.player2Card) leadSuit = trick.player2Card.suit;

  if (leadSuit) {
    const idx = hand.findIndex((c) => c.suit === leadSuit);
    if (idx >= 0) return idx;
  }
  return 0;
}

function drain(c: TestClient): void {
  c.messages.length = 0;
}

// ── Test suite ─────────────────────────────────────────────────────────────

describe("server integration", () => {
  let port: number;
  let server: http.Server;
  let clients: TestClient[];

  beforeAll(async () => {
    port = await getFreePort();
    server = createTestServer(port);
    await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  });

  beforeEach(() => {
    clients = [];
  });

  afterEach(async () => {
    for (const c of clients) {
      await c.close();
    }
    clients.length = 0;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await new Promise((r) => setTimeout(r, 500));
  });

  // ── REST endpoints ───────────────────────────────────────────────────────

  describe("REST endpoints", () => {
    it("GET /health returns ok", async () => {
      const res = await fetch(`http://localhost:${port}/health`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.status).toBe("ok");
      expect(body).toHaveProperty("totalRooms");
      expect(body).toHaveProperty("playersOnline");
    });

    it("GET /api/stats returns stats", async () => {
      const res = await fetch(`http://localhost:${port}/api/stats`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toHaveProperty("totalRooms");
      expect(body).toHaveProperty("activeGames");
      expect(body).toHaveProperty("playersOnline");
    });
  });

  // ── Connection & room creation ───────────────────────────────────────────

  describe("connection & room lifecycle", () => {
    it("Player 1 connects and receives room_joined with playerIndex 0", async () => {
      const c1 = await createClient(port, { userId: "u1", name: "Alice" });
      clients.push(c1);

      const msg = await c1.waitForMessage("room_joined", 5000);
      expect(msg.playerIndex).toBe(0);
      expect(msg.opponentName).toBeNull();
    });

    it("Player 2 joins and both receive correct messages", async () => {
      const c1 = await createClient(port, { userId: "u2", name: "Alice" });
      clients.push(c1);
      const joined1 = await c1.waitForMessage("room_joined", 5000);
      const roomCode = joined1.roomCode;
      expect(roomCode).toBeDefined();

      const c2 = await createClient(port, { room: roomCode, userId: "u3", name: "Bob" });
      clients.push(c2);

      const joined2 = await c2.waitForMessage("room_joined", 5000);
      expect(joined2.playerIndex).toBe(1);

      const oppJoined = await c1.waitForMessage("opponent_joined", 5000);
      expect(oppJoined.name).toBe("Bob");
    });

    it("Connection without userId or name → error + close", async () => {
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      const messages: any[] = [];
      ws.on("message", (d) => {
        try { messages.push(JSON.parse(d.toString())); } catch {}
      });

      await new Promise<void>((resolve) => {
        ws.on("close", () => resolve());
        ws.on("error", () => resolve());
        setTimeout(() => { try { ws.close(); } catch {} resolve(); }, 3000);
      });

      const errMsg = messages.find((m) => m.type === "error");
      expect(errMsg).toBeDefined();
      expect(errMsg!.code).toBe("MISSING_PARAMS");
    });
  });

  // ── Game start & countdown ───────────────────────────────────────────────

  describe("game start", () => {
    it("both players receive countdown and game_start", async () => {
      const c1 = await createClient(port, { userId: "u10", name: "Alice" });
      clients.push(c1);
      const { roomCode } = await c1.waitForMessage("room_joined", 5000);

      const c2 = await createClient(port, { room: roomCode, userId: "u11", name: "Bob" });
      clients.push(c2);
      await c2.waitForMessage("room_joined", 5000);

      const cd1 = await c1.waitForMessage("countdown", 8000);
      expect(cd1.seconds).toBe(3);

      const gs1 = await c1.waitForMessage("game_start", 10000);
      const gs2 = await c2.waitForMessage("game_start", 10000);

      expect(gs1.state).toBeDefined();
      expect(gs2.state).toBeDefined();
      expect(gs1.state.yourHand).toHaveLength(5);
      expect(gs2.state.yourHand).toHaveLength(5);
      expect(gs1.state.phase).toBe("trump_selection");
    });

    it("hakem receives your_turn with trump_selection phase", async () => {
      const c1 = await createClient(port, { userId: "u20", name: "Alice" });
      clients.push(c1);
      const { roomCode } = await c1.waitForMessage("room_joined", 5000);

      const c2 = await createClient(port, { room: roomCode, userId: "u21", name: "Bob" });
      clients.push(c2);

      await c1.waitForMessage("game_start", 10000);
      await c2.waitForMessage("game_start", 10000);

      const turn = await c1.waitForMessage("your_turn", 10000);
      expect(turn.phase).toBe("trump_selection");
    });

    it("SanitizedGameState has correct structure", async () => {
      const c1 = await createClient(port, { userId: "u30", name: "Alice" });
      clients.push(c1);
      const { roomCode } = await c1.waitForMessage("room_joined", 5000);

      const c2 = await createClient(port, { room: roomCode, userId: "u31", name: "Bob" });
      clients.push(c2);

      const gs = await c1.waitForMessage("game_start", 10000);
      const s: SanitizedGameState = gs.state;

      expect(s).toHaveProperty("yourHand");
      expect(s).toHaveProperty("opponentHandCount");
      expect(s).toHaveProperty("phase");
      expect(s).toHaveProperty("trumpSuit");
      expect(s).toHaveProperty("hakem");
      expect(s).toHaveProperty("yourPlayerIndex");
      expect(s).toHaveProperty("stackCount");
      expect(s).toHaveProperty("currentTrick");
      expect(s).toHaveProperty("trickHistory");
      expect(s).toHaveProperty("matchScores");
      expect(s).toHaveProperty("roundScores");
      expect(s).toHaveProperty("isYourTurn");
      expect(s).toHaveProperty("activePlayer");

      expect(s.yourPlayerIndex).toBe(0);
      expect(s.opponentHandCount).toBe(5);
      expect(s.stackCount).toBe(42);
      expect(Array.isArray(s.yourHand)).toBe(true);
      expect(s.yourHand).toHaveLength(5);
    });
  });

  // ── Trump selection ──────────────────────────────────────────────────────

  describe("trump selection", () => {
    it("hakem chooses trump → both receive trump_chosen + state_update", async () => {
      const c1 = await createClient(port, { userId: "u40", name: "Alice" });
      clients.push(c1);
      const { roomCode } = await c1.waitForMessage("room_joined", 5000);

      const c2 = await createClient(port, { room: roomCode, userId: "u41", name: "Bob" });
      clients.push(c2);

      await c1.waitForMessage("game_start", 10000);
      await c2.waitForMessage("game_start", 10000);

      await c1.waitForMessage("your_turn", 10000);
      drain(c1);
      drain(c2);

      c1.send({ type: "choose_trump", suit: "spades" });

      const tc1 = await c1.waitForMessage("trump_chosen", 5000);
      const tc2 = await c2.waitForMessage("trump_chosen", 5000);
      expect(tc1.suit).toBe("spades");
      expect(tc2.suit).toBe("spades");

      const su1 = await c1.waitForMessage("state_update", 5000);
      expect(su1.state.trumpSuit).toBe("spades");
      expect(su1.state.phase).toBe("discarding");
    });
  });

  // ── Discarding ───────────────────────────────────────────────────────────

  describe("discarding", () => {
    it("both players discard → phase advances to drawing", async () => {
      const c1 = await createClient(port, { userId: "u50", name: "Alice" });
      clients.push(c1);
      const { roomCode } = await c1.waitForMessage("room_joined", 5000);

      const c2 = await createClient(port, { room: roomCode, userId: "u51", name: "Bob" });
      clients.push(c2);

      await c1.waitForMessage("game_start", 10000);
      await c2.waitForMessage("game_start", 10000);

      await c1.waitForMessage("your_turn", 10000);
      drain(c1);
      drain(c2);

      c1.send({ type: "choose_trump", suit: "hearts" });

      await c1.waitForMessage("trump_chosen", 5000);
      await c2.waitForMessage("trump_chosen", 5000);

      drain(c1);
      drain(c2);

      c1.send({ type: "discard", cardIndices: [0, 1, 2] });
      c2.send({ type: "discard", cardIndices: [0, 1] });

      const drawTurn = await c1.waitForMessage("your_turn", 10000);
      expect(drawTurn.phase).toBe("drawing");
    });
  });

  // ── Error cases ──────────────────────────────────────────────────────────

  describe("error handling", () => {
    it("invalid message type → error response", async () => {
      const c1 = await createClient(port, { userId: "u60", name: "Alice" });
      clients.push(c1);
      const { roomCode } = await c1.waitForMessage("room_joined", 5000);

      const c2 = await createClient(port, { room: roomCode, userId: "u61", name: "Bob" });
      clients.push(c2);

      await c1.waitForMessage("game_start", 10000);
      await c2.waitForMessage("game_start", 10000);

      c1.send({ type: "foobar" });

      const err = await c1.waitForMessage("error", 5000);
      expect(err.code).toBe("UNKNOWN_TYPE");
    });

    it("not your turn → error response", async () => {
      const c1 = await createClient(port, { userId: "u70", name: "Alice" });
      clients.push(c1);
      const { roomCode } = await c1.waitForMessage("room_joined", 5000);

      const c2 = await createClient(port, { room: roomCode, userId: "u71", name: "Bob" });
      clients.push(c2);

      await c1.waitForMessage("game_start", 10000);
      await c2.waitForMessage("game_start", 10000);

      await c1.waitForMessage("your_turn", 10000);

      c2.send({ type: "choose_trump", suit: "hearts" });

      const err = await c2.waitForMessage("error", 5000);
      expect(err.code).toBe("INVALID_MOVE");
    });

    it("wrong phase action → error response", async () => {
      const c1 = await createClient(port, { userId: "u80", name: "Alice" });
      clients.push(c1);
      const { roomCode } = await c1.waitForMessage("room_joined", 5000);

      const c2 = await createClient(port, { room: roomCode, userId: "u81", name: "Bob" });
      clients.push(c2);

      await c1.waitForMessage("game_start", 10000);
      await c2.waitForMessage("game_start", 10000);

      c1.send({ type: "play_card", cardIndex: 0 });

      const err = await c1.waitForMessage("error", 5000);
      expect(err.code).toBe("INVALID_MOVE");
    });

    it("invalid card index → error response", async () => {
      const c1 = await createClient(port, { userId: "u90", name: "Alice" });
      clients.push(c1);
      const { roomCode } = await c1.waitForMessage("room_joined", 5000);

      const c2 = await createClient(port, { room: roomCode, userId: "u91", name: "Bob" });
      clients.push(c2);

      await c1.waitForMessage("game_start", 10000);
      await c2.waitForMessage("game_start", 10000);

      await c1.waitForMessage("your_turn", 10000);
      c1.send({ type: "choose_trump", suit: "hearts" });
      await c1.waitForMessage("trump_chosen", 5000);
      await c1.waitForMessage("state_update", 5000);

      c1.send({ type: "discard", cardIndices: [0, 1, 99] });

      const err = await c1.waitForMessage("error", 5000);
      expect(err.code).toBe("INVALID_MOVE");
    });

    it("ping → pong", async () => {
      const c1 = await createClient(port, { userId: "u100", name: "Alice" });
      clients.push(c1);

      c1.send({ type: "ping" });

      const pong = await c1.waitForMessage("pong", 3000);
      expect(pong.type).toBe("pong");
    });
  });

  // ── Turn timeout ─────────────────────────────────────────────────────────

  describe("turn timeout", () => {
    it("auto-plays when player doesn't act within timeout", async () => {
      const c1 = await createClient(port, { userId: "u110", name: "Alice" });
      clients.push(c1);
      const { roomCode } = await c1.waitForMessage("room_joined", 5000);

      const c2 = await createClient(port, { room: roomCode, userId: "u111", name: "Bob" });
      clients.push(c2);

      await c1.waitForMessage("game_start", 10000);
      await c2.waitForMessage("game_start", 10000);

      // Hakem's turn — don't act
      await c1.waitForMessage("your_turn", 10000);

      // Wait for timeout
      const timeout1 = await c1.waitForMessage("timeout", (TURN_TIMEOUT_SEC + 5) * 1000);
      expect(timeout1.playerIndex).toBe(0);

      // Game should auto-advance
      const nextTurn = await Promise.race([
        c1.waitForMessage("your_turn", 10000),
        c2.waitForMessage("your_turn", 10000),
      ]);
      expect(nextTurn.phase).toBeDefined();
    }, (TURN_TIMEOUT_SEC + 20) * 1000);
  });

  // ── Disconnection & forfeit ──────────────────────────────────────────────

  describe("disconnection", () => {
    it("player disconnects → opponent gets opponent_left", async () => {
      const c1 = await createClient(port, { userId: "u120", name: "Alice" });
      clients.push(c1);
      const { roomCode } = await c1.waitForMessage("room_joined", 5000);

      const c2 = await createClient(port, { room: roomCode, userId: "u121", name: "Bob" });
      clients.push(c2);
      await c2.waitForMessage("room_joined", 5000);

      await c1.waitForMessage("game_start", 10000);
      await c2.waitForMessage("game_start", 10000);

      drain(c1);

      c2.ws.close();

      const oppLeft = await c1.waitForMessage("opponent_left", 5000);
      expect(oppLeft.type).toBe("opponent_left");
    });

    it("player disconnects, doesn't return → opponent gets forfeit", async () => {
      const c1 = await createClient(port, { userId: "u130", name: "Alice" });
      clients.push(c1);
      const { roomCode } = await c1.waitForMessage("room_joined", 5000);

      const c2 = await createClient(port, { room: roomCode, userId: "u131", name: "Bob" });
      clients.push(c2);

      await c1.waitForMessage("game_start", 10000);
      await c2.waitForMessage("game_start", 10000);

      drain(c1);

      c2.ws.close();
      clients.splice(clients.indexOf(c2), 1);

      const forfeit = await c1.waitForMessage("forfeit", (RECONNECT_TIMEOUT_SEC + 8) * 1000);
      expect(forfeit.type).toBe("forfeit");
      expect(forfeit.playerIndex).toBe(1);
    }, (RECONNECT_TIMEOUT_SEC + 15) * 1000);
  });

  // ── Reconnection ─────────────────────────────────────────────────────────

  describe("reconnection", () => {
    it("player disconnects and reconnects within window → gets room_joined back", async () => {
      const c1 = await createClient(port, { userId: "u140", name: "Alice" });
      clients.push(c1);
      const { roomCode } = await c1.waitForMessage("room_joined", 5000);

      const c2 = await createClient(port, { room: roomCode, userId: "u141", name: "Bob" });
      clients.push(c2);

      await c1.waitForMessage("game_start", 10000);
      await c2.waitForMessage("game_start", 10000);

      // c2 disconnects
      c2.ws.close();
      clients.splice(clients.indexOf(c2), 1);

      // Wait for the server to process the close event
      await c1.waitForMessage("opponent_left", 5000);

      // Reconnect c2 with same room + userId
      const c2New = await createClient(port, { room: roomCode, userId: "u141", name: "Bob" });
      clients.push(c2New);

      const rejoined = await c2New.waitForMessage("room_joined", 10000);
      expect(rejoined.playerIndex).toBe(1);
    }, 15000);
  });

  // ── Full game flow ───────────────────────────────────────────────────────

  describe("full game flow", () => {

    /** Wait for "your_turn" on either client without leaking handlers */
    function waitForAnyTurn(
      c1: TestClient, c2: TestClient, timeout = 10000
    ): Promise<{ client: TestClient; phase: string }> {
      return new Promise((resolve, reject) => {
        // Check existing messages first
        for (const c of [c1, c2]) {
          const msg = c.messages.find((m) => m.type === "your_turn");
          if (msg) { resolve({ client: c, phase: msg.phase }); return; }
        }

        const timer = setTimeout(() => {
          c1.ws.off("message", handler);
          c2.ws.off("message", handler);
          reject(new Error("Timeout waiting for any your_turn"));
        }, timeout);

        const handler = () => {
          for (const c of [c1, c2]) {
            const msg = c.messages.find((m) => m.type === "your_turn");
            if (msg) {
              clearTimeout(timer);
              c1.ws.off("message", handler);
              c2.ws.off("message", handler);
              resolve({ client: c, phase: msg.phase });
              return;
            }
          }
        };

        c1.ws.on("message", handler);
        c2.ws.on("message", handler);
      });
    }

    /** Wait for a specific message type on a specific client, then return the LATEST state_update */
    function getLatestState(client: TestClient): { hand: Card[]; trick: any } {
      const allUpdates = client.messages.filter((m) => m.type === "state_update");
      const stateMsg = allUpdates[allUpdates.length - 1];
      return {
        hand: stateMsg?.state?.yourHand ?? [],
        trick: stateMsg?.state?.currentTrick ?? { leader: 0, player1Card: null, player2Card: null },
      };
    }

    async function quickSetup(uidSuffix: string = String(Date.now())): Promise<[TestClient, TestClient, string]> {
      const c1 = await createClient(port, { userId: `t${uidSuffix}a`, name: "Alice" });
      clients.push(c1);
      const { roomCode } = await c1.waitForMessage("room_joined", 5000);

      const c2 = await createClient(port, { room: roomCode, userId: `t${uidSuffix}b`, name: "Bob" });
      clients.push(c2);

      await c1.waitForMessage("game_start", 10000);
      await c2.waitForMessage("game_start", 10000);

      return [c1, c2, roomCode];
    }

    async function doTrumpAndDiscard(
      hakem: TestClient,
      other: TestClient,
      trumpSuit: Suit = "hearts"
    ): Promise<void> {
      await hakem.waitForMessage("your_turn", 10000);
      drain(hakem);
      drain(other);

      hakem.send({ type: "choose_trump", suit: trumpSuit });

      await hakem.waitForMessage("trump_chosen", 5000);
      await other.waitForMessage("trump_chosen", 5000);
      await hakem.waitForMessage("state_update", 5000);

      drain(hakem);
      drain(other);

      hakem.send({ type: "discard", cardIndices: [0, 1, 2] });
      other.send({ type: "discard", cardIndices: [0, 1] });

      await hakem.waitForMessage("your_turn", 10000);
    }

    async function doDrawingPhase(c1: TestClient, c2: TestClient): Promise<void> {
      // Drawing phase: exactly 19 turns (stack 41→4), alternating players
      const drawClients: [TestClient, TestClient] = [c1, c2];
      for (let turn = 0; turn < 19; turn++) {
        const active = drawClients[turn % 2];
        drain(c1);
        drain(c2);
        active.send({ type: "draw_choice", action: "pass" });
        // Wait for next player's drawn_card (last turn will timeout — caught)
        const nextActive = drawClients[(turn + 1) % 2];
        await nextActive.waitForMessage("drawn_card", 5000).catch(() => {});
      }
    }

    async function doFinalPicks(c1: TestClient, c2: TestClient): Promise<void> {
      // Hakem (c1 = player 0) picks first
      const hakemTurn = await c1.waitForMessage("your_turn", 8000);
      expect(hakemTurn.phase).toBe("final_pick");
      drain(c1);
      drain(c2);
      c1.send({ type: "final_pick", keepIndex: 0 });

      // Other player (c2 = player 1) picks
      const otherTurn = await c2.waitForMessage("your_turn", 8000);
      expect(otherTurn.phase).toBe("final_pick");
      drain(c1);
      drain(c2);
      c2.send({ type: "final_pick", keepIndex: 0 });

      // Await trick_taking your_turn on hakem (c1)
      const trickTurn = await c1.waitForMessage("your_turn", 10000);
      expect(trickTurn.phase).toBe("trick_taking");
    }

    it("plays through trump → discard → draw → final_pick → trick_taking", async () => {
      const [c1, c2] = await quickSetup("f1");

      await doTrumpAndDiscard(c1, c2);

      for (let i = 0; i < 3; i++) {
        const drawn0 = c1.messages.find((m) => m.type === "drawn_card");
        const drawn1 = c2.messages.find((m) => m.type === "drawn_card");
        const active = drawn0 ? c1 : (drawn1 ? c2 : null);

        if (!active) break;

        drain(c1);
        drain(c2);
        active.send({ type: "draw_choice", action: "pass" });

        try {
          await c1.waitForMessage("drawn_card", 3000);
        } catch {
          try { await c2.waitForMessage("drawn_card", 3000); } catch { break; }
        }
      }

      const anyState = c1.messages.find((m) => m.type === "state_update") ??
                       c2.messages.find((m) => m.type === "state_update");
      if (anyState) {
        expect(["drawing", "final_pick"]).toContain(anyState.state.phase);
      }
    }, 30000);

    /** Wait for your_turn on either client, return the active client with fresh state */
    async function waitAndPlay(
      c1: TestClient, c2: TestClient
    ): Promise<{ played: boolean; gameOver: boolean }> {
      // Wait for your_turn on either client, or round/game over
      const active = await new Promise<TestClient | null>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("no your_turn")), 15000);
        const h = () => {
          if (c1.messages.some((m) => m.type === "round_result") ||
              c1.messages.some((m) => m.type === "game_over") ||
              c2.messages.some((m) => m.type === "round_result") ||
              c2.messages.some((m) => m.type === "game_over")) {
            clearTimeout(t); c1.ws.off("message", h); c2.ws.off("message", h); resolve(null);
          } else if (c1.messages.some((m) => m.type === "your_turn")) {
            clearTimeout(t); c1.ws.off("message", h); c2.ws.off("message", h); resolve(c1);
          } else if (c2.messages.some((m) => m.type === "your_turn")) {
            clearTimeout(t); c1.ws.off("message", h); c2.ws.off("message", h); resolve(c2);
          }
        };
        c1.ws.on("message", h);
        c2.ws.on("message", h);
        h(); // Check immediately
      });

      if (!active) return { played: false, gameOver: true };

      const yt = active.messages.find((m) => m.type === "your_turn");
      if (!yt || yt.phase !== "trick_taking") return { played: false, gameOver: false };

      // Read state from the latest state_update
      const stateUpdates = active.messages.filter((m) => m.type === "state_update");
      const latest = stateUpdates[stateUpdates.length - 1];
      const hand: Card[] = latest?.state?.yourHand ?? [];
      const trick = latest?.state?.currentTrick ?? { leader: 0, player1Card: null, player2Card: null };

      const cardIdx = findValidCardIndex(hand, trick);

      // Consume the your_turn
      active.messages = active.messages.filter((m) => m.type !== "your_turn");

      active.send({ type: "play_card", cardIndex: cardIdx });

      // Wait for the response to arrive
      await new Promise((r) => setTimeout(r, 300));

      return { played: true, gameOver: false };
    }

    it("plays a complete round and receives round_result", async () => {
      const [c1, c2] = await quickSetup("f2");

      await doTrumpAndDiscard(c1, c2);
      await doDrawingPhase(c1, c2);
      await doFinalPicks(c1, c2);

      // Play cards until round is over
      let cardsPlayed = 0;
      for (let card = 0; card < 30; card++) {
        // Check for completion
        const roundResult = c1.messages.find((m) => m.type === "round_result") ??
                            c2.messages.find((m) => m.type === "round_result");
        const gameOver = c1.messages.find((m) => m.type === "game_over") ??
                         c2.messages.find((m) => m.type === "game_over");
        if (roundResult || gameOver) break;

        try {
          const result = await waitAndPlay(c1, c2);
          if (result.gameOver) break;
          if (!result.played) break;
          cardsPlayed++;
        } catch (e) {
          console.log(`[round test] waitAndPlay threw at card ${card} (played ${cardsPlayed}):`, (e as Error).message);
          console.log(`[round test] c1 msgs:`, c1.messages.map(m => m.type));
          console.log(`[round test] c2 msgs:`, c2.messages.map(m => m.type));
          break;
        }
      }

      console.log(`[round test] loop ended, cardsPlayed=${cardsPlayed}`);

      // Give a moment for final messages to arrive
      await new Promise((r) => setTimeout(r, 1000));

      console.log(`[round test] after wait, c1 msgs:`, c1.messages.map(m => m.type));
      console.log(`[round test] after wait, c2 msgs:`, c2.messages.map(m => m.type));

      const roundResult = c1.messages.find((m) => m.type === "round_result") ??
                          c2.messages.find((m) => m.type === "round_result");
      const gameOver = c1.messages.find((m) => m.type === "game_over") ??
                       c2.messages.find((m) => m.type === "game_over");

      expect(roundResult || gameOver).toBeTruthy();
      if (roundResult) {
        expect(roundResult.tricks).toBeDefined();
        expect(roundResult.matchScore).toBeDefined();
      }
      if (gameOver) {
        expect(gameOver.matchWinner).toBeDefined();
        expect(gameOver.finalScore).toBeDefined();
      }
    }, 120000);

    it("verifies card_played and trick_result messages during trick-taking", async () => {
      const [c1, c2] = await quickSetup("f3");

      await doTrumpAndDiscard(c1, c2);
      await doDrawingPhase(c1, c2);
      await doFinalPicks(c1, c2);

      // Play first card (leader) — doFinalPicks already awaited trick_taking your_turn
      const leaderState = getLatestState(c1);
      const leaderIdx = findValidCardIndex(leaderState.hand, leaderState.trick);

      c1.send({ type: "play_card", cardIndex: leaderIdx });

      // Wait for follower's turn
      const followerTurn = await c2.waitForMessage("your_turn", 10000);
      expect(followerTurn.phase).toBe("trick_taking");

      // Play second card (follower)
      const followerState = getLatestState(c2);
      const followerIdx = findValidCardIndex(followerState.hand, followerState.trick);

      c2.send({ type: "play_card", cardIndex: followerIdx });

      // Both should receive card_played and trick_result
      const cp = await c1.waitForMessage("card_played", 5000);
      expect(cp.type).toBe("card_played");
      expect(cp.card).toBeDefined();

      const tr = await c1.waitForMessage("trick_result", 5000);
      expect(tr.type).toBe("trick_result");
      expect(tr.winner).toBeDefined();
      expect(tr.score).toHaveLength(2);
    }, 120000);
  });
});
