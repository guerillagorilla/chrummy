import http from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { Game } from "../src/engine/gameEngine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 8000);
const POLL_INTERVAL = 500;
const ROOM_CODE_LENGTH = 4;
const ROOM_IDLE_MS = 1000 * 60 * 5;

let version = 0;
const rooms = new Map();

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  while (code.length < ROOM_CODE_LENGTH) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function createRoom() {
  let code = makeRoomCode();
  while (rooms.has(code)) {
    code = makeRoomCode();
  }
  const room = {
    code,
    game: new Game(2, 1),
    phase: "await_draw",
    sockets: [null, null],
    winnerIndex: null,
    lastActive: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

function cardPayload(card) {
  if (!card) return null;
  return { rank: card.rank, suit: card.suit, cid: card.cid };
}

function meldPayload(meld) {
  return {
    type: meld.type,
    rank: meld.rank,
    suit: meld.suit ?? null,
    cards: meld.cards.map(cardPayload),
    staged: Boolean(meld.staged),
  };
}

function stateForPlayer(room, playerIndex) {
  const game = room.game;
  const you = game.players[playerIndex];
  const opponent = game.players[(playerIndex + 1) % 2];
  const opponentSocket = room.sockets[(playerIndex + 1) % 2];
  return {
    type: "state",
    room: room.code,
    playerIndex,
    phase: room.phase,
    currentPlayerIndex: game.currentPlayerIndex,
    winnerIndex: room.winnerIndex,
    roundIndex: game.roundIndex,
    round: game.currentRound(),
    opponentConnected: opponentSocket?.readyState === WebSocket.OPEN,
    drawCount: game.drawPile.length,
    discardTop: cardPayload(game.discardPile[game.discardPile.length - 1]),
    you: {
      hand: you.hand.map(cardPayload),
      melds: you.melds.map(meldPayload),
      stagedMelds: you.stagedMelds.map(meldPayload),
      hasLaidDown: you.hasLaidDown,
      totalScore: you.totalScore,
    },
    opponent: {
      handCount: opponent.hand.length,
      melds: opponent.melds.map(meldPayload),
      stagedMelds: opponent.stagedMelds.map(meldPayload),
      hasLaidDown: opponent.hasLaidDown,
      totalScore: opponent.totalScore,
    },
  };
}

function broadcastState(room) {
  room.sockets.forEach((socket, idx) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(stateForPlayer(room, idx)));
    }
  });
}

function sendError(socket, message) {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: "error", message }));
}

function cleanupRooms() {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    const active = room.sockets.some((socket) => socket && socket.readyState === socket.OPEN);
    if (!active && now - room.lastActive > ROOM_IDLE_MS) {
      rooms.delete(code);
    }
  }
}

