export const WORLD_WIDTH = 1600;
export const WORLD_HEIGHT = 1200;
export const TICK_RATE = 20;
export const TICK_DT = 1 / TICK_RATE;
export const TICK_INTERVAL_MS = 1000 / TICK_RATE;

export const PLAYER_SPEED = 240;
export const PLAYER_RADIUS = 20;
export const PLAYER_BASE_HP = 100;
export const PLAYER_HP_PER_LEVEL = 20;
export const PLAYER_BASE_DAMAGE = 20;
export const PLAYER_DAMAGE_PER_LEVEL = 5;
export const PLAYER_PVP_MULTIPLIER = 0.75;
export const PLAYER_ATTACK_COOLDOWN = 0.45;
export const PLAYER_ATTACK_ANIM_DURATION = 0.22;
export const MAX_NAME_LENGTH = 14;

export const BULLET_SPEED = 560;
export const BULLET_RADIUS = 6;
export const BULLET_MAX_LIFETIME = 1.25;
export const BULLET_SPAWN_OFFSET = 24;

export const PLAYER_COLORS = [
  '#38bdf8', // Sky blue
  '#f472b6', // Pink
  '#a78bfa', // Purple
  '#4ade80', // Green
  '#facc15', // Yellow
] as const;

export const MONSTER_COUNT = 10;
export const MONSTER_MAX_HP = 60;
export const MONSTER_SPEED = 115;
export const MONSTER_WANDER_SPEED = 32;
export const MONSTER_DETECT_RADIUS = 260;
export const MONSTER_LEASH_RADIUS = 450;
export const MONSTER_ATTACK_RANGE = 36;
export const MONSTER_DAMAGE = 12;
export const MONSTER_ATTACK_COOLDOWN = 1.2;
export const MONSTER_RESPAWN_TIME = 5.0;
export const MONSTER_RADIUS = 18;

export const XP_MONSTER_KILL = 35;
export const XP_PLAYER_KILL = 50;

export interface PlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  spawn_x: number;
  spawn_y: number;
  vx: number;
  vy: number;
  facing: number;
  hp: number;
  max_hp: number;
  level: number;
  xp: number;
  kills: number;
  color: string;
  attack_cooldown: number;
  attack_timer: number;
  alive: boolean;
}

export interface MonsterState {
  id: string;
  x: number;
  y: number;
  hp: number;
  max_hp: number;
  target_id: string | null;
  attack_timer: number;
  alive: boolean;
  respawn_timer: number;
  facing: number;
  moving: boolean;
  wander_dx: number;
  wander_dy: number;
  wander_timer: number;
}

export interface BulletState {
  id: string;
  owner_id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  color: string;
  ttl: number;
  hit: boolean;
}

export type CombatEvent =
  | {
      kind: 'shoot';
      playerId: string;
      x: number;
      y: number;
      facing: number;
      color: string;
    }
  | {
      kind: 'bullet_hit';
      x: number;
      y: number;
      color: string;
      targetType: 'player' | 'monster' | 'wall';
    }
  | {
      kind: 'damage';
      targetType: 'player' | 'monster';
      targetId: string;
      x: number;
      y: number;
      amount: number;
      attackerId: string;
    }
  | {
      kind: 'xp';
      playerId: string;
      x: number;
      y: number;
      amount: number;
    }
  | {
      kind: 'level_up';
      playerId: string;
      x: number;
      y: number;
      level: number;
    }
  | {
      kind: 'monster_death';
      monsterId: string;
      x: number;
      y: number;
    }
  | {
      kind: 'player_death';
      playerId: string;
      playerName: string;
      killerName: string;
      x: number;
      y: number;
    };

export interface SerializedPlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  hp: number;
  max_hp: number;
  level: number;
  xp: number;
  required_xp: number;
  kills: number;
  color: string;
  attacking: boolean;
  alive: boolean;
}

export interface SerializedMonster {
  id: string;
  x: number;
  y: number;
  hp: number;
  max_hp: number;
  target_id: string | null;
  alive: boolean;
  facing: number;
  moving: boolean;
}

export interface SerializedBullet {
  id: string;
  owner_id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
}

export interface StateSnapshot {
  type: 'state';
  players: SerializedPlayer[];
  monsters: SerializedMonster[];
  bullets: SerializedBullet[];
  events: CombatEvent[];
  serverTime: number;
}
