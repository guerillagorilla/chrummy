const SUITS = ["spades", "hearts", "diamonds", "clubs"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const JOKER = "JOKER";
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

export const ROUNDS = [
  {
    handSize: 7,
    requirements: [
      { type: "set", size: 3 },
      { type: "set", size: 3 },
    ],
  },
  {
    handSize: 8,
    requirements: [
      { type: "set", size: 3 },
      { type: "run", size: 4 },
    ],
  },
  {
    handSize: 9,
    requirements: [
      { type: "run", size: 4 },
      { type: "run", size: 4 },
    ],
  },
  {
    handSize: 10,
    requirements: [
      { type: "set", size: 4 },
      { type: "set", size: 5 },
    ],
  },
  {
    handSize: 11,
    requirements: [
      { type: "run", size: 7 },
      { type: "set", size: 3 },
    ],
  },
  {
    handSize: 12,
    requirements: [
      { type: "set", size: 3 },
      { type: "set", size: 3 },
      { type: "run", size: 4 },
    ],
  },
  {
    handSize: 12,
    requirements: [
      { type: "run", size: 4 },
      { type: "run", size: 4 },
      { type: "set", size: 3 },
    ],
  },
];

function joinWithAnd(parts) {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export function formatRequirements(requirements = []) {
  const groups = [];
  for (const req of requirements) {
    const key = `${req.type}:${req.size}`;
    const existing = groups.find((group) => group.key === key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.push({ key, req, count: 1 });
    }
  }
  const parts = groups.map(({ req, count }) => {
    const isSet = req.type === "set";
    const label = isSet ? `${req.size}-of-a-kind` : `${req.size}-card straight flush`;
    if (count === 1) return label;
    const plural = isSet ? "s" : "es";
    return `${count} ${label}${plural}`;
  });
  return joinWithAnd(parts);
}

let nextId = 1;

export class Card {
  constructor(rank, suit) {
    this.rank = rank;
    this.suit = suit;
    this.cid = nextId++;
  }

  short() {
    return `${this.rank}${this.suit}`;
  }

  isWild() {
    return this.rank === "2" || this.rank === JOKER;
  }

  isJoker() {
    return this.rank === JOKER;
  }

  isRed() {
    return this.suit === "hearts" || this.suit === "diamonds";
  }
}

export class Meld {
  constructor({ type, rank = null, suit = null, cards }) {
    this.type = type;
    this.rank = rank;
    this.suit = suit;
    this.cards = cards;
  }

  canAdd(card) {
    if (this.type === "run") {
      return canFormRun([...this.cards, card], false);
    }
    return canFormSet([...this.cards, card], false);
  }

  add(card) {
    this.cards.push(card);
    if (this.type === "run") {
      this.cards = getSortedMeldCards(this);
    }
  }
}

export class Player {
  constructor(name) {
    this.name = name;
    this.hand = [];
    this.melds = [];
    this.stagedMelds = [];
    this.hasLaidDown = false;
    this.totalScore = 0;
    this.lastDiscardedRank = null;
    this.lastDiscardedId = null;
    this.aiNoProgressTurns = 0;
    this.strategyFlags = new Set();
  }
}

function numDecksForPlayers(players) {
  if (players <= 0) {
    throw new Error("Players must be >= 1");
  }
  if (players <= 2) return 1;
  if (players <= 4) return 2;
  if (players <= 6) return 3;
  if (players <= 8) return 4;
  if (players <= 10) return 5;
  throw new Error("Max 10 players supported");
}

export class Deck {
  constructor(players = 2, jokersPerDeck = 2) {
    const decks = numDecksForPlayers(players);
    this.cards = [];
    for (let d = 0; d < decks; d += 1) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          this.cards.push(new Card(rank, suit));
        }
      }
      for (let j = 0; j < jokersPerDeck; j += 1) {
        this.cards.push(new Card(JOKER, "joker"));
      }
    }
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  deal(count) {
    if (count < 0 || count > this.cards.length) {
      throw new Error("Invalid deal size");
    }
    const hand = this.cards.slice(0, count);
    this.cards = this.cards.slice(count);
    return hand;
  }
}

