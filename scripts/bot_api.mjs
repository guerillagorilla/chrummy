/**
 * Bot API for LLM integration
 * 
 * WebSocket endpoint at /api/bot for Llama AI to connect and play.
 * 
 * The Llama service connects and can:
 * 1. Join a room as the Llama AI player
 * 2. Receive game state when it's their turn
 * 3. Send actions back (draw, meld, discard)
 * 4. Send chat messages (trash talk)
 * 
 * Card notation: "7H" = 7 of hearts, "QS" = queen of spades, "JK" = joker
 */

import { WebSocketServer, WebSocket } from "ws";

// Track Llama connections per room
// Map: roomCode -> Map(seatKey -> WebSocket)
// seatKey is either a number (player index) or "default"
export const llamaConnections = new Map();

// Callback for when Llama sends an action
let onLlamaAction = null;

// Callback for when Llama joins a room (may create room)
let onLlamaJoin = null;

export function setLlamaActionHandler(handler) {
  onLlamaAction = handler;
}

export function setLlamaJoinHandler(handler) {
  onLlamaJoin = handler;
}

/**
 * Create the Bot API WebSocket server
 */
export function createBotApiServer(server, path = "/api/bot") {
  const wss = new WebSocketServer({ noServer: true });
  
  // Handle upgrade requests for our path
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    
    if (url.pathname === path) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });
  
  wss.on("connection", (ws) => {
    console.log("[bot-api] Llama service connected");
    let joinedRoom = null;
    let joinedSeat = null;
    
    // Send welcome message
    ws.send(JSON.stringify({
      type: "welcome",
      message: "Connected to Chrummy Bot API",
      usage: {
        join: { action: "join", room: "MAGIC", create: true },
        action: { 
          action: "play", 
          draw: "deck|discard",
          meld: true,  // optional, auto-meld if possible
          discard: "7H or cid",
          chat: "optional trash talk message"
        },
        candidates: { action: "candidates", state: { room: "MAGIC", player_index: 1 } },
        strategy: {
          action: "strategy",
          state: { room: "MAGIC", player_index: 1 },
          candidates: [],
          advice: {
            vetoIds: [],
            priorityAdjustments: {},
            flags: ["preserve_wilds"],
            rationale: "Preserving flexibility early",
          },
        },
      },
      card_notation: "7H = 7 of hearts, QS = queen of spades, JK = joker",
    }));
    
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleLlamaMessage(ws, msg, joinedRoom, joinedSeat, (room, seat) => {
          joinedRoom = room;
          joinedSeat = seat;
        });
      } catch (e) {
        ws.send(JSON.stringify({ type: "error", message: `Invalid JSON: ${e.message}` }));
      }
    });
    
    ws.on("close", () => {
      console.log("[bot-api] Llama service disconnected");
      if (joinedRoom) {
        const roomConnections = llamaConnections.get(joinedRoom);
        if (roomConnections) {
          const seatKey = joinedSeat ?? "default";
          roomConnections.delete(seatKey);
          if (roomConnections.size === 0) {
            llamaConnections.delete(joinedRoom);
          }
        }
      }
    });
  });
  
  return wss;
}

