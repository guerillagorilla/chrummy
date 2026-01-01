"""Core game logic for Chinese Rummy mini-game 1."""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from itertools import combinations, count

SUITS = ["♠", "♥", "♦", "♣"]
RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]
JOKER = "🃏"


def num_decks_for_players(players: int) -> int:
    if players <= 0:
        raise ValueError("Players must be >= 1")
    if players <= 2:
        return 1
    if players <= 4:
        return 2
    if players <= 6:
        return 3
    if players <= 8:
        return 4
    if players <= 10:
        return 5
    raise ValueError("Max 10 players supported")


_id_counter = count(1)


@dataclass(frozen=True)
class Card:
    rank: str
    suit: str
    cid: int = field(default_factory=lambda: next(_id_counter))

    def short(self) -> str:
        return f"{self.rank}{self.suit}"

    def is_wild(self) -> bool:
        return self.rank == "2" or self.rank == JOKER

    def is_joker(self) -> bool:
        return self.rank == JOKER

    def is_red(self) -> bool:
        return self.suit in {"♥", "♦"}


class Deck:
    def __init__(self, players: int = 2, jokers_per_deck: int = 2) -> None:
        decks = num_decks_for_players(players)
        cards: list[Card] = []
        for _ in range(decks):
            cards.extend(Card(rank, suit) for suit in SUITS for rank in RANKS)
            cards.extend(Card(JOKER, JOKER) for _ in range(jokers_per_deck))
        self.cards = cards

    def shuffle(self) -> None:
        random.shuffle(self.cards)

    def deal(self, n: int) -> list[Card]:
        if n < 0 or n > len(self.cards):
            raise ValueError("Invalid deal size")
        hand, self.cards = self.cards[:n], self.cards[n:]
        return hand


@dataclass
class Meld:
    rank: str
    cards: list[Card]

    def can_add(self, card: Card) -> bool:
        return card.is_wild() or card.rank == self.rank

    def add(self, card: Card) -> None:
        self.cards.append(card)


@dataclass
class Player:
    name: str
    hand: list[Card] = field(default_factory=list)
    melds: list[Meld] = field(default_factory=list)
    has_laid_down: bool = False
    total_score: int = 0


def _meld_candidates(hand: list[Card]) -> list[tuple[list[Card], str]]:
    candidates: list[tuple[list[Card], str]] = []
    for trio in combinations(hand, 3):
        wilds = [c for c in trio if c.is_wild()]
        naturals = [c for c in trio if not c.is_wild()]
        if len(naturals) < 2:
            continue
        ranks = {c.rank for c in naturals}
        if len(ranks) != 1:
            continue
        if len(wilds) > 1:
            continue
        rank = next(iter(ranks))
        candidates.append((list(trio), rank))
    return candidates


def find_two_melds(hand: list[Card]) -> list[Meld] | None:
    candidates = _meld_candidates(hand)
    for first_cards, first_rank in candidates:
        first_ids = {c.cid for c in first_cards}
        for second_cards, second_rank in candidates:
            second_ids = {c.cid for c in second_cards}
            if first_ids.isdisjoint(second_ids):
                return [
                    Meld(rank=first_rank, cards=first_cards),
                    Meld(rank=second_rank, cards=second_cards),
                ]
    return None


