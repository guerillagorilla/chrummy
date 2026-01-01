// Test agent that plays the game automatically using the real AI
// Run with: node scripts/test_agent.mjs

import { Game, JokerRank } from "../src/engine/gameEngine.js";
import { aiTurn } from "../src/engine/ai.js";

function cardLabel(card) {
  if (!card) return "Empty";
  if (card.rank === JokerRank) return "JKR";
  const suitChar = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" }[card.suit] || "?";
  return `${card.rank}${suitChar}`;
}

function handStr(hand) {
  // Sort by rank for easier reading
  const rankOrder = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", JokerRank];
  const sorted = [...hand].sort((a, b) => {
    const aIdx = rankOrder.indexOf(a.rank);
    const bIdx = rankOrder.indexOf(b.rank);
    if (aIdx !== bIdx) return aIdx - bIdx;
    return a.suit.localeCompare(b.suit);
  });
  return sorted.map(cardLabel).join(" ");
}

function meldsStr(melds) {
  if (!melds || melds.length === 0) return "none";
  return melds.map(m => m.cards.map(cardLabel).join(",")).join(" | ");
}

function playGame() {
  const game = new Game(2, 1); // Dealer is opponent, so You go first
  let turn = 0;
  const maxTurns = 100;

  console.log("=== Starting Game ===");
  console.log(`You:      ${handStr(game.players[0].hand)}`);
  console.log(`Opponent: ${handStr(game.players[1].hand)}`);
  console.log(`Discard:  ${cardLabel(game.discardPile[game.discardPile.length - 1])}`);
  console.log("");

  while (turn < maxTurns) {
    turn++;
    const playerIndex = game.currentPlayerIndex;
    const playerName = playerIndex === 0 ? "You" : "Opp";

    // Both players use the real AI
    const result = aiTurn(game, playerIndex);
    
    // Format output
    const drawInfo = result.drewCard ? `+${cardLabel(result.drewCard)} (${result.drawChoice})` : "(no draw)";
    console.log(`T${turn} ${playerName}: ${drawInfo}`);
    
    // Show lay down
    const player = game.players[playerIndex];
    if (result.log.some(l => l.includes("Laid down"))) {
      console.log(`  *** LAY DOWN! ${meldsStr(player.melds)}`);
    }
    
    // Show lay off
    if (result.log.some(l => l.includes("Laid off"))) {
      const layoffLog = result.log.find(l => l.includes("Laid off"));
      console.log(`  ${layoffLog}`);
    }
    
    // Show discard and hand
    const discardStr = result.discarded ? `-${cardLabel(result.discarded)}` : "(no discard)";
    console.log(`  ${discardStr} | Hand: ${handStr(player.hand)}`);
    
    // Check win after discard
    if (player.hand.length === 0 && player.hasLaidDown) {
      console.log(`\n=== ${playerName} WINS! ===`);
      console.log(`Your melds: ${meldsStr(game.players[0].melds)}`);
      console.log(`Opp melds:  ${meldsStr(game.players[1].melds)}`);
      console.log(`Your hand:  ${handStr(game.players[0].hand) || "(empty)"}`);
      console.log(`Opp hand:   ${handStr(game.players[1].hand) || "(empty)"}`);
      return;
    }

    // Next player
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % 2;
  }

  console.log("\nGame exceeded max turns!");
  console.log(`Your melds: ${meldsStr(game.players[0].melds)}`);
  console.log(`Opp melds:  ${meldsStr(game.players[1].melds)}`);
  console.log(`Your hand:  ${handStr(game.players[0].hand)}`);
  console.log(`Opp hand:   ${handStr(game.players[1].hand)}`);
}

playGame();
