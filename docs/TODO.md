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
- **Buying Cards (3+ players only)**
  - [x] Add "Buy" button visible when it's not your turn
  - [x] When a card is discarded, non-current players can click Buy to claim it
  - [x] Cost: buyer receives the discard + draws 1 extra card from draw pile (2 cards total)
  - [x] Priority: if multiple players want to buy, player closest to discarder (clockwise) wins
  - [x] Current player doesn't need to buy - they take discard normally on their turn
  - [x] Only one card can be bought at a time (per discard)
  - [x] No limit on total buys per round
  - [x] Play "ding" sound when a buy is successful
  - [x] Hide/disable buying in 2-player games (pointless since next turn is always yours)
- **More Players (Deck Scaling)**
  - [x] Support room sizes up to 10 players (see README deck scaling rules)
  - [x] Server: build multi-deck shoe based on room size
  - [x] Server: enforce turn order and per-player state for N players
  - [x] Client: render multiple opponent hands and meld areas
- [x] Client: show current player turn + count of opponents
- [x] Update rules/docs to reflect multiplayer limits and deck scaling

---

## Suggestions Backlog

### Code Architecture

- [ ] Split `src/app.js` into modules:
  - `src/render.js` for rendering functions (`renderCard`, `renderHand`, `renderMelds`, etc.)
  - `src/multiplayer.js` for WebSocket handling and room management
  - `src/dragdrop.js` for drag-and-drop and touch handlers
  - `src/audio.js` for sound loading/playback
  - `src/state.js` for centralized state management (replace scattered globals)
- [ ] Introduce a single state object (example):
  - `const gameState = { mode: "local", phase: "await_draw", selectedCardId: null /* ... */ };`
- [ ] Extract magic numbers into a constants file (example: `DOUBLE_TAP_DELAY`, `AI_TURN_DELAY`, `REVEAL_DURATION`).

### GUI Improvements

High Impact

- [x] Draw pile card count (show remaining cards under the deck).
- [ ] Card animations for draw, discard, and meld transitions.
- [x] More prominent turn indicator (pulsing message and stronger glow).
- [ ] Mobile layout improvements: stacked melds, smaller cards, collapsible opponent area, bottom-fixed scrollable hand.

Medium Impact

- [ ] Sort hand toggle (auto-sort by rank/suit).
- [ ] Undo button (allow undoing moves before discarding).
- [ ] Toast notifications for events (replace or supplement message bar).
- [ ] Improve opponent hand count badges (more visible).
- [ ] Rules reminder tooltip or button for round requirements.

Polish

- [ ] Card flip animation when opponent draws a wild from deck.
- [ ] Victory celebration (confetti or win animation).
- [ ] Sound toggle in UI (mute/unmute).
- [ ] Dragging visual (shadow/scale while dragging).

### Accessibility

- [ ] Keyboard navigation (tab through cards, enter to select/play).
- [ ] ARIA labels for cards, buttons, and interactive elements.
- [ ] Color blind mode (pattern fills for suits).

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
