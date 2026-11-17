import crypto from 'node:crypto';
import {
  BULLET_MAX_LIFETIME,
  BULLET_RADIUS,
  BULLET_SPAWN_OFFSET,
  BULLET_SPEED,
  BulletState,
  CombatEvent,
  MAX_NAME_LENGTH,
  MONSTER_ATTACK_COOLDOWN,
  MONSTER_ATTACK_RANGE,
  MONSTER_COUNT,
  MONSTER_DAMAGE,
  MONSTER_DETECT_RADIUS,
  MONSTER_LEASH_RADIUS,
  MONSTER_MAX_HP,
  MONSTER_RADIUS,
  MONSTER_RESPAWN_TIME,
  MONSTER_SPEED,
  MONSTER_WANDER_SPEED,
  MonsterState,
  PLAYER_ATTACK_ANIM_DURATION,
  PLAYER_ATTACK_COOLDOWN,
  PLAYER_BASE_DAMAGE,
  PLAYER_BASE_HP,
  PLAYER_COLORS,
  PLAYER_DAMAGE_PER_LEVEL,
  PLAYER_HP_PER_LEVEL,
  PLAYER_PVP_MULTIPLIER,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  PlayerState,
  StateSnapshot,
  TICK_DT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  XP_MONSTER_KILL,
  XP_PLAYER_KILL,
} from './types.ts';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Computes the parametric intersection fraction t in [0, 1] if segment AB
 * comes within `radius` of circle center C, or null if no intersection.
 */
function segmentCircleHitT(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  radius: number,
): number | null {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;

  const a = dx * dx + dy * dy;
  if (a <= 1e-9) {
    return fx * fx + fy * fy <= radius * radius ? 0 : null;
  }

  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;

  if (c <= 0) {
    return 0;
  }

  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;

  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-b - sqrtDisc) / (2 * a);
  if (t1 >= 0 && t1 <= 1) {
    return t1;
  }
  return null;
}

export function requiredXpForLevel(level: number): number {
  return level * 100;
}

export function sanitizePlayerName(rawName: unknown): string {
  if (typeof rawName !== 'string') {
    return 'Wanderer';
  }
  const cleaned = rawName
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return cleaned.length > 0 ? cleaned : 'Wanderer';
}

export class GameWorld {
  private players = new Map<string, PlayerState>();
  private monsters: MonsterState[] = [];
  private bullets: BulletState[] = [];
  private events: CombatEvent[] = [];
  private colorIndex = 0;

  constructor() {
    this.spawnInitialMonsters();
  }

  private spawnInitialMonsters(): void {
    this.monsters = [];
    for (let i = 1; i <= MONSTER_COUNT; i++) {
      const pos = this.randomMonsterSpawn();
      this.monsters.push({
        id: `slime_${i}`,
        x: pos.x,
        y: pos.y,
        hp: MONSTER_MAX_HP,
        max_hp: MONSTER_MAX_HP,
        target_id: null,
        attack_timer: 0,
        alive: true,
        respawn_timer: 0,
        facing: randomRange(-Math.PI, Math.PI),
        moving: false,
        wander_dx: 0,
        wander_dy: 0,
        wander_timer: randomRange(0.5, 3.0),
      });
    }
  }

  private randomMonsterSpawn(): { x: number; y: number } {
    const margin = 90;
    for (let attempt = 0; attempt < 12; attempt++) {
      const x = randomRange(margin, WORLD_WIDTH - margin);
      const y = randomRange(margin, WORLD_HEIGHT - margin);
      let tooClose = false;
      for (const p of this.players.values()) {
        if (p.alive && Math.hypot(p.x - x, p.y - y) < 160) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        return { x, y };
      }
    }
    return {
      x: randomRange(margin, WORLD_WIDTH - margin),
      y: randomRange(margin, WORLD_HEIGHT - margin),
    };
  }

