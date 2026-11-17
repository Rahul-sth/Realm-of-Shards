from dataclasses import dataclass
import math
import random
from typing import Dict, List, Optional

from .constants import (
    MONSTER_ATTACK_COOLDOWN,
    MONSTER_ATTACK_RANGE,
    MONSTER_DAMAGE,
    MONSTER_DETECT_RADIUS,
    MONSTER_LEASH_RADIUS,
    MONSTER_MAX_HP,
    MONSTER_RADIUS,
    MONSTER_RESPAWN_TIME,
    MONSTER_SPEED,
    MONSTER_WANDER_SPEED,
    WORLD_HEIGHT,
    WORLD_WIDTH,
)
from .player import Player, clamp


def random_monster_spawn(players: Dict[str, Player]) -> tuple[float, float]:
    margin = 90.0
    for _ in range(12):
        x = random.uniform(margin, WORLD_WIDTH - margin)
        y = random.uniform(margin, WORLD_HEIGHT - margin)
        if all(
            not p.alive or math.hypot(p.x - x, p.y - y) >= 160.0
            for p in players.values()
        ):
            return x, y
    return (
        random.uniform(margin, WORLD_WIDTH - margin),
        random.uniform(margin, WORLD_HEIGHT - margin),
    )


@dataclass
class SlimeMonster:
    id: str
    x: float
    y: float
    hp: int = MONSTER_MAX_HP
    max_hp: int = MONSTER_MAX_HP
    target_id: Optional[str] = None
    attack_timer: float = 0.0
    alive: bool = True
    respawn_timer: float = 0.0
    facing: float = 0.0
    moving: bool = False
    wander_dx: float = 0.0
    wander_dy: float = 0.0
    wander_timer: float = 1.5

    def step(
        self,
        dt: float,
        players: Dict[str, Player],
        monsters: List["SlimeMonster"],
        events: List[dict],
    ) -> None:
        if not self.alive:
            self.respawn_timer -= dt
            if self.respawn_timer <= 1e-6:
                sx, sy = random_monster_spawn(players)
                self.x = sx
                self.y = sy
                self.hp = MONSTER_MAX_HP
                self.max_hp = MONSTER_MAX_HP
                self.target_id = None
                self.attack_timer = 0.0
                self.alive = True
                self.respawn_timer = 0.0
                self.moving = False
            return

        if self.attack_timer > 0.0:
            self.attack_timer = max(0.0, self.attack_timer - dt)

        target = players.get(self.target_id) if self.target_id else None
        if (
            target is None
            or not target.alive
            or math.hypot(target.x - self.x, target.y - self.y) > MONSTER_LEASH_RADIUS
        ):
            self.target_id = None
            target = None

        if target is None:
            best_dist = MONSTER_DETECT_RADIUS
            best_player: Optional[Player] = None
            for player in players.values():
                if not player.alive:
                    continue
                dist = math.hypot(player.x - self.x, player.y - self.y)
                if dist <= best_dist:
                    best_dist = dist
                    best_player = player
            if best_player is not None:
                self.target_id = best_player.id
                target = best_player

        if target is not None:
            dx = target.x - self.x
            dy = target.y - self.y
            dist = math.hypot(dx, dy)
            if dist > 0.001:
                self.facing = math.atan2(dy, dx)

            if dist > 28.0:
                step_dist = min(MONSTER_SPEED * dt, dist - 24.0)
                self.x = clamp(
                    self.x + (dx / dist) * step_dist,
                    MONSTER_RADIUS,
                    WORLD_WIDTH - MONSTER_RADIUS,
                )
                self.y = clamp(
                    self.y + (dy / dist) * step_dist,
                    MONSTER_RADIUS,
                    WORLD_HEIGHT - MONSTER_RADIUS,
                )
                self.moving = True
            else:
                self.moving = False

            if dist <= MONSTER_ATTACK_RANGE and self.attack_timer <= 0.0:
                self.attack_timer = MONSTER_ATTACK_COOLDOWN
                target.hp = max(0, target.hp - MONSTER_DAMAGE)
                events.append(
                    {
                        "kind": "damage",
                        "targetType": "player",
                        "targetId": target.id,
                        "x": target.x,
                        "y": target.y,
                        "amount": MONSTER_DAMAGE,
                        "attackerId": self.id,
                    }
                )
                if target.hp <= 0:
                    target.hp = 0
                    target.alive = False
                    target.vx = 0.0
                    target.vy = 0.0
                    target.attack_timer = 0.0
                    for m in monsters:
                        if m.target_id == target.id:
                            m.target_id = None
                    events.append(
                        {
                            "kind": "player_death",
                            "playerId": target.id,
                            "playerName": target.name,
                            "killerName": "Void Slime",
                            "x": target.x,
                            "y": target.y,
                        }
                    )
        else:
            self.wander_timer -= dt
            if self.wander_timer <= 0.0:
                if random.random() < 0.45:
                    self.wander_dx = 0.0
                    self.wander_dy = 0.0
                    self.wander_timer = random.uniform(1.0, 2.6)
                else:
                    angle = random.uniform(-math.pi, math.pi)
                    self.wander_dx = math.cos(angle)
                    self.wander_dy = math.sin(angle)
                    self.facing = angle
                    self.wander_timer = random.uniform(1.2, 2.8)

            if self.wander_dx != 0.0 or self.wander_dy != 0.0:
                self.x = clamp(
                    self.x + self.wander_dx * MONSTER_WANDER_SPEED * dt,
                    60.0,
                    WORLD_WIDTH - 60.0,
                )
                self.y = clamp(
                    self.y + self.wander_dy * MONSTER_WANDER_SPEED * dt,
                    60.0,
                    WORLD_HEIGHT - 60.0,
                )
                self.moving = True
            else:
                self.moving = False

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "x": round(self.x, 2),
            "y": round(self.y, 2),
            "hp": self.hp,
            "max_hp": self.max_hp,
            "target_id": self.target_id,
            "alive": self.alive,
            "facing": round(self.facing, 3),
            "moving": self.moving,
        }
