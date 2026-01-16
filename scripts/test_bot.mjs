#!/usr/bin/env node
/**
 * Test client for the Llama AI bot API
 * 
 * Usage:
 *   node scripts/test_bot.mjs [room_code]
 * 
 * If room_code is provided, joins that room.
 * Otherwise, waits for you to tell it which room to join.
 */

import WebSocket from "ws";

const roomCode = process.argv[2];

const ws = new WebSocket("ws://localhost:8000/api/bot", {
  perMessageDeflate: false
});

ws.on("open", () => {
  console.log("Connected to bot API");
});

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  console.log("\n📨 Received:", JSON.stringify(msg, null, 2));
  
  // Auto-join if room code provided
  if (msg.type === "welcome" && roomCode) {
    console.log(`\n🎮 Joining room ${roomCode}...`);
    ws.send(JSON.stringify({ action: "join", room: roomCode }));
  }
  
  // When it's our turn, make a simple play
  if (msg.type === "your_turn") {
    console.log("\n🤔 Thinking...");
    
    // Simple strategy: draw from deck, discard first card
    const hand = msg.hand;
    const discardCard = hand[0];  // Just discard first card
    
    setTimeout(() => {
      console.log(`\n🎴 Playing: draw deck, discard ${discardCard.card}`);
      ws.send(JSON.stringify({
        action: "play",
        draw: "deck",
        meld: true,  // Try to meld if possible
        discard: discardCard.cid
      }));
    }, 1000);  // 1 second delay to simulate thinking
  }
});

ws.on("error", (err) => {
  console.error("WebSocket error:", err.message);
});

ws.on("close", () => {
  console.log("\nDisconnected");
  process.exit(0);
});

// Handle Ctrl+C
process.on("SIGINT", () => {
  console.log("\nClosing...");
  ws.close();
});

console.log("\nLlama AI Test Bot");
console.log("==================");
if (roomCode) {
  console.log(`Will join room: ${roomCode}`);
} else {
  console.log("No room code provided. Create a room in the browser, then run:");
  console.log("  node scripts/test_bot.mjs ROOM_CODE");
}
console.log("");
