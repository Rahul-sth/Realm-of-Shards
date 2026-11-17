import math
import random
import time
from typing import Dict, List, Optional

from .combat import Bullet, spawn_player_bullet, step_bullets
from .constants import (
    MONSTER_COUNT,
    PLAYER_COLORS,
    PLAYER_RADIUS,
    PLAYER_SPEED,
    TICK_DT,
    WORLD_HEIGHT,
    WORLD_WIDTH,
)
from .monsters import SlimeMonster, random_monster_spawn
from .player import Player, clamp, sanitize_name


class GameWorld:
    def __init__(self) -> None:
        self.players: Dict[str, Player] = {}
        self.monsters: List[SlimeMonster] = []
        self.bullets: List[Bullet] = []
        self.events: List[dict] = []
        self._color_index = 0
        self._spawn_initial_monsters()

    def _spawn_initial_monsters(self) -> None:
        self.monsters = []
        for idx in range(1, MONSTER_COUNT + 1):
            sx, sy = random_monster_spawn(self.players)
            self.monsters.append(
                SlimeMonster(
                    id=f"slime_{idx}",
                    x=sx,
                    y=sy,
                    facing=random.uniform(-math.pi, math.pi),
                    wander_timer=random.uniform(0.5, 3.0),
                )
            )

    def add_player(self, player_id: str, raw_name: object) -> Player:
        name = sanitize_name(raw_name)
        color = PLAYER_COLORS[self._color_index % len(PLAYER_COLORS)]
        self._color_index += 1

        spawn_x = clamp(
            WORLD_WIDTH / 2.0 + random.uniform(-200.0, 200.0),
            PLAYER_RADIUS + 40.0,
            WORLD_WIDTH - PLAYER_RADIUS - 40.0,
        )
        spawn_y = clamp(
            WORLD_HEIGHT / 2.0 + random.uniform(-160.0, 160.0),
            PLAYER_RADIUS + 40.0,
            WORLD_HEIGHT - PLAYER_RADIUS - 40.0,
        )

        player = Player(
            id=player_id,
            name=name,
            x=spawn_x,
            y=spawn_y,
            spawn_x=spawn_x,
            spawn_y=spawn_y,
            color=color,
        )
        self.players[player_id] = player
        return player

    def remove_player(self, player_id: str) -> None:
        self.players.pop(player_id, None)
        for monster in self.monsters:
            if monster.target_id == player_id:
                monster.target_id = None

    def handle_input(self, player_id: str, dx: float, dy: float, facing: float) -> None:
        player = self.players.get(player_id)
        if player is None:
            return
        if not player.alive:
            player.vx = 0.0
            player.vy = 0.0
            return
        if not (math.isfinite(dx) and math.isfinite(dy) and math.isfinite(facing)):
            return

        ndx = clamp(dx, -1.0, 1.0)
        ndy = clamp(dy, -1.0, 1.0)
        mag = math.hypot(ndx, ndy)
        if mag > 0.0001:
            ndx /= mag
            ndy /= mag
        else:
            ndx = 0.0
            ndy = 0.0

        player.vx = ndx * PLAYER_SPEED
        player.vy = ndy * PLAYER_SPEED
        player.facing = facing

    def handle_attack(
        self,
        player_id: str,
        target_x: Optional[float] = None,
        target_y: Optional[float] = None,
    ) -> None:
        player = self.players.get(player_id)
        if player is None:
            return
        spawn_player_bullet(player, self.bullets, self.events, target_x, target_y)

    def handle_respawn(self, player_id: str) -> None:
        player = self.players.get(player_id)
        if player is None or player.alive:
            return
        player.hp = player.max_hp
        player.alive = True
        player.vx = 0.0
        player.vy = 0.0
        player.attack_cooldown = 0.0
        player.attack_timer = 0.0
        player.x = player.spawn_x
        player.y = player.spawn_y

    def step(self, dt: float = TICK_DT) -> None:
        for player in self.players.values():
            player.step(dt)
        self.bullets = step_bullets(
            dt, self.bullets, self.players, self.monsters, self.events
        )
        for monster in self.monsters:
            monster.step(dt, self.players, self.monsters, self.events)

    def get_snapshot(self, flush_events: bool = True) -> dict:
        if flush_events:
            events = self.events[:]
            self.events.clear()
        else:
            events = self.events[:]

        return {
            "type": "state",
            "players": [p.to_dict() for p in self.players.values()],
            "monsters": [m.to_dict() for m in self.monsters],
            "bullets": [b.to_dict() for b in self.bullets],
            "events": events,
            "serverTime": int(time.time() * 1000),
        }
