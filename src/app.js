import { Game, SuitSymbols, JokerRank, formatRequirements, ROUNDS } from "./engine/gameEngine.js";
import { aiTurn as aiTurnEngine } from "./engine/ai.js";
import { aiTurn } from "./engine/ai.js";

const messageEl = document.getElementById("message");
const scoreEl = document.getElementById("score");
const subtitleEl = document.getElementById("subtitle");
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
const laydownSelectedBtn = document.getElementById("laydown-selected-btn");
const autoStageBtn = document.getElementById("auto-stage-btn");
const devModeToggle = document.getElementById("dev-mode");
const roomCodeInput = document.getElementById("room-code");
const createRoomBtn = document.getElementById("create-room");
const joinRoomBtn = document.getElementById("join-room");
const leaveRoomBtn = document.getElementById("leave-room");
const roomSizeSelect = document.getElementById("room-size");
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

let draggingCardId = null;
let lastDropTargetId = null;
let revealOpponentCardId = null;
let revealTimer = null;
let insertMarkerEl = null;
let pendingDiscardCardId = null;
let lastTapTime = 0;
let lastTapCardId = null;
let lastPileTapTime = 0;
let lastPileTapId = null;
const soundFiles = {
  draw: "/public/assets/sounds/cockatrice/draw.wav",
  play: "/public/assets/sounds/cockatrice/playcard.wav",
  discard: "/public/assets/sounds/cockatrice/tap.wav",
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

function setMessage(text, state = "normal") {
  messageEl.textContent = text;
  messageEl.classList.remove("your-turn", "waiting");
  if (state === "your-turn") {
    messageEl.classList.add("your-turn");
  } else if (state === "waiting") {
    messageEl.classList.add("waiting");
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
  const maxPlayers = multiplayerState?.maxPlayers ?? 2;
  return `Waiting for players (${connected}/${maxPlayers})...`;
}

function playerLabel(index, view) {
  const reference = view ?? getView();
  const isMultiplayer = Boolean(multiplayerState) || reference?.mode === "multiplayer";
  if (!isMultiplayer) {
    return index === 1 ? "Opponent" : `Player ${index + 1}`;
  }
  return index === multiplayerPlayerIndex ? "You" : `Player ${index + 1}`;
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

function getOpponentMelds() {
  const view = getView();
  if (view.opponents) {
    return view.opponents.flatMap((opponent) => opponent.melds ?? []);
  }
  return view.mode === "multiplayer" ? [] : game.players[1].melds;
}

function updateScore() {
  const view = getView();
  const roundIndex = Number.isFinite(view.roundIndex) ? view.roundIndex : 0;
  const roundTotal = ROUNDS.length;
  const roundData = view.round ?? ROUNDS[roundIndex];
  const roundSummary = roundData ? formatRequirements(roundData.requirements) : "";
  const roundLabel = roundSummary ? `Round ${roundIndex + 1}/${roundTotal}: ${roundSummary}` : `Round ${roundIndex + 1}/${roundTotal}`;
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
    subtitleEl.textContent = roundSummary ? `Round ${roundIndex + 1}: ${roundSummary}` : `Round ${roundIndex + 1}`;
  }
}

function logOpponent(text) {
  const item = document.createElement("li");
  item.textContent = text;
  opponentLogEl.prepend(item);
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

function canFormRun(cards, requireHalfNatural) {
  const naturals = cards.filter((candidate) => !cardIsWild(candidate));
  if (requireHalfNatural && naturals.length < Math.ceil(cards.length / 2)) return false;
  let suit = null;
  const values = [];
  for (const card of naturals) {
    if (suit && card.suit !== suit) return false;
    suit = card.suit;
    values.push(RANK_VALUES[card.rank]);
  }
  const unique = new Set(values);
  if (unique.size !== values.length) return false;
  if (naturals.length === 0) return !requireHalfNatural;
  const size = cards.length;
  for (let start = 2; start <= 14 - size + 1; start += 1) {
    const needed = new Set();
    for (let offset = 0; offset < size; offset += 1) {
      needed.add(start + offset);
    }
    if (values.every((value) => needed.has(value))) {
      return true;
    }
  }
  return false;
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
  for (const card of hand) {
    const cardEl = renderCard(card, {
      faceUp,
      selectable,
      selected: selectedId === card.cid,
    });
    container.appendChild(cardEl);
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
    meld.cards.forEach((card) => {
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
    meld.cards.forEach((card) => {
      const cardEl = renderCard(card, { faceUp: true });
      meldEl.appendChild(cardEl);
    });
    container.appendChild(meldEl);
  });
}

function renderPiles(view) {
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
    stack.className = "opponent-stack";
    if (opponent.connected === false) {
      stack.classList.add("disconnected");
    }
    const label = document.createElement("div");
    label.className = "opponent-label";
    label.textContent = playerLabel(opponent.playerIndex, view);
    const hand = document.createElement("div");
    hand.className = "hand opponent-hand";
    if (view.mode === "local" && Array.isArray(opponent.hand)) {
      for (const card of opponent.hand) {
        const revealThis = devMode || card.cid === revealOpponentCardId;
        const cardEl = renderCard(card, {
          faceUp: revealThis,
        });
        if (!devMode && card.cid === revealOpponentCardId) {
          cardEl.classList.add("reveal");
        }
        hand.appendChild(cardEl);
      }
    } else {
      const count = opponent.handCount ?? 0;
      for (let i = 0; i < count; i += 1) {
        hand.appendChild(renderCard(null, { faceUp: false }));
      }
    }
    stack.append(label, hand);
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
    label.textContent = playerLabel(opponent.playerIndex, view);
    const grid = document.createElement("div");
    grid.className = "meld-grid meld-grid-group";
    renderMelds(grid, opponent, opponent.playerIndex);
    group.append(label, grid);
    opponentMeldsEl.appendChild(group);
  });
}

function renderAll() {
  const view = getView();
  if (opponentLogPanel) {
    opponentLogPanel.classList.toggle("hidden", !devMode);
  }
  const handToRender = autoSortEnabled ? sortHand(view.you.hand) : view.you.hand;
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
  updateScore();
  updateRoundButtons(view);
  updateLaydownControls(view);
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
  resetSelections();
  revealOpponentCardId = null;
  if (revealTimer) {
    clearTimeout(revealTimer);
    revealTimer = null;
  }
  opponentLogEl.innerHTML = "";
  setMessage("Your turn: draw from deck or discard.");
  renderAll();
}

function advanceRound() {
  if (multiplayerEnabled) return;
  game.nextRound();
  state = "await_draw";
  resetSelections();
  revealOpponentCardId = null;
  if (revealTimer) {
    clearTimeout(revealTimer);
    revealTimer = null;
  }
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
  const shouldReveal =
    result.drewCard &&
    !devMode &&
    (result.drawChoice === "discard" || (result.drawChoice === "deck" && result.drewCard.isWild()));
  if (shouldReveal) {
    revealOpponentCardId = result.drewCard.cid;
    if (revealTimer) {
      clearTimeout(revealTimer);
    }
    revealTimer = setTimeout(() => {
      revealOpponentCardId = null;
      renderAll();
    }, 1500);
  }
  if (result.discarded) {
    playSound("discard");
  }

  if (game.checkWin(game.players[1])) {
    game.applyRoundScores(1);
    setMessage("Opponent wins. Press Next Round to continue or Restart to reset.");
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

devModeToggle.addEventListener("change", (event) => {
  devMode = event.target.checked;
  renderAll();
});

function setMultiplayerEnabled(enabled) {
  multiplayerEnabled = enabled;
  if (enabled) {
    devMode = false;
    devModeToggle.checked = false;
    opponentLogEl.innerHTML = "";
    revealOpponentCardId = null;
  }
  devModeToggle.disabled = enabled;
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

function updateTurnHighlight() {
  if (yourRowEl) {
    const showHighlight = multiplayerEnabled && 
      multiplayerReady() && 
      isPlayerTurn();
    if (showHighlight) {
      yourRowEl.classList.add("your-turn");
    } else {
      yourRowEl.classList.remove("your-turn");
    }
  }
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

  if (prevPhase === "await_draw" && nextPhase === "await_discard") {
    playSound("draw");
  }

  const prevDiscard = prevState.discardTop?.cid;
  const nextDiscard = nextState.discardTop?.cid;
  if (prevPhase === "await_discard" && (nextPhase === "await_draw" || nextPhase === "game_over")) {
    if (prevDiscard !== nextDiscard) {
      playSound("discard");
    }
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

  if (msg.type === "state") {
    const prevState = multiplayerState;
    multiplayerState = msg;
    maybePlayMultiplayerSounds(prevState, multiplayerState);
    setMultiplayerEnabled(true);
    resetSelections();
    renderAll();
    updateMessageFromState();
    if (
      pendingDiscardCardId &&
      multiplayerState.phase === "await_discard" &&
      isPlayerTurn() &&
      multiplayerReady()
    ) {
      if (multiplayerState.you.hasLaidDown) {
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

function leaveRoomCleanup() {
  multiplayerEnabled = false;
  multiplayerState = null;
  multiplayerRoom = null;
  multiplayerPlayerIndex = null;
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
    const hand = getYourHand();
    const fromIndex = hand.findIndex((card) => card.cid === cardId);
    if (fromIndex === -1 || toIndex === -1 || toIndex === undefined) return false;
    if (fromIndex === toIndex) return false;
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
      toIndex = getYourHand().findIndex((card) => card.cid === targetId);
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
