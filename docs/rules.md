# Chinese Rummy — Rules

## Gameplay

- Players: 2 for now.
- Decks: 1 deck + 2 jokers.
- Wilds: 2s and jokers.
- Deal: varies by round (see Rounds & Meld Requirements).
- Setup: remaining cards become the face-down draw stack; top card is turned face-up as the discard.
- Turn order: player to dealer’s left goes first, then clockwise.
- On your turn you must draw first: either the face-up discard or the face-down draw stack.
- After drawing, you may lay down and/or lay off (once you have laid down), then must discard exactly one card to end your turn.
- Win condition: a player wins the round when they reach 0 cards (after lay down/lay off/discard).
- After each round, the next round’s meld requirements apply.
- Only the top discard is ever available. Any card covered by a new discard is dead and cannot be picked up later.

## Melds and Lay Downs

- Required melds change by round (see Rounds & Meld Requirements).
- A valid set is X-of-a-kind (rank matches), and a valid run is a straight flush (same suit, consecutive ranks).
- Each required meld must be at least 50% natural (non-wild).
  - Example valid: 7♣ 7♥ 2♠ (2 is wild).
  - Example invalid: 7♣ 2♥ 🃏 (two wilds in a 3-card meld).

## Lay Offs

- A player may lay off a card onto any existing meld (their own or opponent’s).
- A player may only lay off after they have laid down their required melds.
- Lay offs only happen on your turn.
- After laying down, the 50% natural rule no longer applies to lay offs. Wilds (2s/Jokers) can be added to any meld (yours or an opponent’s) that can accept them.
- If you lay off onto opponent’s meld, the card leaves your hand.

## Rounds & Meld Requirements

Rounds progress in order from 1 through 7.

1. Round 1 — 7 cards: 2x 3-of-a-kind.
2. Round 2 — 8 cards: 1x 3-of-a-kind + 1x 4-card straight flush.
3. Round 3 — 9 cards: 2x 4-card straight flush.
4. Round 4 — 10 cards: 1x 4-of-a-kind + 1x 5-of-a-kind.
5. Round 5 — 11 cards: 1x 7-card straight flush + 1x 3-of-a-kind.
6. Round 6 — 12 cards: 2x 3-of-a-kind + 1x 4-card straight flush.
7. Round 7 — 12 cards: 2x 4-card straight flush + 1x 3-of-a-kind.

## Reshuffle

- If the draw pile runs out, the dealer shuffles all non-hand cards to create a new draw pile.

## Scoring

- Round winner (goes out): 0 points.
- Other player: sum of remaining hand.
- Card values:
  - 3–9 = 5 points
  - 10–A = 10 points
  - Wilds (2s/Jokers) = 20 points
- Scores carry across rounds.

## AI Opponent (Development Heuristics)

### Draw behavior

- Takes discard only if it helps AI or blocks opponent:
  - If discard is wild, take it.
  - If discard matches a rank already in AI’s hand, take it. (Rank = face value: A, 2, 3, …, 10, J, Q, K.)
  - If discard matches a rank in AI’s melds, take it.
  - If discard matches a rank in opponent’s melds, take it (deny).
- Once AI has laid down, it only takes discard if the top card can be laid off immediately.
- Otherwise draws from the deck.

### Lay down / lay off

- After drawing, AI tries to lay down the current round’s required melds (50% natural rule enforced).
- AI then lays off any eligible cards if possible (after laying down).

### Discard behavior

- Never discard wilds unless it has no other choice (all wilds).
- Protect any card that completes a required meld for the current round (even if high-point).
- Avoid discarding ranks that could be laid off onto opponent’s melds.
- Keep cards that can be laid onto AI’s own melds.
- Prefer discarding singletons.
- Among singletons, discard higher-point cards first (10–A before 3–9).

## Known AI Limitations (Development)

- AI does not count probabilities or track long-term card distributions.
- AI does not model hidden information beyond “block opponent meld ranks.”
- AI does not optimize endgame sequencing beyond the heuristics listed above.
