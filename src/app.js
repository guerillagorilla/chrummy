import { Game, SuitSymbols, JokerRank, formatRequirements, ROUNDS, getSortedMeldCards } from "./engine/gameEngine.js";
import { aiTurn as aiTurnEngine } from "./engine/ai.js";
import { aiTurn } from "./engine/ai.js";

const messageEl = document.getElementById("message");
const scoreEl = document.getElementById("score");
const subtitleEl = document.getElementById("subtitle");
const subtitleTextEl = document.getElementById("subtitle-text");
const opponentLogEl = document.getElementById("opponent-log");
const drawPileEl = document.getElementById("draw-pile");
const discardPileEl = document.getElementById("discard-pile");
const discardCardEl = document.getElementById("discard-card");
const yourHandEl = document.getElementById("your-hand");
const opponentHandEl = document.getElementById("opponent-hand");
const yourMeldsEl = document.getElementById("your-melds");
const opponentMeldsEl = document.getElementById("opponent-melds");
const opponentLogPanel = document.querySelector(".panel.log");
const restartBtn = document.getElementById("restart-btn");
const nextRoundBtn = document.getElementById("next-round-btn");
const rulesBtn = document.getElementById("rules-btn");
const rulesModal = document.getElementById("rules-modal");
const rulesCloseBtn = document.getElementById("rules-close");
const rulesRoundEl = document.getElementById("rules-round");
const laydownSelectedBtn = document.getElementById("laydown-selected-btn");
const autoStageBtn = document.getElementById("auto-stage-btn");
const devModeToggle = document.getElementById("dev-mode");
const roomCodeInput = document.getElementById("room-code");
const createRoomBtn = document.getElementById("create-room");
const joinRoomBtn = document.getElementById("join-room");
const addAiBtn = document.getElementById("add-ai");
const leaveRoomBtn = document.getElementById("leave-room");
const buyBtn = document.getElementById("buy-card");
const sortHandBtn = document.getElementById("sort-hand");
const roomSizeSelect = document.getElementById("room-size");
const skipRoundBtn = document.getElementById("skip-round");
const winCelebrationEl = document.getElementById("win-celebration");
const fanCurveInput = document.getElementById("fan-curve");
const fanCurveValue = document.getElementById("fan-curve-value");
const fanRotateInput = document.getElementById("fan-rotate");
const fanRotateValue = document.getElementById("fan-rotate-value");
const fanSpreadInput = document.getElementById("fan-spread");
const fanSpreadValue = document.getElementById("fan-spread-value");
const fanLiftInput = document.getElementById("fan-lift");
const fanLiftValue = document.getElementById("fan-lift-value");
const devSliders = document.querySelector(".dev-sliders");
const yourRowEl = document.querySelector(".your-row");


let game = new Game(2, 1);
let state = "await_draw";
let selectedCardId = null;
let devMode = false;
let multiplayerState = null;
let multiplayerRoom = null;
let multiplayerPlayerIndex = null;
let socket = null;
let multiplayerEnabled = false;
let autoSortEnabled = false;
let lastWinner = null;
let lastCelebrationKey = null;
let winCelebrationTimer = null;

let draggingCardId = null;
let lastDropTargetId = null;
let revealOpponentCardId = null;
let revealOpponentType = null; // 'discard' or 'wild'
let revealOpponentCard = null; // the actual card object for display
let revealOpponentPlayerIndex = null;
let revealTimer = null;
let insertMarkerEl = null;
let pendingDiscardCardId = null;
let manualHandOrder = [];
let lastTapTime = 0;
let lastTapCardId = null;
let lastPileTapTime = 0;
let lastPileTapId = null;
let buyPending = false;
const handDebug = { lastOrder: "" };
const soundFiles = {
  draw: "/assets/sounds/cockatrice/draw.wav",
  play: "/assets/sounds/cockatrice/playcard.wav",
  discard: "/assets/sounds/cockatrice/tap.wav",
  ding: "/assets/sounds/cockatrice/stagechangeoldnotification.wav",
};
const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
let audioContext = null;
let audioUnlocked = false;
const soundBuffers = new Map();
const RANK_VALUES = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};
const SUIT_ORDER = {
  spades: 0,
  hearts: 1,
  diamonds: 2,
  clubs: 3,
  joker: 4,
};
const CONFETTI_COLORS = [
  "#f6d365",
  "#fda085",
  "#7afcff",
  "#feff9c",
  "#ff9a8b",
  "#9bf6ff",
  "#c4fcef",
  "#ffcf56",
];

function setMessage(text, state = "normal") {
  messageEl.textContent = text;
  messageEl.classList.remove("your-turn", "waiting");
  if (state === "your-turn") {
    messageEl.classList.add("your-turn");
  } else if (state === "waiting") {
    messageEl.classList.add("waiting");
  }
}

function stopWinCelebration() {
  if (!winCelebrationEl) return;
  if (winCelebrationTimer) {
    clearTimeout(winCelebrationTimer);
    winCelebrationTimer = null;
  }
  winCelebrationEl.classList.remove("active");
  winCelebrationEl.innerHTML = "";
}

function startWinCelebration() {
  if (!winCelebrationEl) return;
  winCelebrationEl.innerHTML = "";
  const burst = document.createElement("div");
  burst.className = "celebration-burst";
  winCelebrationEl.appendChild(burst);
  for (let i = 0; i < 60; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    const fromLeft = i % 2 === 0;
    const edgeBase = fromLeft ? -6 : 96;
    const x = edgeBase + Math.random() * 12;
    const driftTarget = (50 - x) * (0.75 + Math.random() * 0.2);
    const size = 6 + Math.floor(Math.random() * 8);
    piece.style.setProperty("--x", `${x}%`);
    piece.style.setProperty("--w", `${size}px`);
    piece.style.setProperty("--h", `${Math.max(4, Math.floor(size * 0.6))}px`);
    piece.style.setProperty("--delay", `${Math.floor(Math.random() * 400)}ms`);
    piece.style.setProperty("--duration", `${2200 + Math.floor(Math.random() * 1200)}ms`);
    piece.style.setProperty("--rotate", `${Math.floor(Math.random() * 360)}deg`);
    piece.style.setProperty("--rise", `${-50 - Math.random() * 20}vh`);
    piece.style.setProperty("--fall", `${120 + Math.random() * 30}vh`);
    piece.style.setProperty("--drift-mid", `${driftTarget.toFixed(2)}vw`);
    piece.style.setProperty("--drift-end", `${(driftTarget * 1.2).toFixed(2)}vw`);
    piece.style.setProperty("--color", CONFETTI_COLORS[i % CONFETTI_COLORS.length]);
    winCelebrationEl.appendChild(piece);
  }
  winCelebrationEl.classList.add("active");
  if (winCelebrationTimer) clearTimeout(winCelebrationTimer);
  winCelebrationTimer = setTimeout(() => {
    stopWinCelebration();
  }, 3600);
}

function updateWinCelebration() {
  let shouldCelebrate = false;
  let celebrationKey = null;
  if (multiplayerState) {
    if (multiplayerState.phase === "game_over" && multiplayerState.winnerIndex === multiplayerPlayerIndex) {
      shouldCelebrate = true;
      celebrationKey = `mp-${multiplayerState.winnerIndex}-${multiplayerState.round ?? ""}-${multiplayerState.you?.totalScore ?? ""}`;
    }
  } else if (state === "game_over" && lastWinner === 0) {
    shouldCelebrate = true;
    celebrationKey = `local-${game.roundIndex}-${game.players[0].totalScore}`;
  }

  if (shouldCelebrate && celebrationKey && celebrationKey !== lastCelebrationKey) {
    lastCelebrationKey = celebrationKey;
    startWinCelebration();
    return;
  }
  if (!shouldCelebrate) {
    lastCelebrationKey = null;
    stopWinCelebration();
  }
}

function playSound(key) {
  if (!audioUnlocked || !audioContext) return;
  const buffer = soundBuffers.get(key);
  if (!buffer) {
    loadSoundBuffer(key).then((loaded) => {
      if (!loaded || !audioContext) return;
      const source = audioContext.createBufferSource();
      const gain = audioContext.createGain();
      gain.gain.value = 0.6;
      source.buffer = loaded;
      source.connect(gain).connect(audioContext.destination);
      source.start(0);
    }).catch(() => {});
    return;
  }
  const source = audioContext.createBufferSource();
  const gain = audioContext.createGain();
  gain.gain.value = 0.6;
  source.buffer = buffer;
  source.connect(gain).connect(audioContext.destination);
  source.start(0);
}

async function loadSoundBuffer(key) {
  if (!audioContext) return null;
  if (soundBuffers.has(key)) return soundBuffers.get(key);
  const url = soundFiles[key];
  if (!url) return null;
  const response = await fetch(url);
  const data = await response.arrayBuffer();
  const buffer = await audioContext.decodeAudioData(data);
  soundBuffers.set(key, buffer);
  return buffer;
}

function unlockAudio() {
  if (audioUnlocked) return;
  if (!AudioContextCtor) return;
  audioContext = audioContext || new AudioContextCtor();
  audioContext.resume().then(() => {
    audioUnlocked = true;
    Object.keys(soundFiles).forEach((key) => {
      loadSoundBuffer(key).catch(() => {});
    });
  }).catch(() => {});
}