class Game:
    def __init__(self, players: int = 2, dealer_index: int = 0) -> None:
        if players != 2:
            raise ValueError("Prototype supports 2 players only.")
        self.players: list[Player] = [Player(name="You"), Player(name="Opponent")]
        self.dealer_index = dealer_index
        self.current_player_index = 0
        self.draw_pile: list[Card] = []
        self.discard_pile: list[Card] = []
        self.players_count = players
        self.start_round()

    def start_round(self) -> None:
        deck = Deck(players=self.players_count)
        deck.shuffle()

        for player in self.players:
            player.hand.clear()
            player.melds.clear()
            player.has_laid_down = False

        order = list(range(len(self.players)))
        start = (self.dealer_index + 1) % len(self.players)
        order = order[start:] + order[:start]

        for _ in range(7):
            for idx in order:
                self.players[idx].hand.extend(deck.deal(1))

        self.draw_pile = deck.cards[:]
        self.discard_pile = []
        if self.draw_pile:
            self.discard_pile.append(self.draw_pile.pop(0))
        self.current_player_index = start

    def hand_points(self, hand: list[Card]) -> int:
        total = 0
        for card in hand:
            if card.is_wild():
                total += 20
            elif card.rank in {"10", "J", "Q", "K", "A"}:
                total += 10
            else:
                total += 5
        return total

    def apply_round_scores(self, winner_index: int) -> list[int]:
        round_scores: list[int] = []
        for idx, player in enumerate(self.players):
            if idx == winner_index:
                round_score = 0
            else:
                round_score = self.hand_points(player.hand)
            player.total_score += round_score
            round_scores.append(round_score)
        return round_scores

    def current_player(self) -> Player:
        return self.players[self.current_player_index]

    def other_player(self) -> Player:
        return self.players[(self.current_player_index + 1) % len(self.players)]

    def draw_from_discard(self, player: Player) -> Card | None:
        if not self.discard_pile:
            return None
        card = self.discard_pile.pop()
        player.hand.append(card)
        return card

    def draw_from_stock(self, player: Player) -> Card | None:
        if not self.draw_pile:
            self._reshuffle_non_hand_cards()
        if not self.draw_pile:
            return None
        card = self.draw_pile.pop(0)
        player.hand.append(card)
        return card

    def discard(self, player: Player, card: Card) -> None:
        player.hand = [c for c in player.hand if c.cid != card.cid]
        self.discard_pile.append(card)

    def try_lay_down(self, player: Player) -> bool:
        if player.has_laid_down:
            return False
        melds = find_two_melds(player.hand)
        if not melds:
            return False
        for meld in melds:
            for card in meld.cards:
                player.hand = [c for c in player.hand if c.cid != card.cid]
            player.melds.append(meld)
        player.has_laid_down = True
        return True

    def lay_off_all(self, player: Player) -> int:
        if not player.has_laid_down and not player.melds:
            return 0
        all_melds: list[Meld] = []
        for p in self.players:
            all_melds.extend(p.melds)
        if not all_melds:
            return 0
        moved = 0
        hand_sorted = sorted(player.hand, key=lambda c: c.is_wild())
        for card in list(hand_sorted):
            if len(player.hand) <= 1:
                break
            for meld in all_melds:
                if meld.can_add(card):
                    meld.add(card)
                    player.hand = [c for c in player.hand if c.cid != card.cid]
                    moved += 1
                    break
        return moved

    def lay_off_card_to_meld(self, player: Player, card: Card, meld: Meld) -> bool:
        if card not in player.hand:
            return False
        if meld not in [m for p in self.players for m in p.melds]:
            return False
        if not meld.can_add(card):
            return False
        meld.add(card)
        player.hand = [c for c in player.hand if c.cid != card.cid]
        return True

    def can_lay_off(self, player: Player) -> bool:
        all_melds: list[Meld] = []
        for p in self.players:
            all_melds.extend(p.melds)
        if not all_melds:
            return False
        if len(player.hand) <= 1:
            return False
        for card in player.hand:
            for meld in all_melds:
                if meld.can_add(card):
                    return True
        return False

    def can_lay_off_card(self, card: Card) -> bool:
        for p in self.players:
            for meld in p.melds:
                if meld.can_add(card):
                    return True
        return False

    def meld_ranks_for(self, player_index: int) -> set[str]:
        ranks: set[str] = set()
        for meld in self.players[player_index].melds:
            ranks.add(meld.rank)
        return ranks

    def opponent_meld_ranks(self, player_index: int) -> set[str]:
        ranks: set[str] = set()
        for idx, player in enumerate(self.players):
            if idx == player_index:
                continue
            for meld in player.melds:
                ranks.add(meld.rank)
        return ranks

    def check_win_after_discard(self, player: Player) -> bool:
        return len(player.hand) == 0

    def _reshuffle_non_hand_cards(self) -> None:
        pool: list[Card] = []
        for player in self.players:
            for meld in player.melds:
                pool.extend(meld.cards)
            player.melds.clear()
            player.has_laid_down = False
        pool.extend(self.discard_pile)
        self.discard_pile = []
        random.shuffle(pool)
        self.draw_pile = pool
        if self.draw_pile:
            self.discard_pile.append(self.draw_pile.pop(0))


def ai_choose_discard(
    hand: list[Card],
    can_lay_down: bool,
    can_lay_off: bool,
    avoid_ranks: set[str],
    keep_ranks: set[str],
) -> Card:
    # Point-aware but conservative: avoid discarding wilds unless forced.
    non_wild = [c for c in hand if not c.is_wild()]
    if non_wild:
        counts: dict[str, int] = {}
        for card in non_wild:
            counts[card.rank] = counts.get(card.rank, 0) + 1
        # Protect any card that would complete a pair to a trip.
        protected = {c.rank for c in non_wild if counts[c.rank] >= 2}
        candidates = [
            c
            for c in non_wild
            if c.rank not in protected and c.rank not in avoid_ranks and c.rank not in keep_ranks
        ]
        if not candidates:
            candidates = [c for c in non_wild if c.rank not in protected and c.rank not in keep_ranks]
        if not candidates:
            candidates = non_wild

        # Prefer singletons first, then lower counts; within that, drop higher point cards.
        def card_points(c: Card) -> int:
            if c.rank in {"10", "J", "Q", "K", "A"}:
                return 10
            return 5

        candidates.sort(key=lambda c: (counts[c.rank], -card_points(c), c.rank))
        return candidates[0]
    # If all wild (rare), discard the first.
    return hand[0]
