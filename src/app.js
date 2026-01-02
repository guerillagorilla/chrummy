import { Game, SuitSymbols, JokerRank } from "./engine/gameEngine.js";
import { aiTurn as aiTurnEngine } from "./engine/ai.js";
import { aiTurn } from "./engine/ai.js";

const messageEl = document.getElementById("message");
const scoreEl = document.getElementById("score");
const opponentLogEl = document.getElementById("opponent-log");
const drawPileEl = document.getElementById("draw-pile");
const discardPileEl = document.getElementById("discard-pile");
const discardCardEl = document.getElementById("discard-card");
const yourHandEl = document.getElementById("your-hand");
const opponentHandEl = document.getElementById("opponent-hand");
const yourMeldsEl = document.getElementById("your-melds");
const opponentMeldsEl = document.getElementById("opponent-melds");
const laydownBtn = document.getElementById("laydown-btn");
const restartBtn = document.getElementById("restart-btn");
const devModeToggle = document.getElementById("dev-mode");
const roomCodeInput = document.getElementById("room-code");
const createRoomBtn = document.getElementById("create-room");
const joinRoomBtn = document.getElementById("join-room");
const leaveRoomBtn = document.getElementById("leave-room");
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

let draggingCardId = null;
let lastDropTargetId = null;
let revealOpponentCardId = null;
let revealTimer = null;
const soundFiles = {
  draw: "/public/assets/sounds/cockatrice/draw.wav",
  play: "/public/assets/sounds/cockatrice/playcard.wav",
  discard: "/public/assets/sounds/cockatrice/tap.wav",
};
const sounds = Object.fromEntries(
  Object.entries(soundFiles).map(([key, src]) => [key, new Audio(src)]),
);

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
  const base = sounds[key];
  if (!base) return;
  const audio = base.cloneNode();
  audio.volume = 0.6;
  audio.play().catch(() => {
    // Audio may be blocked until user interaction; ignore silently.
  });
}

