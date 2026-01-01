# Repository Guidelines

## Project Structure and Modules

- `game_engine.py` holds the core game rules, turn flow, scoring, and AI heuristics.
- `pygame_viewer.py` is the Pygame UI and input handling for the prototype.
- `rules.md` documents the current gameplay rules and AI behavior targets.
- `requirements.txt` lists runtime dependencies.
- `README.md` covers setup, controls, and a short rules summary.

## Setup, Run, and Dev Commands

- Create and activate a virtual environment: `python -m venv .venv` then `source .venv/bin/activate`.
- Install dependencies: `python -m pip install -r requirements.txt`.
- Run the prototype UI: `python pygame_viewer.py`.

There is no separate build step; running the viewer loads the game engine directly.

## Coding Style and Naming Conventions

- Python style with 4-space indentation and type hints where practical.
- Naming: `snake_case` for functions and variables, `PascalCase` for classes, `UPPER_SNAKE_CASE` for constants (see `SUITS`, `RANKS`).
- Keep game rules and AI logic inside `game_engine.py`; keep rendering and input code inside `pygame_viewer.py`.
- Favor small, single-purpose functions for AI heuristics or rule checks so they are easy to test later.

## Testing Guidelines

- There is no automated test suite yet.
- If you add tests, place them in a `tests/` directory and name files `test_*.py`.
- Suggested framework: `pytest` (run with `pytest` once added).

## Commit and Pull Request Guidelines

- The repository has no commit history yet, so there is no established convention.
- Use concise, imperative commit messages, for example: `Add layoff validation` or `Fix discard AI edge case`.
- PRs should include: a short summary, how to run or reproduce changes, and screenshots for UI changes in `pygame_viewer.py`.
- If you change rules or scoring, update `rules.md` and mention it in the PR description.

## Rules and Gameplay References

- Treat `rules.md` as the source of truth for gameplay and AI decisions.
- When updating logic in `game_engine.py`, align behavior with the written rules or update the rules alongside the code.