function registerAudioUnlock() {
  const handler = () => {
    unlockAudio();
  };
  document.addEventListener("pointerdown", handler, { once: true });
  document.addEventListener("touchstart", handler, { once: true });
  document.addEventListener("mousedown", handler, { once: true });
  document.addEventListener("keydown", handler, { once: true });
}

function buildLocalView() {
  const opponents = game.players.slice(1).map((player, idx) => ({
    playerIndex: idx + 1,
    connected: true,
    hand: player.hand,
    handCount: player.hand.length,
    melds: player.melds,
    stagedMelds: player.stagedMelds,
    hasLaidDown: player.hasLaidDown,
    totalScore: player.totalScore,
  }));
  return {
    mode: "local",
    phase: state,
    currentPlayerIndex: state === "ai_turn" ? 1 : 0,
    winnerIndex: null,
    roundIndex: game.roundIndex,
    round: game.currentRound(),
    connectedCount: game.players.length,
    maxPlayers: game.players.length,
    drawCount: game.drawPile.length,
    discardTop: game.discardPile[game.discardPile.length - 1] ?? null,
    you: {
      hand: game.players[0].hand,
      melds: game.players[0].melds,
      stagedMelds: game.players[0].stagedMelds,
      hasLaidDown: game.players[0].hasLaidDown,
      totalScore: game.players[0].totalScore,
    },
    opponents,
  };
}

function getView() {
  if (multiplayerState) {
    return { mode: "multiplayer", ...multiplayerState };
  }
  return buildLocalView();
}

function currentPhase() {
  if (multiplayerState) return multiplayerState.phase;
  if (multiplayerEnabled) return "waiting";
  return state;
}

function multiplayerReady() {
  if (!multiplayerState) return false;
  if (typeof multiplayerState.ready === "boolean") return multiplayerState.ready;
  const connected = multiplayerState.connectedCount ?? 0;
  const maxPlayers = multiplayerState.maxPlayers ?? 2;
  return connected >= 2 && connected === maxPlayers;
}

function waitingForPlayersMessage() {
  const connected = multiplayerState?.connectedCount ?? 0;
  const aiCount = multiplayerState?.aiCount ?? 0;
  const maxPlayers = multiplayerState?.maxPlayers ?? 2;
  const filled = connected + aiCount;
  return `Waiting for players (${filled}/${maxPlayers})...`;
}

function playerLabel(index, view) {
  const reference = view ?? getView();
  const isMultiplayer = Boolean(multiplayerState) || reference?.mode === "multiplayer";
  if (!isMultiplayer) {
    return index === 1 ? "Opponent" : `Player ${index + 1}`;
  }
  return index === multiplayerPlayerIndex ? "You" : `Player ${index + 1}`;
}

function opponentLabel(opponent, view) {
  const base = playerLabel(opponent.playerIndex, view);
  if (!opponent.isAi) return base;
  if (base === "Opponent") return "AI Opponent";
  return `AI ${base}`;
}

function isPlayerTurn() {
  if (multiplayerState) {
    return multiplayerState.currentPlayerIndex === multiplayerPlayerIndex;
  }
  if (multiplayerEnabled) return false;
  return state === "await_draw" || state === "await_discard";
}

function youHasLaidDown() {
  return multiplayerState ? multiplayerState.you.hasLaidDown : game.players[0].hasLaidDown;
}

function getYourHand() {
  return multiplayerState ? multiplayerState.you.hand : game.players[0].hand;
}

function syncManualHandOrder(hand) {
  if (!multiplayerState) return;
  const ids = hand.map((card) => card.cid);
  if (manualHandOrder.length === 0) {
    manualHandOrder = [...ids];
    return;
  }
  const idSet = new Set(ids);
  manualHandOrder = manualHandOrder.filter((id) => idSet.has(id));
  ids.forEach((id) => {
    if (!manualHandOrder.includes(id)) {
      manualHandOrder.push(id);
    }
  });
}

function orderHandForDisplay(hand) {
  if (!multiplayerState || manualHandOrder.length === 0) {
    return hand;
  }
  const byId = new Map(hand.map((card) => [card.cid, card]));
  const ordered = [];
  manualHandOrder.forEach((id) => {
    const card = byId.get(id);
    if (card) ordered.push(card);
  });
  byId.forEach((card, id) => {
    if (!manualHandOrder.includes(id)) {
      ordered.push(card);
    }
  });
  return ordered;
}

function getOpponentMelds() {
  const view = getView();
  if (view.opponents) {
    return view.opponents.flatMap((opponent) => opponent.melds ?? []);
  }
  return view.mode === "multiplayer" ? [] : game.players[1].melds;
}

function hasLayoffOpportunity(view) {
  if (!view?.you?.hasLaidDown) return false;
  const melds = [
    ...(view.you.melds ?? []),
    ...(view.opponents ? view.opponents.flatMap((opponent) => opponent.melds ?? []) : []),
  ];
  if (melds.length === 0) return false;
  return (view.you.hand ?? []).some((card) => melds.some((meld) => meldCanAdd(meld, card)));
}

function updateScore() {
  const view = getView();
  const roundIndex = Number.isFinite(view.roundIndex) ? view.roundIndex : 0;
  const roundTotal = ROUNDS.length;
  const roundData = view.round ?? ROUNDS[roundIndex];
  const roundSummary = roundData ? formatRequirements(roundData.requirements) : "";
  const roundLabel = roundSummary ? `Round ${roundIndex + 1}/${roundTotal}: ${roundSummary}` : `Round ${roundIndex + 1}/${roundTotal}`;
  const subtitleText = roundSummary ? `Round ${roundIndex + 1}: ${roundSummary}` : `Round ${roundIndex + 1}`;
  if (rulesRoundEl) {
    rulesRoundEl.textContent = roundSummary ? `Round ${roundIndex + 1}: ${roundSummary}` : `Round ${roundIndex + 1}`;
  }
  const opponents = view.opponents ?? [];
  let opponentsLabel = "Opponents: 0";
  if (opponents.length === 1 && view.mode === "local") {
    opponentsLabel = `Opponent: ${opponents[0].totalScore}`;
  } else if (opponents.length > 0) {
    const scores = opponents.map((opponent) => `P${opponent.playerIndex + 1}: ${opponent.totalScore}`).join(" ");
    opponentsLabel = `Opponents: ${scores}`;
  }
  scoreEl.textContent = `${roundLabel} | You: ${view.you.totalScore} | ${opponentsLabel}`;
  if (subtitleEl) {
    if (subtitleTextEl) {
      subtitleTextEl.textContent = subtitleText;
      requestAnimationFrame(() => {
        const shouldScroll = subtitleTextEl.scrollWidth > subtitleEl.clientWidth;
        const forceScroll = subtitleText.length > 18;
        subtitleEl.classList.toggle("subtitle--scrolling", shouldScroll || forceScroll);
        subtitleTextEl.style.setProperty(
          "--subtitle-scroll-duration",
          `${Math.max(8, Math.ceil(subtitleTextEl.scrollWidth / 35))}s`
        );
      });
      subtitleEl.title = subtitleText;
    } else {
      subtitleEl.textContent = subtitleText;
    }
  }
  const titleRound = subtitleText;
  document.title = `Chinese Rummy - ${titleRound}`;
}

function logOpponent(text) {
  const item = document.createElement("li");
  item.textContent = text;
  opponentLogEl.prepend(item);
}

function cardText(card) {
  if (!card) return "Unknown";
  if (card.rank === JokerRank) return "JKR";
  const suitChar = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" }[card.suit] || "";
  return `${card.rank}${suitChar}`;
}

function totalMeldCardsFor(view, playerIndex) {
  if (!view) return 0;
  const player = playerIndex === view.playerIndex ? view.you : view.opponents?.find((op) => op.playerIndex === playerIndex);
  if (!player) return 0;
  return (player.melds ?? []).reduce((sum, meld) => sum + meld.cards.length, 0);
}

function logMultiplayerActivity(prevState, nextState) {
  if (!devMode || !multiplayerEnabled || !opponentLogEl || !prevState || !nextState) return;
  const prevPhase = prevState.phase;
  const nextPhase = nextState.phase;
  const actor = prevState.currentPlayerIndex;
  if (actor !== multiplayerPlayerIndex) {
    if (prevPhase === "await_draw" && nextPhase === "await_discard") {
      logOpponent(`${playerLabel(actor, nextState)} drew.`);
    }
    if (prevState.discardTop?.cid !== nextState.discardTop?.cid) {
      logOpponent(`${playerLabel(actor, nextState)} discarded ${cardText(nextState.discardTop)}.`);
    }
    const prevMelds = totalMeldCardsFor(prevState, actor);
    const nextMelds = totalMeldCardsFor(nextState, actor);
    if (nextMelds > prevMelds) {
      logOpponent(`${playerLabel(actor, nextState)} melded.`);
    }
  }
}

function cardLabel(card) {
  if (!card) return "Empty";
  if (card.rank === JokerRank) return "JOKER";
  return `${card.rank} ${SuitSymbols[card.suit]}`;
}

function cardIsRed(card) {
  if (!card) return false;
  if (typeof card.isRed === "function") return card.isRed();
  return card.suit === "hearts" || card.suit === "diamonds";
}

function cardIsWild(card) {
  if (!card) return false;
  if (typeof card.isWild === "function") return card.isWild();
  return card.rank === "2" || card.rank === JokerRank;
}

