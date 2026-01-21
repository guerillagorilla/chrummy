# Chrummy Llama AI Integration

This document describes how to connect an LLM (like Llama via Ollama) to play Chinese Rummy.

## Overview

The game server exposes a WebSocket API at `ws://localhost:8000/api/bot` that allows an external AI to:
- Join a game room as the "Llama AI" player
- Receive game state when it's their turn
- Request candidate moves from the engine
- Send back strategy advice and receive the engine-selected move
- Optionally send chat messages (trash talk)

`docs/rules.md` is the source of truth for gameplay rules. This document is a quick integration reference.

## Connection Flow

```
1. Connect to ws://localhost:8000/api/bot
2. Receive: { type: "welcome", ... }
3. Send: { action: "join", room: "MINT WOLF", create: true }
4. Receive: { type: "joined", room: "MINT WAVE", seat: 1, ... }
5. Wait for: { type: "your_turn", ... }
6. Send: { action: "strategy", state: {...}, candidates: [...], advice: {...} }
7. Receive: { type: "engine_move", move: {...} }
8. Send: { action: "play", draw: "deck", discard: "7H" }
7. Repeat from step 5
```

## Messages

### Server → Client

#### `welcome`
Sent on connection.
```json
{
  "type": "welcome",
  "message": "Connected to Chrummy Bot API",
  "card_notation": "7H = 7 of hearts, QS = queen of spades, JK = joker"
}
```

#### `joined`
Sent after successfully joining a room.
```json
{
  "type": "joined",
  "room": "MINT WAVE",
  "seat": 1,
  "message": "Joined room MINT WAVE as Llama AI. Waiting for game to start and your turn."
}
```

#### `your_turn`
Sent when it's the AI's turn to play.
```json
{
  "type": "your_turn",
  "room": "MINT WAVE",
  "player_index": 1,
  "seat": 1,
  "phase": "await_draw",
  "round_number": 1,
  "requirements": "2 3-of-a-kinds",
  "hand": [
    { "card": "7H", "cid": 42 },
    { "card": "7S", "cid": 58 },
    { "card": "7D", "cid": 91 },
    { "card": "QC", "cid": 23 },
    { "card": "3H", "cid": 15 },
    { "card": "9S", "cid": 77 },
    { "card": "JK", "cid": 103 }
  ],
  "melds": [],
  "has_laid_down": false,
  "discard_top": "4D",
  "deck_count": 38,
  "opponents": [
    {
      "player_index": 0,
      "card_count": 7,
      "melds": [],
      "has_laid_down": false
    }
  ]
}
```

#### `state`
Sent on every game state update (for the Llama seat). Useful for detecting missed turns.
```json
{
  "type": "state",
  "room": "MOON STAR",
  "playerIndex": 1,
  "phase": "await_draw",
  "currentPlayerIndex": 1,
  "roundIndex": 0,
  "drawCount": 39,
  "discardTop": { "rank": "7", "suit": "hearts", "cid": 12 },
  "you": {
    "hand": [{ "rank": "7", "suit": "hearts", "cid": 42 }],
    "melds": [],
    "stagedMelds": [],
    "hasLaidDown": false,
    "totalScore": 0
  },
  "opponents": [
    { "playerIndex": 0, "connected": true, "isAi": false, "hand": null }
  ]
}
```

#### `action_accepted`
Sent after a valid move.
```json
{
  "type": "action_accepted",
  "message": "Move accepted"
}
```

#### `error`
Sent when something goes wrong.
```json
{
  "type": "error",
  "message": "Not Llama's turn"
}
```

### Client → Server

#### `join`
Join a room as the Llama AI.
```json
{
  "action": "join",
  "room": "MINT WOLF",
  "create": true
}
```
If `create` is true, the server creates a new room using the provided `room` value (format: `WORD WORD`). The Llama is assigned to seat 1. If `create` is false, you can provide a `seat` index to join an existing room.

#### `play`
Make a move. `action`, `draw`, and `discard` are required unless you go out by laying off your last card.
```json
{
  "action": "play",
  "draw": "deck",
  "meld": true,
  "discard": "7H"
}
```

