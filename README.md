# Chinese Rummy (Web)

Web prototype for a Chinese Rummy card game.

## Setup and Run

Install Node (18+), then start the dev server:

```bash
npm run dev
```

Open `http://localhost:8000` in a browser.

## Deck Rules (Chinese Rummy)

- 2 players = 1 deck
- 3-4 players = 2 decks
- 5-6 players = 3 decks
- 7-8 players = 4 decks
- 9-10 players = 5 decks
- 2s and jokers are wild

## Scoring

- Round winner (goes out): 0 points
- Other player: sum of remaining hand
- Card values: 3-9 = 5 points, 10-A = 10 points, wilds (2s/Jokers) = 20 points
- Scores carry across rounds

## Rules

See `docs/rules.md` for detailed gameplay rules and AI behavior notes.

## Controls (Web)

- Double-click draw pile or discard pile to draw.
- Double-click a card in your hand to discard it.
- Use the Lay Down / Lay Off buttons for meld actions.
- Drag cards onto the discard pile to discard.
- Drag a card onto a meld (Lay Off mode) to place it.