function combinations(items, size) {
  const results = [];
  const combo = [];
  function backtrack(start, remaining) {
    if (remaining === 0) {
      results.push([...combo]);
      return;
    }
    for (let i = start; i <= items.length - remaining; i += 1) {
      combo.push(items[i]);
      backtrack(i + 1, remaining - 1);
      combo.pop();
    }
  }
  backtrack(0, size);
  return results;
}

function canFormSet(cards, requireHalfNatural) {
  const naturals = cards.filter((card) => !card.isWild());
  if (requireHalfNatural && naturals.length < Math.ceil(cards.length / 2)) return false;
  if (naturals.length === 0) return !requireHalfNatural;
  const rank = naturals[0].rank;
  return naturals.every((card) => card.rank === rank);
}

function canFormRun(cards, requireHalfNatural) {
  const naturals = cards.filter((card) => !card.isWild());
  if (requireHalfNatural && naturals.length < Math.ceil(cards.length / 2)) return false;
  let suit = null;
  const naturalValues = [];
  let hasAce = false;
  for (const card of naturals) {
    if (suit && card.suit !== suit) return false;
    suit = card.suit;
    naturalValues.push(RANK_VALUES[card.rank]);
    if (card.rank === "A") hasAce = true;
  }
  const naturalSet = new Set(naturalValues);
  if (naturalSet.size !== naturalValues.length) return false;
  if (naturals.length === 0) return true;
  const size = cards.length;
  const canFitRun = (values, allowAceLow) => {
    const startMin = allowAceLow ? 1 : 2;
    for (let start = startMin; start <= 14 - size + 1; start += 1) {
      const needed = new Set();
      for (let offset = 0; offset < size; offset += 1) {
        needed.add(start + offset);
      }
      if (values.every((value) => needed.has(value))) {
        return true;
      }
    }
    return false;
  };

  if (canFitRun(naturalValues, false)) return true;
  if (!hasAce) return false;
  const lowValues = naturalValues.map((value) => (value === 14 ? 1 : value));
  const lowSet = new Set(lowValues);
  if (lowSet.size !== lowValues.length) return false;
  return canFitRun(lowValues, true);
}

function makeMeld(requirement, cards) {
  if (requirement.type === "set") {
    const natural = cards.find((card) => !card.isWild());
    return new Meld({
      type: "set",
      rank: natural ? natural.rank : null,
      cards: [...cards],
    });
  }
  const natural = cards.find((card) => !card.isWild());
  return new Meld({
    type: "run",
    suit: natural ? natural.suit : null,
    cards: [...cards],
  });
}

function findMeldOptions(hand, requirement, maxSize = hand.length) {
  const options = [];
  const startSize = requirement.size;
  const endSize = Math.max(startSize, Math.min(maxSize, hand.length));
  for (let size = endSize; size >= startSize; size -= 1) {
    for (const combo of combinations(hand, size)) {
      if (requirement.type === "set" && canFormSet(combo, true)) {
        options.push(makeMeld(requirement, combo));
      }
      if (requirement.type === "run" && canFormRun(combo, true)) {
        options.push(makeMeld(requirement, combo));
      }
    }
  }
  return options;
}

function findMeldsForRequirements(hand, requirements, { useAll = false } = {}) {
  const options = requirements.map((req) => findMeldOptions(hand, req));
  const used = new Set();

  function backtrack(reqIndex) {
    if (reqIndex === requirements.length) {
      if (useAll && used.size !== hand.length) return null;
      return [];
    }
    for (const meld of options[reqIndex]) {
      const meldIds = meld.cards.map((card) => card.cid);
      if (meldIds.some((cid) => used.has(cid))) continue;
      meldIds.forEach((cid) => used.add(cid));
      const rest = backtrack(reqIndex + 1);
      if (rest) return [meld, ...rest];
      meldIds.forEach((cid) => used.delete(cid));
    }
    return null;
  }

  return backtrack(0);
}

export function findTwoMelds(hand) {
  return findMeldsForRequirements(hand, ROUNDS[0].requirements);
}

export function canLayDownWithCards(hand, requirements) {
  return Boolean(findMeldsForRequirements(hand, requirements));
}

export function canLayDownWithCard(hand, card, requirements) {
  return Boolean(findMeldsForRequirements([...hand, card], requirements));
}