function meldCanAdd(meld, card) {
  if (!meld || !card) return false;
  if (typeof meld.canAdd === "function") return meld.canAdd(card);
  if (meld.type === "run") {
    return canFormRun([...meld.cards, card], false);
  }
  return cardIsWild(card) || meld.rank === card.rank;
}

function applyHandGap(container, count) {
  const rootStyles = getComputedStyle(document.documentElement);
  const spread = parseFloat(rootStyles.getPropertyValue("--hand-dynamic-spread")) || 520;
  const gapMax = parseFloat(rootStyles.getPropertyValue("--hand-dynamic-gap-max")) || 70;
  const spacingScale =
    parseFloat(container.style.getPropertyValue("--hand-spacing-scale")) ||
    parseFloat(rootStyles.getPropertyValue("--hand-spacing-scale")) ||
    1;
  const gap = Math.min(gapMax, Math.max(16, (spread / Math.max(1, count)) * spacingScale));
  container.style.setProperty("--hand-dynamic-gap", `${gap}px`);
}

function applyHandLift(container) {
  const rootStyles = getComputedStyle(document.documentElement);
  const lift = parseFloat(rootStyles.getPropertyValue("--hand-lift")) || 0;
  container.style.setProperty("--hand-lift", `${lift}px`);
}

function canFormRun(cards, requireHalfNatural) {
  const naturals = cards.filter((candidate) => !cardIsWild(candidate));
  if (requireHalfNatural && naturals.length < Math.ceil(cards.length / 2)) return false;
  let suit = null;
  const values = [];
  let hasAce = false;
  for (const card of naturals) {
    if (suit && card.suit !== suit) return false;
    suit = card.suit;
    values.push(RANK_VALUES[card.rank]);
    if (card.rank === "A") hasAce = true;
  }
  const unique = new Set(values);
  if (unique.size !== values.length) return false;
  if (naturals.length === 0) return !requireHalfNatural;
  const size = cards.length;
  const canFitRun = (runValues, allowAceLow) => {
    const startMin = allowAceLow ? 1 : 2;
    for (let start = startMin; start <= 14 - size + 1; start += 1) {
      const needed = new Set();
      for (let offset = 0; offset < size; offset += 1) {
        needed.add(start + offset);
      }
      if (runValues.every((value) => needed.has(value))) {
        return true;
      }
    }
    return false;
  };

  if (canFitRun(values, false)) return true;
  if (!hasAce) return false;
  const lowValues = values.map((value) => (value === 14 ? 1 : value));
  const lowSet = new Set(lowValues);
  if (lowSet.size !== lowValues.length) return false;
  return canFitRun(lowValues, true);
}

function renderCard(card, options = {}) {
  const { faceUp = true, selectable = false, selected = false } = options;
  const cardEl = document.createElement("div");
  cardEl.className = "card";
  if (!faceUp) {
    cardEl.classList.add("back");
    return cardEl;
  }

  if (cardIsRed(card)) {
    cardEl.classList.add("red");
  }
  if (selected) {
    cardEl.classList.add("selected");
  }
  if (selectable) {
    cardEl.setAttribute("draggable", "true");
  }

  const top = document.createElement("div");
  top.textContent = card.rank === JokerRank ? "J" : card.rank;
  const suit = document.createElement("div");
  suit.className = "suit";
  if (card.rank === JokerRank) {
    suit.textContent = "JOKER";
    cardEl.classList.add("joker");
  } else {
    suit.innerHTML = SuitSymbols[card.suit];
  }
  const bottom = document.createElement("div");
  bottom.textContent = card.rank === JokerRank ? "J" : card.rank;

  cardEl.append(top, suit, bottom);
  cardEl.dataset.cardId = String(card.cid);
  return cardEl;
}

function renderHand(container, hand, options = {}) {
  const { faceUp = true, selectable = false, selectedId = null } = options;
  container.innerHTML = "";
  if (container === yourHandEl) {
    const middle = hand.length > 0 ? (hand.length - 1) / 2 : 0;
    container.style.setProperty("--hand-count", hand.length);
    container.style.setProperty("--hand-middle", middle);
    const spacingScale = 1 + Math.min(0.4, Math.max(0, (hand.length - 7) * 0.03));
    container.style.setProperty("--hand-spacing-scale", spacingScale.toFixed(2));
    applyHandGap(container, hand.length);
    applyHandLift(container);
  }
  for (let i = 0; i < hand.length; i += 1) {
    const card = hand[i];
    const cardEl = renderCard(card, {
      faceUp,
      selectable,
      selected: selectedId === card.cid,
    });
    if (container === yourHandEl) {
      cardEl.style.setProperty("--hand-index", i);
    }
    container.appendChild(cardEl);
  }
  if (!multiplayerEnabled && devMode && container === yourHandEl) {
    const order = hand.map((card) => card.cid).join(",");
    if (order !== handDebug.lastOrder) {
      console.log(`[hand] order=${order}`);
      handDebug.lastOrder = order;
    }
  }
  // Re-append insert marker for your hand (it gets cleared by innerHTML)
  if (container === yourHandEl && insertMarkerEl) {
    container.appendChild(insertMarkerEl);
  }
}

function sortHand(hand) {
  return [...hand].sort((a, b) => {
    const aWild = cardIsWild(a) ? 1 : 0;
    const bWild = cardIsWild(b) ? 1 : 0;
    if (aWild !== bWild) return aWild - bWild;
    const aRank = a.rank === JokerRank ? 15 : RANK_VALUES[a.rank] ?? 0;
    const bRank = b.rank === JokerRank ? 15 : RANK_VALUES[b.rank] ?? 0;
    if (aRank !== bRank) return aRank - bRank;
    const aSuit = SUIT_ORDER[a.suit] ?? 9;
    const bSuit = SUIT_ORDER[b.suit] ?? 9;
    if (aSuit !== bSuit) return aSuit - bSuit;
    return a.cid - b.cid;
  });
}

function renderMelds(container, playerView, ownerIndex, { clear = true } = {}) {
  if (clear) {
    container.innerHTML = "";
  }
  const staged = playerView.stagedMelds ?? [];
  const committed = playerView.melds ?? [];
  staged.forEach((meld, meldIndex) => {
    const meldEl = document.createElement("div");
    meldEl.className = "meld staged";
    meldEl.dataset.ownerIndex = String(ownerIndex);
    meldEl.dataset.meldIndex = String(meldIndex);
    meldEl.dataset.staged = "true";
    const sortedCards = getSortedMeldCards(meld);
    sortedCards.forEach((card) => {
      const cardEl = renderCard(card, { faceUp: true });
      meldEl.appendChild(cardEl);
    });
    container.appendChild(meldEl);
  });
  committed.forEach((meld, meldIndex) => {
    const meldEl = document.createElement("div");
    meldEl.className = "meld";
    meldEl.dataset.ownerIndex = String(ownerIndex);
    meldEl.dataset.meldIndex = String(meldIndex);
    meldEl.dataset.staged = "false";
    const sortedCards = getSortedMeldCards(meld);
    sortedCards.forEach((card) => {
      const cardEl = renderCard(card, { faceUp: true });
      meldEl.appendChild(cardEl);
    });
    container.appendChild(meldEl);
  });
}

function renderPiles(view) {
  // Update draw pile count
  const drawCountEl = document.getElementById("draw-count");
  if (drawCountEl) {
    if (view.drawCount == null) {
      drawCountEl.textContent = "";
    } else {
      const count = view.drawCount;
      drawCountEl.textContent = count === 1 ? "1 card" : `${count} cards`;
    }
  }

  // Update discard pile
  discardCardEl.innerHTML = "";
  discardCardEl.classList.add("back");
  const topDiscard = view.discardTop;
  if (topDiscard) {
    const cardEl = renderCard(topDiscard, { faceUp: true });
    discardCardEl.appendChild(cardEl);
    discardCardEl.classList.remove("back");
  } else {
    discardCardEl.textContent = "Empty";
  }
}

function clearSelectedHighlight() {
  document.querySelectorAll(".card.selected").forEach((cardEl) => {
    cardEl.classList.remove("selected");
  });
}

function setSelectedHighlight(cardId) {
  clearSelectedHighlight();
  if (!cardId) return;
  const cardEl = yourHandEl.querySelector(`[data-card-id="${cardId}"]`);
  if (cardEl) {
    cardEl.classList.add("selected");
  }
}

