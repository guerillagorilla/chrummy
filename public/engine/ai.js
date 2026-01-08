import { JokerRank, formatRequirements, canLayDownWithCard } from "./gameEngine.js";

const RANK_VALUES = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

function isWild(card) {
  return card.isWild ? card.isWild() : card.rank === "2" || card.rank === JokerRank;
}

function countRanks(hand) {
  const counts = new Map();
  for (const card of hand) {
    if (isWild(card)) continue;
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }
  return counts;
}

function countSuitRanks(hand) {
  const suits = new Map();
  for (const card of hand) {
    if (isWild(card) || card.rank === JokerRank) continue;
    if (!suits.has(card.suit)) {
      suits.set(card.suit, new Set());
    }
    suits.get(card.suit).add(RANK_VALUES[card.rank]);
  }
  return suits;
}

function canFormRunWith(hand, card, runSize) {
  const suits = countSuitRanks(hand);
  const wilds = hand.filter(isWild).length + (isWild(card) ? 1 : 0);
  if (isWild(card)) {
    for (const ranks of suits.values()) {
      if (runPossible(ranks, wilds, runSize)) return true;
    }
    return runPossible(new Set(), wilds, runSize);
  }
  const ranks = new Set(suits.get(card.suit) ?? []);
  ranks.add(RANK_VALUES[card.rank]);
  return runPossible(ranks, wilds, runSize);
}

function runPossible(rankSet, wildCount, runSize) {
  const neededNaturals = Math.ceil(runSize / 2);
  for (let start = 2; start <= 14 - runSize + 1; start += 1) {
    let naturals = 0;
    for (let offset = 0; offset < runSize; offset += 1) {
      if (rankSet.has(start + offset)) {
        naturals += 1;
      }
    }
    if (naturals < neededNaturals) continue;
    if (naturals + wildCount >= runSize) return true;
  }
  return false;
}

function cardHelpsSet(hand, card, size) {
  const neededNaturals = Math.ceil(size / 2);
  const counts = countRanks(hand);
  if (isWild(card)) {
    for (const count of counts.values()) {
      if (count >= neededNaturals) return true;
    }
    return false;
  }
  const current = counts.get(card.rank) ?? 0;
  return current + 1 >= neededNaturals;
}

function cardSupportsRound(game, playerIndex, card) {
  const round = game.currentRound();
  if (!round) return false;
  const hand = game.players[playerIndex].hand;
  for (const req of round.requirements) {
    if (req.type === "set") {
      if (cardHelpsSet(hand, card, req.size)) return true;
    } else if (req.type === "run") {
      if (canFormRunWith(hand, card, req.size)) return true;
    }
  }
  return false;
}

function cardCompletesSet(hand, card, size) {
  if (isWild(card)) return false;
  const counts = countRanks(hand);
  const neededNaturals = Math.ceil(size / 2);
  const current = counts.get(card.rank) ?? 0;
  return current + 1 >= size && current + 1 >= neededNaturals;
}

function cardCompletesRun(hand, card, size) {
  if (isWild(card)) return false;
  const suits = countSuitRanks(hand);
  const ranks = new Set(suits.get(card.suit) ?? []);
  ranks.add(RANK_VALUES[card.rank]);
  const wilds = hand.filter(isWild).length;
  const neededNaturals = Math.ceil(size / 2);
  for (let start = 2; start <= 14 - size + 1; start += 1) {
    let naturals = 0;
    for (let offset = 0; offset < size; offset += 1) {
      if (ranks.has(start + offset)) {
        naturals += 1;
      }
    }
    if (naturals < neededNaturals) continue;
    if (naturals + wilds >= size && naturals >= neededNaturals) return true;
  }
  return false;
}

function cardCompletesRound(game, playerIndex, card) {
  const round = game.currentRound();
  if (!round) return false;
  const hand = game.players[playerIndex].hand;
  return canLayDownWithCard(hand, card, round.requirements);
}

