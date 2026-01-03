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

See `docs/rules.md` for detailed gameplay rules, including the 7-round progression and AI behavior notes.

## Controls (Web)

- Double-click draw pile or discard pile to draw.
- Double-click a card in your hand to discard it.
- Use the Lay Down button for meld actions.
- After laying down, click a card, then a meld to lay off.
- Drag cards onto the discard pile to discard.
- Drag a card onto a meld to place it (after laying down).

## Panel Reference

| Panel | Selector | Description |
|-------|----------|-------------|
| **Top bar** | `.topbar` | Title, message, score, buttons |
| **Message** | `#message` | Status text ("Your turn...") |
| **Score** | `#score` | Score display |
| **Opponent row** | `.opponent-row` | Contains opponent hand + log |
| **Opponent hand** | `#opponent-hand` / `.panel.opponent` | Opponent's cards (face down) |
| **Opponent log** | `#opponent-log` / `.panel.log` | AI action history |
| **Center area** | `.center-area` | Draw/discard piles + melds |
| **Piles** | `.piles-section` | Draw pile + discard pile |
| **Draw pile** | `#draw-pile` | Face-down deck |
| **Discard pile** | `#discard-pile` | Face-up discard |
| **Melds section** | `.melds-section` | Both players' melds |
| **Opponent melds** | `#opponent-melds` | Opponent's laid melds |
| **Your melds** | `#your-melds` | Your laid melds |
| **Your row** | `.your-row` | Your hand area (gets turn glow) |
| **Your hand** | `#your-hand` / `.panel.you` | Your cards |