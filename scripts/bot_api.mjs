/**
 * Bot API for LLM integration
 * 
 * WebSocket endpoint that provides event-driven game state updates
 * and accepts game actions.
 * 
 * Card notation: "7H" = 7 of hearts, "QS" = queen of spades, "JK" = joker
 * Suits: H=hearts, D=diamonds, C=clubs, S=spades
 */

import { WebSocketServer, WebSocket } from "ws";
import { Game, ROUNDS, formatRequirements, SuitSymbols } from "../src/engine/gameEngine.js";
import { aiTurn, chooseDrawSource } from "../src/engine/ai.js";

const SUIT_TO_SHORT = {
  hearts: "H",
  diamonds: "D",
  clubs: "C",
  spades: "S",
};

const SHORT_TO_SUIT = {
  H: "hearts",
  D: "diamonds", 
  C: "clubs",
  S: "spades",
};

/**
 * Convert a Card object to short notation like "7H" or "JK"
 * Returns object with notation and cid for unique identification
 */
export function cardToNotation(card, includeId = false) {
  if (!card) return null;
  const notation = card.rank === "JOKER" ? "JK" : `${card.rank}${SUIT_TO_SHORT[card.suit]}`;
  if (includeId) {
    return { card: notation, cid: card.cid };
  }
  return notation;
}

/**
 * Convert card to full payload with ID
 */
export function cardToPayload(card) {
  if (!card) return null;
  return {
    card: card.rank === "JOKER" ? "JK" : `${card.rank}${SUIT_TO_SHORT[card.suit]}`,
    cid: card.cid
  };
}

/**
 * Parse notation like "7H" or "JK" to { rank, suit }
 */
export function parseNotation(notation) {
  if (!notation) return null;
  const n = notation.toUpperCase().trim();
  if (n === "JK" || n === "JOKER") {
    return { rank: "JOKER", suit: "spades" }; // jokers stored with spades suit
  }
  // Handle 10 specially
  if (n.startsWith("10")) {
    const suit = SHORT_TO_SUIT[n.slice(2)];
    if (!suit) return null;
    return { rank: "10", suit };
  }
  if (n.length < 2) return null;
  const rank = n.slice(0, -1);
  const suitChar = n.slice(-1);
  const suit = SHORT_TO_SUIT[suitChar];
  if (!suit) return null;
  return { rank, suit };
}

/**
 * Find a card in hand by notation
 */
/**
 * Find a card in hand by notation or cid
 * Can accept:
 * - string notation like "7H"
 * - number cid
 * - object { card: "7H", cid: 123 } (cid takes precedence)
 */
export function findCardByNotation(hand, cardSpec) {
  if (!cardSpec) return null;
  
  // If it's a number, treat as cid
  if (typeof cardSpec === 'number') {
    return hand.find(c => c.cid === cardSpec);
  }
  
  // If it's an object with cid, use that
  if (typeof cardSpec === 'object' && cardSpec.cid) {
    return hand.find(c => c.cid === cardSpec.cid);
  }
  
  // Otherwise parse as notation string
  const notation = typeof cardSpec === 'object' ? cardSpec.card : cardSpec;
  const parsed = parseNotation(notation);
  if (!parsed) return null;
  return hand.find(c => c.rank === parsed.rank && c.suit === parsed.suit);
}

/**
 * Format a meld for display
 */
function meldToPayload(meld) {
  return {
    type: meld.type,
    cards: meld.cards.map(c => cardToNotation(c)),  // Just notation for melds, no need for cid
  };
}

/**
 * Get legal actions for current player
 */
function getLegalActions(game, playerIndex, phase) {
  const player = game.players[playerIndex];
  const actions = [];
  
  if (phase === "await_draw") {
    actions.push("draw_deck");
    if (game.discardPile.length > 0) {
      actions.push("draw_discard");
    }
  } else if (phase === "await_discard") {
    // Can discard any card
    actions.push({
      action: "discard",
      cards: player.hand.map(cardToPayload),
    });
    
    // Can meld if not yet laid down
    if (!player.hasLaidDown) {
      actions.push("meld");
    }
    
    // Can lay off if already laid down
    if (player.hasLaidDown) {
      const layoffTargets = [];
      for (let pi = 0; pi < game.players.length; pi++) {
        const p = game.players[pi];
        p.melds.forEach((meld, mi) => {
          const fittingCards = player.hand.filter(c => meld.canAdd(c));
          if (fittingCards.length > 0) {
            layoffTargets.push({
              player: pi,
              meld_index: mi,
              meld: meldToPayload(meld),
              fitting_cards: fittingCards.map(cardToNotation),
            });
          }
        });
      }
      if (layoffTargets.length > 0) {
        actions.push({ action: "layoff", targets: layoffTargets });
      }
    }
  }
  
  return actions;
}

