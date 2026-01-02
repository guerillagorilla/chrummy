import { JokerRank, formatRequirements } from "./gameEngine.js";

export function chooseDrawSource(game, playerIndex) {
  const topDiscard = game.discardPile[game.discardPile.length - 1];
  if (!topDiscard) return "deck";
  const player = game.players[playerIndex];
  if (player.hasLaidDown && !game.canLayOffCard(topDiscard)) return "deck";
  if (topDiscard.rank === "2" || topDiscard.rank === JokerRank) return "discard";

  const handRanks = new Set(player.hand.map((card) => card.rank));
  const ownMeldRanks = game.meldRanksFor(playerIndex);
  const opponentMeldRanks = game.opponentMeldRanks(playerIndex);

  if (handRanks.has(topDiscard.rank)) return "discard";
  if (ownMeldRanks.has(topDiscard.rank)) return "discard";
  if (opponentMeldRanks.has(topDiscard.rank)) return "discard";
  return "deck";
}

export function chooseDiscard(hand, avoidRanks, keepRanks) {
  const nonWild = hand.filter((card) => !card.isWild());
  if (nonWild.length > 0) {
    const counts = new Map();
    for (const card of nonWild) {
      counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
    }
    const protectedRanks = new Set(
      nonWild.filter((card) => counts.get(card.rank) >= 2).map((card) => card.rank),
    );

    let candidates = nonWild.filter(
      (card) => !protectedRanks.has(card.rank) && !avoidRanks.has(card.rank) && !keepRanks.has(card.rank),
    );
    if (candidates.length === 0) {
      candidates = nonWild.filter((card) => !protectedRanks.has(card.rank) && !keepRanks.has(card.rank));
    }
    if (candidates.length === 0) {
      candidates = nonWild;
    }

    const points = (card) => (["10", "J", "Q", "K", "A"].includes(card.rank) ? 10 : 5);

    candidates.sort((a, b) => {
      const countDiff = (counts.get(a.rank) ?? 0) - (counts.get(b.rank) ?? 0);
      if (countDiff !== 0) return countDiff;
      const pointsDiff = points(b) - points(a);
      if (pointsDiff !== 0) return pointsDiff;
      return a.rank.localeCompare(b.rank);
    });

    return candidates[0];
  }

  return hand[0];
}

export function aiTurn(game, playerIndex) {
  const player = game.players[playerIndex];
  const drawChoice = chooseDrawSource(game, playerIndex);
  const drawn = drawChoice === "discard" ? game.drawFromDiscard(player) : game.drawFromStock(player);

  const log = [];
  if (drawn) {
    log.push(`Drew ${drawChoice} (${drawn.rank}${drawn.suit}).`);
  } else {
    log.push(`Tried to draw from ${drawChoice}, but pile was empty.`);
  }

  if (game.tryLayDown(player)) {
    const summary = formatRequirements(game.currentRound().requirements);
    log.push(`Laid down ${summary}.`);
  }

  const moved = game.layOffAll(player);
  if (moved > 0) {
    log.push(`Laid off ${moved} card${moved === 1 ? "" : "s"}.`);
  }

  const avoidRanks = game.opponentMeldRanks(playerIndex);
  const keepRanks = game.meldRanksFor(playerIndex);
  const discard = chooseDiscard(player.hand, avoidRanks, keepRanks);
  if (discard) {
    game.discard(player, discard);
    log.push(`Discarded ${discard.rank}${discard.suit}.`);
  }

  return { log, drewCard: drawn, drawChoice, discarded: discard };
}
