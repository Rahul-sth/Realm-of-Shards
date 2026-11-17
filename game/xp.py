from typing import TYPE_CHECKING, List

from .constants import PLAYER_HP_PER_LEVEL

if TYPE_CHECKING:
    from .player import Player


def required_xp_for_level(level: int) -> int:
    return level * 100


def award_xp(player: "Player", amount: int, events: List[dict]) -> None:
    player.xp += amount
    events.append(
        {
            "kind": "xp",
            "playerId": player.id,
            "x": player.x,
            "y": player.y,
            "amount": amount,
        }
    )

    while player.xp >= required_xp_for_level(player.level):
        player.xp -= required_xp_for_level(player.level)
        player.level += 1
        player.max_hp += PLAYER_HP_PER_LEVEL
        player.hp = player.max_hp
        events.append(
            {
                "kind": "level_up",
                "playerId": player.id,
                "x": player.x,
                "y": player.y,
                "level": player.level,
            }
        )
