from dataclasses import dataclass
import math
from typing import Dict, List, Optional
import uuid

from .constants import (
    BULLET_MAX_LIFETIME,
    BULLET_RADIUS,
    BULLET_SPAWN_OFFSET,
    BULLET_SPEED,
    MONSTER_RADIUS,
    MONSTER_RESPAWN_TIME,
    PLAYER_ATTACK_ANIM_DURATION,
    PLAYER_ATTACK_COOLDOWN,
    PLAYER_BASE_DAMAGE,
    PLAYER_DAMAGE_PER_LEVEL,
    PLAYER_PVP_MULTIPLIER,
    PLAYER_RADIUS,
    WORLD_HEIGHT,
    WORLD_WIDTH,
    XP_MONSTER_KILL,
    XP_PLAYER_KILL,
)
from .monsters import SlimeMonster
from .player import Player, clamp
from .xp import award_xp


@dataclass
class Bullet:
    id: str
    owner_id: str
    x: float
    y: float
    vx: float
    vy: float
    damage: int
    color: str
    ttl: float = BULLET_MAX_LIFETIME
    hit: bool = False

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "owner_id": self.owner_id,
            "x": round(self.x, 2),
            "y": round(self.y, 2),
            "vx": round(self.vx, 2),
            "vy": round(self.vy, 2),
            "color": self.color,
        }


def segment_circle_hit_t(
    ax: float,
    ay: float,
    bx: float,
    by: float,
    cx: float,
    cy: float,
    radius: float,
) -> Optional[float]:
    dx = bx - ax
    dy = by - ay
    fx = ax - cx
    fy = ay - cy

    a = dx * dx + dy * dy
    if a <= 1e-9:
        return 0.0 if (fx * fx + fy * fy <= radius * radius) else None

    b = 2.0 * (fx * dx + fy * dy)
    c = fx * fx + fy * fy - radius * radius
    if c <= 0.0:
        return 0.0

    disc = b * b - 4.0 * a * c
    if disc < 0.0:
        return None

    t1 = (-b - math.sqrt(disc)) / (2.0 * a)
    if 0.0 <= t1 <= 1.0:
        return t1
    return None


def spawn_player_bullet(
    attacker: Player,
    bullets: List[Bullet],
    events: List[dict],
    target_x: Optional[float] = None,
    target_y: Optional[float] = None,
) -> None:
    if not attacker.alive or attacker.attack_cooldown > 0.0:
        return

    direction_x = math.cos(attacker.facing)
    direction_y = math.sin(attacker.facing)

    if (
        target_x is not None
        and target_y is not None
        and math.isfinite(target_x)
        and math.isfinite(target_y)
    ):
        dx = target_x - attacker.x
        dy = target_y - attacker.y
        length = math.sqrt(dx * dx + dy * dy)
        if length > 1e-6:
            direction_x = dx / length
            direction_y = dy / length
            attacker.facing = math.atan2(direction_y, direction_x)

    attacker.attack_cooldown = PLAYER_ATTACK_COOLDOWN
    attacker.attack_timer = PLAYER_ATTACK_ANIM_DURATION

    spawn_x = clamp(attacker.x + direction_x * BULLET_SPAWN_OFFSET, 0.0, float(WORLD_WIDTH))
    spawn_y = clamp(attacker.y + direction_y * BULLET_SPAWN_OFFSET, 0.0, float(WORLD_HEIGHT))
    damage = PLAYER_BASE_DAMAGE + (attacker.level - 1) * PLAYER_DAMAGE_PER_LEVEL

    bullets.append(
        Bullet(
            id=uuid.uuid4().hex[:10],
            owner_id=attacker.id,
            x=spawn_x,
            y=spawn_y,
            vx=direction_x * BULLET_SPEED,
            vy=direction_y * BULLET_SPEED,
            damage=damage,
            color=attacker.color,
            ttl=BULLET_MAX_LIFETIME,
            hit=False,
        )
    )

    events.append(
        {
            "kind": "shoot",
            "playerId": attacker.id,
            "x": spawn_x,
            "y": spawn_y,
            "facing": attacker.facing,
            "color": attacker.color,
        }
    )