/**
 * BotSession manages a single bot's connection to a game
 */
export class BotSession {
  constructor(ws, options = {}) {
    this.ws = ws;
    this.game = null;
    this.botPlayerIndex = 0;
    this.aiPlayerIndex = 1;
    this.phase = "not_started";
    this.useAiOpponent = options.useAiOpponent !== false;
    this.aiDelay = options.aiDelay || 1000;
    this.eventLog = [];
    
    this.setupHandlers();
  }
  
  setupHandlers() {
    this.ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch (e) {
        this.sendError(`Invalid JSON: ${e.message}`);
      }
    });
    
    this.ws.on("close", () => {
      this.cleanup();
    });
  }
  
  cleanup() {
    // Any cleanup needed
  }
  
  send(event) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.eventLog.push(event);
      this.ws.send(JSON.stringify(event));
    }
  }
  
  sendError(message) {
    this.send({ type: "error", message });
  }
  
  handleMessage(msg) {
    try {
      this.handleMessageInner(msg);
    } catch (e) {
      console.error("[bot-api] Error handling message:", e);
      this.sendError(`Internal error: ${e.message}`);
    }
  }
  
  handleMessageInner(msg) {
    switch (msg.action) {
      case "new_game":
        this.startNewGame(msg);
        break;
      case "draw_deck":
        this.handleDraw("deck");
        break;
      case "draw_discard":
        this.handleDraw("discard");
        break;
      case "discard":
        this.handleDiscard(msg.card);
        break;
      case "meld":
        this.handleMeld(msg.cards);
        break;
      case "layoff":
        this.handleLayoff(msg.card, msg.player, msg.meld_index);
        break;
      default:
        this.sendError(`Unknown action: ${msg.action}`);
    }
  }
  
  startNewGame(options = {}) {
    this.game = new Game(2, 0);
    this.phase = "await_draw";
    this.botPlayerIndex = 0;
    this.aiPlayerIndex = 1;
    
    const round = this.game.currentRound();
    const botPlayer = this.game.players[this.botPlayerIndex];
    
    this.send({
      type: "game_started",
      round_number: this.game.roundIndex + 1,
      total_rounds: ROUNDS.length,
      requirements: formatRequirements(round.requirements),
      your_hand: botPlayer.hand.map(cardToPayload),
      discard_top: cardToNotation(this.game.discardPile[this.game.discardPile.length - 1]),
      deck_count: this.game.drawPile.length,
      you_go_first: this.game.currentPlayerIndex === this.botPlayerIndex,
    });
    
    if (this.game.currentPlayerIndex === this.botPlayerIndex) {
      this.sendYourTurn();
    } else {
      this.runAiTurn();
    }
  }
  
  sendYourTurn() {
    const player = this.game.players[this.botPlayerIndex];
    const opponent = this.game.players[this.aiPlayerIndex];
    
    this.send({
      type: "your_turn",
      phase: this.phase,
      your_hand: player.hand.map(cardToPayload),
      your_melds: player.melds.map(meldToPayload),
      has_laid_down: player.hasLaidDown,
      opponent_melds: opponent.melds.map(meldToPayload),
      opponent_card_count: opponent.hand.length,
      discard_top: cardToNotation(this.game.discardPile[this.game.discardPile.length - 1]),
      deck_count: this.game.drawPile.length,
      legal_actions: getLegalActions(this.game, this.botPlayerIndex, this.phase),
    });
  }
  
  handleDraw(source) {
    if (this.phase !== "await_draw") {
      this.sendError("Not time to draw. Current phase: " + this.phase);
      return;
    }
    if (this.game.currentPlayerIndex !== this.botPlayerIndex) {
      this.sendError("Not your turn.");
      return;
    }
    
    const player = this.game.players[this.botPlayerIndex];
    let card;
    
    if (source === "discard") {
      card = this.game.drawFromDiscard(player);
      if (!card) {
        this.sendError("Discard pile is empty.");
        return;
      }
    } else {
      card = this.game.drawFromStock(player);
      if (!card) {
        this.sendError("Deck is empty.");
        return;
      }
    }
    
    this.phase = "await_discard";
    
    this.send({
      type: "drew_card",
      card: cardToNotation(card),
      source: source,
      your_hand: player.hand.map(cardToPayload),
    });
    
    this.sendYourTurn();
  }
  
  handleDiscard(cardNotation) {
    if (this.phase !== "await_discard") {
      this.sendError("Not time to discard. Current phase: " + this.phase);
      return;
    }
    if (this.game.currentPlayerIndex !== this.botPlayerIndex) {
      this.sendError("Not your turn.");
      return;
    }
    
    const player = this.game.players[this.botPlayerIndex];
    const card = findCardByNotation(player.hand, cardNotation);
    
    if (!card) {
      this.sendError(`Card not in hand: ${JSON.stringify(cardNotation)}. Your hand: ${JSON.stringify(player.hand.map(cardToPayload))}`);
      return;
    }
    
    // Clear any staged melds if not laid down
    if (!player.hasLaidDown && player.stagedMelds.length > 0) {
      this.game.clearStaged(player);
    }
    
    this.game.discard(player, card);
    
    this.send({
      type: "you_discarded",
      card: cardToNotation(card),
      your_hand: player.hand.map(cardToPayload),
    });
    
    // Check for win
    if (this.game.checkWinAfterDiscard(player)) {
      this.handleRoundEnd(this.botPlayerIndex);
      return;
    }
    
    // Next turn
    this.phase = "await_draw";
    this.game.currentPlayerIndex = this.aiPlayerIndex;
    
    this.send({
      type: "opponent_turn",
      opponent_card_count: this.game.players[this.aiPlayerIndex].hand.length,
    });
    
    this.runAiTurn();
  }
  
  handleMeld(cardNotations) {
    if (this.phase !== "await_discard") {
      this.sendError("Not time to meld. Current phase: " + this.phase);
      return;
    }
    
    const player = this.game.players[this.botPlayerIndex];
    
    if (player.hasLaidDown) {
      this.sendError("Already laid down this round.");
      return;
    }
    
    // For now, use auto-stage which finds valid melds automatically
    if (!this.game.autoStageMelds(player)) {
      this.sendError("No valid melds found. You need: " + formatRequirements(this.game.currentRound().requirements));
      return;
    }
    
    if (!this.game.tryLayDownStaged(player)) {
      this.sendError("Could not lay down melds.");
      return;
    }
    
    this.send({
      type: "you_melded",
      melds: player.melds.map(meldToPayload),
      your_hand: player.hand.map(cardToPayload),
    });
    
    // Check for win (empty hand after melding)
    if (this.game.checkWin(player)) {
      this.handleRoundEnd(this.botPlayerIndex);
      return;
    }
    
    this.sendYourTurn();
  }
  
  handleLayoff(cardNotation, targetPlayer, meldIndex) {
    if (this.phase !== "await_discard") {
      this.sendError("Not time to lay off. Current phase: " + this.phase);
      return;
    }
    
    const player = this.game.players[this.botPlayerIndex];
    
    if (!player.hasLaidDown) {
      this.sendError("Must lay down before laying off.");
      return;
    }
    
    const card = findCardByNotation(player.hand, cardNotation);
    if (!card) {
      this.sendError(`Card not in hand: ${cardNotation}`);
      return;
    }
    
    const targetMeld = this.game.players[targetPlayer]?.melds[meldIndex];
    if (!targetMeld) {
      this.sendError(`Invalid meld target: player ${targetPlayer}, meld ${meldIndex}`);
      return;
    }
    
    if (!this.game.layOffCardToMeld(player, card, targetMeld)) {
      this.sendError("Cannot lay off that card to that meld.");
      return;
    }
    
    this.send({
      type: "you_laid_off",
      card: cardToNotation(card),
      to_player: targetPlayer,
      to_meld: meldIndex,
      your_hand: player.hand.map(cardToPayload),
    });
    
    // Check for win
    if (this.game.checkWin(player)) {
      this.handleRoundEnd(this.botPlayerIndex);
      return;
    }
    
    this.sendYourTurn();
  }
  
  runAiTurn() {
    if (!this.useAiOpponent) return;
    
    setTimeout(() => {
      if (this.game.currentPlayerIndex !== this.aiPlayerIndex) return;
      
      const ai = this.game.players[this.aiPlayerIndex];
      const discardBefore = this.game.discardPile[this.game.discardPile.length - 1];
      
      // Determine draw source
      const drawSource = chooseDrawSource(this.game, this.aiPlayerIndex);
      
      this.send({
        type: "opponent_drawing",
        source: drawSource,
      });
      
      // Run AI turn
      aiTurn(this.game, this.aiPlayerIndex);
      
      const discardAfter = this.game.discardPile[this.game.discardPile.length - 1];
      
      // Report what AI did
      this.send({
        type: "opponent_acted",
        drew_from: drawSource,
        discarded: cardToNotation(discardAfter),
        opponent_melds: ai.melds.map(meldToPayload),
        opponent_card_count: ai.hand.length,
        opponent_has_laid_down: ai.hasLaidDown,
      });
      
      // Check for AI win
      if (this.game.checkWin(ai)) {
        this.handleRoundEnd(this.aiPlayerIndex);
        return;
      }
      
      // Back to bot's turn
      this.phase = "await_draw";
      this.game.currentPlayerIndex = this.botPlayerIndex;
      this.sendYourTurn();
      
    }, this.aiDelay);
  }
  
  handleRoundEnd(winnerIndex) {
    this.game.applyRoundScores(winnerIndex);
    
    const isBot = winnerIndex === this.botPlayerIndex;
    const botPlayer = this.game.players[this.botPlayerIndex];
    const aiPlayer = this.game.players[this.aiPlayerIndex];
    
    this.send({
      type: "round_end",
      winner: isBot ? "you" : "opponent",
      your_score: botPlayer.totalScore,
      opponent_score: aiPlayer.totalScore,
      round_number: this.game.roundIndex + 1,
    });
    
    // Check if game is over
    if (this.game.roundIndex >= ROUNDS.length - 1) {
      const youWin = botPlayer.totalScore < aiPlayer.totalScore;
      this.send({
        type: "game_end",
        winner: youWin ? "you" : "opponent",
        your_final_score: botPlayer.totalScore,
        opponent_final_score: aiPlayer.totalScore,
      });
      this.phase = "game_over";
    } else {
      // Start next round
      this.game.nextRound();
      this.phase = "await_draw";
      
      const round = this.game.currentRound();
      this.send({
        type: "new_round",
        round_number: this.game.roundIndex + 1,
        requirements: formatRequirements(round.requirements),
        your_hand: botPlayer.hand.map(cardToPayload),
        discard_top: cardToNotation(this.game.discardPile[this.game.discardPile.length - 1]),
        deck_count: this.game.drawPile.length,
        you_go_first: this.game.currentPlayerIndex === this.botPlayerIndex,
      });
      
      if (this.game.currentPlayerIndex === this.botPlayerIndex) {
        this.sendYourTurn();
      } else {
        this.runAiTurn();
      }
    }
  }
}

