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


let game = new Game(2, 1);
let state = "await_draw";
let selectedCardId = null;
let devMode = false;

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

function setMessage(text) {
  messageEl.textContent = text;
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
  discardCardEl.innerHTML = "";
  discardCardEl.classList.add("back");
  const topDiscard = game.discardPile[game.discardPile.length - 1];
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
  clearMeldHighlights();
  clearSelectedHighlight();
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
    playSound("draw");
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
  if (state !== "await_discard") return;
  if (game.tryLayDown(game.players[0])) {
    setMessage("You laid down two 3-of-a-kinds.");
    playSound("play");
  } else {
    setMessage("No valid two 3-of-a-kinds.");
  }
  renderAll();
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
  if (state !== "await_discard") return;
  if (!game.players[0].hasLaidDown) {
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
  if (state !== "await_discard") return;
  const cardEl = event.target.closest(".card");
  if (!cardEl) return;
  const cardId = Number(cardEl.dataset.cardId);
  const card = game.players[0].hand.find((c) => c.cid === cardId);
  handlePlayerDiscard(card);
});

function handleLayoff(cardId, meldEl) {
  const meld = getMeldFromElement(meldEl);
  const card = game.players[0].hand.find((c) => c.cid === cardId);
  if (!card || !meld) return false;
  if (game.layOffCardToMeld(game.players[0], card, meld)) {
    setMessage(`Laid off ${card.rank} to meld.`);
    playSound("play");
    resetSelections();
    renderAll();
    return true;
  } else {
    setMessage("Cannot lay off to that meld.");
    return false;
  }
}

function handleLayoffClick(event) {
  if (!selectedCardId || state !== "await_discard") return;
  if (!game.players[0].hasLaidDown) return;
  const meldEl = event.target.closest(".meld");
  handleLayoff(selectedCardId, meldEl);
}

function getMeldFromElement(meldEl) {
  if (!meldEl) return null;
  const owner = meldEl.dataset.owner;
  const meldIndex = Number(meldEl.dataset.meldIndex);
  const melds = owner === "you" ? game.players[0].melds : game.players[1].melds;
  return melds[meldIndex] ?? null;
}

function clearMeldHighlights() {
  document.querySelectorAll(".meld.drop-valid").forEach((meldEl) => {
    meldEl.classList.remove("drop-valid");
  });
}

function updateMeldHighlights(cardId) {
  clearMeldHighlights();
  const card = game.players[0].hand.find((c) => c.cid === cardId);
  if (!card) return;
  document.querySelectorAll(".meld").forEach((meldEl) => {
    const meld = getMeldFromElement(meldEl);
    if (meld && meld.canAdd(card)) {
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
    if (state === "await_discard" && game.players[0].hasLaidDown) {
      updateMeldHighlights(draggingCardId);
    }
  });

  yourHandEl.addEventListener("dragend", () => {
    draggingCardId = null;
    lastDropTargetId = null;
    clearMeldHighlights();
  });

  yourHandEl.addEventListener("dragover", (event) => {
    if (state !== "await_draw" && state !== "await_discard") return;
    event.preventDefault();
  });

  yourHandEl.addEventListener("drop", (event) => {
    if (state !== "await_draw" && state !== "await_discard") return;
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
      toIndex = game.players[0].hand.findIndex((card) => card.cid === targetId);
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
    
    const hand = game.players[0].hand;
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
    if (state !== "await_discard") return;
    event.preventDefault();
  });

  discardPileEl.addEventListener("drop", (event) => {
    event.preventDefault();
    const cardId = Number(event.dataTransfer.getData("text/plain"));
    const card = game.players[0].hand.find((c) => c.cid === cardId);
    handlePlayerDiscard(card);
    clearMeldHighlights();
  });

  [opponentMeldsEl, yourMeldsEl].forEach((meldArea) => {
    meldArea.addEventListener("dragover", (event) => {
      if (state !== "await_discard") return;
      if (!game.players[0].hasLaidDown) return;
      // Check if there are any melds to lay off to
      const allMelds = [...game.players[0].melds, ...game.players[1].melds];
      if (allMelds.length === 0) return;
      event.preventDefault();
    });

    meldArea.addEventListener("drop", (event) => {
      if (state !== "await_discard") return;
      if (!game.players[0].hasLaidDown) return;
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
startRound();

if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  const events = new EventSource("/events");
  events.onmessage = () => {
    window.location.reload();
  };
  window.autoPlayStep = runPlayerAiTurn;
}