function bestRunSuitForRound(game, playerIndex) {
  const round = game.currentRound();
  if (!round) return null;
  const runReq = round.requirements.find((req) => req.type === "run");
  if (!runReq) return null;
  const hand = game.players[playerIndex].hand;
  const suitRanks = countSuitRanks(hand);
  const wilds = hand.filter(isWild).length;
  let bestSuit = null;
  let bestScore = -1;
  for (const [suit, ranks] of suitRanks.entries()) {
    let score = 0;
    for (let start = 2; start <= 14 - runReq.size + 1; start += 1) {
      let naturals = 0;
      for (let offset = 0; offset < runReq.size; offset += 1) {
        if (ranks.has(start + offset)) naturals += 1;
      }
      if (naturals === 0) continue;
      const canComplete = naturals + wilds >= runReq.size;
      score = Math.max(score, (canComplete ? 2 : 1) * naturals);
    }
    if (score > bestScore) {
      bestScore = score;
      bestSuit = suit;
    }
  }
  return bestSuit;
}

function keepCardsForRound(game, playerIndex) {
  const round = game.currentRound();
  const hand = game.players[playerIndex].hand;
  const keep = new Set();
  if (!round) return keep;
  const counts = countRanks(hand);
  const suitRanks = countSuitRanks(hand);
  const wilds = hand.filter(isWild).length;

  for (const req of round.requirements) {
    if (req.type === "set") {
      const neededNaturals = Math.ceil(req.size / 2);
      for (const card of hand) {
        if (isWild(card)) {
          keep.add(card.cid);
          continue;
        }
        const count = counts.get(card.rank) ?? 0;
        if (count >= neededNaturals - 1) {
          keep.add(card.cid);
        }
      }
    } else if (req.type === "run") {
      for (const card of hand) {
        if (isWild(card)) {
          keep.add(card.cid);
          continue;
        }
        const ranks = new Set(suitRanks.get(card.suit) ?? []);
        ranks.add(RANK_VALUES[card.rank]);
        if (runPossible(ranks, wilds, req.size)) {
          keep.add(card.cid);
        }
      }
    }
  }
  return keep;
}

export function chooseDrawSource(game, playerIndex) {
  const topDiscard = game.discardPile[game.discardPile.length - 1];
  if (!topDiscard) return "deck";
  const player = game.players[playerIndex];
  const isWildDiscard = topDiscard.rank === "2" || topDiscard.rank === JokerRank;
  const desperation = player.aiNoProgressTurns >= 6;
  const bestRunSuit = bestRunSuitForRound(game, playerIndex);
  if (player.hasLaidDown) {
    return game.canLayOffCard(topDiscard) ? "discard" : "deck";
  }
  if (isWildDiscard) return "discard";

  const completesRound = cardCompletesRound(game, playerIndex, topDiscard);
  const supportsRound = cardSupportsRound(game, playerIndex, topDiscard);
  const supportsRunSuit =
    bestRunSuit && topDiscard.suit === bestRunSuit && supportsRound;
  if (
    (player.lastDiscardedId === topDiscard.cid ||
      player.lastDiscardedRank === topDiscard.rank) &&
    !completesRound
  ) {
    return "deck";
  }

  if (completesRound) return "discard";
  if (desperation) return "deck";
  return supportsRunSuit || supportsRound ? "discard" : "deck";
}

