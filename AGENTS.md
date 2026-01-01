# Repository Guidelines

## Project Structure and Modules

- `engine/gameEngine.js` holds the core game rules, turn flow, scoring, and AI heuristics.
- `engine/ai.js` contains AI draw/discard logic.
- `docs/rules.md` documents the current gameplay rules and AI behavior targets.
- Root contains the web UI (`index.html`, `styles.css`, `app.js`), assets, and `dev_server.mjs`.
- `README.md` covers setup, controls, and a short rules summary.

## Setup, Run, and Dev Commands

- Install Node (18+).
- Run the prototype UI: `npm run dev` (or `node dev_server.mjs`).

There is no separate build step; the dev server serves static files from the repo root.

## Coding Style and Naming Conventions

- JavaScript style with 2-space indentation.
- Naming: `camelCase` for functions and variables, `PascalCase` for classes, `UPPER_SNAKE_CASE` for constants (see `SUITS`, `RANKS`).
- Keep game rules and AI logic inside `engine/`; keep rendering and input code inside `app.js`.
- Favor small, single-purpose functions for AI heuristics or rule checks so they are easy to test later.

## Testing Guidelines

- There is no automated test suite yet.
- If you add tests, place them in a `tests/` directory and name files `*.test.js`.
- Suggested framework: `vitest` or `jest` (run with `npm test` once added).

## Commit and Pull Request Guidelines

- Use concise, imperative commit messages, for example: `Add layoff validation` or `Fix discard AI edge case`.
- PRs should include: a short summary, how to run or reproduce changes, and screenshots for UI changes in `app.js` or `styles.css`.
- If you change rules or scoring, update `docs/rules.md` and mention it in the PR description.

## Rules and Gameplay References

- Treat `docs/rules.md` as the source of truth for gameplay and AI decisions.
- When updating logic in `engine/gameEngine.js`, align behavior with the written rules or update the rules alongside the code.