async function walkFiles(dir, files = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

async function snapshotMtime(root) {
  const files = await walkFiles(root);
  let newest = 0;
  for (const file of files) {
    if (file.endsWith(".pyc")) continue;
    try {
      const stat = await fs.stat(file);
      newest = Math.max(newest, stat.mtimeMs);
    } catch {
      // ignore transient file errors
    }
  }
  return newest;
}

async function watchFiles() {
  let lastMtime = await snapshotMtime(ROOT);
  setInterval(async () => {
    const current = await snapshotMtime(ROOT);
    if (current > lastMtime) {
      lastMtime = current;
      version += 1;
    }
  }, POLL_INTERVAL);
}

const mimeTypes = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".ttf": "font/ttf",
};

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end();
    return;
  }

  if (req.url === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    let lastSeen = -1;
    const interval = setInterval(() => {
      if (version !== lastSeen) {
        lastSeen = version;
        res.write(`data: ${version}\n\n`);
      }
    }, POLL_INTERVAL);
    req.on("close", () => clearInterval(interval));
    return;
  }

  const cleanUrl = req.url.split("?")[0];
  const requestedPath = cleanUrl === "/" ? "/public/index.html" : cleanUrl;
  const filePath = path.join(ROOT, requestedPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

watchFiles();
setInterval(cleanupRooms, 30000);

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket) => {
  let room = null;
  let playerIndex = null;

  socket.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      sendError(socket, "Invalid JSON.");
      return;
    }

    if (msg.type === "create_room") {
      room = createRoom();
      playerIndex = 0;
      room.sockets[playerIndex] = socket;
      room.lastActive = Date.now();
      socket.send(JSON.stringify({ type: "room_created", room: room.code, playerIndex }));
      broadcastState(room);
      return;
    }

    if (msg.type === "join_room") {
      const code = String(msg.room || "").toUpperCase();
      const target = rooms.get(code);
      if (!target) {
        sendError(socket, "Room not found.");
        return;
      }
      const isSlotOpen = (s) => !s || s.readyState !== WebSocket.OPEN;
      const slot = isSlotOpen(target.sockets[0]) ? 0 : (isSlotOpen(target.sockets[1]) ? 1 : -1);
      if (slot === -1) {
        sendError(socket, "Room is full.");
        return;
      }
      room = target;
      playerIndex = slot;
      room.sockets[playerIndex] = socket;
      room.lastActive = Date.now();
      socket.send(JSON.stringify({ type: "room_joined", room: room.code, playerIndex }));
      broadcastState(room);
      return;
    }

    if (msg.type === "leave_room") {
      if (room && playerIndex !== null) {
        room.sockets[playerIndex] = null;
        room.lastActive = Date.now();
        socket.send(JSON.stringify({ type: "room_left" }));
        // Notify other player
        const otherIdx = (playerIndex + 1) % 2;
        const otherSocket = room.sockets[otherIdx];
        if (otherSocket && otherSocket.readyState === WebSocket.OPEN) {
          otherSocket.send(JSON.stringify({ type: "opponent_left" }));
        }
      }
      room = null;
      playerIndex = null;
      return;
    }

    if (!room || playerIndex === null) {
      sendError(socket, "Join a room first.");
      return;
    }

    room.lastActive = Date.now();

    if (msg.type === "action") {
      const game = room.game;
      if (room.phase === "game_over" && msg.action !== "restart") {
        sendError(socket, "Round is over.");
        return;
      }
      if (game.currentPlayerIndex !== playerIndex) {
        sendError(socket, "Not your turn.");
        return;
      }

      if (msg.action === "draw") {
        if (room.phase !== "await_draw") {
          sendError(socket, "Already drew.");
          return;
        }
        const source = msg.source === "discard" ? "discard" : "deck";
        const player = game.players[playerIndex];
        const drawn = source === "discard" ? game.drawFromDiscard(player) : game.drawFromStock(player);
        if (!drawn) {
          sendError(socket, `No cards in ${source}.`);
          return;
        }
        room.phase = "await_discard";
        broadcastState(room);
        return;
      }

      if (msg.action === "laydown") {
        if (room.phase !== "await_discard") {
          sendError(socket, "Draw first.");
          return;
        }
        if (!game.tryLayDownStaged(game.players[playerIndex])) {
          sendError(socket, "Invalid laydown.");
          broadcastState(room);
          return;
        }
        broadcastState(room);
        return;
      }

      if (msg.action === "stage") {
        if (room.phase !== "await_discard") {
          sendError(socket, "Draw first.");
          return;
        }
        const player = game.players[playerIndex];
        if (player.hasLaidDown) {
          sendError(socket, "Already laid down.");
          return;
        }
        const cardId = Number(msg.cardId);
        const meldIndex = Number.isFinite(msg.meldIndex) ? Number(msg.meldIndex) : null;
        const card = player.hand.find((c) => c.cid === cardId);
        if (!card) {
          sendError(socket, "Card not in hand.");
          return;
        }
        game.stageCard(player, card, meldIndex);
        broadcastState(room);
        return;
      }

      if (msg.action === "unstage") {
        if (room.phase !== "await_discard") {
          sendError(socket, "Draw first.");
          return;
        }
        const player = game.players[playerIndex];
        if (player.hasLaidDown) {
          sendError(socket, "Already laid down.");
          return;
        }
        const cardId = Number(msg.cardId);
        const card = player.stagedMelds.flatMap((meld) => meld.cards).find((c) => c.cid === cardId);
        if (!card) {
          sendError(socket, "Card not staged.");
          return;
        }
        game.unstageCard(player, card);
        broadcastState(room);
        return;
      }

      if (msg.action === "layoff") {
        if (room.phase !== "await_discard") {
          sendError(socket, "Draw first.");
          return;
        }
        const meldOwner = Number(msg.meldOwner);
        const meldIndex = Number(msg.meldIndex);
        const cardId = Number(msg.cardId);
        const owner = meldOwner === 1 ? 1 : 0;
        const meld = game.players[owner].melds[meldIndex];
        const card = game.players[playerIndex].hand.find((c) => c.cid === cardId);
        if (!card || !meld) {
          sendError(socket, "Invalid layoff.");
          return;
        }
        if (!game.layOffCardToMeld(game.players[playerIndex], card, meld)) {
          sendError(socket, "Cannot lay off to that meld.");
          return;
        }
        broadcastState(room);
        return;
      }

      if (msg.action === "discard") {
        if (room.phase !== "await_discard") {
          sendError(socket, "Draw first.");
          return;
        }
        const cardId = Number(msg.cardId);
        const player = game.players[playerIndex];
        const card = player.hand.find((c) => c.cid === cardId);
        if (!card) {
          sendError(socket, "Card not in hand.");
          return;
        }
        if (!player.hasLaidDown && player.stagedMelds.length > 0) {
          game.clearStaged(player);
        }
        game.discard(player, card);
        if (game.checkWinAfterDiscard(player)) {
          game.applyRoundScores(playerIndex);
          room.phase = "game_over";
          room.winnerIndex = playerIndex;
        } else {
          room.phase = "await_draw";
          game.currentPlayerIndex = (game.currentPlayerIndex + 1) % 2;
        }
        broadcastState(room);
        return;
      }

      if (msg.action === "restart") {
        if (room.phase !== "game_over") {
          sendError(socket, "Round is still active.");
          return;
        }
        room.game.dealerIndex = (room.game.dealerIndex + 1) % 2;
        room.game.nextRound();
        room.phase = "await_draw";
        room.winnerIndex = null;
        broadcastState(room);
        return;
      }
    }
  });

  socket.on("close", () => {
    if (!room || playerIndex === null) return;
    if (room.sockets[playerIndex] === socket) {
      room.sockets[playerIndex] = null;
      room.lastActive = Date.now();
    }
  });
});

server.listen(PORT, () => {
  console.log(`Serving ${ROOT} on http://localhost:${PORT}`);
});
