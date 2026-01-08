import http from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { Game, ROUNDS, canLayDownWithCard } from "../src/engine/gameEngine.js";
import { aiTurn, chooseDrawSource } from "../src/engine/ai.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_ROOT = path.join(ROOT, "public");
const SRC_ROOT = path.join(ROOT, "src");
const PORT = Number(process.env.PORT || 8000);
const POLL_INTERVAL = 500;
const ROOM_CODE_LENGTH = 4;
const ROOM_IDLE_MS = 1000 * 60 * 5;
const AI_TURN_DELAY_MS = 3000;

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

function createRoom(maxPlayers) {
  let code = makeRoomCode();
  while (rooms.has(code)) {
    code = makeRoomCode();
  }
  const size = Number(maxPlayers);
  if (!Number.isInteger(size) || size < 2 || size > 10) {
    throw new Error("Invalid room size.");
  }
  const room = {
    code,
    game: null,
    phase: "waiting_for_players",
    sockets: Array.from({ length: size }, () => null),
    winnerIndex: null,
    lastActive: Date.now(),
    maxPlayers: size,
    resumePhase: null,
    aiSeats: Array.from({ length: size }, () => false),
    buyState: null,
    devMode: Array.from({ length: size }, () => false),
    aiTimer: null,
  };
  rooms.set(code, room);
  return room;
}

function connectedCount(room) {
  return room.sockets.filter((socket) => socket && socket.readyState === WebSocket.OPEN).length;
}

function aiCount(room) {
  return room.aiSeats.filter(Boolean).length;
}

function filledCount(room) {
  return connectedCount(room) + aiCount(room);
}

function updateRoomPhase(room) {
  const ready = filledCount(room) === room.maxPlayers;
  if (ready) {
    if (!room.game) {
      room.game = new Game(room.maxPlayers, 0);
      room._logTurnOrder = true;
      room.phase = "await_draw";
      room.winnerIndex = null;
      room.resumePhase = null;
      return;
    }
    if (room.phase === "waiting_for_players") {
      room.phase = room.resumePhase || "await_draw";
      room.resumePhase = null;
    }
    return;
  }
  if (room.phase !== "waiting_for_players") {
    room.resumePhase = room.phase;
    room.phase = "waiting_for_players";
  }
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
  const connected = connectedCount(room);
  const ai = aiCount(room);
  const filled = connected + ai;
  const topDiscard = room.game?.discardPile?.[room.game.discardPile.length - 1] ?? null;
  const buyAvailable =
    room.maxPlayers >= 3 &&
    room.phase === "await_draw" &&
    topDiscard &&
    room.buyState &&
    !room.buyState.resolved &&
    room.buyState.discardCid === topDiscard.cid;
  if (!room.game) {
    return {
      type: "state",
      room: room.code,
      playerIndex,
      phase: room.phase,
      currentPlayerIndex: 0,
      winnerIndex: room.winnerIndex,
      roundIndex: 0,
      round: ROUNDS[0],
      connectedCount: connected,
      aiCount: ai,
      filledCount: filled,
      maxPlayers: room.maxPlayers,
      ready: filled === room.maxPlayers,
      drawCount: 0,
      discardTop: null,
      buyAvailable: false,
      you: {
        hand: [],
        melds: [],
        stagedMelds: [],
        hasLaidDown: false,
        totalScore: 0,
      },
      opponents: [],
    };
  }
  const game = room.game;
  const you = game.players[playerIndex];
  const showHands = room.devMode[playerIndex];
  const opponents = game.players
    .map((player, idx) => ({ player, idx }))
    .filter(({ idx }) => idx !== playerIndex)
    .map(({ player, idx }) => ({
      playerIndex: idx,
      connected: room.aiSeats[idx] || room.sockets[idx]?.readyState === WebSocket.OPEN,
      isAi: room.aiSeats[idx],
      hand: showHands ? player.hand.map(cardPayload) : null,
      handCount: player.hand.length,
      melds: player.melds.map(meldPayload),
      stagedMelds: player.stagedMelds.map(meldPayload),
      hasLaidDown: player.hasLaidDown,
      totalScore: player.totalScore,
    }));
  return {
    type: "state",
    room: room.code,
    playerIndex,
    phase: room.phase,
    currentPlayerIndex: game.currentPlayerIndex,
    winnerIndex: room.winnerIndex,
    roundIndex: game.roundIndex,
    round: game.currentRound(),
    connectedCount: connected,
    aiCount: ai,
    filledCount: filled,
    maxPlayers: room.maxPlayers,
    ready: filled === room.maxPlayers,
    drawCount: game.drawPile.length,
    discardTop: cardPayload(topDiscard),
    buyAvailable,
    you: {
      hand: you.hand.map(cardPayload),
      melds: you.melds.map(meldPayload),
      stagedMelds: you.stagedMelds.map(meldPayload),
      hasLaidDown: you.hasLaidDown,
      totalScore: you.totalScore,
    },
    opponents,
  };
}