export class Game {
  constructor(players = 2, dealerIndex = 0) {
    if (players < 2 || players > 10) {
      throw new Error("Players must be between 2 and 10.");
    }
    this.players = Array.from({ length: players }, (_, idx) => new Player(`Player ${idx + 1}`));
    this.dealerIndex = dealerIndex;
    this.currentPlayerIndex = 0;
    this.drawPile = [];
    this.discardPile = [];
    this.deadPile = [];
    this.playersCount = players;
    this.roundIndex = 0;
    this.startRound();
  }

  startRound() {
    const deck = new Deck(this.playersCount);
    deck.shuffle();

    for (const player of this.players) {
      player.hand = [];
      player.melds = [];
      player.stagedMelds = [];
      player.hasLaidDown = false;
      player.aiNoProgressTurns = 0;
    }
    this.deadPile = [];

    const order = [...Array(this.players.length).keys()];
    const start = (this.dealerIndex + 1) % this.players.length;
    const dealOrder = order.slice(start).concat(order.slice(0, start));

    const currentRound = this.currentRound();
    for (let round = 0; round < currentRound.handSize; round += 1) {
      for (const idx of dealOrder) {
        this.players[idx].hand.push(...deck.deal(1));
      }
    }

    this.drawPile = [...deck.cards];
    this.discardPile = [];
    if (this.drawPile.length > 0) {
      this.discardPile.push(this.drawPile.shift());
    }
    this.currentPlayerIndex = start;
  }

  currentRound() {
    return ROUNDS[this.roundIndex] ?? ROUNDS[0];
  }

  nextRound() {
    if (this.roundIndex < ROUNDS.length - 1) {
      this.roundIndex += 1;
    }
    this.startRound();
  }

  currentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  otherPlayer() {
    return this.players[(this.currentPlayerIndex + 1) % this.players.length];
  }

  drawFromDiscard(player) {
    if (this.discardPile.length === 0) return null;
    const card = this.discardPile.pop();
    player.hand.push(card);
    return card;
  }

  drawFromStock(player) {
    if (this.drawPile.length === 0) {
      this.reshuffleNonHandCards();
    }
    if (this.drawPile.length === 0) return null;
    const card = this.drawPile.shift();
    player.hand.push(card);
    return card;
  }

  discard(player, card) {
    player.hand = player.hand.filter((c) => c.cid !== card.cid);
    player.lastDiscardedRank = card.rank;
    player.lastDiscardedId = card.cid;
    if (this.discardPile.length > 0) {
      this.deadPile.push(...this.discardPile);
      this.discardPile = [];
    }
    this.discardPile.push(card);
  }

  tryLayDown(player) {
    if (player.hasLaidDown) return false;
    const melds = findMeldsForRequirements(player.hand, this.currentRound().requirements);
    if (!melds) return false;
    for (const meld of melds) {
      for (const card of meld.cards) {
        player.hand = player.hand.filter((c) => c.cid !== card.cid);
      }
      player.melds.push(meld);
    }
    player.hasLaidDown = true;
    return true;
  }

  tryLayDownWithCards(player, cards) {
    if (player.hasLaidDown) return false;
    const requirements = this.currentRound().requirements;
    const handIds = new Set(player.hand.map((card) => card.cid));
    if (!cards.every((card) => handIds.has(card.cid))) return false;
    const melds = findMeldsForRequirements(cards, requirements, { useAll: true });
    if (!melds) return false;
    for (const meld of melds) {
      for (const card of meld.cards) {
        player.hand = player.hand.filter((c) => c.cid !== card.cid);
      }
      player.melds.push(meld);
    }
    player.hasLaidDown = true;
    return true;
  }

  stageCard(player, card, meldIndex = null) {
    const handHasCard = player.hand.some((c) => c.cid === card.cid);
    if (!handHasCard) return false;
    player.hand = player.hand.filter((c) => c.cid !== card.cid);
    if (meldIndex !== null && player.stagedMelds[meldIndex]) {
      player.stagedMelds[meldIndex].cards.push(card);
      return true;
    }
    player.stagedMelds.push({ cards: [card], staged: true });
    return true;
  }

  unstageCard(player, card) {
    for (let i = 0; i < player.stagedMelds.length; i += 1) {
      const meld = player.stagedMelds[i];
      const idx = meld.cards.findIndex((c) => c.cid === card.cid);
      if (idx === -1) continue;
      meld.cards.splice(idx, 1);
      if (meld.cards.length === 0) {
        player.stagedMelds.splice(i, 1);
      }
      player.hand.push(card);
      return true;
    }
    return false;
  }

