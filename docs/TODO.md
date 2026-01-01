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