function broadcastState(room) {
  room.sockets.forEach((socket, idx) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      if (room.game && room._logTurnOrder) {
        console.log(`[room ${room.code}] round=${room.game.roundIndex + 1} dealer=${room.game.dealerIndex} current=${room.game.currentPlayerIndex}`);
        room._logTurnOrder = false;
      }
      socket.send(JSON.stringify(stateForPlayer(room, idx)));
    }
  });
}

function resolveBuy(room) {
  const game = room.game;
  if (!game || room.phase !== "await_draw") return null;
  if (!room.buyState || room.buyState.resolved) return null;
  if (!room.buyState.requests || room.buyState.requests.size === 0) return null;
  const topDiscard = game.discardPile[game.discardPile.length - 1];
  if (!topDiscard || topDiscard.cid !== room.buyState.discardCid) {
    room.buyState = null;
    return null;
  }
  const discarderIndex = (game.currentPlayerIndex - 1 + game.players.length) % game.players.length;
  const eligible = [...room.buyState.requests].filter((idx) => idx !== game.currentPlayerIndex);
  if (eligible.length === 0) return null;
  const winnerIndex = eligible.reduce((best, idx) => {
    const bestDist = (best - discarderIndex + game.players.length) % game.players.length;
    const idxDist = (idx - discarderIndex + game.players.length) % game.players.length;
    return idxDist < bestDist ? idx : best;
  }, eligible[0]);
  const buyer = game.players[winnerIndex];
  const discardCard = game.drawFromDiscard(buyer);
  const bonusCard = discardCard ? game.drawFromStock(buyer) : null;
  room.buyState.resolved = true;
  room.buyState.winnerIndex = winnerIndex;
  room.buyState.requests.clear();
  return { winnerIndex, discardCard, bonusCard };
}

function broadcastBuy(room, result) {
  if (!result) return;
  const payload = {
    type: "buy_success",
    buyerIndex: result.winnerIndex,
    card: cardPayload(result.discardCard),
  };
  room.sockets.forEach((socket) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  });
}

function queueAiBuys(room) {
  if (!room.buyState || room.buyState.resolved || !room.game) return;
  const game = room.game;
  if (room.maxPlayers < 3) return;
  const topDiscard = game.discardPile[game.discardPile.length - 1];
  if (!topDiscard || topDiscard.cid !== room.buyState.discardCid) return;
  room.aiSeats.forEach((isAi, idx) => {
    if (!isAi) return;
    if (idx === game.currentPlayerIndex) return;
    if (room.buyState.requests.has(idx)) return;
    const player = game.players[idx];
    const canLayDown = canLayDownWithCard(player.hand, topDiscard, game.currentRound().requirements);
    const canLayOff = player.hasLaidDown && game.canLayOffCard(topDiscard);
    if (canLayDown || canLayOff) {
      room.buyState.requests.add(idx);
    }
  });
}

function scheduleAiTurn(room) {
  if (!room.game) return;
  if (room.aiTimer) return;
  if (room.phase !== "await_draw") return;
  const current = room.game.currentPlayerIndex;
  if (!room.aiSeats[current]) return;
  room.aiTimer = setTimeout(() => {
    room.aiTimer = null;
    if (!room.game || room.phase !== "await_draw") return;
    const aiIndex = room.game.currentPlayerIndex;
    if (!room.aiSeats[aiIndex]) return;
    aiTurn(room.game, aiIndex);
    if (room.game.checkWin(room.game.players[aiIndex])) {
      room.game.applyRoundScores(aiIndex);
      room.phase = "game_over";
      room.winnerIndex = aiIndex;
    } else {
      room.phase = "await_draw";
      room.game.currentPlayerIndex = (aiIndex + 1) % room.game.players.length;
    }
    broadcastState(room);
    scheduleAiTurn(room);
  }, AI_TURN_DELAY_MS);
}