/**
 * Create a WebSocket server for bot connections
 * Uses noServer mode so it can coexist with other WebSocket servers
 */
export function createBotApiServer(server, path = "/api/bot") {
  const wss = new WebSocketServer({ noServer: true });
  
  // Handle upgrade requests for our path
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    
    if (url.pathname === path) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });
  
  wss.on("connection", (ws) => {
    console.log("[bot-api] Bot connected");
    const session = new BotSession(ws);
    
    // Send welcome message
    session.send({
      type: "welcome",
      message: "Connected to Chrummy Bot API",
      actions: [
        { action: "new_game", description: "Start a new game" },
        { action: "draw_deck", description: "Draw from deck (when it's your turn to draw)" },
        { action: "draw_discard", description: "Draw from discard pile (when it's your turn to draw)" },
        { action: "discard", params: { card: "7H" }, description: "Discard a card (when it's your turn to discard)" },
        { action: "meld", description: "Automatically find and lay down valid melds" },
        { action: "layoff", params: { card: "7H", player: 0, meld_index: 0 }, description: "Lay off a card onto an existing meld" },
      ],
      card_notation: "Cards use notation like '7H' (7 of hearts), 'QS' (queen of spades), 'JK' (joker)",
    });
    
    ws.on("close", () => {
      console.log("[bot-api] Bot disconnected");
    });
  });
  
  return wss;
}