  public addPlayer(id: string, rawName: unknown): PlayerState {
    const name = sanitizePlayerName(rawName);
    const color = PLAYER_COLORS[this.colorIndex % PLAYER_COLORS.length];
    this.colorIndex++;

    const spawnX = clamp(
      WORLD_WIDTH / 2 + randomRange(-200, 200),
      PLAYER_RADIUS + 40,
      WORLD_WIDTH - PLAYER_RADIUS - 40,
    );
    const spawnY = clamp(
      WORLD_HEIGHT / 2 + randomRange(-160, 160),
      PLAYER_RADIUS + 40,
      WORLD_HEIGHT - PLAYER_RADIUS - 40,
    );

    const player: PlayerState = {
      id,
      name,
      x: spawnX,
      y: spawnY,
      spawn_x: spawnX,
      spawn_y: spawnY,
      vx: 0,
      vy: 0,
      facing: 0,
      hp: PLAYER_BASE_HP,
      max_hp: PLAYER_BASE_HP,
      level: 1,
      xp: 0,
      kills: 0,
      color,
      attack_cooldown: 0,
      attack_timer: 0,
      alive: true,
    };

    this.players.set(id, player);
    return player;
  }

  public removePlayer(id: string): void {
    this.players.delete(id);
    for (const monster of this.monsters) {
      if (monster.target_id === id) {
        monster.target_id = null;
      }
    }
  }

  public getPlayer(id: string): PlayerState | undefined {
    return this.players.get(id);
  }

  public handleInput(id: string, dx: number, dy: number, facing: number): void {
    const player = this.players.get(id);
    if (!player) return;

    if (!player.alive) {
      player.vx = 0;
      player.vy = 0;
      return;
    }

    if (
      !Number.isFinite(dx) ||
      !Number.isFinite(dy) ||
      !Number.isFinite(facing)
    ) {
      return;
    }

    let ndx = clamp(dx, -1, 1);
    let ndy = clamp(dy, -1, 1);
    const mag = Math.hypot(ndx, ndy);
    if (mag > 0.0001) {
      ndx /= mag;
      ndy /= mag;
    } else {
      ndx = 0;
      ndy = 0;
    }

    player.vx = ndx * PLAYER_SPEED;
    player.vy = ndy * PLAYER_SPEED;
    player.facing = facing;
  }

  public handleAttack(id: string, targetX?: number, targetY?: number): void {
    const player = this.players.get(id);
    if (!player || !player.alive) return;
    if (player.attack_cooldown > 0) return;

    let directionX = Math.cos(player.facing);
    let directionY = Math.sin(player.facing);

    if (
      typeof targetX === 'number' &&
      typeof targetY === 'number' &&
      Number.isFinite(targetX) &&
      Number.isFinite(targetY)
    ) {
      const dx = targetX - player.x;
      const dy = targetY - player.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length > 1e-6) {
        directionX = dx / length;
        directionY = dy / length;
        player.facing = Math.atan2(directionY, directionX);
      }
    }

    player.attack_cooldown = PLAYER_ATTACK_COOLDOWN;
    player.attack_timer = PLAYER_ATTACK_ANIM_DURATION;

    const spawnX = clamp(player.x + directionX * BULLET_SPAWN_OFFSET, 0, WORLD_WIDTH);
    const spawnY = clamp(player.y + directionY * BULLET_SPAWN_OFFSET, 0, WORLD_HEIGHT);

    const damage = PLAYER_BASE_DAMAGE + (player.level - 1) * PLAYER_DAMAGE_PER_LEVEL;

    this.bullets.push({
      id: crypto.randomUUID().slice(0, 10),
      owner_id: player.id,
      x: spawnX,
      y: spawnY,
      vx: directionX * BULLET_SPEED,
      vy: directionY * BULLET_SPEED,
      damage,
      color: player.color,
      ttl: BULLET_MAX_LIFETIME,
      hit: false,
    });

