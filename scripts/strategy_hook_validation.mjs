#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Game, Card, JokerRank } from "../src/engine/gameEngine.js";
import { aiTurn, setStrategyHook } from "../src/engine/ai.js";

const SUITS = ["spades", "hearts", "diamonds", "clubs"];

function makeCard(rank, suitIndex = 0) {
  const suit = rank === JokerRank ? "joker" : SUITS[suitIndex % SUITS.length];
  return new Card(rank, suit);
}

function makeHand(ranks) {
  return ranks.map((rank, index) => makeCard(rank, index));
}

function setupGame({ hand, drawCard }) {
  const game = new Game(2, 0);
  const player = game.players[0];
  const opponent = game.players[1];

  player.hand = hand;
  player.melds = [];
  player.stagedMelds = [];
  player.hasLaidDown = false;
  player.aiNoProgressTurns = 0;

  opponent.hand = [];
  opponent.melds = [];
  opponent.stagedMelds = [];
  opponent.hasLaidDown = false;

  game.drawPile = drawCard ? [drawCard] : [];
  game.discardPile = [];
  game.deadPile = [];
  game.currentPlayerIndex = 0;

  return game;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logPath = path.join(__dirname, "strategy_hook_validation.log");

const logLines = [];
function logLine(line = "") {
  logLines.push(line);
  console.log(line);
}

function runTurn({ label, handRanks, drawRank, hook, captureContext = true }) {
  const hand = makeHand(handRanks);
  const drawCard = drawRank ? makeCard(drawRank, hand.length + 1) : null;
  const game = setupGame({ hand, drawCard });
  const capture = {
    context: null,
    result: null,
    explain: null,
    vetoAll: false,
  };
  let activeHook = hook ?? null;
  if (captureContext) {
    const wrapped = (context) => {
      capture.context = context;
      const result = hook ? hook(context) : null;
      capture.result = result;
      if (Array.isArray(result?.vetoIds) && context.candidates?.length > 0) {
        capture.vetoAll = result.vetoIds.length >= context.candidates.length;
      }
      return result;
    };
    if (hook?.onExplain) {
      wrapped.onExplain = (payload) => {
        capture.explain = payload;
        hook.onExplain(payload);
      };
    } else {
      wrapped.onExplain = (payload) => {
        capture.explain = payload;
      };
    }
    activeHook = wrapped;
  }
  setStrategyHook(activeHook);
  const result = aiTurn(game, 0);
  setStrategyHook(null);
  const player = game.players[0];
  const opponent = game.players[1];
  const handShort = player.hand.map((card) => card.short());
  const discardTop = game.discardPile[game.discardPile.length - 1];
  logLine(`Case: ${label}`);
  logLine(`  Starting hand ranks: ${handRanks.join(", ")}`);
  logLine(`  Starting hand cids: ${hand.map((card) => card.cid).join(", ")}`);
  logLine(`  Draw rank: ${drawRank ?? "none"}`);
  logLine(`  Draw choice: ${result.drawChoice}`);
  logLine(`  Drew: ${cardLabel(result.drewCard)}`);
  logLine(`  Discarded: ${cardLabel(result.discarded)}`);
  logLine(`  Discard pile top: ${cardLabel(discardTop)}`);
  logLine(`  Player hand after turn: ${handShort.join(", ") || "empty"}`);
  logLine(`  Opponent melds: ${opponent.melds.length}`);
  logLine("");
  return { result, game, capture };
}

function cardLabel(card) {
  return card ? card.short() : "none";
}

function check(label, condition, details = "") {
  const status = condition ? "PASS" : "FAIL";
  logLine(`${status}: ${label}${details ? ` -> ${details}` : ""}`);
  return condition;
}

logLine("Summary Validation Ladder");
logLine("=========================");

// 1) Confirm strategy hook is called
{
  let called = 0;
  const hook = () => {
    called += 1;
    return null;
  };
  const run = runTurn({
    label: "strategy hook called",
    handRanks: ["A", "9", "8", "7", "6", "5"],
    drawRank: "4",
    hook,
  });
  check("Confirm strategy hook is called", called === 1, `called=${called}`);
  logLine("Invariant checks:");
  runInvariantChecks(run);
}

// 2) Confirm phases change correctly
{
  const phases = {};
  const makeHook = (label) => (context) => {
    phases[label] = context.phase;
    return null;
  };

  const runEarly = runTurn({
    label: "phase early",
    handRanks: ["A", "9", "8", "7", "6", "5", "4", "3", "Q", "J"],
    drawRank: "K",
    hook: makeHook("early"),
  });
  const runMid = runTurn({
    label: "phase mid",
    handRanks: ["A", "9", "8", "7", "6", "5"],
    drawRank: "4",
    hook: makeHook("mid"),
  });
  const runLate = runTurn({
    label: "phase late",
    handRanks: ["A", "9", "8", "7"],
    drawRank: "6",
    hook: makeHook("late"),
  });

  check(
    "Confirm phases change correctly",
    phases.early === "early" && phases.mid === "mid" && phases.late === "late",
    `early=${phases.early}, mid=${phases.mid}, late=${phases.late}`,
  );
  logLine("Invariant checks:");
  runInvariantChecks(runEarly);
  runInvariantChecks(runMid);
  runInvariantChecks(runLate);
}

// 3) Confirm wild veto works
{
  let vetoedId = null;
  let chosen = null;
  const hook = (context) => {
    vetoedId = context.candidates[0]?.cid ?? null;
    return vetoedId ? { vetoIds: [vetoedId] } : null;
  };
  hook.onExplain = (payload) => {
    chosen = payload.chosenDiscard?.cid ?? null;
  };

  const run = runTurn({
    label: "wild veto",
    handRanks: ["2", "2", JokerRank],
    drawRank: "2",
    hook,
  });

  check(
    "Confirm wild veto works",
    vetoedId !== null && chosen !== null && vetoedId !== chosen,
    `vetoed=${vetoedId}, chosen=${chosen}`,
  );
  logLine("Invariant checks:");
  runInvariantChecks(run);
}

// 4) Confirm phase-based behavior differs
{
  const hook = (context) => {
    if (context.phase === "late") {
      return { priorityAdjustments: { "3": 100 } };
    }
    return { priorityAdjustments: { A: 100 } };
  };

  const early = runTurn({
    label: "phase behavior early",
    handRanks: ["A", "9", "8", "7", "6", "5", "4", "3", "Q", "J"],
    drawRank: "K",
    hook,
  });
  const late = runTurn({
    label: "phase behavior late",
    handRanks: ["A", "9", "3", "7"],
    drawRank: "6",
    hook,
  });

  const earlyDiscard = cardLabel(early.result.discarded);
  const lateDiscard = cardLabel(late.result.discarded);

  check(
    "Confirm phase-based behavior differs",
    earlyDiscard !== lateDiscard,
    `early=${earlyDiscard}, late=${lateDiscard}`,
  );
  logLine("Invariant checks:");
  runInvariantChecks(early);
  runInvariantChecks(late);
}

// 5) Confirm explanation hook fires
{
  let explainCalled = 0;
  let explainPhase = null;
  let explainHasResult = false;
  const hook = () => ({ priorityAdjustments: { A: 50 } });
  hook.onExplain = (payload) => {
    explainCalled += 1;
    explainPhase = payload.phase;
    explainHasResult = Boolean(payload.strategyResult);
  };

  const run = runTurn({
    label: "explain hook",
    handRanks: ["A", "9", "8", "7", "6", "5"],
    drawRank: "4",
    hook,
  });

  check(
    "Confirm explanation hook fires",
    explainCalled === 1 && explainPhase && explainHasResult,
    `called=${explainCalled}, phase=${explainPhase}, hasResult=${explainHasResult}`,
  );
  logLine("Invariant checks:");
  runInvariantChecks(run);
}

// 6) Confirm AI unchanged when disabled
{
  const baseline = runTurn({
    label: "baseline no hook",
    handRanks: ["A", "9", "8", "7", "6", "5"],
    drawRank: "4",
    hook: null,
    captureContext: false,
  });
  const noop = runTurn({
    label: "noop hook",
    handRanks: ["A", "9", "8", "7", "6", "5"],
    drawRank: "4",
    hook: () => null,
  });

  const baseDiscard = cardLabel(baseline.result.discarded);
  const noopDiscard = cardLabel(noop.result.discarded);

  check(
    "Confirm AI unchanged when disabled",
    baseDiscard === noopDiscard,
    `baseline=${baseDiscard}, noop=${noopDiscard}`,
  );
  logLine("Invariant checks:");
  runInvariantChecks(noop);
}

// 7) A/B compare results
{
  const baseline = runTurn({
    label: "A/B baseline",
    handRanks: ["A", "9", "8", "7", "6", "5"],
    drawRank: "4",
    hook: null,
    captureContext: false,
  });
  const strategy = runTurn({
    label: "A/B strategy",
    handRanks: ["A", "9", "8", "7", "6", "5"],
    drawRank: "4",
    hook: () => ({ priorityAdjustments: { "5": 100 } }),
  });

  const baseDiscard = cardLabel(baseline.result.discarded);
  const stratDiscard = cardLabel(strategy.result.discarded);

  check(
    "A/B compare results",
    baseDiscard !== stratDiscard,
    `A=${baseDiscard}, B=${stratDiscard}`,
  );
  logLine("Invariant checks:");
  runInvariantChecks(strategy);
}

fs.writeFileSync(logPath, `${logLines.join("\n")}\n`, "utf8");
logLine(`Logs written to ${logPath}`);

function runInvariantChecks(run) {
  if (!run?.capture?.context) {
    logLine("  Skipped (no strategy context captured).");
    return;
  }
  const context = run.capture.context;
  const discarded = run.result.discarded;
  const candidates = context.candidates ?? [];
  const hasNonWildCandidate = candidates.some((card) => !card.isWild());
  const discardedIsWild = discarded?.isWild?.() ?? false;
  const discardedInCandidates = candidates.some((card) => card.cid === discarded?.cid);
  const meldCardIds = new Set(
    run.game.players[0].melds.flatMap((meld) => meld.cards.map((card) => card.cid)),
  );
  const discardedInMeld = discarded ? meldCardIds.has(discarded.cid) : false;

  check(
    "Invariant: wilds never discarded early (unless only wilds available)",
    context.phase !== "early" || !discardedIsWild || !hasNonWildCandidate,
    `phase=${context.phase}, discarded=${cardLabel(discarded)}`,
  );
  check(
    "Invariant: completed melds never broken",
    !discardedInMeld,
    `discarded=${cardLabel(discarded)}`,
  );
  check(
    "Invariant: discarded cards were legal candidates",
    discardedInCandidates || candidates.length === 0,
    `discarded=${cardLabel(discarded)}, candidates=${candidates.length}`,
  );
  check(
    "Invariant: strategy never returns empty candidate set",
    !run.capture.vetoAll,
    `vetoAll=${run.capture.vetoAll}`,
  );
}