#### `candidates`
Request candidate moves from the engine for the current state.
```json
{
  "action": "candidates",
  "state": { "type": "your_turn", "...": "..." }
}
```

#### `strategy`
Send strategy advice and request the engine-selected move.
```json
{
  "action": "strategy",
  "state": { "type": "your_turn", "...": "..." },
  "candidates": [ { "id": 1, "draw": "deck", "meld": false, "discard": "7H" } ],
  "candidates_hash": "abc123",
  "advice": { "vetoIds": [], "priorityAdjustments": {}, "flags": [], "rationale": "" }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `draw` | Yes | `"deck"` or `"discard"` - where to draw from |
| `meld` | No | `true` to auto-meld if possible |
| `discard` | Yes* | Card to discard. Can be notation (`"7H"`) or cid (`42`). Required unless you empty your hand via layoff. |
| `layoffs` | No | Array of layoffs: `[{ "cid": 42, "player": 0, "meld_index": 0 }]` |

## Card Notation

| Notation | Meaning |
|----------|----------|
| `2H` - `AH` | 2 through Ace of Hearts |
| `2D` - `AD` | 2 through Ace of Diamonds |
| `2C` - `AC` | 2 through Ace of Clubs |
| `2S` - `AS` | 2 through Ace of Spades |
| `JK` | Joker (wild) |

Face cards: `J` = Jack, `Q` = Queen, `K` = King, `A` = Ace

**Note:** `2`s and Jokers are wild cards.

## Card IDs (cid)

Each card has a unique `cid` (card ID) for unambiguous identification. This is important when you have multiple jokers or need to distinguish between identical cards. You can use either notation or cid when discarding.

## Game Rules

### Objective
Be the first to "go out" by melding all your cards and discarding your last card.

### Rounds
The game has 7 rounds with increasing requirements:

| Round | Hand Size | Requirements |
|-------|-----------|---------------|
| 1 | 7 | 2 three-of-a-kinds |
| 2 | 8 | 1 three-of-a-kind + 1 four-card run |
| 3 | 9 | 2 four-card runs |
| 4 | 10 | 1 four-of-a-kind + 1 five-of-a-kind |
| 5 | 11 | 1 seven-card run + 1 three-of-a-kind |
| 6 | 12 | 2 three-of-a-kinds + 1 four-card run |
| 7 | 12 | 2 four-card runs + 1 three-of-a-kind |

### Melds

**Sets (N-of-a-kind):** 3+ cards of the same rank (e.g., 7♥ 7♠ 7♦)

**Runs (Straight flush):** 4+ consecutive cards of the same suit (e.g., 4♥ 5♥ 6♥ 7♥)

### Wild Cards
- **2s** and **Jokers** are wild
- Can substitute for any card in a meld
- Required melds must be at least 50% natural unless the meld is all wilds

### Turn Sequence
1. **Draw** - Take one card from deck OR discard pile
2. **Meld** (optional) - Lay down melds if you meet the round requirements
3. **Lay off** (optional) - After laying down, add cards to any player's melds
4. **Discard** - Place one card on discard pile

### Laying Down
- Must meet ALL requirements for the round simultaneously
- Once laid down, can lay off cards on future turns
- Cannot lay down until you have all required melds

### Scoring
- Winner scores 0
- Losers score the point value of cards remaining in hand:
  - 3–9: 5 points
  - 10–A: 10 points
  - 2s and Jokers: 20 points

### Winning
- Round: First to empty your hand (meld everything + discard last card)
- Game: Lowest total score after 7 rounds

## Prompt Template

Here's a suggested prompt for the LLM:

```
You are playing Chinese Rummy. 

CURRENT STATE:
- Round {round_number}/7
- Requirement: {requirements}
- Your hand: {hand cards}
- Discard pile top: {discard_top}
- Cards in deck: {deck_count}
- You have{has_laid_down ? "" : " NOT"} laid down yet
- Your melds: {melds or "none"}
- Opponent has {opponent_card_count} cards{opponent_has_laid_down ? " and has laid down" : ""}

