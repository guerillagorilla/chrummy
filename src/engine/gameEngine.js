const SUITS = ["spades", "hearts", "diamonds", "clubs"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const JOKER = "JOKER";

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
  constructor(rank, cards) {
    this.rank = rank;
    this.cards = cards;
  }

  canAdd(card) {
    return card.isWild() || card.rank === this.rank;
  }

  add(card) {
    this.cards.push(card);
  }
}

export class Player {
  constructor(name) {
    this.name = name;
    this.hand = [];
    this.melds = [];
    this.hasLaidDown = false;
    this.totalScore = 0;
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

function meldCandidates(hand) {
  const candidates = [];
  for (let i = 0; i < hand.length - 2; i += 1) {
    for (let j = i + 1; j < hand.length - 1; j += 1) {
      for (let k = j + 1; k < hand.length; k += 1) {
        const trio = [hand[i], hand[j], hand[k]];
        const wilds = trio.filter((card) => card.isWild());
        const naturals = trio.filter((card) => !card.isWild());
        if (naturals.length < 2) continue;
        const ranks = new Set(naturals.map((card) => card.rank));
        if (ranks.size !== 1) continue;
        if (wilds.length > 1) continue;
        const rank = Array.from(ranks)[0];
        candidates.push({ cards: trio, rank });
      }
    }
  }
  return candidates;
}

export function findTwoMelds(hand) {
  const candidates = meldCandidates(hand);
  for (const first of candidates) {
    const firstIds = new Set(first.cards.map((card) => card.cid));
    for (const second of candidates) {
      const secondIds = new Set(second.cards.map((card) => card.cid));
      const disjoint = [...firstIds].every((cid) => !secondIds.has(cid));
      if (disjoint) {
        return [new Meld(first.rank, [...first.cards]), new Meld(second.rank, [...second.cards])];
      }
    }
  }
  return null;
}

export class Game {
  constructor(players = 2, dealerIndex = 0) {
    if (players !== 2) {
      throw new Error("Prototype supports 2 players only.");
    }
    this.players = [new Player("You"), new Player("Opponent")];
    this.dealerIndex = dealerIndex;
    this.currentPlayerIndex = 0;
    this.drawPile = [];
    this.discardPile = [];
    this.playersCount = players;
    this.startRound();
  }

  startRound() {
    const deck = new Deck(this.playersCount);
    deck.shuffle();

    for (const player of this.players) {
      player.hand = [];
      player.melds = [];
      player.hasLaidDown = false;
    }

    const order = [...Array(this.players.length).keys()];
    const start = (this.dealerIndex + 1) % this.players.length;
    const dealOrder = order.slice(start).concat(order.slice(0, start));

    for (let round = 0; round < 7; round += 1) {
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
    this.discardPile.push(card);
  }

  tryLayDown(player) {
    if (player.hasLaidDown) return false;
    const melds = findTwoMelds(player.hand);
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
      ranks.add(meld.rank);
    }
    return ranks;
  }

  opponentMeldRanks(playerIndex) {
    const ranks = new Set();
    for (let idx = 0; idx < this.players.length; idx += 1) {
      if (idx === playerIndex) continue;
      for (const meld of this.players[idx].melds) {
        ranks.add(meld.rank);
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

  reshuffleNonHandCards() {
    const pool = [];
    for (const player of this.players) {
      for (const meld of player.melds) {
        pool.push(...meld.cards);
      }
      player.melds = [];
      player.hasLaidDown = false;
    }
    pool.push(...this.discardPile);
    this.discardPile = [];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.drawPile = pool;
    if (this.drawPile.length > 0) {
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