def step_bullets(
    dt: float,
    bullets: List[Bullet],
    players: Dict[str, Player],
    monsters: List[SlimeMonster],
    events: List[dict],
) -> List[Bullet]:
    surviving: List[Bullet] = []

    for bullet in bullets:
        if bullet.hit:
            continue

        bullet.ttl -= dt
        if bullet.ttl <= 0.0:
            continue

        prev_x = bullet.x
        prev_y = bullet.y
        next_x = prev_x + bullet.vx * dt
        next_y = prev_y + bullet.vy * dt

        best_t: Optional[float] = None
        hit_kind: Optional[str] = None
        hit_monster: Optional[SlimeMonster] = None
        hit_player: Optional[Player] = None

        for monster in monsters:
            if not monster.alive:
                continue
            t = segment_circle_hit_t(
                prev_x,
                prev_y,
                next_x,
                next_y,
                monster.x,
                monster.y,
                MONSTER_RADIUS + BULLET_RADIUS,
            )
            if t is not None and (best_t is None or t < best_t):
                best_t = t
                hit_kind = "monster"
                hit_monster = monster
                hit_player = None

        for other in players.values():
            if not other.alive or other.id == bullet.owner_id:
                continue
            t = segment_circle_hit_t(
                prev_x,
                prev_y,
                next_x,
                next_y,
                other.x,
                other.y,
                PLAYER_RADIUS + BULLET_RADIUS,
            )
            if t is not None and (best_t is None or t < best_t):
                best_t = t
                hit_kind = "player"
                hit_player = other
                hit_monster = None

        if best_t is not None and hit_kind is not None:
            bullet.hit = True
            impact_x = prev_x + (next_x - prev_x) * best_t
            impact_y = prev_y + (next_y - prev_y) * best_t
            attacker = players.get(bullet.owner_id)

            events.append(
                {
                    "kind": "bullet_hit",
                    "x": impact_x,
                    "y": impact_y,
                    "color": bullet.color,
                    "targetType": hit_kind,
                }
            )

            if hit_kind == "monster" and hit_monster is not None and hit_monster.alive:
                hit_monster.hp = max(0, hit_monster.hp - bullet.damage)
                if attacker is not None:
                    hit_monster.target_id = attacker.id

                events.append(
                    {
                        "kind": "damage",
                        "targetType": "monster",
                        "targetId": hit_monster.id,
                        "x": hit_monster.x,
                        "y": hit_monster.y,
                        "amount": bullet.damage,
                        "attackerId": bullet.owner_id,
                    }
                )

                if hit_monster.hp <= 0:
                    hit_monster.alive = False
                    hit_monster.respawn_timer = MONSTER_RESPAWN_TIME
                    hit_monster.target_id = None
                    hit_monster.moving = False
                    events.append(
                        {
                            "kind": "monster_death",
                            "monsterId": hit_monster.id,
                            "x": hit_monster.x,
                            "y": hit_monster.y,
                        }
                    )
                    if attacker is not None:
                        attacker.kills += 1
                        award_xp(attacker, XP_MONSTER_KILL, events)

            elif hit_kind == "player" and hit_player is not None and hit_player.alive:
                pvp_damage = round(bullet.damage * PLAYER_PVP_MULTIPLIER)
                hit_player.hp = max(0, hit_player.hp - pvp_damage)

                events.append(
                    {
                        "kind": "damage",
                        "targetType": "player",
                        "targetId": hit_player.id,
                        "x": hit_player.x,
                        "y": hit_player.y,
                        "amount": pvp_damage,
                        "attackerId": bullet.owner_id,
                    }
                )

                if hit_player.hp <= 0:
                    hit_player.hp = 0
                    hit_player.alive = False
                    hit_player.vx = 0.0
                    hit_player.vy = 0.0
                    hit_player.attack_timer = 0.0
                    for m in monsters:
                        if m.target_id == hit_player.id:
                            m.target_id = None
                    events.append(
                        {
                            "kind": "player_death",
                            "playerId": hit_player.id,
                            "playerName": hit_player.name,
                            "killerName": attacker.name if attacker is not None else "Champion",
                            "x": hit_player.x,
                            "y": hit_player.y,
                        }
                    )
                    if attacker is not None:
                        attacker.kills += 1
                        award_xp(attacker, XP_PLAYER_KILL, events)
            continue

        if next_x < 0.0 or next_x > WORLD_WIDTH or next_y < 0.0 or next_y > WORLD_HEIGHT:
            events.append(
                {
                    "kind": "bullet_hit",
                    "x": clamp(next_x, 0.0, float(WORLD_WIDTH)),
                    "y": clamp(next_y, 0.0, float(WORLD_HEIGHT)),
                    "color": bullet.color,
                    "targetType": "wall",
                }
            )
            continue

        bullet.x = next_x
        bullet.y = next_y
        surviving.append(bullet)

    return surviving