function renderOpponentHands(view) {
  opponentHandEl.innerHTML = "";
  const opponents = view.opponents ?? [];
  if (opponents.length === 0) return;
  const list = document.createElement("div");
  list.className = "opponent-list";
  opponents.forEach((opponent) => {
    const stack = document.createElement("div");
    stack.className = "opponent-stack compact";
    if (view.mode === "multiplayer" && view.currentPlayerIndex === opponent.playerIndex) {
      stack.classList.add("current-turn");
    }
    if (opponent.connected === false) {
      stack.classList.add("disconnected");
    }
    
    // Check if this opponent has a revealed card
    const hasReveal = revealOpponentPlayerIndex === opponent.playerIndex && !!revealOpponentCard;
    if (hasReveal && revealOpponentType === "wild") {
      stack.classList.add("wild-pickup");
    } else if (hasReveal && revealOpponentType === "discard") {
      stack.classList.add("discard-pickup");
    }
    
    const label = document.createElement("div");
    label.className = "opponent-label";
    label.textContent = opponentLabel(opponent, view);
    
    // Compact card stack display
    const cardCount = opponent.handCount ?? (Array.isArray(opponent.hand) ? opponent.hand.length : 0);
    const cardsContainer = document.createElement("div");
    cardsContainer.className = "opponent-cards-compact";
    
    // Render 3 stacked mini cards
    for (let i = 0; i < Math.min(3, cardCount); i++) {
      const miniCard = document.createElement("div");
      miniCard.className = "mini-card";
      cardsContainer.appendChild(miniCard);
    }
    
    // Card count badge
    const countBadge = document.createElement("div");
    countBadge.className = "card-count-badge";
    countBadge.textContent = cardCount;
    cardsContainer.appendChild(countBadge);
    
    // Wild indicator
    if (hasReveal && revealOpponentType === "wild") {
      const wildIndicator = document.createElement("div");
      wildIndicator.className = "wild-indicator";
      wildIndicator.textContent = "WILD!";
      cardsContainer.appendChild(wildIndicator);
    }
    
    // Discard pickup indicator - show the card
    if (hasReveal && revealOpponentType === "discard" && revealOpponentCard) {
      const pickedCard = document.createElement("div");
      pickedCard.className = "picked-card";
      const suit = SuitSymbols[revealOpponentCard.suit] || "";
      const rank = revealOpponentCard.rank === JokerRank ? "🃏" : revealOpponentCard.rank;
      pickedCard.innerHTML = `<span class="picked-rank">${rank}</span><span class="picked-suit">${suit}</span>`;
      if (revealOpponentCard.suit === "Hearts" || revealOpponentCard.suit === "Diamonds") {
        pickedCard.classList.add("red");
      }
      cardsContainer.appendChild(pickedCard);
    }
    
    stack.append(label, cardsContainer);
    list.appendChild(stack);
  });
  opponentHandEl.appendChild(list);
}

function renderOpponentMeldGroups(view) {
  opponentMeldsEl.innerHTML = "";
  const opponents = view.opponents ?? [];
  if (opponents.length === 0) return;
  const useGroupedLayout = !(opponents.length === 1 && view.mode === "local");
  opponentMeldsEl.classList.toggle("meld-group-grid", useGroupedLayout);
  opponentMeldsEl.classList.toggle("meld-grid", !useGroupedLayout);
  if (!useGroupedLayout) {
    renderMelds(opponentMeldsEl, opponents[0], opponents[0].playerIndex);
    return;
  }
  opponents.forEach((opponent) => {
    const group = document.createElement("div");
    group.className = "meld-group";
    const label = document.createElement("div");
    label.className = "meld-group-label";
    label.textContent = opponentLabel(opponent, view);
    const grid = document.createElement("div");
    grid.className = "meld-grid meld-grid-group";
    renderMelds(grid, opponent, opponent.playerIndex);
    group.append(label, grid);
    opponentMeldsEl.appendChild(group);
  });
}

function renderAll() {
  const view = getView();
  const opponents = view.opponents ?? [];
  const isSinglePlayer = view.mode === "local" && opponents.length === 1;
  document.body.classList.toggle("single-player", isSinglePlayer);
  if (opponentLogPanel) {
    opponentLogPanel.classList.toggle("hidden", !devMode);
  }
  const baseHand = autoSortEnabled ? sortHand(view.you.hand) : view.you.hand;
  const handToRender = autoSortEnabled ? baseHand : orderHandForDisplay(baseHand);
  renderHand(yourHandEl, handToRender, {
    faceUp: true,
    selectable: true,
    selectedId: selectedCardId,
  });
  renderOpponentHands(view);
  const ownerIndex = multiplayerState ? multiplayerPlayerIndex : 0;
  renderMelds(yourMeldsEl, view.you, ownerIndex);
  renderOpponentMeldGroups(view);
  renderPiles(view);
  updateSortToggle();
  updateScore();
  updateRoundButtons(view);
  updateLaydownControls(view);
  updateBuyControls(view);
  updateTurnHighlight();
  updateWinCelebration();
}

function resetSelections() {
  selectedCardId = null;
  clearMeldHighlights();
  clearSelectedHighlight();
}

function startRound() {
  if (multiplayerEnabled) return;
  game.roundIndex = 0;
  game.startRound();
  state = "await_draw";
  lastWinner = null;
  stopWinCelebration();
  resetSelections();
  clearRevealState();
  opponentLogEl.innerHTML = "";
  setMessage("Your turn: draw from deck or discard.");
  renderAll();
}

function clearRevealState() {
  revealOpponentCardId = null;
  revealOpponentCard = null;
  revealOpponentType = null;
  revealOpponentPlayerIndex = null;
  if (revealTimer) {
    clearTimeout(revealTimer);
    revealTimer = null;
  }
}

function advanceRound() {
  if (multiplayerEnabled) return;
  game.nextRound();
  state = "await_draw";
  lastWinner = null;
  stopWinCelebration();
  resetSelections();
  clearRevealState();
  opponentLogEl.innerHTML = "";
  setMessage("Your turn: draw from deck or discard.");
  renderAll();
}

function canAct() {
  const phase = currentPhase();
  if (multiplayerEnabled) {
    if (!multiplayerState) return false;
    if (!multiplayerReady()) return false;
    return isPlayerTurn() && (phase === "await_draw" || phase === "await_discard");
  }
  return phase === "await_draw" || phase === "await_discard";
}

function handlePlayerDraw(source) {
  if (multiplayerEnabled) {
    if (!multiplayerState) return;
    if (!multiplayerReady()) {
      setMessage(waitingForPlayersMessage());
      return;
    }
    if (!isPlayerTurn() || currentPhase() !== "await_draw") return;
    sendAction("draw", { source });
    return;
  }
  if (state !== "await_draw") return;
  const player = game.players[0];
  const card = source === "discard" ? game.drawFromDiscard(player) : game.drawFromStock(player);
  if (card) {
    setMessage(`You drew ${card.rank} from ${source}.`);
    playSound("draw");
  } else {
    setMessage(`No cards available in ${source}.`);
  }
  state = "await_discard";
  renderAll();
}

function handlePlayerDiscard(card) {
  if (multiplayerEnabled) {
    if (!multiplayerState) return;
    if (!multiplayerReady()) {
      setMessage(waitingForPlayersMessage());
      return;
    }
    if (!card) return;
    if (!isPlayerTurn() || currentPhase() !== "await_discard") return;
    if (!youHasLaidDown()) {
      const stagedCount = multiplayerState.you.stagedMelds?.length ?? 0;
      if (stagedCount > 0) {
        pendingDiscardCardId = card.cid;
        sendAction("laydown");
        return;
      }
    }
    sendAction("discard", { cardId: card.cid });
    return;
  }
  if (state !== "await_discard") return;
  if (!card) return;
  const player = game.players[0];
  if (!player.hasLaidDown && player.stagedMelds.length > 0) {
    if (!game.tryLayDownStaged(player)) {
      const summary = formatRequirements(game.currentRound().requirements);
      setMessage(`Staged cards do not form ${summary}.`);
      renderAll();
      return;
    }
    playSound("play");
  }
  if (!player.hasLaidDown && player.stagedMelds.length > 0) {
    game.clearStaged(player);
  }
  game.discard(player, card);
  setMessage(`You discarded ${card.rank}.`);
  playSound("discard");
  renderAll();
  if (game.checkWin(game.players[0])) {
    game.applyRoundScores(0);
    setMessage("You win! Press Next Round to continue or Restart to reset.");
    lastWinner = 0;
    state = "game_over";
    renderAll();
    return;
  }
  state = "ai_turn";
  resetSelections();
  renderAll();
  setTimeout(runAiTurn, 600);
}

function runAiTurn() {
  const result = aiTurn(game, 1);
  result.log.forEach((entry) => logOpponent(entry));
  if (result.drawChoice === "deck" && result.drewCard && devMode) {
    logOpponent(`(Hidden draw was ${result.drewCard.rank}.)`);
  }
  if (result.drewCard) {
    playSound("draw");
  }
  const isWildDraw = result.drawChoice === "deck" && result.drewCard && (typeof result.drewCard.isWild === 'function' ? result.drewCard.isWild() : false);
  const isDiscardDraw = result.drawChoice === "discard";
  const shouldReveal = result.drewCard && !devMode && (isDiscardDraw || isWildDraw);
  if (shouldReveal) {
    revealOpponentCardId = result.drewCard.cid;
    revealOpponentCard = result.drewCard;
    revealOpponentType = isWildDraw ? "wild" : "discard";
    revealOpponentPlayerIndex = 1; // AI is always player 1 in local mode
    if (revealTimer) {
      clearTimeout(revealTimer);
    }
    revealTimer = setTimeout(() => {
      revealOpponentCardId = null;
      revealOpponentCard = null;
      revealOpponentType = null;
      revealOpponentPlayerIndex = null;
      renderAll();
    }, 3000);
  }
  if (result.discarded) {
    playSound("discard");
  }

  if (game.checkWin(game.players[1])) {
    game.applyRoundScores(1);
    setMessage("Opponent wins. Press Next Round to continue or Restart to reset.");
    lastWinner = 1;
    state = "game_over";
  } else {
    state = "await_draw";
    setMessage("Your turn: draw from deck or discard.");
  }
  renderAll();
}

