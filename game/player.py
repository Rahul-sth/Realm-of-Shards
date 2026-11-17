from dataclasses import dataclass
import re

from .constants import (
    MAX_NAME_LENGTH,
    PLAYER_BASE_HP,
    PLAYER_RADIUS,
    WORLD_HEIGHT,
    WORLD_WIDTH,
)
from .xp import required_xp_for_level


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def sanitize_name(raw_name: object) -> str:
    if not isinstance(raw_name, str):
        return "Wanderer"
    cleaned = re.sub(r"[\x00-\x1f\x7f<>]", "", raw_name)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()[:MAX_NAME_LENGTH]
    return cleaned if cleaned else "Wanderer"


@dataclass
class Player:
    id: str
    name: str
    x: float
    y: float
    color: str
    spawn_x: float = 0.0
    spawn_y: float = 0.0
    vx: float = 0.0
    vy: float = 0.0
    facing: float = 0.0
    hp: int = PLAYER_BASE_HP
    max_hp: int = PLAYER_BASE_HP
    level: int = 1
    xp: int = 0
    kills: int = 0
    attack_cooldown: float = 0.0
    attack_timer: float = 0.0
    alive: bool = True

    def step(self, dt: float) -> None:
        if self.attack_cooldown > 0.0:
            self.attack_cooldown = max(0.0, self.attack_cooldown - dt)
        if self.attack_timer > 0.0:
            self.attack_timer = max(0.0, self.attack_timer - dt)

        if not self.alive:
            self.vx = 0.0
            self.vy = 0.0
            return

        self.x = clamp(
            self.x + self.vx * dt,
            PLAYER_RADIUS,
            WORLD_WIDTH - PLAYER_RADIUS,
        )
        self.y = clamp(
            self.y + self.vy * dt,
            PLAYER_RADIUS,
            WORLD_HEIGHT - PLAYER_RADIUS,
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "x": round(self.x, 2),
            "y": round(self.y, 2),
            "vx": round(self.vx, 2),
            "vy": round(self.vy, 2),
            "facing": round(self.facing, 3),
            "hp": self.hp,
            "max_hp": self.max_hp,
            "level": self.level,
            "xp": self.xp,
            "required_xp": required_xp_for_level(self.level),
            "kills": self.kills,
            "color": self.color,
            "attacking": self.attack_timer > 0.0,
            "alive": self.alive,
        }