function buildLocalView() {
  return {
    mode: "local",
    phase: state,
    currentPlayerIndex: state === "ai_turn" ? 1 : 0,
    winnerIndex: null,
    drawCount: game.drawPile.length,
    discardTop: game.discardPile[game.discardPile.length - 1] ?? null,
    you: {
      hand: game.players[0].hand,
      melds: game.players[0].melds,
      hasLaidDown: game.players[0].hasLaidDown,
      totalScore: game.players[0].totalScore,
    },
    opponent: {
      hand: game.players[1].hand,
      handCount: game.players[1].hand.length,
      melds: game.players[1].melds,
      hasLaidDown: game.players[1].hasLaidDown,
      totalScore: game.players[1].totalScore,
    },
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
  return view.mode === "multiplayer" ? view.opponent.melds : game.players[1].melds;
}

function updateScore() {
  const view = getView();
  scoreEl.textContent = `You: ${view.you.totalScore} | Opponent: ${view.opponent.totalScore}`;
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
  return cardIsWild(card) || meld.rank === card.rank;
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
}

function renderMelds(container, melds, owner) {
  container.innerHTML = "";
  melds.forEach((meld, meldIndex) => {
    const meldEl = document.createElement("div");
    meldEl.className = "meld";
    meldEl.dataset.owner = owner;
    meldEl.dataset.meldIndex = String(meldIndex);
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

function renderAll() {
  const view = getView();
  renderHand(yourHandEl, view.you.hand, {
    faceUp: true,
    selectable: true,
    selectedId: selectedCardId,
  });
  opponentHandEl.innerHTML = "";
  const opponentHand =
    view.mode === "multiplayer" ? Array.from({ length: view.opponent.handCount }) : view.opponent.hand;
  for (const card of opponentHand) {
    const revealThis = view.mode === "local" && (devMode || card.cid === revealOpponentCardId);
    const cardEl = renderCard(card, {
      faceUp: revealThis,
    });
    if (view.mode === "local" && !devMode && card.cid === revealOpponentCardId) {
      cardEl.classList.add("reveal");
    }
    opponentHandEl.appendChild(cardEl);
  }
  renderMelds(yourMeldsEl, view.you.melds, "you");
  renderMelds(opponentMeldsEl, view.opponent.melds, "opponent");
  renderPiles(view);
  updateScore();
}

function resetSelections() {
  selectedCardId = null;
  clearMeldHighlights();
  clearSelectedHighlight();
}

function startRound() {
  if (multiplayerEnabled) return;
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

function canAct() {
  const phase = currentPhase();
  if (multiplayerEnabled) {
    if (!multiplayerState) return false;
    if (!multiplayerState.opponentConnected) return false;
    return isPlayerTurn() && (phase === "await_draw" || phase === "await_discard");
  }
  return phase === "await_draw" || phase === "await_discard";
}

function handlePlayerDraw(source) {
  if (multiplayerEnabled) {
    if (!multiplayerState) return;
    if (!multiplayerState.opponentConnected) {
      setMessage("Waiting for opponent...");
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
    if (!multiplayerState.opponentConnected) {
      setMessage("Waiting for opponent...");
      return;
    }
    if (!card) return;
    if (!isPlayerTurn() || currentPhase() !== "await_discard") return;
    sendAction("discard", { cardId: card.cid });
    return;
  }
  if (state !== "await_discard") return;
  if (!card) return;
  game.discard(game.players[0], card);
  setMessage(`You discarded ${card.rank}.`);
  playSound("discard");
  renderAll();
  if (game.checkWinAfterDiscard(game.players[0])) {
    game.applyRoundScores(0);
    setMessage("You win! Press Restart to play again.");
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

  if (game.checkWinAfterDiscard(game.players[1])) {
    game.applyRoundScores(1);
    setMessage("Opponent wins. Press Restart to play again.");
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
  if (game.checkWinAfterDiscard(game.players[0])) {
    game.applyRoundScores(0);
    setMessage("You win! Press Restart to play again.");
    state = "game_over";
    renderAll();
    return;
  }
  state = "ai_turn";
  renderAll();
  setTimeout(runAiTurn, 600);
}

laydownBtn.addEventListener("click", () => {
  if (multiplayerEnabled) {
    if (!multiplayerState) return;
    if (!isPlayerTurn() || currentPhase() !== "await_discard") return;
    if (!multiplayerState.opponentConnected) {
      setMessage("Waiting for opponent...");
      return;
    }
    sendAction("laydown");
    return;
  }
  if (state !== "await_discard") return;
  if (game.tryLayDown(game.players[0])) {
    setMessage("You laid down two 3-of-a-kinds.");
    playSound("play");
  } else {
    setMessage("No valid two 3-of-a-kinds.");
  }
  renderAll();
});

restartBtn.addEventListener("click", () => {
  if (multiplayerEnabled) {
    if (!multiplayerState) return;
    if (multiplayerState.phase !== "game_over") {
      setMessage("Finish the round before restarting.");
      return;
    }
    sendAction("restart");
    return;
  }
  startRound();
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
  if (!multiplayerState.opponentConnected) {
    setMessage("Waiting for opponent...", "waiting");
    return;
  }
  if (multiplayerState.phase === "game_over") {
    const winner = multiplayerState.winnerIndex === multiplayerPlayerIndex ? "You win!" : "Opponent wins.";
    setMessage(`${winner} Press Leave to exit.`);
    return;
  }
  if (isPlayerTurn()) {
    const prompt = multiplayerState.phase === "await_draw" ? "Your turn: draw from deck or discard." : "Your turn: discard.";
    setMessage(prompt, "your-turn");
  } else {
    setMessage("Opponent's turn.", "waiting");
  }
}

function updateTurnHighlight() {
  if (yourRowEl) {
    const showHighlight = multiplayerEnabled && 
      multiplayerState?.opponentConnected && 
      isPlayerTurn();
    if (showHighlight) {
      yourRowEl.classList.add("your-turn");
    } else {
      yourRowEl.classList.remove("your-turn");
    }
  }
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

  const prevMeldCards = totalMeldCards(prevState.you.melds) + totalMeldCards(prevState.opponent.melds);
  const nextMeldCards = totalMeldCards(nextState.you.melds) + totalMeldCards(nextState.opponent.melds);
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
    setMessage("Waiting for opponent...", "waiting");
    showRoomControls(true);
    return;
  }

  if (msg.type === "room_left") {
    leaveRoomCleanup();
    setMessage("Left the room.");
    return;
  }

  if (msg.type === "opponent_left") {
    setMessage("Opponent left the game.", "waiting");
    if (multiplayerState) {
      multiplayerState.opponentConnected = false;
    }
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
  sendSocket({ type: "create_room" });
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
});

yourHandEl.addEventListener("click", (event) => {
  const cardEl = event.target.closest(".card");
  if (!cardEl) return;
  if (currentPhase() !== "await_discard") return;
  if (!youHasLaidDown()) {
    setMessage("Lay down first before laying off.");
    return;
  }
  const cardId = Number(cardEl.dataset.cardId);
  if (!cardId) return;
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
  if (multiplayerEnabled) {
    if (!multiplayerState) return false;
    if (!multiplayerState.opponentConnected) {
      setMessage("Waiting for opponent...");
      return false;
    }
    if (!isPlayerTurn() || currentPhase() !== "await_discard" || !youHasLaidDown()) return false;
    const meldOwner = Number(meldEl.dataset.owner === "opponent");
    const meldIndex = Number(meldEl.dataset.meldIndex);
    sendAction("layoff", { cardId, meldOwner, meldIndex });
    return true;
  }
  if (game.layOffCardToMeld(game.players[0], card, meld)) {
    setMessage(`Laid off ${card.rank} to meld.`);
    playSound("play");
    resetSelections();
    renderAll();
    return true;
  }
  setMessage("Cannot lay off to that meld.");
  return false;
}

function handleLayoffClick(event) {
  if (!selectedCardId || currentPhase() !== "await_discard") return;
  if (!youHasLaidDown()) return;
  const meldEl = event.target.closest(".meld");
  handleLayoff(selectedCardId, meldEl);
}

function getMeldFromElement(meldEl) {
  if (!meldEl) return null;
  const owner = meldEl.dataset.owner;
  const meldIndex = Number(meldEl.dataset.meldIndex);
  const view = getView();
  const melds = owner === "you" ? view.you.melds : view.opponent.melds;
  return melds[meldIndex] ?? null;
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
    const meld = getMeldFromElement(meldEl);
    if (meld && meldCanAdd(meld, card)) {
      meldEl.classList.add("drop-valid");
    }
  });
}

[opponentMeldsEl, yourMeldsEl].forEach((meldArea) => {
  meldArea.addEventListener("click", handleLayoffClick);
});

function enableDragAndDrop() {
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
  });

  yourHandEl.addEventListener("dragover", (event) => {
    if (currentPhase() !== "await_draw" && currentPhase() !== "await_discard") return;
    event.preventDefault();
  });

  yourHandEl.addEventListener("drop", (event) => {
    if (currentPhase() !== "await_draw" && currentPhase() !== "await_discard") return;
    event.preventDefault();
    const cardId = Number(event.dataTransfer.getData("text/plain")) || draggingCardId;
    if (!cardId) return;
    
    // Find target card or nearest position
    let targetEl = event.target.closest(".card");
    let toIndex;
    
    if (targetEl) {
      const targetId = Number(targetEl.dataset.cardId);
      if (targetId === cardId) return;
      if (lastDropTargetId === targetId) return;
      toIndex = getYourHand().findIndex((card) => card.cid === targetId);
      lastDropTargetId = targetId;
    } else {
      // Dropped in gap - find nearest card position based on X
      const cards = yourHandEl.querySelectorAll(".card");
      if (cards.length === 0) return;

      const firstRect = cards[0].getBoundingClientRect();
      const lastRect = cards[cards.length - 1].getBoundingClientRect();

      if (event.clientX > lastRect.right) {
        toIndex = cards.length;
      } else if (event.clientX < firstRect.left) {
        toIndex = 0;
      } else {
        let closestIdx = 0;
        let closestDist = Infinity;
        cards.forEach((card, idx) => {
          const rect = card.getBoundingClientRect();
          const cardCenter = rect.left + rect.width / 2;
          const dist = Math.abs(event.clientX - cardCenter);
          if (dist < closestDist) {
            closestDist = dist;
            closestIdx = idx;
          }
        });

        // If dropped to the right of center, insert after
        const closestRect = cards[closestIdx].getBoundingClientRect();
        const closestCenter = closestRect.left + closestRect.width / 2;
        if (event.clientX > closestCenter && closestIdx < cards.length - 1) {
          closestIdx++;
        }
        toIndex = closestIdx;
      }
    }
    
    const hand = getYourHand();
    const fromIndex = hand.findIndex((card) => card.cid === cardId);
    if (fromIndex === -1 || toIndex === -1 || toIndex === undefined) return;
    if (fromIndex === toIndex) return;
    
    const [moved] = hand.splice(fromIndex, 1);
    // Adjust toIndex if we removed from before it
    const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    hand.splice(adjustedToIndex, 0, moved);
    renderAll();
  });

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

  [opponentMeldsEl, yourMeldsEl].forEach((meldArea) => {
    meldArea.addEventListener("dragover", (event) => {
      if (currentPhase() !== "await_discard") return;
      if (!youHasLaidDown()) return;
      // Check if there are any melds to lay off to
      const view = getView();
      const allMelds = [...view.you.melds, ...view.opponent.melds];
      if (allMelds.length === 0) return;
      event.preventDefault();
    });

    meldArea.addEventListener("drop", (event) => {
      if (currentPhase() !== "await_discard") return;
      if (!youHasLaidDown()) return;
      event.preventDefault();
      const cardId = Number(event.dataTransfer.getData("text/plain")) || draggingCardId;
      
      // Try exact meld first, then find nearest valid meld
      let meldEl = event.target.closest(".meld");
      if (!meldEl) {
        // Find the valid meld that's highlighted (if only one, use it)
        const validMelds = meldArea.querySelectorAll(".meld.drop-valid");
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
