// Test agent that plays the game automatically using the real AI
// Run with: node scripts/test_agent.mjs

import { Game, JokerRank, formatRequirements, ROUNDS, canLayDownWithCards } from "../src/engine/gameEngine.js";
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

function playRound(game, roundNumber) {
  let turn = 0;
  const maxTurns = 200;
  const roundSummary = formatRequirements(game.currentRound().requirements);

  console.log(`=== Round ${roundNumber + 1}: ${roundSummary} ===`);
  console.log(`You:      ${handStr(game.players[0].hand)}`);
  console.log(`Opponent: ${handStr(game.players[1].hand)}`);
  console.log(`Discard:  ${cardLabel(game.discardPile[game.discardPile.length - 1])}`);
  console.log("");

  while (turn < maxTurns) {
    turn++;
    const playerIndex = game.currentPlayerIndex;
    const playerName = playerIndex === 0 ? "You" : "Opp";
    const player = game.players[playerIndex];
    const startSize = player.hand.length;

    const result = aiTurn(game, playerIndex);
    const drawInfo = result.drewCard ? `+${cardLabel(result.drewCard)} (${result.drawChoice})` : "(no draw)";
    console.log(`T${turn} ${playerName}: ${drawInfo}`);

    if (result.log.some((entry) => entry.includes("Laid down"))) {
      console.log(`  *** LAY DOWN! ${meldsStr(player.melds)}`);
    }

    if (result.log.some((entry) => entry.includes("Laid off"))) {
      const layoffLog = result.log.find((entry) => entry.includes("Laid off"));
      console.log(`  ${layoffLog}`);
    }

    const discardStr = result.discarded ? `-${cardLabel(result.discarded)}` : "(no discard)";
    console.log(`  ${discardStr} | Hand: ${handStr(player.hand)}`);

    if (game.checkWin(player)) {
      console.log(`\n=== ${playerName} WINS ROUND ${roundNumber + 1}! ===`);
      console.log(`Your melds: ${meldsStr(game.players[0].melds)}`);
      console.log(`Opp melds:  ${meldsStr(game.players[1].melds)}`);
      console.log(`Your hand:  ${handStr(game.players[0].hand) || "(empty)"}`);
      console.log(`Opp hand:   ${handStr(game.players[1].hand) || "(empty)"}`);
      game.applyRoundScores(playerIndex);
      return playerIndex;
    }

    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % 2;
  }

  console.log("\nRound exceeded max turns!");
  return null;
}

function playGame(rounds = ROUNDS.length) {
  const game = new Game(2, 1); // Dealer is opponent, so You go first
  console.log("=== Starting Game ===");
  for (let round = 0; round < rounds; round += 1) {
    const winner = playRound(game, round);
    if (winner === null) {
      break;
    }
    if (round < rounds - 1) {
      game.dealerIndex = (game.dealerIndex + 1) % 2;
      game.nextRound();
      console.log("");
    }
  }
  console.log(`Final score: You ${game.players[0].totalScore} | Opponent ${game.players[1].totalScore}`);
}

playGame();