function runPlayerAiTurn() {
  if (state !== "await_draw" && state !== "await_discard") return;
  const result = aiTurnEngine(game, 0);
  if (result.drewCard) {
    playSound("draw");
  }
  if (result.log.some((entry) => entry.includes("Laid down") || entry.includes("Laid off"))) {
    playSound("play");
  }
  if (result.discarded) {
    playSound("discard");
  }
  if (game.checkWin(game.players[0])) {
    game.applyRoundScores(0);
    setMessage("You win! Press Next Round to continue or Restart to reset.");
    lastWinner = 0;
    state = "game_over";
    renderAll();
    return;
  }
  state = "ai_turn";
  renderAll();
  setTimeout(runAiTurn, 600);
}

laydownSelectedBtn.addEventListener("click", () => {
  if (multiplayerEnabled) {
    if (!multiplayerState) return;
    if (!multiplayerReady()) {
      setMessage(waitingForPlayersMessage());
      return;
    }
    if (!isPlayerTurn() || currentPhase() !== "await_discard") return;
    const staged = multiplayerState.you.stagedMelds ?? [];
    if (staged.length === 0) {
      setMessage("Stage cards first.");
      return;
    }
    sendAction("laydown");
    return;
  }
  if (state !== "await_discard") return;
  const player = game.players[0];
  if (player.stagedMelds.length === 0) {
    setMessage("Stage cards first.");
    return;
  }
  if (game.tryLayDownStaged(player)) {
    const summary = formatRequirements(game.currentRound().requirements);
    setMessage(`You laid down ${summary}.`);
    playSound("play");
    resetSelections();
  } else {
    const summary = formatRequirements(game.currentRound().requirements);
    setMessage(`Staged cards do not form ${summary}.`);
  }
  renderAll();
});

autoStageBtn.addEventListener("click", () => {
  if (multiplayerEnabled) {
    if (!multiplayerState) return;
    if (!multiplayerReady()) {
      setMessage(waitingForPlayersMessage());
      return;
    }
    if (!isPlayerTurn() || currentPhase() !== "await_discard") return;
    sendAction("auto_stage");
    return;
  }
  if (state !== "await_discard") return;
  const player = game.players[0];
  if (game.autoStageMelds(player)) {
    setMessage("Staged melds. Review and click Lay Down Selected.");
    renderAll();
    return;
  }
  setMessage("No valid melds to stage.");
});

restartBtn.addEventListener("click", () => {
  if (multiplayerEnabled) {
    setMessage("Use Next Round or Leave.");
    return;
  }
  if (state !== "game_over") {
    setMessage("Finish the round before restarting.");
    return;
  }
  startRound();
});

nextRoundBtn.addEventListener("click", () => {
  if (multiplayerEnabled) {
    if (!multiplayerState) return;
    if (multiplayerState.phase !== "game_over") {
      setMessage("Finish the round before continuing.");
      return;
    }
    sendAction("restart");
    return;
  }
  if (state !== "game_over") {
    setMessage("Finish the round before continuing.");
    return;
  }
  advanceRound();
});

function openRulesModal() {
  if (!rulesModal) return;
  rulesModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeRulesModal() {
  if (!rulesModal) return;
  rulesModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

if (rulesBtn && rulesModal) {
  rulesBtn.addEventListener("click", openRulesModal);
  if (rulesCloseBtn) {
    rulesCloseBtn.addEventListener("click", closeRulesModal);
  }
  rulesModal.addEventListener("click", (event) => {
    if (event.target === rulesModal) {
      closeRulesModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !rulesModal.classList.contains("hidden")) {
      closeRulesModal();
    }
  });
}

if (skipRoundBtn) {
  skipRoundBtn.addEventListener("click", () => {
    if (multiplayerEnabled) {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      sendSocket({ type: "skip_round" });
      return;
    }
    advanceRound();
  });
}

devModeToggle.addEventListener("change", (event) => {
  devMode = event.target.checked;
  if (devSliders) {
    devSliders.classList.toggle("hidden", !devMode);
  }
  if (multiplayerEnabled && socket && socket.readyState === WebSocket.OPEN) {
    sendSocket({ type: "set_dev_mode", enabled: devMode });
  }
  renderAll();
});

function setMultiplayerEnabled(enabled) {
  const wasEnabled = multiplayerEnabled;
  multiplayerEnabled = enabled;
  if (enabled && !wasEnabled) {
    opponentLogEl.innerHTML = "";
    clearRevealState();
  }
  devModeToggle.disabled = false;
}

function updateMessageFromState() {
  if (!multiplayerState) return;
  updateTurnHighlight();
  if (!multiplayerReady()) {
    setMessage(waitingForPlayersMessage(), "waiting");
    return;
  }
  if (multiplayerState.phase === "game_over") {
    const winnerLabel =
      multiplayerState.winnerIndex === multiplayerPlayerIndex
        ? "You win!"
        : `${playerLabel(multiplayerState.winnerIndex, multiplayerState)} wins.`;
    setMessage(`${winnerLabel} Press Next Round to continue.`);
    return;
  }
  if (isPlayerTurn()) {
    const prompt = multiplayerState.phase === "await_draw" ? "Your turn: draw from deck or discard." : "Your turn: discard.";
    setMessage(prompt, "your-turn");
  } else {
    setMessage(`${playerLabel(multiplayerState.currentPlayerIndex, multiplayerState)}'s turn.`, "waiting");
  }
}

function updateSortToggle() {
  if (!sortHandBtn) return;
  sortHandBtn.classList.toggle("active", autoSortEnabled);
  sortHandBtn.setAttribute("aria-pressed", autoSortEnabled ? "true" : "false");
  sortHandBtn.textContent = autoSortEnabled ? "Auto Sort: On" : "Auto Sort";
}

function updateTurnHighlight() {
  if (yourRowEl) {
    const showHighlight = multiplayerEnabled 
      ? (multiplayerReady() && isPlayerTurn())
      : (state === "await_draw" || state === "await_discard");
    if (showHighlight) {
      yourRowEl.classList.add("your-turn");
    } else {
      yourRowEl.classList.remove("your-turn");
    }
  }
}

function setupHandTuningControls() {
  const root = document.documentElement;
  if (!fanCurveInput || !fanRotateInput || !fanSpreadInput) return;

  const styles = getComputedStyle(root);
  const curve = parseFloat(styles.getPropertyValue("--hand-fan-curve")) || 1;
  const rotate = parseFloat(styles.getPropertyValue("--hand-fan-rotate")) || 3;
  const spread = parseFloat(styles.getPropertyValue("--hand-dynamic-spread")) || 520;
  const lift = parseFloat(styles.getPropertyValue("--hand-lift")) || 0;

  fanCurveInput.value = curve.toString();
  fanRotateInput.value = rotate.toString();
  fanSpreadInput.value = spread.toString();
  if (fanLiftInput) fanLiftInput.value = lift.toString();
  if (devSliders) {
    devSliders.classList.toggle("hidden", !devMode);
  }

  const updateValue = () => {
    if (fanCurveValue) fanCurveValue.textContent = fanCurveInput.value;
    if (fanRotateValue) fanRotateValue.textContent = fanRotateInput.value;
    if (fanSpreadValue) fanSpreadValue.textContent = fanSpreadInput.value;
    if (fanLiftValue && fanLiftInput) fanLiftValue.textContent = fanLiftInput.value;
  };

  const apply = () => {
    const curve = `${fanCurveInput.value}px`;
    const rotate = `${fanRotateInput.value}deg`;
    const spreadValue = Number.parseFloat(fanSpreadInput.value) || 520;
    const spread = `${spreadValue}px`;
    const gapMax = `${Math.min(140, Math.max(40, spreadValue / 5.5))}px`;
    root.style.setProperty("--hand-fan-curve", curve);
    root.style.setProperty("--hand-fan-rotate", rotate);
    root.style.setProperty("--hand-dynamic-spread", spread);
    root.style.setProperty("--hand-dynamic-gap-max", gapMax);
    if (fanLiftInput) {
      root.style.setProperty("--hand-lift", `${fanLiftInput.value}px`);
    }
    document.querySelectorAll(".hand.curved-hand").forEach((hand) => {
      hand.style.setProperty("--hand-fan-curve", curve);
      hand.style.setProperty("--hand-fan-rotate", rotate);
      hand.style.setProperty("--hand-dynamic-spread", spread);
      hand.style.setProperty("--hand-dynamic-gap-max", gapMax);
      if (fanLiftInput) {
        hand.style.setProperty("--hand-lift", `${fanLiftInput.value}px`);
      }
    });
    updateValue();
    renderAll();
  };

  fanCurveInput.addEventListener("input", apply);
  fanRotateInput.addEventListener("input", apply);
  fanSpreadInput.addEventListener("input", apply);
  if (fanLiftInput) fanLiftInput.addEventListener("input", apply);
  updateValue();
}

function updateRoundButtons(view) {
  if (!nextRoundBtn || !restartBtn) return;
  const phase = view?.phase ?? state;
  const gameOver = phase === "game_over";
  nextRoundBtn.classList.toggle("hidden", !gameOver);
  if (multiplayerEnabled) {
    restartBtn.classList.add("hidden");
  } else {
    restartBtn.classList.remove("hidden");
  }
}

function updateBuyControls(view) {
  if (!buyBtn) return;
  const canBuy =
    multiplayerEnabled &&
    view?.maxPlayers >= 3 &&
    view?.phase === "await_draw" &&
    !isPlayerTurn() &&
    Boolean(view?.buyAvailable) &&
    Boolean(view?.discardTop);
  buyBtn.classList.toggle("hidden", !multiplayerEnabled);
  buyBtn.disabled = !canBuy || buyPending;
  buyBtn.textContent = buyPending ? "Buying..." : "Buy";
}

function updateLaydownControls(view) {
  if (!laydownSelectedBtn || !autoStageBtn) return;
  const phase = view?.phase ?? state;
  const canUse =
    phase === "await_discard" &&
    !youHasLaidDown() &&
    (!multiplayerEnabled || (multiplayerReady() && isPlayerTurn()));
  const stagedCount = view?.you?.stagedMelds?.length ?? 0;
  laydownSelectedBtn.disabled = !canUse || stagedCount === 0;
  autoStageBtn.disabled = !canUse;
}

function stageCardForLaydown(cardId, meldIndex = null) {
  if (multiplayerEnabled) {
    if (!multiplayerState) return;
    if (!multiplayerReady()) {
      setMessage(waitingForPlayersMessage());
      return;
    }
    if (!isPlayerTurn() || currentPhase() !== "await_discard") return;
    sendAction("stage", { cardId, meldIndex });
    return;
  }
  const player = game.players[0];
  const card = player.hand.find((c) => c.cid === cardId);
  if (!card) return;
  game.stageCard(player, card, meldIndex);
  renderAll();
}

function unstageCardForLaydown(cardId) {
  if (multiplayerEnabled) {
    if (!multiplayerState) return;
    if (!isPlayerTurn() || currentPhase() !== "await_discard") return;
    sendAction("unstage", { cardId });
    return;
  }
  if (state !== "await_discard") return;
  const player = game.players[0];
  if (player.hasLaidDown) return;
  const card = player.stagedMelds.flatMap((meld) => meld.cards).find((c) => c.cid === cardId);
  if (!card) return;
  game.unstageCard(player, card);
  renderAll();
}

function wsUrl() {
  return `${location.origin.replace(/^http/, "ws")}/ws`;
}

function ensureSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return socket;
  }
  socket = new WebSocket(wsUrl());
  socket.addEventListener("message", handleSocketMessage);
  socket.addEventListener("close", () => {
    if (multiplayerEnabled) {
      multiplayerRoom = null;
      roomCodeInput.value = "";
      setMessage("Disconnected. Rejoin to continue.");
    }
  });
  return socket;
}