function runAiTurns(room) {
  scheduleAiTurn(room);
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

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

function writeHead(res, status, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
}

function resolveRequestPath(requestedPath) {
  const relativePath = requestedPath.replace(/^\/+/, "");
  return path.resolve(ROOT, relativePath);
}

function isAllowedPath(filePath) {
  return (
    filePath === PUBLIC_ROOT ||
    filePath.startsWith(`${PUBLIC_ROOT}${path.sep}`) ||
    filePath === SRC_ROOT ||
    filePath.startsWith(`${SRC_ROOT}${path.sep}`)
  );
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    writeHead(res, 400);
    res.end();
    return;
  }

  if (req.url === "/events") {
    writeHead(res, 200, {
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
  const filePath = resolveRequestPath(requestedPath);
  if (!isAllowedPath(filePath)) {
    writeHead(res, 403);
    res.end("Forbidden");
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      writeHead(res, 403);
      res.end("Forbidden");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";
    writeHead(res, 200, { "Content-Type": contentType });
    createReadStream(filePath).pipe(res);
  } catch {
    writeHead(res, 404);
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
      let size = Number(msg.players);
      if (!Number.isInteger(size)) {
        size = 2;
      }
      try {
        room = createRoom(size);
      } catch {
        sendError(socket, "Invalid room size.");
        return;
      }
      playerIndex = 0;
      room.sockets[playerIndex] = socket;
      room.devMode[playerIndex] = false;
      room.lastActive = Date.now();
      updateRoomPhase(room);
      socket.send(JSON.stringify({ type: "room_created", room: room.code, playerIndex }));
      broadcastState(room);
      runAiTurns(room);
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
      const slot = target.sockets.findIndex((socket, idx) => isSlotOpen(socket) && !target.aiSeats[idx]);
      if (slot === -1) {
        sendError(socket, "Room is full.");
        return;
      }
      room = target;
      playerIndex = slot;
      room.sockets[playerIndex] = socket;
      room.devMode[playerIndex] = false;
      room.lastActive = Date.now();
      updateRoomPhase(room);
      socket.send(JSON.stringify({ type: "room_joined", room: room.code, playerIndex }));
      broadcastState(room);
      runAiTurns(room);
      return;
    }

    if (msg.type === "add_ai") {
      if (!room) {
        sendError(socket, "Join a room first.");
        return;
      }
      const slot = room.aiSeats.findIndex((seat, idx) => {
        if (seat) return false;
        return !room.sockets[idx] || room.sockets[idx].readyState !== WebSocket.OPEN;
      });
      if (slot === -1) {
        sendError(socket, "No open seats.");
        return;
      }
      room.aiSeats[slot] = true;
      room.lastActive = Date.now();
      updateRoomPhase(room);
      broadcastState(room);
      runAiTurns(room);
      return;
    }

    if (msg.type === "leave_room") {
      if (room && playerIndex !== null) {
        room.sockets[playerIndex] = null;
        room.devMode[playerIndex] = false;
        room.lastActive = Date.now();
        socket.send(JSON.stringify({ type: "room_left" }));
        updateRoomPhase(room);
        room.sockets.forEach((otherSocket, idx) => {
          if (!otherSocket || idx === playerIndex) return;
          if (otherSocket.readyState === WebSocket.OPEN) {
            otherSocket.send(JSON.stringify({ type: "player_left", playerIndex }));
          }
        });
        broadcastState(room);
        runAiTurns(room);
      }
      room = null;
      playerIndex = null;
      return;
    }

    if (msg.type === "buy") {
      if (!room || playerIndex === null) {
        sendError(socket, "Join a room first.");
        return;
      }
      if (room.maxPlayers < 3) {
        sendError(socket, "Buying is only available for 3+ players.");
        return;
      }
      if (room.phase !== "await_draw") {
        sendError(socket, "You can only buy after a discard.");
        return;
      }
      if (!room.buyState || room.buyState.resolved) {
        sendError(socket, "No card available to buy.");
        return;
      }
      if (playerIndex === room.game.currentPlayerIndex) {
        sendError(socket, "Current player cannot buy.");
        return;
      }
      room.buyState.requests.add(playerIndex);
      broadcastState(room);
      return;
    }

    if (msg.type === "set_dev_mode") {
      if (!room || playerIndex === null) {
        sendError(socket, "Join a room first.");
        return;
      }
      room.devMode[playerIndex] = Boolean(msg.enabled);
      broadcastState(room);
      return;
    }

    if (msg.type === "skip_round") {
      if (!room || playerIndex === null) {
        sendError(socket, "Join a room first.");
        return;
      }
      if (!room.devMode[playerIndex]) {
        sendError(socket, "Enable dev mode to skip rounds.");
        return;
      }
      if (!room.game) {
        sendError(socket, "Game not ready.");
        return;
      }
      room.game.dealerIndex = (room.game.dealerIndex + 1) % room.game.players.length;
      room.game.nextRound();
      room._logTurnOrder = true;
      room.phase = "await_draw";
      room.winnerIndex = null;
      room.buyState = null;
      broadcastState(room);
      runAiTurns(room);
      return;
    }

    if (!room || playerIndex === null) {
      sendError(socket, "Join a room first.");
      return;
    }

    room.lastActive = Date.now();
    updateRoomPhase(room);

    if (room.phase === "waiting_for_players") {
      sendError(socket, "Waiting for players to join.");
      return;
    }

    if (msg.type === "action") {
      const game = room.game;
      if (room.phase === "game_over" && msg.action !== "restart") {
        sendError(socket, "Round is over.");
        return;
      }
      if (msg.action === "restart") {
        if (room.phase !== "game_over") {
          sendError(socket, "Round is still active.");
          return;
        }
        room.game.dealerIndex = (room.game.dealerIndex + 1) % room.game.players.length;
        room.game.nextRound();
        room._logTurnOrder = true;
        room.phase = "await_draw";
        room.winnerIndex = null;
        room.buyState = null;
        broadcastState(room);
        runAiTurns(room);
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
        const buyResult = resolveBuy(room);
        if (buyResult) {
          broadcastBuy(room, buyResult);
          broadcastState(room);
        }
        const source = msg.source === "discard" ? "discard" : "deck";
        if (source === "discard" && room.buyState?.resolved) {
          sendError(socket, "Discard was bought. Draw from deck.");
          return;
        }
        const player = game.players[playerIndex];
        const drawn = source === "discard" ? game.drawFromDiscard(player) : game.drawFromStock(player);
        if (!drawn) {
          sendError(socket, `No cards in ${source}.`);
          return;
        }
        room.phase = "await_discard";
        room.buyState = null;
        broadcastState(room);
        runAiTurns(room);
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
        runAiTurns(room);
        return;
      }

      if (msg.action === "auto_stage") {
        if (room.phase !== "await_discard") {
          sendError(socket, "Draw first.");
          return;
        }
        const player = game.players[playerIndex];
        if (player.hasLaidDown) {
          sendError(socket, "Already laid down.");
          return;
        }
        if (!game.autoStageMelds(player)) {
          sendError(socket, "No valid melds.");
          broadcastState(room);
          return;
        }
        broadcastState(room);
        runAiTurns(room);
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
        runAiTurns(room);
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
        runAiTurns(room);
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
        if (!Number.isFinite(meldOwner) || meldOwner < 0 || meldOwner >= game.players.length) {
          sendError(socket, "Invalid layoff.");
          return;
        }
        const meld = game.players[meldOwner].melds[meldIndex];
        const card = game.players[playerIndex].hand.find((c) => c.cid === cardId);
        if (!card || !meld) {
          sendError(socket, "Invalid layoff.");
          return;
        }
        if (!game.layOffCardToMeld(game.players[playerIndex], card, meld)) {
          sendError(socket, "Cannot lay off to that meld.");
          return;
        }
        if (game.checkWin(game.players[playerIndex])) {
          game.applyRoundScores(playerIndex);
          room.phase = "game_over";
          room.winnerIndex = playerIndex;
          broadcastState(room);
          runAiTurns(room);
          return;
        }
        broadcastState(room);
        runAiTurns(room);
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
        room.buyState = {
          discardCid: card.cid,
          requests: new Set(),
          resolved: false,
        };
        queueAiBuys(room);
        if (game.checkWinAfterDiscard(player)) {
          game.applyRoundScores(playerIndex);
          room.phase = "game_over";
          room.winnerIndex = playerIndex;
        } else {
          room.phase = "await_draw";
          game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
        }
        broadcastState(room);
        runAiTurns(room);
        return;
      }

    }
  });

  socket.on("close", () => {
    if (!room || playerIndex === null) return;
    if (room.sockets[playerIndex] === socket) {
      room.sockets[playerIndex] = null;
      room.devMode[playerIndex] = false;
      room.lastActive = Date.now();
      updateRoomPhase(room);
      broadcastState(room);
      runAiTurns(room);
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Serving /public and /src on http://0.0.0.0:${PORT}`);
});
