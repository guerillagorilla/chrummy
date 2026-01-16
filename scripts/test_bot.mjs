#!/usr/bin/env node
/**
 * Simple test client for the bot API
 * Run: node scripts/test_bot.mjs
 */

import WebSocket from "ws";

const ws = new WebSocket("ws://localhost:8000/api/bot", {
  perMessageDeflate: false
});

ws.on("open", () => {
  console.log("Connected to bot API");
});

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  console.log("\n📨 Received:", JSON.stringify(msg, null, 2));
  
  // Auto-play logic for testing
  if (msg.type === "welcome") {
    console.log("\n🎮 Starting new game...");
    ws.send(JSON.stringify({ action: "new_game" }));
  }
  
  if (msg.type === "your_turn" && msg.phase === "await_draw") {
    // Just draw from deck
    console.log("\n🃏 Drawing from deck...");
    ws.send(JSON.stringify({ action: "draw_deck" }));
  }
  
  // Track if we just tried to meld and failed
  if (msg.type === "your_turn" && msg.phase === "await_discard") {
    // Just discard first card (simple strategy)
    // Cards are now { card: "7H", cid: 123 }
    const cardInfo = msg.your_hand[0];
    console.log(`\n🗑️ Discarding ${cardInfo.card} (cid: ${cardInfo.cid})...`);
    // Can use either cid or the full object
    ws.send(JSON.stringify({ action: "discard", card: cardInfo.cid }));
  }
  
  if (msg.type === "you_melded") {
    console.log("\n✅ Melded successfully!");
    // Will get another your_turn to discard
  }
  
  if (msg.type === "game_end") {
    console.log("\n🏆 Game over!");
    ws.close();
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
