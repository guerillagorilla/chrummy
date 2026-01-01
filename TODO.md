# Checklist

1. Create web folder structure

- web/
- web/index.html
- web/styles.css
- web/app.js
- web/engine/
- web/engine/gameEngine.js
- web/engine/ai.js
- web/assets/fonts/

2. Choose rendering method

- Decide: Canvas (single draw loop) or DOM (card divs + drag/drop).
- If unsure, pick DOM for faster dev + easier drag/drop.

3. Port core game rules

- Translate game_engine.py into gameEngine.js.
- Include:
  - Deck, Card, wild checks
  - Deal rules
  - Draw/Discard piles
  - Lay down validation (two 3-of-a-kinds, 50% natural)
  - Lay off to melds
  - Scoring and totals
  - Reshuffle logic

4. Port AI

- Translate ai_choose_discard + draw behavior into ai.js.
- Keep "don't feed opponent" rule.
- Keep "never discard wilds unless forced."

5. UI wireframe

- Header: title, current message, score
- Left: opponent hand, opponent log
- Center: draw pile + discard pile
- Middle: meld areas (opponent + yours)
- Bottom: your hand (draggable)

6. Implement UI interactions

- Draw: click/double-click deck or discard
- Lay down: button or key
- Lay off: click card then meld
- Discard: double-click card

7. Dev-only features

- "Show opponent hand" toggle
- "Show drawn card from deck" log
- "Dev mode" flag

8. Font setup

- Add a suit-compatible font to assets/fonts
- Use @font-face in CSS to render suits consistently

9. Parity testing

- Run several rounds and compare behavior to the Pygame version.
- Verify scoring and AI match rules.md.

10. Optional later

- Add WebSocket server for multiplayer
- Add lobby / player names / turn animations

---

Suggested Web Layout

web/
  index.html
  styles.css
  app.js
  engine/
    gameEngine.js
    ai.js
    rules.js
  assets/
    fonts/
      DejaVuSans.ttf (or NotoSansSymbols.ttf)
