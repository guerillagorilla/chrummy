# Checklist

1. [x] Create web folder structure

- public/index.html
- public/assets/fonts/
- src/app.js
- src/styles.css
- src/engine/
- src/engine/gameEngine.js
- src/engine/ai.js

2. [x] Choose rendering method

- Decide: Canvas (single draw loop) or DOM (card divs + drag/drop).
- If unsure, pick DOM for faster dev + easier drag/drop.

3. [x] Port core game rules

- Ensure core rules are fully represented in gameEngine.js.
- Include:
  - Deck, Card, wild checks
  - Deal rules
  - Draw/Discard piles
  - Lay down validation (two 3-of-a-kinds, 50% natural)
  - Lay off to melds
  - Scoring and totals
  - Reshuffle logic

4. [x] Port AI

- Translate ai_choose_discard + draw behavior into ai.js.
- Keep "don't feed opponent" rule.
- Keep "never discard wilds unless forced."

5. [x] UI wireframe

- Header: title, current message, score
- Left: opponent hand, opponent log
- Center: draw pile + discard pile
- Middle: meld areas (opponent + yours)
- Bottom: your hand (draggable)

6. [x] Implement UI interactions

- Draw: click/double-click deck or discard
- Lay down: button or key
- Lay off: click card then meld
- Discard: double-click card

7. [x] Dev-only features

- "Show opponent hand" toggle
- "Show drawn card from deck" log
- "Dev mode" flag

8. [x] Font setup

- Add a suit-compatible font to public/assets/fonts
- Use @font-face in CSS to render suits consistently

9. [ ] Parity testing

- Run several rounds and compare behavior against the rules (both player and opponent behaviors).
- Verify scoring and AI match docs/rules.md.

10. [ ] Optional later

- Add WebSocket server for multiplayer
- Add lobby / player names / turn animations
- Add reconnects and error handling for multiplayer

---

Multiplayer Outline (Draft)

Status (WIP):

- WebSocket server wired into `scripts/dev_server.mjs`.
- Client can create/join rooms from the header controls.
- State is authoritative on the server; client sends actions only.
- Basic disconnect handling (room slot freed; rejoin allowed).

1. WebSocket Server (Recommended)

- Node.js server holds authoritative game state
- Players connect via WebSocket, send actions (draw, discard, laydown, layoff)
- Server validates moves and broadcasts updates
- Each player only sees their hand + public info (melds, discard, opponent card count)

```
Client A                Server                Client B
   |-- draw:deck -------->|                      |
   |<-- state update -----|-- state update ----->|
   |-- discard:card ----->|                      |
   |<-- state update -----|-- state update ----->|
```

2. Room System

- Generate room codes (e.g., "ABCD")
- First player creates room, second joins with code
- Could add matchmaking later

3. Key Changes Needed:

- Move `Game` class to server-side only
- Client becomes a "view" that renders state and sends actions
- Server sends filtered state (hide opponent's hand)
- Handle disconnects/reconnects

Simple MVP plan:

1. Add `ws` package to Node server
2. Create rooms with game instances
3. Client connects, joins room, receives initial state
4. Actions sent as JSON: `{type: "draw", source: "deck"}`
5. Server validates, updates game, broadcasts new state

---

Suggested Web Layout

public/index.html
src/styles.css
src/app.js
src/engine/
  gameEngine.js
  ai.js
public/
  assets/fonts/
    DejaVuSans.ttf (or NotoSansSymbols.ttf)
