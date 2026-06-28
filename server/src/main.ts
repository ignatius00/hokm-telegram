import * as http from "http";
import * as path from "path";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import {
  createRoom,
  getRoom,
  getStats,
  cleanupStaleRooms,
} from "./server/room-manager";
import { msgError } from "./server/protocol";
import { setupWebSocket, cleanupSessions } from "./server/websocket-handler";

// ── Config ───────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "3000", 10);

// ── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  const stats = getStats();
  res.json({
    status: "ok",
    activeRooms: stats.totalRooms,
    playersOnline: stats.playersOnline,
    uptime: process.uptime(),
  });
});

// Stats
app.get("/api/stats", (_req, res) => {
  res.json(getStats());
});

// Create room via REST (convenience endpoint)
app.post("/api/rooms", (req, res) => {
  const { telegramId, name } = req.body ?? {};
  if (!telegramId || !name) {
    res.status(400).json({ error: "telegramId and name are required" });
    return;
  }

  const { roomCode } = createRoom(null as any, telegramId, name);
  const proto = process.env.NODE_ENV === "production" ? "wss" : "ws";
  const host = req.headers.host ?? `localhost:${PORT}`;
  res.json({
    roomCode,
    wsUrl: `${proto}://${host}/ws?room=${roomCode}&userId=${telegramId}&name=${encodeURIComponent(name)}`,
  });
});

// Serve static client files in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../../client/dist")));
  app.get("*", (_req: express.Request, res: express.Response) => {
    res.sendFile(path.join(__dirname, "../../client/dist/index.html"));
  });
}

// ── HTTP + WebSocket server ──────────────────────────────────────────────────

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Handle upgrade manually to only capture /ws path
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname === "/ws") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

// Setup WebSocket message handling
setupWebSocket(wss, PORT);

// ── Cleanup interval ─────────────────────────────────────────────────────────

const cleanupInterval = setInterval(() => {
  const removed = cleanupStaleRooms();
  cleanupSessions();
  if (removed > 0) {
    console.log(`Cleaned up ${removed} stale room(s)`);
  }
}, 5 * 60 * 1000);

// ── Graceful shutdown ────────────────────────────────────────────────────────

function shutdown(signal: string): void {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  clearInterval(cleanupInterval);

  wss.clients.forEach((client) => {
    client.close(1001, "Server shutting down");
  });

  wss.close(() => {
    server.close(() => {
      console.log("Server closed.");
      process.exit(0);
    });
  });

  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 5000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ── Start ────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`Hokm server listening on port ${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/health`);
  console.log(`  Stats:  http://localhost:${PORT}/api/stats`);
});