function handleLlamaMessage(ws, msg, currentRoom, currentSeat, setRoom) {
  if (msg.action === "join") {
    const wantsCreate = Boolean(msg.create);
    let roomCode = String(msg.room || "")
      .toUpperCase()
      .replace(/[^A-Z ]/g, "")
      .trim()
      .replace(/\s+/g, " ");
    if (!roomCode && !wantsCreate) {
      ws.send(JSON.stringify({ type: "error", message: "Room code required" }));
      return;
    }
    if (wantsCreate && !/^[A-Z]{4} [A-Z]{4}$/.test(roomCode)) {
      ws.send(JSON.stringify({ type: "error", message: "Magic word must be two 4-letter words" }));
      return;
    }
    if (!wantsCreate && roomCode && !/^[A-Z]{4} [A-Z]{4}$/.test(roomCode)) {
      ws.send(JSON.stringify({ type: "error", message: "Room code must be two 4-letter words" }));
      return;
    }
    let seat = Number.isFinite(msg.seat) ? Number(msg.seat) : null;
    
    // Leave previous room if any
    if (currentRoom) {
      const roomConnections = llamaConnections.get(currentRoom);
      if (roomConnections) {
        const seatKey = currentSeat ?? "default";
        roomConnections.delete(seatKey);
        if (roomConnections.size === 0) {
          llamaConnections.delete(currentRoom);
        }
      }
    }
    
    if (onLlamaJoin) {
      const result = onLlamaJoin(roomCode, seat, wantsCreate);
      if (result?.error) {
        ws.send(JSON.stringify({ type: "error", message: result.error }));
        return;
      }
      if (result?.roomCode) {
        roomCode = result.roomCode;
      }
      if (Number.isFinite(result?.seat)) {
        seat = result.seat;
      }
    }

    // Join new room (with resolved roomCode/seat)
    const roomConnections = llamaConnections.get(roomCode) ?? new Map();
    const seatKey = seat ?? "default";
    roomConnections.set(seatKey, ws);
    llamaConnections.set(roomCode, roomConnections);
    setRoom(roomCode, seat);
    
    ws.send(JSON.stringify({
      type: "joined",
      room: roomCode,
      seat,
      message: `Joined room ${roomCode} as Llama AI. Waiting for game to start and your turn.`
    }));
    
    console.log(`[bot-api] Llama joined room ${roomCode}${seat !== null ? ` seat ${seat}` : ""}`);
    
    // Now that the connection is registered, allow the server to trigger turn/state if needed.
    if (onLlamaJoin) {
      onLlamaJoin(roomCode, seat, false);
    }
    return;
  }
  
  if (msg.action === "play" || msg.action === "candidates" || msg.action === "advise" || msg.action === "strategy") {
    if (!currentRoom) {
      ws.send(JSON.stringify({ type: "error", message: "Join a room first" }));
      return;
    }
    
    // Call the action handler if set
    if (onLlamaAction) {
      try {
        const result = onLlamaAction(currentRoom, currentSeat, msg);
        if (result.error) {
          ws.send(JSON.stringify({ type: "error", message: result.error }));
        } else if (result.response) {
          ws.send(JSON.stringify(result.response));
        } else {
          ws.send(JSON.stringify({ type: "action_accepted", message: result.message || "Move accepted" }));
        }
      } catch (e) {
        ws.send(JSON.stringify({ type: "error", message: `Server error: ${e.message}` }));
      }
    } else {
      ws.send(JSON.stringify({ type: "error", message: "Server not ready to accept actions" }));
    }
    return;
  }
  
  if (msg.action === "chat") {
    // Chat/trash talk - will be broadcast to players
    ws._pendingChat = msg.message;
    return;
  }
  
  ws.send(JSON.stringify({ type: "error", message: `Unknown action: ${msg.action}` }));
}

/**
 * Get pending action from Llama for a room
 */
export function getLlamaPendingAction(roomCode) {
  const ws = llamaConnections.get(roomCode);
  if (!ws || ws.readyState !== WebSocket.OPEN) return null;
  
  const action = ws._pendingAction;
  ws._pendingAction = null;
  return action;
}

/**
 * Send a message to the Llama service for a room
 */
export function sendToLlama(roomCode, message, seat = null) {
  const roomConnections = llamaConnections.get(roomCode);
  if (!roomConnections) return false;
  const seatKey = seat ?? "default";
  let ws = roomConnections.get(seatKey);
  if (!ws && seat !== null) {
    ws = roomConnections.get("default");
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}

/**
 * Check if Llama is connected for a room
 */
export function isLlamaConnected(roomCode, seat = null) {
  const roomConnections = llamaConnections.get(roomCode);
  if (!roomConnections) return false;
  const seatKey = seat ?? "default";
  let ws = roomConnections.get(seatKey);
  if (!ws && seat !== null) {
    ws = roomConnections.get("default");
  }
  return Boolean(ws && ws.readyState === WebSocket.OPEN);
}
