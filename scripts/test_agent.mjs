// Test agent that plays the game automatically
// Run with: node test_agent.mjs

import { Game } from "./engine/gameEngine.js";

const JokerRank = "JOKER";

function cardLabel(card) {
  if (!card) return "Empty";
  if (card.rank === JokerRank) return "JKR";
  const suitChar = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" }[card.suit] || "?";
  return `${card.rank}${suitChar}`;
}

function handStr(hand) {
  return hand.map(cardLabel).join(" ");
}

function playGame() {
  const game = new Game(2, 0);
  let turn = 0;
  const maxTurns = 100;

  console.log("=== Starting Game ===");
  console.log(`You:      ${handStr(game.players[0].hand)}`);
  console.log(`Opponent: ${handStr(game.players[1].hand)}`);
  console.log(`Discard:  ${cardLabel(game.discardPile[game.discardPile.length - 1])}`);
  console.log("");

  while (turn < maxTurns) {
    turn++;
    const currentPlayer = game.currentPlayer();
    const isHuman = game.currentPlayerIndex === 0;
    const playerName = isHuman ? "You" : "Opp";

    // Draw phase
    const topDiscard = game.discardPile[game.discardPile.length - 1];
    let drawChoice = "deck";
    
    // Simple AI: take discard if it matches a rank in hand or is wild
    if (topDiscard) {
      const hasMatch = currentPlayer.hand.some(c => c.rank === topDiscard.rank);
      if (hasMatch || topDiscard.rank === JokerRank || topDiscard.rank === "2") {
        drawChoice = "discard";
      }
    }

    let drewCard;
    if (drawChoice === "discard") {
      drewCard = game.drawFromDiscard(currentPlayer);
    } else {
      drewCard = game.drawFromStock(currentPlayer);
    }
    
    console.log(`T${turn} ${playerName}: +${cardLabel(drewCard)} (${drawChoice})`);

    // Try to lay down if possible (need 2 triplets)
    if (!currentPlayer.hasLaidDown) {
      const success = game.tryLayDown(currentPlayer);
      if (success) {
        console.log(`  *** LAY DOWN! ${currentPlayer.melds.map(m => m.cards.map(cardLabel).join(",")).join(" | ")}`);
      }
    }

    // Try to lay off
    if (currentPlayer.hasLaidDown) {
      const moved = game.layOffAll(currentPlayer);
      if (moved > 0) {
        console.log(`  Laid off ${moved} cards`);
      }
    }

    // Check if player has 0 or 1 card (can win by discarding)
    if (currentPlayer.hand.length === 0) {
      console.log(`\n=== ${playerName} WINS (0 cards)! ===`);
      break;
    }

    // Discard (pick worst card - highest point singleton, never discard wild if possible)
    let cardToDiscard = null;
    const hand = currentPlayer.hand;
    
    // Count ranks
    const rankCounts = {};
    for (const c of hand) {
      rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
    }
    
    // Find singletons (non-wild)
    const singletons = hand.filter(c => 
      rankCounts[c.rank] === 1 && c.rank !== "2" && c.rank !== JokerRank
    );
    
    if (singletons.length > 0) {
      // Discard highest point singleton
      singletons.sort((a, b) => {
        const pointA = ["10", "J", "Q", "K", "A"].includes(a.rank) ? 10 : 5;
        const pointB = ["10", "J", "Q", "K", "A"].includes(b.rank) ? 10 : 5;
        return pointB - pointA;
      });
      cardToDiscard = singletons[0];
    } else {
      // No singletons - discard first non-wild, or first card if all wilds
      cardToDiscard = hand.find(c => c.rank !== "2" && c.rank !== JokerRank) || hand[0];
    }

    game.discard(currentPlayer, cardToDiscard);
    console.log(`  -${cardLabel(cardToDiscard)} | Hand: ${handStr(currentPlayer.hand)}`);
    
    // Check win after discard
    if (currentPlayer.hand.length === 0 && currentPlayer.hasLaidDown) {
      console.log(`\n=== ${playerName} WINS! ===`);
      console.log(`Your melds: ${game.players[0].melds.map(m => m.cards.map(cardLabel).join(",")).join(" | ") || "none"}`);
      console.log(`Opp melds:  ${game.players[1].melds.map(m => m.cards.map(cardLabel).join(",")).join(" | ") || "none"}`);
      console.log(`Your hand:  ${handStr(game.players[0].hand) || "(empty)"}`);
      console.log(`Opp hand:   ${handStr(game.players[1].hand) || "(empty)"}`);
      break;
    }

    // Next player
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % 2;
  }

  if (turn >= maxTurns) {
    console.log("\nGame exceeded max turns!");
    console.log(`Your hand:  ${handStr(game.players[0].hand)}`);
    console.log(`Opp hand:   ${handStr(game.players[1].hand)}`);
  }
}

playGame();
