# Chinese Rummy (Python)

Prototype for a Chinese Rummy card game.

## Setup

1) Create and activate a virtual environment (example):

```bash
python -m venv .venv
source .venv/bin/activate
```

2) Install dependencies:

```bash
python -m pip install -r requirements.txt
```

## Run

Pygame mini-game:

```bash
python pygame_viewer.py
```

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

See `rules.md` for detailed gameplay rules and AI behavior notes.

## Controls (Pygame)

- D: draw from deck
- F: draw from discard
- L: lay down two 3-of-a-kinds (if available)
- O: lay off cards (click a hand card, then a meld)
- 1-9: discard the selected card
- R: restart round
- Esc or window close: quit
