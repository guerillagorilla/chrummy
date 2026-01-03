// Test agent that plays the game automatically using the real AI
// Run with: node scripts/test_agent.mjs

import { Game, JokerRank, formatRequirements, ROUNDS, canLayDownWithCards } from "../src/engine/gameEngine.js";
import { aiTurn, chooseDrawSource } from "../src/engine/ai.js";

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

function playerLabel(index) {
  return index === 0 ? "You" : `P${index + 1}`;
}

function resolveBuy(game, discarderIndex) {
  if (game.players.length < 3) return null;
  const top = game.discardPile[game.discardPile.length - 1];
  if (!top) return null;
  const nextIndex = (discarderIndex + 1) % game.players.length;
  const requests = [];
  for (let idx = 0; idx < game.players.length; idx += 1) {
    if (idx === discarderIndex || idx === nextIndex) continue;
    if (chooseDrawSource(game, idx) === "discard") {
      requests.push(idx);
    }
  }
  if (requests.length === 0) return null;
  const winner = requests.reduce((best, idx) => {
    const bestDist = (best - discarderIndex + game.players.length) % game.players.length;
    const idxDist = (idx - discarderIndex + game.players.length) % game.players.length;
    return idxDist < bestDist ? idx : best;
  }, requests[0]);
  const buyer = game.players[winner];
  const discardCard = game.drawFromDiscard(buyer);
  const bonusCard = discardCard ? game.drawFromStock(buyer) : null;
  return { winner, discardCard, bonusCard };
}

function playRound(game, roundNumber) {
  let turn = 0;
  const maxTurns = 200;
  const roundSummary = formatRequirements(game.currentRound().requirements);

  console.log(`=== Round ${roundNumber + 1}: ${roundSummary} ===`);
  game.players.forEach((player, idx) => {
    console.log(`${playerLabel(idx)}: ${handStr(player.hand)}`);
  });
  console.log(`Discard:  ${cardLabel(game.discardPile[game.discardPile.length - 1])}`);
  console.log("");

  while (turn < maxTurns) {
    turn++;
    const playerIndex = game.currentPlayerIndex;
    const playerName = playerLabel(playerIndex);
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

    if (result.discarded) {
      const buyResult = resolveBuy(game, playerIndex);
      if (buyResult) {
        const bought = cardLabel(buyResult.discardCard);
        const bonus = buyResult.bonusCard ? ` +${cardLabel(buyResult.bonusCard)}` : "";
        console.log(`  BUY: ${playerLabel(buyResult.winner)} took ${bought}${bonus}`);
      }
    }

    if (game.checkWin(player)) {
      console.log(`\n=== ${playerName} WINS ROUND ${roundNumber + 1}! ===`);
      game.players.forEach((p, idx) => {
        console.log(`${playerLabel(idx)} melds: ${meldsStr(p.melds)}`);
      });
      game.players.forEach((p, idx) => {
        console.log(`${playerLabel(idx)} hand: ${handStr(p.hand) || "(empty)"}`);
      });
      game.applyRoundScores(playerIndex);
      return playerIndex;
    }

    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
  }

  console.log("\nRound exceeded max turns!");
  return null;
}

function playGame(rounds = ROUNDS.length, players = 3) {
  const game = new Game(players, 1); // Dealer is next player, so index 0 goes first
  console.log("=== Starting Game ===");
  for (let round = 0; round < rounds; round += 1) {
    const winner = playRound(game, round);
    if (winner === null) {
      break;
    }
    if (round < rounds - 1) {
      game.dealerIndex = (game.dealerIndex + 1) % game.players.length;
      game.nextRound();
      console.log("");
    }
  }
  const scores = game.players.map((player, idx) => `${playerLabel(idx)} ${player.totalScore}`).join(" | ");
  console.log(`Final score: ${scores}`);
}

playGame();