function sendSocket(payload) {
  const target = ensureSocket();
  const data = JSON.stringify(payload);
  if (target.readyState === WebSocket.OPEN) {
    target.send(data);
  } else {
    target.addEventListener(
      "open",
      () => {
        target.send(data);
      },
      { once: true },
    );
  }
}

function totalMeldCards(melds) {
  return melds.reduce((sum, meld) => sum + meld.cards.length, 0);
}

function maybePlayMultiplayerSounds(prevState, nextState) {
  if (!prevState) return;

  const prevPhase = prevState.phase;
  const nextPhase = nextState.phase;

  const drewCard =
    (prevPhase === "await_draw" && nextPhase === "await_discard") ||
    (prevState.drawCount > nextState.drawCount);
  if (drewCard) {
    playSound("draw");
  }

  const prevDiscard = prevState.discardTop?.cid;
  const nextDiscard = nextState.discardTop?.cid;
  const discardedCard =
    (prevPhase === "await_discard" && (nextPhase === "await_draw" || nextPhase === "game_over")) ||
    prevDiscard !== nextDiscard;
  if (discardedCard && prevDiscard !== nextDiscard) {
    playSound("discard");
  }

  const prevOpponents = prevState.opponents ?? [];
  const nextOpponents = nextState.opponents ?? [];
  const prevOpponentCards = prevOpponents.reduce((sum, opponent) => sum + totalMeldCards(opponent.melds ?? []), 0);
  const nextOpponentCards = nextOpponents.reduce((sum, opponent) => sum + totalMeldCards(opponent.melds ?? []), 0);
  const prevMeldCards = totalMeldCards(prevState.you.melds) + prevOpponentCards;
  const nextMeldCards = totalMeldCards(nextState.you.melds) + nextOpponentCards;
  if (nextMeldCards > prevMeldCards) {
    playSound("play");
  }
}

function handleSocketMessage(event) {
  let msg;
  try {
    msg = JSON.parse(event.data);
  } catch {
    return;
  }

  if (msg.type === "error") {
    if (pendingDiscardCardId) {
      pendingDiscardCardId = null;
    }
    if (buyPending) {
      buyPending = false;
    }
    setMessage(msg.message);
    return;
  }

  if (msg.type === "room_created" || msg.type === "room_joined") {
    multiplayerRoom = msg.room;
    multiplayerPlayerIndex = msg.playerIndex;
    roomCodeInput.value = multiplayerRoom;
    const url = new URL(location.href);
    url.searchParams.set("room", multiplayerRoom);
    history.replaceState(null, "", url);
    setMessage("Waiting for players...", "waiting");
    showRoomControls(true);
    return;
  }

  if (msg.type === "room_left") {
    leaveRoomCleanup();
    setMessage("Left the room.");
    return;
  }

  if (msg.type === "player_left") {
    setMessage(`${playerLabel(msg.playerIndex, multiplayerState)} left the game.`, "waiting");
    renderAll();
    return;
  }

  if (msg.type === "buy_success") {
    const label = playerLabel(msg.buyerIndex, multiplayerState);
    if (multiplayerPlayerIndex === msg.buyerIndex) {
      buyPending = false;
    }
    setMessage(`${label} bought the discard.`);
    playSound("ding");
    return;
  }

  if (msg.type === "state") {
    const prevState = multiplayerState;
    multiplayerState = msg;
    syncManualHandOrder(multiplayerState.you.hand);
    logMultiplayerActivity(prevState, multiplayerState);
    maybePlayMultiplayerSounds(prevState, multiplayerState);
    setMultiplayerEnabled(true);
    resetSelections();
    renderAll();
    updateMessageFromState();
    if (buyPending && !multiplayerState.buyAvailable) {
      const wasDiscardTaken = prevState?.discardTop?.cid !== multiplayerState.discardTop?.cid;
      buyPending = false;
      setMessage(wasDiscardTaken ? "Discard taken by current player." : "Another player bought the discard.");
      updateBuyControls(multiplayerState);
    }
    if (
      pendingDiscardCardId &&
      multiplayerState.phase === "await_discard" &&
      isPlayerTurn() &&
      multiplayerReady()
    ) {
      if (multiplayerState.you.hasLaidDown) {
        if (hasLayoffOpportunity(multiplayerState)) {
          pendingDiscardCardId = null;
          setMessage("You can lay off before discarding.");
          return;
        }
        const card = multiplayerState.you.hand.find((c) => c.cid === pendingDiscardCardId);
        pendingDiscardCardId = null;
        if (card) {
          sendAction("discard", { cardId: card.cid });
        }
      } else if ((multiplayerState.you.stagedMelds?.length ?? 0) === 0) {
        pendingDiscardCardId = null;
        setMessage("Lay down invalid. Adjust melds.");
      }
    }
  }
}

function sendAction(action, payload = {}) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    setMessage("Not connected to server.");
    return;
  }
  sendSocket({ type: "action", action, ...payload });
}

function createRoom() {
  setMultiplayerEnabled(true);
  setMessage("Creating room...");
  const size = Number(roomSizeSelect?.value ?? 2);
  sendSocket({ type: "create_room", players: size });
}

function joinRoom(code) {
  const trimmed = String(code || "").trim().toUpperCase();
  if (!trimmed) {
    setMessage("Enter a room code to join.");
    return;
  }
  setMultiplayerEnabled(true);
  setMessage(`Joining room ${trimmed}...`, "waiting");
  sendSocket({ type: "join_room", room: trimmed });
}

function leaveRoom() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    sendSocket({ type: "leave_room" });
  } else {
    leaveRoomCleanup();
  }
}

function addAiPlayer() {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    setMessage("Not connected to server.");
    return;
  }
  sendSocket({ type: "add_ai" });
}

function leaveRoomCleanup() {
  multiplayerEnabled = false;
  multiplayerState = null;
  multiplayerRoom = null;
  multiplayerPlayerIndex = null;
  manualHandOrder = [];
  lastWinner = null;
  stopWinCelebration();
  roomCodeInput.value = "";
  showRoomControls(false);
  const url = new URL(location.href);
  url.searchParams.delete("room");
  history.replaceState(null, "", url);
  updateTurnHighlight();
  startRound();
}

function showRoomControls(inRoom) {
  createRoomBtn.classList.toggle("hidden", inRoom);
  joinRoomBtn.classList.toggle("hidden", inRoom);
  if (addAiBtn) {
    addAiBtn.classList.toggle("hidden", !inRoom);
  }
  leaveRoomBtn.classList.toggle("hidden", !inRoom);
  roomCodeInput.readOnly = inRoom;
  if (roomSizeSelect) {
    roomSizeSelect.disabled = inRoom;
  }
}

createRoomBtn.addEventListener("click", () => {
  createRoom();
});

joinRoomBtn.addEventListener("click", () => {
  joinRoom(roomCodeInput.value);
});

