"""Pygame prototype with basic gameplay for mini-game 1."""

from __future__ import annotations

import sys
import time

import pygame

from game_engine import Card, Game, Player, ai_choose_discard

# Basic colors
GREEN = (20, 120, 60)
WHITE = (245, 245, 245)
BLACK = (15, 15, 15)
RED = (200, 40, 40)
CARD_BG = (250, 250, 250)
CARD_BORDER = (30, 30, 30)
CARD_BACK = (40, 60, 120)


def draw_card(
    surface: pygame.Surface,
    card: Card,
    rect: pygame.Rect,
    font: pygame.font.Font,
    suit_font: pygame.font.Font,
    show_face: bool = True,
    label: str | None = None,
) -> None:
    if not show_face:
        pygame.draw.rect(surface, CARD_BACK, rect, border_radius=8)
        pygame.draw.rect(surface, CARD_BORDER, rect, width=2, border_radius=8)
        if label:
            label_surf = font.render(label, True, WHITE)
            surface.blit(
                label_surf,
                (rect.centerx - label_surf.get_width() // 2, rect.centery - label_surf.get_height() // 2),
            )
        return

    pygame.draw.rect(surface, CARD_BG, rect, border_radius=8)
    pygame.draw.rect(surface, CARD_BORDER, rect, width=2, border_radius=8)

    if card.is_joker():
        color = BLACK
        rank_surf = font.render("JOKER", True, color)
        suit_surf = suit_font.render("🃏", True, color)
    else:
        color = RED if card.is_red() else BLACK
        rank_surf = font.render(card.rank, True, color)
        suit_surf = suit_font.render(card.suit, True, color)

    surface.blit(rank_surf, (rect.x + 8, rect.y + 6))
    surface.blit(suit_surf, (rect.centerx - suit_surf.get_width() // 2, rect.centery - suit_surf.get_height() // 2))
    surface.blit(rank_surf, (rect.right - rank_surf.get_width() - 8, rect.bottom - rank_surf.get_height() - 6))

    if label:
        label_surf = font.render(label, True, BLACK)
        surface.blit(label_surf, (rect.x + 6, rect.bottom - label_surf.get_height() - 6))


def layout_hand(hand: list[Card], start_x: int, start_y: int, card_w: int, card_h: int, gap: int) -> list[pygame.Rect]:
    rects = []
    x = start_x
    y = start_y
    for idx, _ in enumerate(hand):
        rects.append(pygame.Rect(x, y, card_w, card_h))
        x += card_w + gap
        if (idx + 1) % 8 == 0:
            x = start_x
            y += card_h + gap
    return rects


def main() -> None:
    pygame.init()
    pygame.display.set_caption("Chinese Rummy - Mini-Game 1")

    screen = pygame.display.set_mode((1100, 760))
    clock = pygame.time.Clock()

    font = pygame.font.SysFont("Georgia", 22)
    title_font = pygame.font.SysFont("Georgia", 32, bold=True)
    small_font = pygame.font.SysFont("Georgia", 18)
    try:
        suit_font = pygame.font.Font("/System/Library/Fonts/Apple Symbols.ttf", 22)
        suit_small_font = pygame.font.Font("/System/Library/Fonts/Apple Symbols.ttf", 18)
    except FileNotFoundError:
        suit_font = font
        suit_small_font = small_font

    game = Game(players=2, dealer_index=1)
    state = "await_draw"
    message = "Your turn: draw from deck (D) or discard (F)."
    ai_delay_until = 0.0
    opponent_log: list[str] = []

    card_w, card_h = 80, 120
    gap = 12
    dragging: dict[str, object] | None = None
    layoff_mode = False
    layoff_selected_index: int | None = None
    meld_hitboxes: list[tuple[object, pygame.Rect]] = []
    last_click = {"time": 0, "target": None}
    double_click_ms = 350

    running = True
    while running:
        now = time.time()
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    if layoff_mode:
                        layoff_mode = False
                        layoff_selected_index = None
                        message = "Lay-off mode canceled."
                    else:
                        running = False
                elif event.key == pygame.K_r:
                    game.start_round()
                    state = "await_draw"
                    message = "New round. Your turn: draw from deck (D) or discard (F)."
                    opponent_log.clear()
                elif game.current_player().name == "You":
                    player = game.current_player()
                    if state == "await_draw":
                        if event.key == pygame.K_d:
                            card = game.draw_from_stock(player)
                            message = f"You drew {card.short() if card else '(none)'} from deck."
                            state = "await_discard"
                        elif event.key == pygame.K_f:
                            card = game.draw_from_discard(player)
                            message = f"You drew {card.short() if card else '(none)'} from discard."
                            state = "await_discard"
                    elif state == "await_discard":
                        if event.key == pygame.K_l:
                            if game.try_lay_down(player):
                                message = "You laid down two 3-of-a-kinds."
                            else:
                                message = "No valid two 3-of-a-kinds."
                        elif event.key == pygame.K_o:
                            if layoff_mode:
                                layoff_mode = False
                                layoff_selected_index = None
                                message = "Lay-off mode canceled."
                            elif game.can_lay_off(player):
                                layoff_mode = True
                                layoff_selected_index = None
                                message = "Lay-off mode: click a hand card, then a meld to place it."
                            else:
                                message = "No lay offs available."
                        elif pygame.K_1 <= event.key <= pygame.K_9:
                            idx = event.key - pygame.K_1
                            if idx < len(player.hand):
                                discard_card = player.hand[idx]
                                game.discard(player, discard_card)
                                message = f"You discarded {discard_card.short()}."
                                if game.check_win_after_discard(player):
                                    message = "You win! Press R to restart."
                                    state = "game_over"
                                else:
                                    game.current_player_index = 1
                                    ai_delay_until = now + 0.6
                                    state = "ai_turn"
            elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                if game.current_player().name == "You":
                    you = game.players[0]
                    click_target = None
                    click_time = pygame.time.get_ticks()
                    rects = layout_hand(you.hand, 30, 500, card_w, card_h, gap)
                    hand_clicked = False
                    for idx, rect in enumerate(rects):
                        if rect.collidepoint(event.pos):
                            hand_clicked = True
                            click_target = ("hand", idx)
                            if layoff_mode:
                                layoff_selected_index = idx
                                message = "Lay-off: now click a meld to place this card."
                            else:
                                card = you.hand[idx]
                                dragging = {
                                    "card": card,
                                    "index": idx,
                                    "offset": (event.pos[0] - rect.x, event.pos[1] - rect.y),
                                    "pos": event.pos,
                                }
                            break
                    if not hand_clicked:
                        # Double-click on deck/discard to draw.
                        draw_rect = pygame.Rect(600, 120, card_w, card_h)
                        discard_rect = pygame.Rect(700, 120, card_w, card_h)
                        if draw_rect.collidepoint(event.pos):
                            click_target = ("draw", None)
                        elif discard_rect.collidepoint(event.pos):
                            click_target = ("discard", None)

                    if click_target:
                        if (
                            last_click["target"] == click_target
                            and click_time - last_click["time"] <= double_click_ms
                        ):
                            if game.current_player().name == "You":
                                player = game.current_player()
                                if state == "await_draw":
                                    if click_target[0] == "draw":
                                        card = game.draw_from_stock(player)
                                        message = f"You drew {card.short() if card else '(none)'} from deck."
                                        state = "await_discard"
                                    elif click_target[0] == "discard":
                                        card = game.draw_from_discard(player)
                                        message = f"You drew {card.short() if card else '(none)'} from discard."
                                        state = "await_discard"
                                elif state == "await_discard" and click_target[0] == "hand":
                                    idx = click_target[1]
                                    if idx is not None and idx < len(player.hand):
                                        discard_card = player.hand[idx]
                                        game.discard(player, discard_card)
                                        message = f"You discarded {discard_card.short()}."
                                        if game.check_win_after_discard(player):
                                            message = "You win! Press R to restart."
                                            state = "game_over"
                                        else:
                                            game.current_player_index = 1
                                            ai_delay_until = now + 0.6
                                            state = "ai_turn"
                            last_click["time"] = 0
                            last_click["target"] = None
                        else:
                            last_click["time"] = click_time
                            last_click["target"] = click_target

                    if layoff_mode and layoff_selected_index is not None and not hand_clicked:
                        target_meld = None
                        for meld, rect in meld_hitboxes:
                            if rect.collidepoint(event.pos):
                                target_meld = meld
                                break
                        if target_meld is not None:
                            card = you.hand[layoff_selected_index]
                            if game.lay_off_card_to_meld(you, card, target_meld):
                                message = f"Laid off {card.short()}."
                            else:
                                message = "Invalid lay-off."
                            layoff_selected_index = None
                        else:
                            message = "Lay-off: click a meld to place the selected card."
            elif event.type == pygame.MOUSEMOTION:
                if dragging:
                    dragging["pos"] = event.pos
            elif event.type == pygame.MOUSEBUTTONUP and event.button == 1:
                if dragging and game.current_player().name == "You":
                    you = game.players[0]
                    rects = layout_hand(you.hand, 30, 500, card_w, card_h, gap)
                    drop_index = dragging["index"]
                    for idx, rect in enumerate(rects):
                        if rect.collidepoint(event.pos):
                            drop_index = idx
                            break
                    card = dragging["card"]
                    old_index = dragging["index"]
                    if card in you.hand:
                        you.hand.pop(old_index)
                        if drop_index >= len(you.hand):
                            you.hand.append(card)
                        else:
                            you.hand.insert(drop_index, card)
                    dragging = None

        if game.current_player().name == "Opponent" and state == "ai_turn" and now >= ai_delay_until:
            player = game.current_player()
            top_discard = game.discard_pile[-1] if game.discard_pile else None
            if top_discard and (top_discard.is_wild() or _ai_wants_discard(player, top_discard)):
                drawn = game.draw_from_discard(player)
                if drawn:
                    opponent_log.append(f"Drew {drawn.short()} from discard.")
            else:
                drawn = game.draw_from_stock(player)
                if drawn:
                    opponent_log.append("Drew from deck.")
            game.try_lay_down(player)
            moved = game.lay_off_all(player)
            if moved:
                opponent_log.append(f"Laid off {moved} card(s).")
            discard_card = ai_choose_discard(player.hand)
            game.discard(player, discard_card)
            opponent_log.append(f"Discarded {discard_card.short()}.")
            if game.check_win_after_discard(player):
                message = "Opponent wins! Press R to restart."
                state = "game_over"
            else:
                game.current_player_index = 0
                state = "await_draw"
                message = "Your turn: draw from deck (D) or discard (F)."

        screen.fill(GREEN)

        title = title_font.render("Chinese Rummy - Mini-Game 1", True, WHITE)
        screen.blit(title, (30, 20))
        screen.blit(font.render(message, True, WHITE), (30, 60))

        # Draw piles
        draw_rect = pygame.Rect(800, 120, card_w, card_h)
        discard_rect = pygame.Rect(900, 120, card_w, card_h)
        if game.draw_pile:
            draw_card(
                screen,
                
                game.draw_pile[0],
                draw_rect,
                font,
                suit_font,
                show_face=False,
                label=str(len(game.draw_pile)),
            )
        else:
            pygame.draw.rect(screen, CARD_BACK, draw_rect, border_radius=8)
        if game.discard_pile:
            draw_card(screen, game.discard_pile[-1], discard_rect, font, suit_font, show_face=True)
        else:
            pygame.draw.rect(screen, CARD_BG, discard_rect, border_radius=8)

        screen.blit(small_font.render("Deck (D)", True, WHITE), (draw_rect.x, draw_rect.y - 22))
        screen.blit(small_font.render("Discard (F)", True, WHITE), (discard_rect.x, discard_rect.y - 22))

        # Opponent hand count
        opp = game.players[1]
        opp_label = small_font.render(f"Opponent hand ({len(opp.hand)}):", True, WHITE)
        screen.blit(opp_label, (30, 120))
        if opponent_log:
            log_text = "Opponent last: " + " ".join(opponent_log[-3:])
            screen.blit(small_font.render(log_text, True, WHITE), (30, 140))

        # Opponent hand (face up for development)
        opp_rects = layout_hand(opp.hand, 30, 170, 60, 90, 10)
        for card, rect in zip(opp.hand, opp_rects):
            draw_card(screen, card, rect, small_font, suit_small_font, show_face=True)

        # Opponent melds
        opp_meld_y = 270
        screen.blit(small_font.render("Opponent melds:", True, WHITE), (30, opp_meld_y))
        meld_hitboxes = []
        meld_x = 30
        meld_y = opp_meld_y + 30
        for meld in opp.melds:
            start_x = meld_x
            for card in meld.cards:
                rect = pygame.Rect(meld_x, meld_y, 50, 70)
                if layoff_mode and layoff_selected_index is not None:
                    pygame.draw.rect(screen, WHITE, rect.inflate(4, 4), width=2, border_radius=6)
                draw_card(screen, card, rect, small_font, suit_small_font, show_face=True)
                meld_x += 55
            width = max(50, (len(meld.cards) * 55) - 5)
            meld_hitboxes.append((meld, pygame.Rect(start_x, meld_y, width, 70)))
            meld_x += 20

        # Player melds
        you = game.players[0]
        player_meld_y = 360
        screen.blit(small_font.render("Your melds:", True, WHITE), (30, player_meld_y))
        meld_x = 30
        meld_y = player_meld_y + 30
        for meld in you.melds:
            start_x = meld_x
            for card in meld.cards:
                rect = pygame.Rect(meld_x, meld_y, 50, 70)
                if layoff_mode and layoff_selected_index is not None:
                    pygame.draw.rect(screen, WHITE, rect.inflate(4, 4), width=2, border_radius=6)
                draw_card(screen, card, rect, small_font, suit_small_font, show_face=True)
                meld_x += 55
            width = max(50, (len(meld.cards) * 55) - 5)
            meld_hitboxes.append((meld, pygame.Rect(start_x, meld_y, width, 70)))
            meld_x += 20

        # Player hand
        rects = layout_hand(you.hand, 30, 500, card_w, card_h, gap)
        for idx, (card, rect) in enumerate(zip(you.hand, rects), start=1):
            if layoff_mode and layoff_selected_index == (idx - 1):
                pygame.draw.rect(screen, WHITE, rect.inflate(6, 6), width=3, border_radius=8)
            if dragging and dragging["card"] == card:
                continue
            draw_card(screen, card, rect, font, suit_font, show_face=True, label=str(idx))

        if dragging:
            pos = dragging["pos"]
            offset = dragging["offset"]
            drag_rect = pygame.Rect(pos[0] - offset[0], pos[1] - offset[1], card_w, card_h)
            draw_card(screen, dragging["card"], drag_rect, font, suit_font, show_face=True)

        # Controls
        controls = "Controls: D draw deck | F draw discard | L lay down | O lay off (click card, then meld) | 1-9 discard | R restart"
        screen.blit(small_font.render(controls, True, WHITE), (30, 720))

        pygame.display.flip()
        clock.tick(60)

    pygame.quit()
    sys.exit(0)


def _ai_wants_discard(player: Player, card: Card) -> bool:
    if card.is_wild():
        return True
    naturals = [c for c in player.hand if not c.is_wild() and c.rank == card.rank]
    return len(naturals) >= 1


if __name__ == "__main__":
    main()