RULES REMINDER:
- Sets are 3+ cards of same rank (e.g., 7-7-7)
- Runs are 4+ consecutive cards of same suit (e.g., 4♥-5♥-6♥-7♥)
- 2s and Jokers are wild
- You must meet ALL requirements to lay down
- After laying down, you can add cards to any melds

Never choose a move. Provide strategy advice only.

Respond with JSON: {"vetoIds":[], "priorityAdjustments":{}, "flags":[], "rationale":""}
```

## Example Session

```javascript
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8000/api/bot');

ws.on('message', async (data) => {
  const msg = JSON.parse(data);
  
  if (msg.type === 'welcome') {
    ws.send(JSON.stringify({ action: 'join', room: 'MINT WOLF', create: true }));
  }
  
  if (msg.type === 'your_turn') {
    // Format prompt for Llama
    const prompt = formatPrompt(msg);
    
    // Call Ollama
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2',
        prompt: prompt,
        stream: false
      })
    });
    
    const result = await response.json();
    const decision = JSON.parse(result.response);
    
    // Send move to game
    ws.send(JSON.stringify({
      action: 'play',
      draw: decision.draw,
      meld: decision.meld || false,
      discard: decision.discard
    }));
  }
});
```

## Setup

### Prerequisites

1. Start the game server: `npm run dev`
2. Have your Llama connector ready to connect to `ws://localhost:8000/api/bot`

### Single Player vs Llama AI

```
Browser (you) vs Llama AI
```

1. Open browser to `http://localhost:8000`
2. Click **Create** to create a room
3. Note the two-word room code (e.g., `MINT WAVE`) shown in the top bar
4. **Start your Llama connector** and have it join the room:
   ```json
   { "action": "join", "room": "MINT WOLF", "create": true }
   ```
5. In browser, select **"Llama AI"** from the dropdown
6. Click **"Add AI"**
7. Game starts! You and Llama take turns.

### Multiplayer with Llama AI

```
Browser (Player 1) + Browser (Player 2) + Llama AI
```

1. **Player 1:** Open browser, select "3P" (or more) from player count dropdown
2. **Player 1:** Click **Create**, note the room code (e.g., `MINT WAVE`)
3. **Player 2:** Open browser, enter room code `MINT WAVE`, click **Join**
4. **Start your Llama connector** and have it join:
   ```json
   { "action": "join", "room": "MINT WOLF", "create": true }
   ```
5. **Any player in room:** Select **"Llama AI"** from dropdown, click **"Add AI"**
6. Game starts when all seats are filled!

### Multiple Llama AIs

You can add multiple Llama AIs to a game:

1. Create a room with 3+ players
2. Start multiple Llama connectors, each joining the same room with a unique seat index
3. Click **"Add AI"** (with Llama selected) for each AI seat
4. Each Llama connector will receive `your_turn` when it's their turn

**Note:** Today, if no seat is provided, the server treats the connection as the single Llama for the room. For multiple Llama AIs, each connector must provide a unique `seat`.

### Testing with the Demo Bot

The repo includes a simple test bot:

```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Create room in browser, get code (e.g., MINT WAVE), then:
node scripts/test_bot.mjs "MINT WAVE"
```

The test bot uses a dumb strategy (draw from deck, discard first card) but verifies the API works.

### Connection Timing

The Llama connector can connect:
- **Before** adding the AI in the browser (recommended)
- **After** adding the AI (the server will send the turn state when Llama connects)

If Llama isn't connected when it's their turn, the server waits for a connection and does not auto-fallback.

## Future: Chat/Trash Talk

The API supports a `chat` field for personality:

```json
{
  "action": "play",
  "draw": "discard",
  "discard": "3H",
  "chat": "Oh, you didn't want that 7? Thanks!"
}
```

(Chat display in the UI is not yet implemented)
#### `candidates`
Sent after requesting candidate moves.
```json
{
  "type": "candidates",
  "room": "MOON STAR",
  "candidates_hash": "abc123",
  "candidates": [
    { "id": 1, "draw": "deck", "meld": false, "discard": "7H" }
  ]
}
```

#### `engine_move`
Sent after strategy advice is submitted to the engine.
```json
{
  "type": "engine_move",
  "move": { "draw": "deck", "meld": false, "discard": "7H" }
}
```