  clearStaged(player) {
    for (const meld of player.stagedMelds) {
      player.hand.push(...meld.cards);
    }
    player.stagedMelds = [];
  }

  tryLayDownStaged(player) {
    if (player.hasLaidDown) return false;
    const stagedMelds = player.stagedMelds;
    const requirements = this.currentRound().requirements;
    if (stagedMelds.length !== requirements.length) {
      this.clearStaged(player);
      return false;
    }

    const used = new Set();
    const assignment = [];

    function matchesRequirement(meld, req) {
      if (meld.cards.length < req.size) return false;
      if (req.type === "set") return canFormSet(meld.cards, true);
      return canFormRun(meld.cards, true);
    }

    function backtrack(reqIndex) {
      if (reqIndex === requirements.length) return true;
      for (let i = 0; i < stagedMelds.length; i += 1) {
        if (used.has(i)) continue;
        const requirement = requirements[reqIndex];
        if (!matchesRequirement(stagedMelds[i], requirement)) continue;
        used.add(i);
        assignment.push({ meld: stagedMelds[i], requirement });
        if (backtrack(reqIndex + 1)) return true;
        assignment.pop();
        used.delete(i);
      }
      return false;
    }

    if (!backtrack(0)) {
      this.clearStaged(player);
      return false;
    }

    for (const { meld, requirement } of assignment) {
      const committed = makeMeld({ type: requirement.type }, meld.cards);
      player.melds.push(committed);
    }
    player.stagedMelds = [];
    player.hasLaidDown = true;
    return true;
  }

  autoStageMelds(player) {
    if (player.hasLaidDown) return false;
    this.clearStaged(player);
    const melds = findMeldsForRequirements(player.hand, this.currentRound().requirements);
    if (!melds) return false;
    for (const meld of melds) {
      for (const card of meld.cards) {
        player.hand = player.hand.filter((c) => c.cid !== card.cid);
      }
      player.stagedMelds.push({
        type: meld.type,
        rank: meld.rank ?? null,
        suit: meld.suit ?? null,
        cards: [...meld.cards],
        staged: true,
      });
    }
    return true;
  }

  layOffAll(player) {
    if (!player.hasLaidDown) return 0;
    const allMelds = this.players.flatMap((p) => p.melds);
    if (allMelds.length === 0) return 0;
    let moved = 0;
    const handSorted = [...player.hand].sort((a, b) => Number(a.isWild()) - Number(b.isWild()));
    for (const card of handSorted) {
      if (player.hand.length <= 1) break;
      for (const meld of allMelds) {
        if (meld.canAdd(card)) {
          meld.add(card);
          player.hand = player.hand.filter((c) => c.cid !== card.cid);
          moved += 1;
          break;
        }
      }
    }
    return moved;
  }

  layOffCardToMeld(player, card, meld) {
    const playerHasCard = player.hand.some((c) => c.cid === card.cid);
    const melds = this.players.flatMap((p) => p.melds);
    if (!playerHasCard) return false;
    if (!player.hasLaidDown) return false;
    if (!melds.includes(meld)) return false;
    if (!meld.canAdd(card)) return false;
    meld.add(card);
    player.hand = player.hand.filter((c) => c.cid !== card.cid);
    return true;
  }

  canLayOff(player) {
    if (!player.hasLaidDown) return false;
    const allMelds = this.players.flatMap((p) => p.melds);
    if (allMelds.length === 0) return false;
    if (player.hand.length <= 1) return false;
    return player.hand.some((card) => allMelds.some((meld) => meld.canAdd(card)));
  }

  canLayOffCard(card) {
    return this.players.some((player) => player.melds.some((meld) => meld.canAdd(card)));
  }

  meldRanksFor(playerIndex) {
    const ranks = new Set();
    for (const meld of this.players[playerIndex].melds) {
      if (meld.type === "set" && meld.rank) {
        ranks.add(meld.rank);
        continue;
      }
      for (const card of meld.cards) {
        if (!card.isWild()) {
          ranks.add(card.rank);
        }
      }
    }
    return ranks;
  }

