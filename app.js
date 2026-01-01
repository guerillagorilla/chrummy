import { Game, SuitSymbols, JokerRank } from "./engine/gameEngine.js";
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
const layoffBtn = document.getElementById("layoff-btn");
const restartBtn = document.getElementById("restart-btn");
const devModeToggle = document.getElementById("dev-mode");


let game = new Game(2, 1);
let state = "await_draw";
let layoffMode = false;
let selectedCardId = null;
let devMode = false;

let draggingCardId = null;
let lastDropTargetId = null;
let revealOpponentCardId = null;
let revealTimer = null;

function setMessage(text) {
  messageEl.textContent = text;
}

function updateScore() {
  scoreEl.textContent = `You: ${game.players[0].totalScore} | Opponent: ${game.players[1].totalScore}`;
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

function renderCard(card, options = {}) {
  const { faceUp = true, selectable = false, selected = false } = options;
  const cardEl = document.createElement("div");
  cardEl.className = "card";
  if (!faceUp) {
    cardEl.classList.add("back");
    return cardEl;
  }

  if (card.isRed()) {
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

function renderPiles() {
  discardCardEl.textContent = "Empty";
  discardCardEl.classList.remove("back");
  const topDiscard = game.discardPile[game.discardPile.length - 1];
  if (topDiscard) {
    discardCardEl.innerHTML = cardLabel(topDiscard);
  }
}

function renderAll() {
  renderHand(yourHandEl, game.players[0].hand, {
    faceUp: true,
    selectable: true,
    selectedId: selectedCardId,
  });
  opponentHandEl.innerHTML = "";
  for (const card of game.players[1].hand) {
    const revealThis = devMode || card.cid === revealOpponentCardId;
    const cardEl = renderCard(card, {
      faceUp: revealThis,
    });
    if (!devMode && card.cid === revealOpponentCardId) {
      cardEl.classList.add("reveal");
    }
    opponentHandEl.appendChild(cardEl);
  }
  renderMelds(yourMeldsEl, game.players[0].melds, "you");
  renderMelds(opponentMeldsEl, game.players[1].melds, "opponent");
  renderPiles();
  updateScore();
}

function resetSelections() {
  selectedCardId = null;
  layoffMode = false;
  layoffBtn.classList.remove("active");
}

function startRound() {
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
  return state === "await_draw" || state === "await_discard";
}

function handlePlayerDraw(source) {
  if (state !== "await_draw") return;
  const player = game.players[0];
  const card = source === "discard" ? game.drawFromDiscard(player) : game.drawFromStock(player);
  if (card) {
    setMessage(`You drew ${card.rank} from ${source}.`);
  } else {
    setMessage(`No cards available in ${source}.`);
  }
  state = "await_discard";
  renderAll();
}

function handlePlayerDiscard(card) {
  if (state !== "await_discard") return;
  if (!card) return;
  game.discard(game.players[0], card);
  setMessage(`You discarded ${card.rank}.`);
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

laydownBtn.addEventListener("click", () => {
  if (state !== "await_discard") return;
  if (game.tryLayDown(game.players[0])) {
    setMessage("You laid down two 3-of-a-kinds.");
  } else {
    setMessage("No valid two 3-of-a-kinds.");
  }
  renderAll();
});

layoffBtn.addEventListener("click", () => {
  if (state !== "await_discard") return;
  if (layoffMode) {
    resetSelections();
    setMessage("Lay-off mode canceled.");
    renderAll();
    return;
  }
  if (!game.canLayOff(game.players[0])) {
    setMessage("No lay offs available.");
    return;
  }
  layoffMode = true;
  layoffBtn.classList.add("active");
  setMessage("Lay-off mode: select a card, then click a meld.");
});

restartBtn.addEventListener("click", startRound);

devModeToggle.addEventListener("change", (event) => {
  devMode = event.target.checked;
  renderAll();
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
  if (state !== "await_discard" && state !== "await_draw") return;
  const cardId = Number(cardEl.dataset.cardId);
  if (!cardId) return;
  if (layoffMode) {
    selectedCardId = cardId;
    renderAll();
    return;
  }
});

yourHandEl.addEventListener("dblclick", (event) => {
  if (state !== "await_discard") return;
  const cardEl = event.target.closest(".card");
  if (!cardEl) return;
  const cardId = Number(cardEl.dataset.cardId);
  const card = game.players[0].hand.find((c) => c.cid === cardId);
  handlePlayerDiscard(card);
});

function handleLayoff(cardId, meldEl) {
  if (!meldEl) return false;
  const owner = meldEl.dataset.owner;
  const meldIndex = Number(meldEl.dataset.meldIndex);
  const melds = owner === "you" ? game.players[0].melds : game.players[1].melds;
  const meld = melds[meldIndex];
  const card = game.players[0].hand.find((c) => c.cid === cardId);
  if (!card || !meld) return false;
  if (game.layOffCardToMeld(game.players[0], card, meld)) {
    setMessage(`Laid off ${card.rank} to meld.`);
    resetSelections();
    renderAll();
    return true;
  } else {
    setMessage("Cannot lay off to that meld.");
    return false;
  }
}

function handleLayoffClick(event) {
  if (!layoffMode || !selectedCardId) return;
  const meldEl = event.target.closest(".meld");
  handleLayoff(selectedCardId, meldEl);
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
  });

  yourHandEl.addEventListener("dragend", () => {
    draggingCardId = null;
    lastDropTargetId = null;
  });

  yourHandEl.addEventListener("dragover", (event) => {
    if (state !== "await_draw" && state !== "await_discard") return;
    event.preventDefault();
  });

  yourHandEl.addEventListener("drop", (event) => {
    if (state !== "await_draw" && state !== "await_discard") return;
    event.preventDefault();
    const targetEl = event.target.closest(".card");
    if (!targetEl) return;
    const targetId = Number(targetEl.dataset.cardId);
    const cardId = Number(event.dataTransfer.getData("text/plain")) || draggingCardId;
    if (!cardId || targetId === cardId) return;
    if (lastDropTargetId === targetId) return;
    const hand = game.players[0].hand;
    const fromIndex = hand.findIndex((card) => card.cid === cardId);
    const toIndex = hand.findIndex((card) => card.cid === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const [moved] = hand.splice(fromIndex, 1);
    hand.splice(toIndex, 0, moved);
    lastDropTargetId = targetId;
    renderAll();
  });

  discardPileEl.addEventListener("dragover", (event) => {
    if (state !== "await_discard") return;
    event.preventDefault();
  });

  discardPileEl.addEventListener("drop", (event) => {
    event.preventDefault();
    const cardId = Number(event.dataTransfer.getData("text/plain"));
    const card = game.players[0].hand.find((c) => c.cid === cardId);
    handlePlayerDiscard(card);
  });

  [opponentMeldsEl, yourMeldsEl].forEach((meldArea) => {
    meldArea.addEventListener("dragover", (event) => {
      if (state !== "await_discard") return;
      // Check if there are any melds to lay off to
      const allMelds = [...game.players[0].melds, ...game.players[1].melds];
      if (allMelds.length === 0) return;
      event.preventDefault();
    });

    meldArea.addEventListener("drop", (event) => {
      if (state !== "await_discard") return;
      event.preventDefault();
      const cardId = Number(event.dataTransfer.getData("text/plain")) || draggingCardId;
      const meldEl = event.target.closest(".meld");
      if (meldEl && cardId) {
        handleLayoff(cardId, meldEl);
      }
    });
  });
}

enableDragAndDrop();
startRound();

if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  const events = new EventSource("/events");
  events.onmessage = () => {
    window.location.reload();
  };
}