leaveRoomBtn.addEventListener("click", () => {
  leaveRoom();
});

if (addAiBtn) {
  addAiBtn.addEventListener("click", () => {
    addAiPlayer();
  });
}

if (buyBtn) {
  buyBtn.addEventListener("click", () => {
    if (!multiplayerState) {
      setMessage("Join a room first.");
      return;
    }
    if (buyPending) return;
    buyPending = true;
    updateBuyControls(multiplayerState);
    setMessage("Buy requested.");
    sendSocket({ type: "buy" });
  });
}

if (sortHandBtn) {
  sortHandBtn.addEventListener("click", () => {
    const wasEnabled = autoSortEnabled;
    autoSortEnabled = !autoSortEnabled;
    if (wasEnabled && !autoSortEnabled) {
      const view = getView();
      const sortedHand = sortHand(view.you.hand);
      manualHandOrder = sortedHand.map((card) => card.cid);
      if (!multiplayerState) {
        const hand = getYourHand();
        hand.length = 0;
        hand.push(...sortedHand);
      }
    }
    renderAll();
  });
}

roomCodeInput.addEventListener("input", () => {
  roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-Z]/g, "");
});

roomCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    joinRoom(roomCodeInput.value);
  }
});


[drawPileEl, discardPileEl].forEach((pile) => {
  pile.addEventListener("dblclick", () => {
    if (!canAct()) return;
    const source = pile.dataset.pile;
    handlePlayerDraw(source);
  });

  pile.addEventListener(
    "touchend",
    (event) => {
      if (!canAct()) return;
      event.preventDefault();
      const source = pile.dataset.pile;
      const now = Date.now();
      if (lastPileTapId === source && now - lastPileTapTime < 350) {
        handlePlayerDraw(source);
        lastPileTapId = null;
        lastPileTapTime = 0;
      } else {
        lastPileTapId = source;
        lastPileTapTime = now;
      }
    },
    { passive: false },
  );
});

yourHandEl.addEventListener("click", (event) => {
  const cardEl = event.target.closest(".card");
  if (!cardEl) return;
  if (currentPhase() !== "await_discard") return;
  const cardId = Number(cardEl.dataset.cardId);
  if (!cardId) return;
  if (!youHasLaidDown()) {
    selectedCardId = null;
    setMessage("Drag cards to Your Melds to stage them.");
    return;
  }
  selectedCardId = cardId;
  setMessage("Selected card. Click a meld to lay off.");
  setSelectedHighlight(cardId);
});

yourHandEl.addEventListener("dblclick", (event) => {
  if (currentPhase() !== "await_discard") return;
  const cardEl = event.target.closest(".card");
  if (!cardEl) return;
  const cardId = Number(cardEl.dataset.cardId);
  const card = getYourHand().find((c) => c.cid === cardId);
  handlePlayerDiscard(card);
});

function handleLayoff(cardId, meldEl) {
  const meld = getMeldFromElement(meldEl);
  const card = getYourHand().find((c) => c.cid === cardId);
  if (!card || !meld) return false;
  if (meldEl?.dataset?.staged === "true") {
    setMessage("Cannot lay off onto a staged meld.");
    return false;
  }
  if (multiplayerEnabled) {
    if (!multiplayerState) return false;
    if (!multiplayerReady()) {
      setMessage(waitingForPlayersMessage());
      return false;
    }
    if (!isPlayerTurn() || currentPhase() !== "await_discard" || !youHasLaidDown()) return false;
    const meldOwner = Number(meldEl.dataset.ownerIndex);
    const meldIndex = Number(meldEl.dataset.meldIndex);
    if (!Number.isFinite(meldOwner)) return false;
    sendAction("layoff", { cardId, meldOwner, meldIndex });
    return true;
  }
  if (game.layOffCardToMeld(game.players[0], card, meld)) {
    setMessage(`Laid off ${card.rank} to meld.`);
    playSound("play");
    resetSelections();
    renderAll();
    if (game.checkWin(game.players[0])) {
      game.applyRoundScores(0);
      setMessage("You win! Press Next Round to continue or Restart to reset.");
      lastWinner = 0;
      state = "game_over";
      renderAll();
    }
    return true;
  }
  setMessage("Cannot lay off to that meld.");
  return false;
}

function handleLayoffClick(event) {
  if (!selectedCardId || currentPhase() !== "await_discard") return;
  if (!youHasLaidDown()) return;
  const meldEl = event.target.closest(".meld");
  if (meldEl?.dataset?.staged === "true") return;
  handleLayoff(selectedCardId, meldEl);
}

function getPlayerViewByIndex(index) {
  if (multiplayerState) {
    if (index === multiplayerPlayerIndex) return multiplayerState.you;
    return multiplayerState.opponents?.find((opponent) => opponent.playerIndex === index) ?? null;
  }
  return game.players[index] ?? null;
}

function getMeldFromElement(meldEl) {
  if (!meldEl) return null;
  const ownerIndex = Number(meldEl.dataset.ownerIndex);
  const meldIndex = Number(meldEl.dataset.meldIndex);
  if (!Number.isFinite(ownerIndex)) return null;
  const isStaged = meldEl.dataset.staged === "true";
  const player = getPlayerViewByIndex(ownerIndex);
  if (!player) return null;
  const melds = isStaged ? player.stagedMelds : player.melds;
  return melds?.[meldIndex] ?? null;
}

function clearMeldHighlights() {
  document.querySelectorAll(".meld.drop-valid").forEach((meldEl) => {
    meldEl.classList.remove("drop-valid");
  });
}

function updateMeldHighlights(cardId) {
  clearMeldHighlights();
  const card = getYourHand().find((c) => c.cid === cardId);
  if (!card) return;
  document.querySelectorAll(".meld").forEach((meldEl) => {
    if (meldEl.dataset.staged === "true") return;
    const meld = getMeldFromElement(meldEl);
    if (meld && meldCanAdd(meld, card)) {
      meldEl.classList.add("drop-valid");
    }
  });
}

yourMeldsEl.addEventListener("click", (event) => {
  if (!youHasLaidDown()) {
    const meldEl = event.target.closest(".meld");
    if (!meldEl || meldEl.dataset.staged !== "true") return;
    const cardEl = event.target.closest(".card");
    if (!cardEl) return;
    const cardId = Number(cardEl.dataset.cardId);
    if (cardId) {
      unstageCardForLaydown(cardId);
    }
    return;
  }
  handleLayoffClick(event);
});

opponentMeldsEl.addEventListener("click", handleLayoffClick);

