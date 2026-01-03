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
  - Round-based lay down validation (round-specific meld types, 50% natural)
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

10. [ ] Multiplayer (Current Status)

- **MVP Plan**
  - [x] Add `ws` package to Node server
  - [x] Create rooms with game instances
  - [x] Client connects, joins room, receives initial state
  - [x] Actions sent as JSON: `{type: "draw", source: "deck"}`
  - [x] Server validates, updates game, broadcasts new state
- **Server & Client**
  - [x] WebSocket server wired into `scripts/dev_server.mjs`
  - [x] Server holds authoritative state; client sends actions only
  - [x] Server validates moves and broadcasts updates
  - [x] Filtered state per player (hide opponent hand)
  - [x] Client create/join room controls in the header
- **Room System**
  - [x] Room codes (e.g., "ABCD") and join flow
  - [x] Basic disconnect handling (room slot freed; rejoin allowed)
  - [ ] Matchmaking
- **Polish**
  - [ ] Add lobby / player names / turn animations

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