  opponentMeldRanks(playerIndex) {
    const ranks = new Set();
    for (let idx = 0; idx < this.players.length; idx += 1) {
      if (idx === playerIndex) continue;
      for (const meld of this.players[idx].melds) {
        if (meld.type === "set" && meld.rank) {
          ranks.add(meld.rank);
          continue;
        }
        for (const card of meld.cards) {
          if (!card.isWild()) {
            ranks.add(card.rank);
          }
        }
      }
    }
    return ranks;
  }

  handPoints(hand) {
    let total = 0;
    for (const card of hand) {
      if (card.isWild()) {
        total += 20;
      } else if (["10", "J", "Q", "K", "A"].includes(card.rank)) {
        total += 10;
      } else {
        total += 5;
      }
    }
    return total;
  }

  applyRoundScores(winnerIndex) {
    const roundScores = [];
    for (let idx = 0; idx < this.players.length; idx += 1) {
      const player = this.players[idx];
      const roundScore = idx === winnerIndex ? 0 : this.handPoints(player.hand);
      player.totalScore += roundScore;
      roundScores.push(roundScore);
    }
    return roundScores;
  }

  checkWinAfterDiscard(player) {
    return player.hand.length === 0;
  }

  checkWin(player) {
    return player.hand.length === 0;
  }

  reshuffleNonHandCards() {
    const pool = [];
    const topDiscard = this.discardPile.length > 0 ? this.discardPile[this.discardPile.length - 1] : null;
    if (this.discardPile.length > 1) {
      pool.push(...this.discardPile.slice(0, -1));
    }
    if (this.deadPile.length > 0) {
      pool.push(...this.deadPile);
    }
    this.deadPile = [];
    this.discardPile = topDiscard ? [topDiscard] : [];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.drawPile = pool;
    if (this.discardPile.length === 0 && this.drawPile.length > 0) {
      this.discardPile.push(this.drawPile.shift());
    }
  }
}

export const SuitSymbols = {
  spades: "&spades;",
  hearts: "&hearts;",
  diamonds: "&diams;",
  clubs: "&clubs;",
  joker: "J",
};

export const Ranks = RANKS;
export const JokerRank = JOKER;

/**
 * Returns meld cards sorted by effective rank position.
 * For sets: naturals first, then wilds.
 * For runs: cards sorted by their effective rank in the sequence,
 *           with wilds assigned to fill gaps.
 */
export function getSortedMeldCards(meld) {
  if (!meld || !Array.isArray(meld.cards)) return [];
  if (!meld.type) {
    return [...meld.cards];
  }
  const isWild = (card) => (card?.isWild ? card.isWild() : card?.rank === "2" || card?.rank === JOKER);
  if (meld.type === "set") {
    // Sets: naturals first, then wilds
    const naturals = meld.cards.filter((c) => !isWild(c));
    const wilds = meld.cards.filter((c) => isWild(c));
    return [...naturals, ...wilds];
  }

  // Run: sort by effective position in the straight
  const cards = [...meld.cards];
  const naturals = cards.filter((c) => !isWild(c));
  const wilds = cards.filter((c) => isWild(c));

  if (naturals.length === 0) {
    // All wilds - just return as-is
    return cards;
  }

  // Find the natural card values
  const naturalValues = naturals.map((c) => RANK_VALUES[c.rank]);
  const minNatural = Math.min(...naturalValues);
  const maxNatural = Math.max(...naturalValues);

  // Determine the run range - try to find smallest valid range
  const size = cards.length;
  let runStart = null;
  for (let start = 2; start <= 14 - size + 1; start += 1) {
    const rangeEnd = start + size - 1;
    if (minNatural >= start && maxNatural <= rangeEnd) {
      runStart = start;
      break;
    }
  }

  if (runStart === null) {
    // Shouldn't happen for valid meld, return as-is
    return cards;
  }

  // Build sorted array: assign each position in the run
  const sorted = [];
  const usedNaturals = new Set();
  const wildQueue = [...wilds];

  for (let pos = runStart; pos < runStart + size; pos += 1) {
    const natural = naturals.find(
      (c) => RANK_VALUES[c.rank] === pos && !usedNaturals.has(c.cid)
    );
    if (natural) {
      sorted.push(natural);
      usedNaturals.add(natural.cid);
    } else if (wildQueue.length > 0) {
      sorted.push(wildQueue.shift());
    }
  }

  return sorted;
}
