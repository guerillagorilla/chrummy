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
export const llamaConnections = new Map();  // roomCode -> WebSocket

// Callback for when Llama sends an action
let onLlamaAction = null;

export function setLlamaActionHandler(handler) {
  onLlamaAction = handler;
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
    
    // Send welcome message
    ws.send(JSON.stringify({
      type: "welcome",
      message: "Connected to Chrummy Bot API",
      usage: {
        join: { action: "join", room: "ABCD" },
        action: { 
          action: "play", 
          draw: "deck|discard",
          meld: true,  // optional, auto-meld if possible
          discard: "7H or cid",
          chat: "optional trash talk message"
        }
      },
      card_notation: "7H = 7 of hearts, QS = queen of spades, JK = joker",
    }));
    
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleLlamaMessage(ws, msg, joinedRoom, (room) => { joinedRoom = room; });
      } catch (e) {
        ws.send(JSON.stringify({ type: "error", message: `Invalid JSON: ${e.message}` }));
      }
    });
    
    ws.on("close", () => {
      console.log("[bot-api] Llama service disconnected");
      if (joinedRoom) {
        llamaConnections.delete(joinedRoom);
      }
    });
  });
  
  return wss;
}

function handleLlamaMessage(ws, msg, currentRoom, setRoom) {
  if (msg.action === "join") {
    const roomCode = String(msg.room || "").toUpperCase();
    if (!roomCode) {
      ws.send(JSON.stringify({ type: "error", message: "Room code required" }));
      return;
    }
    
    // Leave previous room if any
    if (currentRoom) {
      llamaConnections.delete(currentRoom);
    }
    
    // Join new room
    llamaConnections.set(roomCode, ws);
    setRoom(roomCode);
    
    ws.send(JSON.stringify({
      type: "joined",
      room: roomCode,
      message: `Joined room ${roomCode} as Llama AI. Waiting for game to start and your turn.`
    }));
    
    console.log(`[bot-api] Llama joined room ${roomCode}`);
    return;
  }
  
  if (msg.action === "play") {
    if (!currentRoom) {
      ws.send(JSON.stringify({ type: "error", message: "Join a room first" }));
      return;
    }
    
    // Call the action handler if set
    if (onLlamaAction) {
      const result = onLlamaAction(currentRoom, msg);
      if (result.error) {
        ws.send(JSON.stringify({ type: "error", message: result.error }));
      } else {
        ws.send(JSON.stringify({ type: "action_accepted", message: result.message || "Move accepted" }));
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
export function sendToLlama(roomCode, message) {
  const ws = llamaConnections.get(roomCode);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}

/**
 * Check if Llama is connected for a room
 */
export function isLlamaConnected(roomCode) {
  const ws = llamaConnections.get(roomCode);
  return ws && ws.readyState === WebSocket.OPEN;
}