function enableDragAndDrop() {
  if (!insertMarkerEl) {
    insertMarkerEl = document.createElement("div");
    insertMarkerEl.className = "insert-marker";
    yourHandEl.appendChild(insertMarkerEl);
  }

  function hideInsertMarker() {
    if (!insertMarkerEl) return;
    insertMarkerEl.classList.remove("active");
  }

  function showInsertMarkerForIndex(cards, index) {
    if (!insertMarkerEl) return;
    if (cards.length === 0) {
      hideInsertMarker();
      return;
    }
    const containerRect = yourHandEl.getBoundingClientRect();
    const scrollLeft = yourHandEl.scrollLeft;
    let left;
    if (index >= cards.length) {
      const lastRect = cards[cards.length - 1].getBoundingClientRect();
      left = lastRect.right - containerRect.left + scrollLeft;
    } else {
      const targetRect = cards[index].getBoundingClientRect();
      left = targetRect.left - containerRect.left + scrollLeft;
    }
    insertMarkerEl.style.left = `${left - 2}px`;
    if (yourHandEl.classList.contains("curved-hand")) {
      const computed = getComputedStyle(yourHandEl);
      const rotateStr = computed.getPropertyValue("--hand-fan-rotate").trim();
      const rotateDeg = Number.parseFloat(rotateStr) || 0;
      const middle = cards.length > 0 ? (cards.length - 1) / 2 : 0;
      const targetIndex = Math.min(index, cards.length - 1);
      const angle = (targetIndex - middle) * rotateDeg;
      insertMarkerEl.style.setProperty("--insert-marker-rotate", `${angle}deg`);
    } else {
      insertMarkerEl.style.setProperty("--insert-marker-rotate", "0deg");
    }
    insertMarkerEl.classList.add("active");
  }

  function computeInsertIndex(cards, clientX) {
    if (cards.length === 0) return 0;
    const firstRect = cards[0].getBoundingClientRect();
    const lastRect = cards[cards.length - 1].getBoundingClientRect();

    if (clientX <= firstRect.left) return 0;
    if (clientX >= lastRect.right) return cards.length;

    for (let i = 0; i < cards.length; i += 1) {
      const rect = cards[i].getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      if (clientX < midpoint) return i;
    }
    return cards.length;
  }

  function moveCardInHand(cardId, toIndex) {
    if (multiplayerState) {
      if (autoSortEnabled) return false;
      const hand = getYourHand();
      const handIds = hand.map((card) => card.cid);
      if (manualHandOrder.length === 0) {
        manualHandOrder = [...handIds];
      }
      const filtered = manualHandOrder.filter((id) => handIds.includes(id));
      const fromIndex = filtered.indexOf(cardId);
      if (fromIndex === -1 || toIndex === -1 || toIndex === undefined) return false;
      if (fromIndex === toIndex) return false;
      filtered.splice(fromIndex, 1);
      const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
      filtered.splice(adjustedToIndex, 0, cardId);
      manualHandOrder = filtered;
      return true;
    }
    const hand = getYourHand();
    const fromIndex = hand.findIndex((card) => card.cid === cardId);
    if (fromIndex === -1 || toIndex === -1 || toIndex === undefined) return false;
    if (fromIndex === toIndex) return false;
    if (!multiplayerEnabled) {
      console.log(`[hand] move cid=${cardId} from=${fromIndex} to=${toIndex} count=${hand.length}`);
    }
    const [moved] = hand.splice(fromIndex, 1);
    const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    hand.splice(adjustedToIndex, 0, moved);
    return true;
  }

  yourHandEl.addEventListener("dragstart", (event) => {
    const cardEl = event.target.closest(".card");
    if (!cardEl) return;
    const cardId = cardEl.dataset.cardId;
    event.dataTransfer.setData("text/plain", cardId);
    event.dataTransfer.effectAllowed = "move";
    draggingCardId = Number(cardId);
    if (currentPhase() === "await_discard" && youHasLaidDown()) {
      updateMeldHighlights(draggingCardId);
    }
  });

  yourHandEl.addEventListener("dragend", () => {
    draggingCardId = null;
    lastDropTargetId = null;
    clearMeldHighlights();
    hideInsertMarker();
  });

  yourHandEl.addEventListener("dragover", (event) => {
    if (currentPhase() !== "await_draw" && currentPhase() !== "await_discard") return;
    event.preventDefault();
    if (autoSortEnabled) return;
    const cards = Array.from(yourHandEl.querySelectorAll(".card"));
    if (cards.length === 0) return;
    const toIndex = computeInsertIndex(cards, event.clientX);
    showInsertMarkerForIndex(cards, toIndex);
  });

  yourHandEl.addEventListener("dragleave", (event) => {
    if (!event.relatedTarget || !yourHandEl.contains(event.relatedTarget)) {
      hideInsertMarker();
    }
  });

  yourHandEl.addEventListener("drop", (event) => {
    if (currentPhase() !== "await_draw" && currentPhase() !== "await_discard") return;
    event.preventDefault();
    if (autoSortEnabled) return;
    const cardId = Number(event.dataTransfer.getData("text/plain")) || draggingCardId;
    if (!cardId) return;
    const cards = Array.from(yourHandEl.querySelectorAll(".card"));
    if (cards.length === 0) return;

    let targetEl = event.target.closest(".card");
    let toIndex;

    if (targetEl) {
      const targetId = Number(targetEl.dataset.cardId);
      if (targetId === cardId) return;
      if (lastDropTargetId === targetId) return;
      toIndex = cards.findIndex((cardEl) => Number(cardEl.dataset.cardId) === targetId);
      lastDropTargetId = targetId;
    } else {
      toIndex = computeInsertIndex(cards, event.clientX);
    }

    if (!moveCardInHand(cardId, toIndex)) return;
    hideInsertMarker();
    renderAll();
  });

  let touchCardId = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchDragging = false;

  yourHandEl.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.touches[0];
      if (!touch) return;
      const target = event.target.closest(".card");
      if (!target) return;
      const cardId = Number(target.dataset.cardId);
      if (!cardId) return;
      touchCardId = cardId;
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchDragging = false;
      draggingCardId = cardId;
      if (currentPhase() === "await_discard" && youHasLaidDown()) {
        updateMeldHighlights(cardId);
      }
    },
    { passive: true },
  );

  yourHandEl.addEventListener(
    "touchmove",
    (event) => {
      if (!touchCardId) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = Math.abs(touch.clientX - touchStartX);
      const dy = Math.abs(touch.clientY - touchStartY);
      if (!touchDragging && (dx > 6 || dy > 6)) {
        touchDragging = true;
      }
      if (!touchDragging) return;
      event.preventDefault();
      const cards = Array.from(yourHandEl.querySelectorAll(".card"));
      if (cards.length > 0 && yourHandEl.contains(document.elementFromPoint(touch.clientX, touch.clientY))) {
        const toIndex = computeInsertIndex(cards, touch.clientX);
        showInsertMarkerForIndex(cards, toIndex);
      } else {
        hideInsertMarker();
      }
    },
    { passive: false },
  );

  yourHandEl.addEventListener(
    "touchend",
    (event) => {
      if (!touchCardId) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const cardId = touchCardId;
      touchCardId = null;

      if (!touchDragging) {
        const now = Date.now();
        if (lastTapCardId === cardId && now - lastTapTime < 350) {
          const card = getYourHand().find((c) => c.cid === cardId);
          handlePlayerDiscard(card);
          lastTapCardId = null;
          lastTapTime = 0;
        } else {
          lastTapCardId = cardId;
          lastTapTime = now;
        }
        draggingCardId = null;
        clearMeldHighlights();
        hideInsertMarker();
        return;
      }

      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!target) {
        draggingCardId = null;
        touchDragging = false;
        clearMeldHighlights();
        hideInsertMarker();
        return;
      }

      if (discardPileEl.contains(target)) {
        const card = getYourHand().find((c) => c.cid === cardId);
        handlePlayerDiscard(card);
      } else if (yourMeldsEl.contains(target) || opponentMeldsEl.contains(target)) {
        const owner = opponentMeldsEl.contains(target) ? "opponent" : "you";
        if (!youHasLaidDown()) {
          if (owner === "you") {
            const meldEl = target.closest(".meld");
            if (meldEl && meldEl.dataset.staged === "true") {
              stageCardForLaydown(cardId, Number(meldEl.dataset.meldIndex));
            } else {
              stageCardForLaydown(cardId, null);
            }
          }
        } else {
          const meldEl = target.closest(".meld");
          if (meldEl) {
            handleLayoff(cardId, meldEl);
          }
        }
      } else if (yourHandEl.contains(target)) {
        const cards = Array.from(yourHandEl.querySelectorAll(".card"));
        const toIndex = computeInsertIndex(cards, touch.clientX);
        if (moveCardInHand(cardId, toIndex)) {
          renderAll();
        }
      }

      draggingCardId = null;
      touchDragging = false;
      clearMeldHighlights();
      hideInsertMarker();
    },
    { passive: false },
  );

  discardPileEl.addEventListener("dragover", (event) => {
    if (currentPhase() !== "await_discard") return;
    event.preventDefault();
  });

  discardPileEl.addEventListener("drop", (event) => {
    event.preventDefault();
    const cardId = Number(event.dataTransfer.getData("text/plain"));
    const card = getYourHand().find((c) => c.cid === cardId);
    handlePlayerDiscard(card);
    clearMeldHighlights();
  });

  [
    { el: yourMeldsEl, allowStage: true },
    { el: opponentMeldsEl, allowStage: false },
  ].forEach(({ el, allowStage }) => {
    el.addEventListener("dragover", (event) => {
      if (currentPhase() !== "await_discard") return;
      if (!youHasLaidDown()) {
        if (!allowStage) return;
        event.preventDefault();
        return;
      }
      // Check if there are any melds to lay off to
      const view = getView();
      const opponentMelds = view.opponents ? view.opponents.flatMap((opponent) => opponent.melds ?? []) : [];
      const allMelds = [...view.you.melds, ...opponentMelds];
      if (allMelds.length === 0) return;
      event.preventDefault();
    });

    el.addEventListener("drop", (event) => {
      if (currentPhase() !== "await_discard") return;
      event.preventDefault();
      const cardId = Number(event.dataTransfer.getData("text/plain")) || draggingCardId;
      if (!cardId) return;
      if (!youHasLaidDown()) {
        if (!allowStage) return;
        const meldEl = event.target.closest(".meld");
        if (meldEl && meldEl.dataset.staged === "true") {
          const meldIndex = Number(meldEl.dataset.meldIndex);
          stageCardForLaydown(cardId, meldIndex);
        } else {
          stageCardForLaydown(cardId, null);
        }
        clearMeldHighlights();
        return;
      }

      // Try exact meld first, then find nearest valid meld
      let meldEl = event.target.closest(".meld");
      if (!meldEl) {
        // Find the valid meld that's highlighted (if only one, use it)
        const validMelds = el.querySelectorAll(".meld.drop-valid");
        if (validMelds.length === 1) {
          meldEl = validMelds[0];
        } else if (validMelds.length > 1) {
          // Find closest valid meld to drop position
          let closest = null;
          let closestDist = Infinity;
          validMelds.forEach((m) => {
            const rect = m.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dist = Math.hypot(event.clientX - cx, event.clientY - cy);
            if (dist < closestDist) {
              closestDist = dist;
              closest = m;
            }
          });
          meldEl = closest;
        }
      }

      if (meldEl && cardId) {
        handleLayoff(cardId, meldEl);
      }
      clearMeldHighlights();
    });
  });
}

enableDragAndDrop();
registerAudioUnlock();
setupHandTuningControls();
const initialRoom = new URLSearchParams(location.search).get("room");
if (initialRoom) {
  roomCodeInput.value = initialRoom;
  joinRoom(initialRoom);
} else {
  startRound();
}

if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  const events = new EventSource("/events");
  events.onmessage = () => {
    // Don't hot-reload when in a multiplayer game
    if (!multiplayerEnabled) {
      window.location.reload();
    }
  };
  if (!initialRoom) {
    window.autoPlayStep = runPlayerAiTurn;
  }
}
