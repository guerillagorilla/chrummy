import http from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { Game, ROUNDS, canLayDownWithCard, formatRequirements } from "../src/engine/gameEngine.js";
import { aiTurn, chooseDrawSource } from "../src/engine/ai.js";
import { createBotApiServer, llamaConnections, sendToLlama, isLlamaConnected, setLlamaActionHandler, setLlamaJoinHandler } from "./bot_api.mjs";

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
const IS_PROD = process.env.NODE_ENV === "production";

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
    aiSeats: Array.from({ length: size }, () => null),  // null | "builtin" | "llama"
    buyState: null,
    llamaSocket: null,  // WebSocket connection to Llama service
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
      isAi: Boolean(room.aiSeats[idx]),
      aiType: room.aiSeats[idx] || null,
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
  const aiType = room.aiSeats[current];
  if (!aiType) return;
  
  if (aiType === "llama") {
    // Llama AI - send state to connected Llama service
    scheduleLlamaTurn(room, current);
  } else {
    // Built-in AI
    room.aiTimer = setTimeout(() => {
      room.aiTimer = null;
      if (!room.game || room.phase !== "await_draw") return;
      const aiIndex = room.game.currentPlayerIndex;
      if (!room.aiSeats[aiIndex]) return;
      aiTurn(room.game, aiIndex);
      finishAiTurn(room, aiIndex);
    }, AI_TURN_DELAY_MS);
  }
}

function finishAiTurn(room, aiIndex) {
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
}

// Llama AI turn handling
const LLAMA_TIMEOUT_MS = 30000;  // 30 second timeout for Llama to respond

function scheduleLlamaTurn(room, aiIndex) {
  if (!isLlamaConnected(room.code)) {
    // No Llama connected, fall back to built-in AI
    console.log(`[llama] No Llama connected for room ${room.code}, falling back to built-in AI`);
    room.aiTimer = setTimeout(() => {
      room.aiTimer = null;
      if (!room.game || room.phase !== "await_draw") return;
      aiTurn(room.game, aiIndex);
      finishAiTurn(room, aiIndex);
    }, AI_TURN_DELAY_MS);
    return;
  }
  
  // Send turn request to Llama
  const game = room.game;
  const player = game.players[aiIndex];
  const topDiscard = game.discardPile[game.discardPile.length - 1];
  
  const turnRequest = {
    type: "your_turn",
    room: room.code,
    player_index: aiIndex,
    phase: "await_draw",
    round_number: game.roundIndex + 1,
    requirements: formatRequirements(game.currentRound().requirements),
    hand: player.hand.map(c => ({ card: cardNotation(c), cid: c.cid })),
    melds: player.melds.map(m => ({ type: m.type, cards: m.cards.map(c => cardNotation(c)) })),
    has_laid_down: player.hasLaidDown,
    discard_top: topDiscard ? cardNotation(topDiscard) : null,
    deck_count: game.drawPile.length,
    opponents: game.players
      .map((p, i) => ({ player: p, index: i }))
      .filter(({ index }) => index !== aiIndex)
      .map(({ player: p, index }) => ({
        player_index: index,
        card_count: p.hand.length,
        melds: p.melds.map(m => ({ type: m.type, cards: m.cards.map(c => cardNotation(c)) })),
        has_laid_down: p.hasLaidDown,
      })),
  };
  
  sendToLlama(room.code, turnRequest);
  
  // Set timeout for Llama response
  room.aiTimer = setTimeout(() => {
    room.aiTimer = null;
    console.log(`[llama] Timeout waiting for Llama in room ${room.code}, falling back to built-in AI`);
    if (!room.game || room.phase !== "await_draw") return;
    aiTurn(room.game, aiIndex);
    finishAiTurn(room, aiIndex);
  }, LLAMA_TIMEOUT_MS);
}

function cardNotation(card) {
  if (!card) return null;
  if (card.rank === "JOKER") return "JK";
  const suitMap = { hearts: "H", diamonds: "D", clubs: "C", spades: "S" };
  return `${card.rank}${suitMap[card.suit]}`;
}