    this.events.push({
      kind: 'shoot',
      playerId: player.id,
      x: spawnX,
      y: spawnY,
      facing: player.facing,
      color: player.color,
    });
  }

  public handleRespawn(id: string): void {
    const player = this.players.get(id);
    if (!player || player.alive) return;

    player.hp = player.max_hp;
    player.alive = true;
    player.vx = 0;
    player.vy = 0;
    player.attack_cooldown = 0;
    player.attack_timer = 0;
    player.x = player.spawn_x;
    player.y = player.spawn_y;
  }

  private grantXp(player: PlayerState, amount: number): void {
    player.xp += amount;
    this.events.push({
      kind: 'xp',
      playerId: player.id,
      x: player.x,
      y: player.y,
      amount,
    });

    while (player.xp >= requiredXpForLevel(player.level)) {
      player.xp -= requiredXpForLevel(player.level);
      player.level += 1;
      player.max_hp += PLAYER_HP_PER_LEVEL;
      player.hp = player.max_hp;

      this.events.push({
        kind: 'level_up',
        playerId: player.id,
        x: player.x,
        y: player.y,
        level: player.level,
      });
    }
  }

  private killPlayer(player: PlayerState, killerName: string): void {
    player.hp = 0;
    player.alive = false;
    player.vx = 0;
    player.vy = 0;
    player.attack_timer = 0;

    for (const monster of this.monsters) {
      if (monster.target_id === player.id) {
        monster.target_id = null;
      }
    }

    this.events.push({
      kind: 'player_death',
      playerId: player.id,
      playerName: player.name,
      killerName,
      x: player.x,
      y: player.y,
    });
  }

  private stepBullets(dt: number): void {
    const surviving: BulletState[] = [];

    for (const bullet of this.bullets) {
      if (bullet.hit) continue;

      bullet.ttl -= dt;
      if (bullet.ttl <= 0) continue;

      const prevX = bullet.x;
      const prevY = bullet.y;
      const nextX = prevX + bullet.vx * dt;
      const nextY = prevY + bullet.vy * dt;

      let bestT: number | null = null;
      let hitKind: 'monster' | 'player' | null = null;
      let hitMonster: MonsterState | null = null;
      let hitPlayer: PlayerState | null = null;

      // Check collision with alive monsters
      for (const monster of this.monsters) {
        if (!monster.alive) continue;
        const t = segmentCircleHitT(
          prevX,
          prevY,
          nextX,
          nextY,
          monster.x,
          monster.y,
          MONSTER_RADIUS + BULLET_RADIUS,
        );
        if (t !== null && (bestT === null || t < bestT)) {
          bestT = t;
          hitKind = 'monster';
          hitMonster = monster;
          hitPlayer = null;
        }
      }

      // Check collision with alive players (never the shooter)
      for (const other of this.players.values()) {
        if (!other.alive || other.id === bullet.owner_id) continue;
        const t = segmentCircleHitT(
          prevX,
          prevY,
          nextX,
          nextY,
          other.x,
          other.y,
          PLAYER_RADIUS + BULLET_RADIUS,
        );
        if (t !== null && (bestT === null || t < bestT)) {
          bestT = t;
          hitKind = 'player';
          hitPlayer = other;
          hitMonster = null;
        }
      }

      if (bestT !== null && hitKind !== null) {
        bullet.hit = true;
        const impactX = prevX + (nextX - prevX) * bestT;
        const impactY = prevY + (nextY - prevY) * bestT;
        const attacker = this.players.get(bullet.owner_id);

        this.events.push({
          kind: 'bullet_hit',
          x: impactX,
          y: impactY,
          color: bullet.color,
          targetType: hitKind,
        });

        if (hitKind === 'monster' && hitMonster && hitMonster.alive) {
          hitMonster.hp = Math.max(0, hitMonster.hp - bullet.damage);
          if (attacker) {
            hitMonster.target_id = attacker.id;
          }

          this.events.push({
            kind: 'damage',
            targetType: 'monster',
            targetId: hitMonster.id,
            x: hitMonster.x,
            y: hitMonster.y,
            amount: bullet.damage,
            attackerId: bullet.owner_id,
          });

          if (hitMonster.hp <= 0) {
            hitMonster.alive = false;
            hitMonster.respawn_timer = MONSTER_RESPAWN_TIME;
            hitMonster.target_id = null;
            hitMonster.moving = false;

            this.events.push({
              kind: 'monster_death',
              monsterId: hitMonster.id,
              x: hitMonster.x,
              y: hitMonster.y,
            });

            if (attacker) {
              attacker.kills += 1;
              this.grantXp(attacker, XP_MONSTER_KILL);
            }
          }
        } else if (hitKind === 'player' && hitPlayer && hitPlayer.alive) {
          const pvpDamage = Math.round(bullet.damage * PLAYER_PVP_MULTIPLIER);
          hitPlayer.hp = Math.max(0, hitPlayer.hp - pvpDamage);

          this.events.push({
            kind: 'damage',
            targetType: 'player',
            targetId: hitPlayer.id,
            x: hitPlayer.x,
            y: hitPlayer.y,
            amount: pvpDamage,
            attackerId: bullet.owner_id,
          });

          if (hitPlayer.hp <= 0) {
            this.killPlayer(hitPlayer, attacker ? attacker.name : 'Champion');
            if (attacker) {
              attacker.kills += 1;
              this.grantXp(attacker, XP_PLAYER_KILL);
            }
          }
        }
        continue;
      }

      // Remove bullets hitting arena wall boundary
      if (nextX < 0 || nextX > WORLD_WIDTH || nextY < 0 || nextY > WORLD_HEIGHT) {
        this.events.push({
          kind: 'bullet_hit',
          x: clamp(nextX, 0, WORLD_WIDTH),
          y: clamp(nextY, 0, WORLD_HEIGHT),
          color: bullet.color,
          targetType: 'wall',
        });
        continue;
      }

      bullet.x = nextX;
      bullet.y = nextY;
      surviving.push(bullet);
    }

    this.bullets = surviving;
  }

  public step(dt: number = TICK_DT): void {
    // 1. Update players
    for (const player of this.players.values()) {
      if (player.attack_cooldown > 0) {
        player.attack_cooldown = Math.max(0, player.attack_cooldown - dt);
      }
      if (player.attack_timer > 0) {
        player.attack_timer = Math.max(0, player.attack_timer - dt);
      }

      if (!player.alive) {
        player.vx = 0;
        player.vy = 0;
        continue;
      }

      player.x = clamp(
        player.x + player.vx * dt,
        PLAYER_RADIUS,
        WORLD_WIDTH - PLAYER_RADIUS,
      );
      player.y = clamp(
        player.y + player.vy * dt,
        PLAYER_RADIUS,
        WORLD_HEIGHT - PLAYER_RADIUS,
      );
    }

    // 2. Update directional projectiles (straight-line motion + single-hit collision)
    this.stepBullets(dt);

    // 3. Update monsters
    for (const monster of this.monsters) {
      if (!monster.alive) {
        monster.respawn_timer -= dt;
        if (monster.respawn_timer <= 1e-6) {
          const spawn = this.randomMonsterSpawn();
          monster.x = spawn.x;
          monster.y = spawn.y;
          monster.hp = MONSTER_MAX_HP;
          monster.max_hp = MONSTER_MAX_HP;
          monster.target_id = null;
          monster.attack_timer = 0;
          monster.alive = true;
          monster.respawn_timer = 0;
          monster.moving = false;
        }
        continue;
      }

      if (monster.attack_timer > 0) {
        monster.attack_timer = Math.max(0, monster.attack_timer - dt);
      }

      let target = monster.target_id ? this.players.get(monster.target_id) : undefined;
      if (
        !target ||
        !target.alive ||
        Math.hypot(target.x - monster.x, target.y - monster.y) > MONSTER_LEASH_RADIUS
      ) {
        monster.target_id = null;
        target = undefined;
      }

      if (!target) {
        let bestDist = MONSTER_DETECT_RADIUS;
        let bestPlayer: PlayerState | undefined;
        for (const p of this.players.values()) {
          if (!p.alive) continue;
          const d = Math.hypot(p.x - monster.x, p.y - monster.y);
          if (d <= bestDist) {
            bestDist = d;
            bestPlayer = p;
          }
        }
        if (bestPlayer) {
          monster.target_id = bestPlayer.id;
          target = bestPlayer;
        }
      }

      if (target) {
        const dx = target.x - monster.x;
        const dy = target.y - monster.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 0.001) {
          monster.facing = Math.atan2(dy, dx);
        }

        if (dist > 28) {
          const stepDist = Math.min(MONSTER_SPEED * dt, dist - 24);
          monster.x = clamp(
            monster.x + (dx / dist) * stepDist,
            MONSTER_RADIUS,
            WORLD_WIDTH - MONSTER_RADIUS,
          );
          monster.y = clamp(
            monster.y + (dy / dist) * stepDist,
            MONSTER_RADIUS,
            WORLD_HEIGHT - MONSTER_RADIUS,
          );
          monster.moving = true;
        } else {
          monster.moving = false;
        }

        if (dist <= MONSTER_ATTACK_RANGE && monster.attack_timer <= 0) {
          monster.attack_timer = MONSTER_ATTACK_COOLDOWN;
          target.hp = Math.max(0, target.hp - MONSTER_DAMAGE);

          this.events.push({
            kind: 'damage',
            targetType: 'player',
            targetId: target.id,
            x: target.x,
            y: target.y,
            amount: MONSTER_DAMAGE,
            attackerId: monster.id,
          });

          if (target.hp <= 0) {
            this.killPlayer(target, 'Void Slime');
            monster.target_id = null;
          }
        }
      } else {
        monster.wander_timer -= dt;
        if (monster.wander_timer <= 0) {
          if (Math.random() < 0.45) {
            monster.wander_dx = 0;
            monster.wander_dy = 0;
            monster.wander_timer = randomRange(1.0, 2.6);
          } else {
            const angle = randomRange(-Math.PI, Math.PI);
            monster.wander_dx = Math.cos(angle);
            monster.wander_dy = Math.sin(angle);
            monster.facing = angle;
            monster.wander_timer = randomRange(1.2, 2.8);
          }
        }

        if (monster.wander_dx !== 0 || monster.wander_dy !== 0) {
          monster.x = clamp(
            monster.x + monster.wander_dx * MONSTER_WANDER_SPEED * dt,
            60,
            WORLD_WIDTH - 60,
          );
          monster.y = clamp(
            monster.y + monster.wander_dy * MONSTER_WANDER_SPEED * dt,
            60,
            WORLD_HEIGHT - 60,
          );
          monster.moving = true;
        } else {
          monster.moving = false;
        }
      }
    }
  }

  public getSnapshot(flushEvents = true): StateSnapshot {
    const players = Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      x: Math.round(p.x * 100) / 100,
      y: Math.round(p.y * 100) / 100,
      vx: Math.round(p.vx * 100) / 100,
      vy: Math.round(p.vy * 100) / 100,
      facing: Math.round(p.facing * 1000) / 1000,
      hp: p.hp,
      max_hp: p.max_hp,
      level: p.level,
      xp: p.xp,
      required_xp: requiredXpForLevel(p.level),
      kills: p.kills,
      color: p.color,
      attacking: p.attack_timer > 0,
      alive: p.alive,
    }));

    const monsters = this.monsters.map((m) => ({
      id: m.id,
      x: Math.round(m.x * 100) / 100,
      y: Math.round(m.y * 100) / 100,
      hp: m.hp,
      max_hp: m.max_hp,
      target_id: m.target_id,
      alive: m.alive,
      facing: Math.round(m.facing * 1000) / 1000,
      moving: m.moving,
    }));

    const bullets = this.bullets.map((b) => ({
      id: b.id,
      owner_id: b.owner_id,
      x: Math.round(b.x * 100) / 100,
      y: Math.round(b.y * 100) / 100,
      vx: Math.round(b.vx * 100) / 100,
      vy: Math.round(b.vy * 100) / 100,
      color: b.color,
    }));

    return {
      type: 'state',
      players,
      monsters,
      bullets,
      events: flushEvents ? this.events.splice(0, this.events.length) : [...this.events],
      serverTime: Date.now(),
    };
  }
}