export function chooseDiscard(hand, avoidRanks, keepRanks, keepCards, forbiddenIds = new Set()) {
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
      (card) =>
        !protectedRanks.has(card.rank) &&
        !avoidRanks.has(card.rank) &&
        !keepRanks.has(card.rank) &&
        !(keepCards && keepCards.has(card.cid)) &&
        !forbiddenIds.has(card.cid),
    );
    if (candidates.length === 0) {
      candidates = nonWild.filter(
        (card) =>
          !protectedRanks.has(card.rank) &&
          !keepRanks.has(card.rank) &&
          !(keepCards && keepCards.has(card.cid)) &&
          !forbiddenIds.has(card.cid),
      );
    }
    if (candidates.length === 0 && forbiddenIds.size > 0) {
      candidates = nonWild.filter(
        (card) =>
          !protectedRanks.has(card.rank) &&
          !avoidRanks.has(card.rank) &&
          !keepRanks.has(card.rank) &&
          !(keepCards && keepCards.has(card.cid)),
      );
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
  const startingHandSize = player.hand.length;
  const drawChoice = chooseDrawSource(game, playerIndex);
  const drawn = drawChoice === "discard" ? game.drawFromDiscard(player) : game.drawFromStock(player);

  const log = [];
  if (drawn) {
    log.push(`Drew ${drawChoice} (${drawn.rank}${drawn.suit}).`);
  } else {
    log.push(`Tried to draw from ${drawChoice}, but pile was empty.`);
  }

  if (!player.hasLaidDown) {
    const staged = game.autoStageMelds(player);
    if (staged && game.tryLayDownStaged(player)) {
      const summary = formatRequirements(game.currentRound().requirements);
      log.push(`Laid down ${summary}.`);
    }
  }

  let moved = game.layOffAll(player);
  if (moved > 0) {
    log.push(`Laid off ${moved} card${moved === 1 ? "" : "s"}.`);
  }

  if (
    drawChoice === "discard" &&
    drawn &&
    drawn.isWild &&
    drawn.isWild() &&
    player.hasLaidDown &&
    player.hand.some((card) => card.cid === drawn.cid) &&
    game.canLayOffCard(drawn)
  ) {
    const allMelds = game.players.flatMap((p) => p.melds);
    const target = allMelds.find((meld) => meld.canAdd(drawn));
    if (target && game.layOffCardToMeld(player, drawn, target)) {
      moved += 1;
      log.push("Laid off 1 card.");
    }
  }

  const progress =
    player.hasLaidDown ||
    moved > 0 ||
    player.hand.length < startingHandSize;
  if (progress) {
    player.aiNoProgressTurns = 0;
  } else {
    player.aiNoProgressTurns += 1;
  }

  if (game.checkWin(player)) {
    return { log, drewCard: drawn, drawChoice, discarded: null };
  }

  const avoidRanks = game.opponentMeldRanks(playerIndex);
  const keepRanks = game.meldRanksFor(playerIndex);
  const bestRunSuit = bestRunSuitForRound(game, playerIndex);
  const keepCards = keepCardsForRound(game, playerIndex);
  if (bestRunSuit) {
    for (const card of player.hand) {
      if (!card.isWild() && card.suit === bestRunSuit) {
        keepCards.add(card.cid);
      }
    }
  }
  const forbiddenIds = new Set();
  if (drawChoice === "discard" && drawn) {
    forbiddenIds.add(drawn.cid);
  }
  let discard = null;
  if (
    drawChoice === "discard" &&
    drawn &&
    startingHandSize === 1 &&
    player.hand.some((card) => card.cid === drawn.cid)
  ) {
    // If the drawn discard wasn't melded, drop it instead of the original card.
    if (drawn.isWild() && player.hasLaidDown && game.canLayOffCard(drawn)) {
      discard = player.hand.find((card) => card.cid !== drawn.cid) ?? drawn;
    } else {
      discard = drawn;
    }
  } else {
    discard = chooseDiscard(player.hand, avoidRanks, keepRanks, keepCards, forbiddenIds);
  }
  if (discard && forbiddenIds.has(discard.cid)) {
    const nonWild = player.hand.filter((card) => !card.isWild());
    const altNonWild = nonWild.filter((card) => !forbiddenIds.has(card.cid));
    if (altNonWild.length > 0) {
      const altHand = [...altNonWild, ...player.hand.filter((card) => card.isWild())];
      discard = chooseDiscard(altHand, avoidRanks, keepRanks, keepCards, new Set());
    }
  }
  if (discard) {
    game.discard(player, discard);
    log.push(`Discarded ${discard.rank}${discard.suit}.`);
  }

  return { log, drewCard: drawn, drawChoice, discarded: discard };
}