function handleLlamaAction(room, aiIndex, action) {
  if (!room.game || room.phase !== "await_draw") return false;
  if (room.game.currentPlayerIndex !== aiIndex) return false;
  
  // Clear the timeout
  if (room.aiTimer) {
    clearTimeout(room.aiTimer);
    room.aiTimer = null;
  }
  
  const game = room.game;
  const player = game.players[aiIndex];
  
  try {
    // Phase 1: Draw
    if (action.draw === "discard") {
      const card = game.drawFromDiscard(player);
      if (!card) throw new Error("Discard pile empty");
    } else {
      const card = game.drawFromStock(player);
      if (!card) throw new Error("Deck empty");
    }
    
    // Phase 2: Meld (optional)
    if (action.meld && !player.hasLaidDown) {
      if (game.autoStageMelds(player)) {
        game.tryLayDownStaged(player);
      }
    }
    
    // Phase 3: Layoffs (optional)
    if (action.layoffs && player.hasLaidDown) {
      for (const layoff of action.layoffs) {
        const card = player.hand.find(c => c.cid === layoff.cid);
        const targetMeld = game.players[layoff.player]?.melds[layoff.meld_index];
        if (card && targetMeld) {
          game.layOffCardToMeld(player, card, targetMeld);
        }
      }
    }
    
    // Phase 4: Discard
    let discardCard;
    if (typeof action.discard === "number") {
      discardCard = player.hand.find(c => c.cid === action.discard);
    } else if (action.discard) {
      // Parse notation
      const notation = action.discard.toUpperCase();
      discardCard = player.hand.find(c => cardNotation(c) === notation);
    }
    
    if (!discardCard && player.hand.length > 0) {
      // Default: discard first card
      discardCard = player.hand[0];
    }
    
    if (discardCard) {
      game.discard(player, discardCard);
    }
    
    finishAiTurn(room, aiIndex);
    return true;
    
  } catch (e) {
    console.error(`[llama] Error handling action: ${e.message}`);
    // Fall back to built-in AI
    aiTurn(game, aiIndex);
    finishAiTurn(room, aiIndex);
    return false;
  }
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

async function snapshotMtime(roots) {
  const rootList = Array.isArray(roots) ? roots : [roots];
  const fileLists = await Promise.all(rootList.map((root) => walkFiles(root)));
  const files = fileLists.flat();
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

async function snapshotMtimeDetails(roots) {
  const rootList = Array.isArray(roots) ? roots : [roots];
  const fileLists = await Promise.all(rootList.map((root) => walkFiles(root)));
  const files = fileLists.flat();
  let newest = 0;
  let newestFile = null;
  for (const file of files) {
    if (file.endsWith(".pyc")) continue;
    try {
      const stat = await fs.stat(file);
      if (stat.mtimeMs > newest) {
        newest = stat.mtimeMs;
        newestFile = file;
      }
    } catch {
      // ignore transient file errors
    }
  }
  return { newest, newestFile };
}

async function watchFiles() {
  const watchRoots = [PUBLIC_ROOT, SRC_ROOT];
  let lastMtime = await snapshotMtime(watchRoots);
  setInterval(async () => {
    const current = await snapshotMtime(watchRoots);
    if (current > lastMtime) {
      lastMtime = current;
      version += 1;
      if (process.env.WATCH_DEBUG) {
        const details = await snapshotMtimeDetails(watchRoots);
        if (details.newestFile) {
          console.log(`[watch] change in ${details.newestFile}`);
        }
      }
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

function sanitizeRelativePath(urlPath) {
  const relativePath = urlPath.replace(/^\/+/, "");
  if (relativePath.includes("..")) return null;
  return relativePath;
}

function isSrcAsset(filePath) {
  if (filePath === path.join(SRC_ROOT, "app.js")) return true;
  if (filePath === path.join(SRC_ROOT, "styles.css")) return true;
  return filePath.startsWith(`${SRC_ROOT}${path.sep}engine${path.sep}`);
}

function candidatePathsForUrl(cleanUrl) {
  const allowSrcFallback = !IS_PROD;
  if (cleanUrl === "/") {
    return [path.join(PUBLIC_ROOT, "index.html")];
  }
  if (cleanUrl === "/app.js") {
    return allowSrcFallback
      ? [path.join(SRC_ROOT, "app.js"), path.join(PUBLIC_ROOT, "app.js")]
      : [path.join(PUBLIC_ROOT, "app.js")];
  }
  if (cleanUrl === "/styles.css") {
    return allowSrcFallback
      ? [path.join(SRC_ROOT, "styles.css"), path.join(PUBLIC_ROOT, "styles.css")]
      : [path.join(PUBLIC_ROOT, "styles.css")];
  }
  const relativePath = sanitizeRelativePath(cleanUrl);
  if (!relativePath) return null;
  if (cleanUrl.startsWith("/engine/")) {
    return allowSrcFallback
      ? [path.join(SRC_ROOT, relativePath), path.join(PUBLIC_ROOT, relativePath)]
      : [path.join(PUBLIC_ROOT, relativePath)];
  }
  if (cleanUrl.startsWith("/assets/")) {
    return [path.join(PUBLIC_ROOT, relativePath)];
  }
  return [path.join(PUBLIC_ROOT, relativePath)];
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    writeHead(res, 400);
    res.end();
    return;
  }

  if (req.url === "/events") {
    if (IS_PROD) {
      writeHead(res, 404);
      res.end("Not found");
      return;
    }
    writeHead(res, 200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    let lastSeen = version;
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
  const candidates = candidatePathsForUrl(cleanUrl);
  if (!candidates) {
    writeHead(res, 403);
    res.end("Forbidden");
    return;
  }

  try {
    let foundPath = null;
    for (const candidate of candidates) {
      try {
        const stat = await fs.stat(candidate);
        if (!stat.isDirectory()) {
          foundPath = candidate;
          break;
        }
      } catch {
        // try next candidate
      }
    }
    if (!foundPath) {
      writeHead(res, 404);
      res.end("Not found");
      return;
    }
    if (!IS_PROD && isSrcAsset(foundPath)) {
      res.setHeader("X-Source", "src");
    }
    const ext = path.extname(foundPath).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";
    writeHead(res, 200, { "Content-Type": contentType });
    createReadStream(foundPath).pipe(res);
  } catch {
    writeHead(res, 404);
    res.end("Not found");
  }
});

watchFiles();
setInterval(cleanupRooms, 30000);

// Both WebSocket servers use noServer mode with centralized upgrade handling
const botWss = createBotApiServer(server, "/api/bot");
const wss = new WebSocketServer({ noServer: true });

// Set up Llama action handler
setLlamaActionHandler((roomCode, action) => {
  const room = rooms.get(roomCode);
  if (!room) {
    return { error: "Room not found" };
  }
  if (!room.game) {
    return { error: "Game not started" };
  }
  
  const aiIndex = room.game.currentPlayerIndex;
  if (!room.aiSeats[aiIndex] || room.aiSeats[aiIndex] !== "llama") {
    return { error: "Not Llama's turn" };
  }
  
  // Process the action
  const success = handleLlamaAction(room, aiIndex, action);
  return success ? { message: "Move accepted" } : { error: "Invalid move" };
});

// Handle Llama joining a room - check if it's their turn
setLlamaJoinHandler((roomCode) => {
  const room = rooms.get(roomCode);
  if (!room || !room.game) return;
  
  const aiIndex = room.game.currentPlayerIndex;
  if (room.aiSeats[aiIndex] === "llama" && room.phase === "await_draw") {
    // It's Llama's turn and they just connected - cancel any fallback timer and give them the turn
    if (room.aiTimer) {
      clearTimeout(room.aiTimer);
      room.aiTimer = null;
    }
    console.log(`[llama] Llama joined room ${roomCode} and it's their turn - sending state`);
    scheduleLlamaTurn(room, aiIndex);
  }
});

// Centralized upgrade handler
server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  
  if (url.pathname === "/ws") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else if (url.pathname !== "/api/bot") {
    // Bot API handles its own path, destroy unknown paths
    socket.destroy();
  }
});

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
      const aiType = msg.ai_type === "llama" ? "llama" : "builtin";
      const slot = room.aiSeats.findIndex((seat, idx) => {
        if (seat) return false;
        return !room.sockets[idx] || room.sockets[idx].readyState !== WebSocket.OPEN;
      });
      if (slot === -1) {
        sendError(socket, "No open seats.");
        return;
      }
      room.aiSeats[slot] = aiType;
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
  const label = IS_PROD ? "/public only" : "/public with dev fallbacks";
  console.log(`Serving ${label} on http://0.0.0.0:${PORT}`);
  console.log(`Bot API available at ws://localhost:${PORT}/api/bot`);
  if (!IS_PROD) {
    console.log("Dev mode: prefers /src assets over /public build output.");
  }
});
