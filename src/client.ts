import { SoundEngine } from './audio.ts';

interface WorldDims {
  width: number;
  height: number;
}

interface NetworkPlayer {
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

interface NetworkMonster {
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

interface NetworkBullet {
  id: string;
  owner_id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
}

type CombatEvent =
  | { kind: 'shoot'; playerId: string; x: number; y: number; facing: number; color: string }
  | { kind: 'bullet_hit'; x: number; y: number; color: string; targetType: 'player' | 'monster' | 'wall' }
  | { kind: 'damage'; targetType: 'player' | 'monster'; targetId: string; x: number; y: number; amount: number; attackerId: string }
  | { kind: 'xp'; playerId: string; x: number; y: number; amount: number }
  | { kind: 'level_up'; playerId: string; x: number; y: number; level: number }
  | { kind: 'monster_death'; monsterId: string; x: number; y: number }
  | { kind: 'player_death'; playerId: string; playerName: string; killerName: string; x: number; y: number };

interface StateMessage {
  type: 'state';
  players: NetworkPlayer[];
  monsters: NetworkMonster[];
  bullets?: NetworkBullet[];
  events?: CombatEvent[];
  serverTime?: number;
}

interface WelcomeMessage {
  type: 'welcome';
  id: string;
  world: WorldDims;
}

interface PongMessage {
  type: 'pong';
  t: number;
}

interface RenderPlayer extends NetworkPlayer {
  renderX: number;
  renderY: number;
  renderFacing: number;
  renderHp: number;
  flashTimer: number;
  swingTimer: number;
  swingDir: number;
  recoilX: number;
  recoilY: number;
  stepTimer: number;
  levelAuraTimer: number;
  phase: number;
}

interface RenderMonster extends NetworkMonster {
  renderX: number;
  renderY: number;
  renderFacing: number;
  renderHp: number;
  flashTimer: number;
  lungeTimer: number;
  spawnTimer: number;
  recoilX: number;
  recoilY: number;
  slimeTrailTimer: number;
  phase: number;
}

interface RenderBullet extends NetworkBullet {
  renderX: number;
  renderY: number;
}

interface SlashFx {
  x: number;
  y: number;
  facing: number;
  color: string;
  dir: number;
  age: number;
  duration: number;
}

interface FloatingTextFx {
  x: number;
  y: number;
  vx: number;
  vy: number;
  text: string;
  color: string;
  size: number;
  age: number;
  duration: number;
}

interface ParticleFx {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  glow: boolean;
  age: number;
  duration: number;
}

interface RingFx {
  x: number;
  y: number;
  color: string;
  maxRadius: number;
  lineWidth: number;
  age: number;
  duration: number;
}

interface AmbientMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  phase: number;
  color: string;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function shortestAngleDiff(from: number, to: number): number {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function lerpAngle(from: number, to: number, t: number): number {
  return from + shortestAngleDiff(from, to) * t;
}

function seededNoise(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

const MAX_PARTICLES = 180;
const ATTACK_COOLDOWN_SEC = 0.45;

export function initRealmOfShards(): void {
  const maybeCanvas = document.getElementById('gameCanvas') as HTMLCanvasElement | null;
  if (!maybeCanvas) return;
  const maybeCtx = maybeCanvas.getContext('2d');
  if (!maybeCtx) return;
  const canvas: HTMLCanvasElement = maybeCanvas;
  const ctx: CanvasRenderingContext2D = maybeCtx;

  // DOM Elements
  const damageVignette = document.getElementById('damageVignette')!;
  const joinOverlay = document.getElementById('joinOverlay')!;
  const joinForm = document.getElementById('joinForm') as HTMLFormElement;
  const playerNameInput = document.getElementById('playerNameInput') as HTMLInputElement;
  const joinError = document.getElementById('joinError')!;
  const enterWorldBtn = document.getElementById('enterWorldBtn') as HTMLButtonElement;
  const enterWorldText = document.getElementById('enterWorldText')!;

  const hud = document.getElementById('hud')!;
  const hudColorDot = document.getElementById('hudColorDot')!;
  const hudPlayerName = document.getElementById('hudPlayerName')!;
  const hudKills = document.getElementById('hudKills')!;
  const hudLevel = document.getElementById('hudLevel')!;
  const hudHpText = document.getElementById('hudHpText')!;
  const hudHpFill = document.getElementById('hudHpFill')!;
  const hudXpText = document.getElementById('hudXpText')!;
  const hudXpFill = document.getElementById('hudXpFill')!;
  const hudOnlineCount = document.getElementById('hudOnlineCount')!;
  const hudConnStatus = document.getElementById('hudConnStatus')!;
  const audioToggleBtn = document.getElementById('audioToggleBtn')!;
  const leaderboardList = document.getElementById('leaderboardList')!;

  const deathOverlay = document.getElementById('deathOverlay')!;
  const deathSubtitle = document.getElementById('deathSubtitle')!;
  const mainMenuBtn = document.getElementById('mainMenuBtn') as HTMLButtonElement;
  const respawnBtn = document.getElementById('respawnBtn') as HTMLButtonElement;

  const mobileControls = document.getElementById('mobileControls')!;
  const joystickZone = document.getElementById('joystickZone')!;
  const joystickThumb = document.getElementById('joystickThumb')!;
  const mobileAttackBtn = document.getElementById('mobileAttackBtn')!;
  const mobileCooldownCircle = document.getElementById('mobileCooldownCircle') as SVGCircleElement | null;
  const shootAimIndicator = document.getElementById('shootAimIndicator');

  const sound = new SoundEngine();

  // Game & World State
  const world: WorldDims = { width: 1600, height: 1200 };
  let myPlayerId: string | null = null;
  let joinedName = '';
  let hasJoined = false;
  let isConnecting = false;
  let intentionalDisconnect = false;
  let respawnPending = false;
  let reconnectTimer: number | null = null;
  let lastServerTime = 0;
  let latencyMs: number | null = null;
  let connState: 'connected' | 'reconnecting' | 'disconnected' = 'disconnected';

  const players = new Map<string, RenderPlayer>();
  const monsters = new Map<string, RenderMonster>();
  const bullets = new Map<string, RenderBullet>();

  // Visual FX queues
  const slashes: SlashFx[] = [];
  const floatingTexts: FloatingTextFx[] = [];
  const particles: ParticleFx[] = [];
  const rings: RingFx[] = [];
  const ambientMotes: AmbientMote[] = [];

  // Local feedback timers
  let localCooldown = 0;
  let screenShake = 0;
  let vignetteTimer: number | null = null;
  let swingToggle = 1;

  // Pre-rendered fantasy terrain offscreen canvas
  let terrainCanvas: HTMLCanvasElement | null = null;

  function buildTerrainCache(): void {
    const off = document.createElement('canvas');
    off.width = world.width;
    off.height = world.height;
    const tctx = off.getContext('2d');
    if (!tctx) return;

    // Base dark slate floor
    tctx.fillStyle = '#1e293b';
    tctx.fillRect(0, 0, world.width, world.height);

    // Subtle stone flagstones (100x100 blocks with slight tonal variation)
    const tile = 100;
    for (let tx = 0; tx < world.width; tx += tile) {
      for (let ty = 0; ty < world.height; ty += tile) {
        const n = seededNoise(tx * 0.03, ty * 0.03);
        if (n > 0.62) {
          tctx.fillStyle = 'rgba(15, 23, 42, 0.24)';
          tctx.fillRect(tx + 2, ty + 2, tile - 4, tile - 4);
        } else if (n < 0.26) {
          tctx.fillStyle = 'rgba(51, 65, 85, 0.2)';
          tctx.fillRect(tx + 2, ty + 2, tile - 4, tile - 4);
        }

        // Subtle stone cracks / moss accents
        if (n > 0.86) {
          tctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
          tctx.lineWidth = 1.5;
          tctx.beginPath();
          tctx.moveTo(tx + 18, ty + 28);
          tctx.lineTo(tx + 44, ty + 46);
          tctx.lineTo(tx + 62, ty + 38);
          tctx.stroke();
        } else if (n < 0.11) {
          tctx.fillStyle = 'rgba(16, 185, 129, 0.06)';
          tctx.beginPath();
          tctx.arc(tx + 50, ty + 50, 22, 0, Math.PI * 2);
          tctx.fill();
        }
      }
    }

    // Crisp Arena Grid (#273549)
    const gridSize = 50;
    tctx.strokeStyle = '#273549';
    tctx.lineWidth = 1;
    tctx.beginPath();
    for (let x = gridSize; x < world.width; x += gridSize) {
      tctx.moveTo(x, 0);
      tctx.lineTo(x, world.height);
    }
    for (let y = gridSize; y < world.height; y += gridSize) {
      tctx.moveTo(0, y);
      tctx.lineTo(world.width, y);
    }
    tctx.stroke();

    // Subtle Ancient Ley Lines radiating from center sanctuary
    const cx = world.width / 2;
    const cy = world.height / 2;
    tctx.strokeStyle = 'rgba(56, 189, 248, 0.055)';
    tctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      tctx.beginPath();
      tctx.moveTo(cx + Math.cos(a) * 125, cy + Math.sin(a) * 125);
      tctx.lineTo(cx + Math.cos(a) * 650, cy + Math.sin(a) * 520);
      tctx.stroke();
    }

    // Center Sanctuary Stone Dais
    const daisGrad = tctx.createRadialGradient(cx, cy, 20, cx, cy, 220);
    daisGrad.addColorStop(0, 'rgba(56, 189, 248, 0.09)');
    daisGrad.addColorStop(0.6, 'rgba(99, 102, 241, 0.04)');
    daisGrad.addColorStop(1, 'rgba(30, 41, 59, 0)');
    tctx.fillStyle = daisGrad;
    tctx.beginPath();
    tctx.arc(cx, cy, 220, 0, Math.PI * 2);
    tctx.fill();

    // Decorative Corner Runic Pads (purely visual floor markings)
    const pads = [
      { x: 220, y: 200, color: 'rgba(56, 189, 248, 0.11)' },
      { x: world.width - 220, y: 200, color: 'rgba(167, 139, 250, 0.11)' },
      { x: 220, y: world.height - 200, color: 'rgba(167, 139, 250, 0.11)' },
      { x: world.width - 220, y: world.height - 200, color: 'rgba(56, 189, 248, 0.11)' },
    ];
    for (const pad of pads) {
      tctx.strokeStyle = pad.color;
      tctx.lineWidth = 2;
      tctx.beginPath();
      tctx.arc(pad.x, pad.y, 64, 0, Math.PI * 2);
      tctx.stroke();
      tctx.beginPath();
      tctx.arc(pad.x, pad.y, 44, 0, Math.PI * 2);
      tctx.stroke();
    }

    // Inner border shadow vignette along arena walls
    const borderGlow = 26;
    const topG = tctx.createLinearGradient(0, 0, 0, borderGlow);
    topG.addColorStop(0, 'rgba(9, 13, 22, 0.65)');
    topG.addColorStop(1, 'rgba(9, 13, 22, 0)');
    tctx.fillStyle = topG;
    tctx.fillRect(0, 0, world.width, borderGlow);

    const botG = tctx.createLinearGradient(0, world.height - borderGlow, 0, world.height);
    botG.addColorStop(0, 'rgba(9, 13, 22, 0)');
    botG.addColorStop(1, 'rgba(9, 13, 22, 0.65)');
    tctx.fillStyle = botG;
    tctx.fillRect(0, world.height - borderGlow, world.width, borderGlow);

    const leftG = tctx.createLinearGradient(0, 0, borderGlow, 0);
    leftG.addColorStop(0, 'rgba(9, 13, 22, 0.65)');
    leftG.addColorStop(1, 'rgba(9, 13, 22, 0)');
    tctx.fillStyle = leftG;
    tctx.fillRect(0, 0, borderGlow, world.height);

    const rightG = tctx.createLinearGradient(world.width - borderGlow, 0, world.width, 0);
    rightG.addColorStop(0, 'rgba(9, 13, 22, 0)');
    rightG.addColorStop(1, 'rgba(9, 13, 22, 0.65)');
    tctx.fillStyle = rightG;
    tctx.fillRect(world.width - borderGlow, 0, borderGlow, world.height);

    terrainCanvas = off;
  }

  function initAmbientMotes(): void {
    ambientMotes.length = 0;
    const colors = ['#38bdf8', '#a78bfa', '#4ade80'];
    for (let i = 0; i < 42; i++) {
      ambientMotes.push({
        x: Math.random() * world.width,
        y: Math.random() * world.height,
        vx: (Math.random() - 0.5) * 14,
        vy: -6 - Math.random() * 12,
        radius: 1.2 + Math.random() * 2.1,
        alpha: 0.18 + Math.random() * 0.32,
        phase: Math.random() * Math.PI * 2,
        color: colors[i % colors.length],
      });
    }
  }

  buildTerrainCache();
  initAmbientMotes();

  // Camera
  const camera = { x: world.width / 2, y: world.height / 2, initialized: false };

  // Input State
  const keys = new Set<string>();
  const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, active: false };
  const joystick = { active: false, pointerId: -1, dx: 0, dy: 0, originX: 0, originY: 0 };
  const shootPad = { active: false, pointerId: -1, originX: 0, originY: 0, aiming: false };
  let touchControlsEnabled =
    window.matchMedia('(pointer: coarse)').matches ||
    (navigator.maxTouchPoints ?? 0) > 0 ||
    'ontouchstart' in window;
  let currentFacing = 0;
  let lastSentDx = 0;
  let lastSentDy = 0;
  let lastQuickInputAt = 0;

  // WebSocket
  let socket: WebSocket | null = null;

  function renderConnStatus(): void {
    hudConnStatus.className = `conn-status ${connState}`;
    if (connState === 'connected') {
      hudConnStatus.textContent = latencyMs !== null ? `Connected · ${latencyMs}ms` : 'Connected';
    } else if (connState === 'reconnecting') {
      hudConnStatus.textContent = 'Reconnecting...';
    } else {
      hudConnStatus.textContent = 'Disconnected';
    }
  }

  function setConnStatus(state: 'connected' | 'reconnecting' | 'disconnected'): void {
    connState = state;
    renderConnStatus();
  }

  function resizeCanvas(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', () => {
    window.setTimeout(resizeCanvas, 100);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resizeCanvas);
  }

  function resetTouchPads(): void {
    joystick.active = false;
    joystick.pointerId = -1;
    joystick.dx = 0;
    joystick.dy = 0;
    joystickThumb.style.transform = 'translate(0px, 0px)';

    shootPad.active = false;
    shootPad.pointerId = -1;
    shootPad.aiming = false;
    mobileAttackBtn.classList.remove('aiming');
    if (shootAimIndicator) {
      shootAimIndicator.style.transform = 'translate(0px, 0px)';
    }
  }

  function syncMobileControlsVisibility(): void {
    const me = myPlayerId ? players.get(myPlayerId) : undefined;
    const alive = me ? me.alive : true;
    const shouldShow = hasJoined && touchControlsEnabled && alive;
    if (shouldShow) {
      mobileControls.classList.remove('hidden');
      mobileControls.setAttribute('aria-hidden', 'false');
    } else {
      mobileControls.classList.add('hidden');
      mobileControls.setAttribute('aria-hidden', 'true');
      resetTouchPads();
    }
  }

  window.addEventListener(
    'touchstart',
    () => {
      touchControlsEnabled = true;
      mouse.active = false;
      syncMobileControlsVisibility();
    },
    { once: true, passive: true },
  );

  audioToggleBtn.addEventListener('click', () => {
    sound.unlock();
    const muted = sound.toggleMute();
    audioToggleBtn.textContent = muted ? 'Sound Off' : 'Sound On';
  });

  function sendJson(data: unknown): void {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  }

  function spawnParticle(pt: ParticleFx): void {
    if (particles.length >= MAX_PARTICLES) {
      particles.shift();
    }
    particles.push(pt);
  }

  function triggerDamageVignette(): void {
    damageVignette.classList.add('active');
    if (vignetteTimer !== null) {
      window.clearTimeout(vignetteTimer);
    }
    vignetteTimer = window.setTimeout(() => {
      damageVignette.classList.remove('active');
      vignetteTimer = null;
    }, 220);
  }

  function connectAndJoin(name: string): void {
    if (isConnecting) return;
    isConnecting = true;
    intentionalDisconnect = false;
    respawnPending = false;
    respawnBtn.disabled = false;
    joinError.textContent = '';
    enterWorldBtn.disabled = true;
    enterWorldText.textContent = 'Connecting...';

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      socket = new WebSocket(wsUrl);
    } catch {
      isConnecting = false;
      enterWorldBtn.disabled = false;
      enterWorldText.textContent = 'Enter World';
      joinError.textContent = 'Could not open connection to server.';
      return;
    }

    const activeSocket = socket;

    activeSocket.addEventListener('open', () => {
      if (socket !== activeSocket) return;
      isConnecting = false;
      lastServerTime = 0;
      setConnStatus('connected');
      sendJson({ type: 'join', name });
      sendJson({ type: 'ping', t: performance.now() });
    });

    activeSocket.addEventListener('message', (event) => {
      if (socket !== activeSocket) return;
      let msg: WelcomeMessage | StateMessage | PongMessage;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      if (msg.type === 'welcome') {
        myPlayerId = msg.id;
        if (
          msg.world &&
          (msg.world.width !== world.width || msg.world.height !== world.height)
        ) {
          world.width = msg.world.width;
          world.height = msg.world.height;
          buildTerrainCache();
          initAmbientMotes();
        }
        hasJoined = true;
        joinOverlay.classList.add('hidden');
        hud.classList.remove('hidden');
        enterWorldBtn.disabled = false;
        enterWorldText.textContent = 'Enter World';
        resizeCanvas();
        syncMobileControlsVisibility();
      } else if (msg.type === 'pong') {
        if (typeof msg.t === 'number') {
          latencyMs = Math.max(1, Math.round(performance.now() - msg.t));
          renderConnStatus();
        }
      } else if (msg.type === 'state') {
        if (typeof msg.serverTime === 'number') {
          if (msg.serverTime < lastServerTime) return;
          lastServerTime = msg.serverTime;
        }
        applyServerState(msg);
      }
    });

    activeSocket.addEventListener('close', () => {
      if (socket !== activeSocket) return;
      isConnecting = false;
      if (intentionalDisconnect) {
        setConnStatus('disconnected');
        return;
      }
      if (!hasJoined) {
        enterWorldBtn.disabled = false;
        enterWorldText.textContent = 'Enter World';
        joinError.textContent = 'Connection failed. Please try again.';
        return;
      }

      setConnStatus('reconnecting');
      if (reconnectTimer === null) {
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          if (!intentionalDisconnect && joinedName) {
            connectAndJoin(joinedName);
          }
        }, 1500);
      }
    });

    activeSocket.addEventListener('error', () => {
      if (socket !== activeSocket) return;
      setConnStatus('disconnected');
    });
  }

  function applyServerState(state: StateMessage): void {
    const seenPlayers = new Set<string>();

    for (const sp of state.players) {
      seenPlayers.add(sp.id);
      const existing = players.get(sp.id);
      if (existing) {
        const tookDamage = sp.hp < existing.hp;
        const leveledUp = sp.level > existing.level;
        const justRespawned = !existing.alive && sp.alive;
        existing.name = sp.name;
        existing.x = sp.x;
        existing.y = sp.y;
        existing.vx = sp.vx;
        existing.vy = sp.vy;
        existing.facing = sp.facing;
        existing.hp = sp.hp;
        existing.max_hp = sp.max_hp;
        existing.level = sp.level;
        existing.xp = sp.xp;
        existing.required_xp = sp.required_xp;
        existing.kills = sp.kills;
        existing.color = sp.color;
        existing.attacking = sp.attacking;
        existing.alive = sp.alive;
        if (justRespawned) {
          existing.renderX = sp.x;
          existing.renderY = sp.y;
          existing.renderHp = sp.hp;
        }
        if (tookDamage) {
          existing.flashTimer = 0.16;
        }
        if (leveledUp) {
          existing.levelAuraTimer = 1.4;
        }
      } else {
        players.set(sp.id, {
          ...sp,
          renderX: sp.x,
          renderY: sp.y,
          renderFacing: sp.facing,
          renderHp: sp.hp,
          flashTimer: 0,
          swingTimer: 0,
          swingDir: 1,
          recoilX: 0,
          recoilY: 0,
          stepTimer: 0,
          levelAuraTimer: 0,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }

    for (const id of players.keys()) {
      if (!seenPlayers.has(id)) {
        players.delete(id);
      }
    }

    const seenMonsters = new Set<string>();
    for (const sm of state.monsters) {
      seenMonsters.add(sm.id);
      const existing = monsters.get(sm.id);
      if (existing) {
        const tookDamage = sm.hp < existing.hp;
        const justRespawned = !existing.alive && sm.alive;
        existing.x = sm.x;
        existing.y = sm.y;
        existing.hp = sm.hp;
        existing.max_hp = sm.max_hp;
        existing.target_id = sm.target_id;
        existing.alive = sm.alive;
        existing.facing = sm.facing;
        existing.moving = sm.moving;
        if (justRespawned) {
          existing.renderX = sm.x;
          existing.renderY = sm.y;
          existing.renderHp = sm.hp;
          existing.spawnTimer = 0.35;
        }
        if (tookDamage) {
          existing.flashTimer = 0.16;
        }
      } else {
        monsters.set(sm.id, {
          ...sm,
          renderX: sm.x,
          renderY: sm.y,
          renderFacing: sm.facing,
          renderHp: sm.hp,
          flashTimer: 0,
          lungeTimer: 0,
          spawnTimer: 0,
          recoilX: 0,
          recoilY: 0,
          slimeTrailTimer: 0,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }

    for (const id of monsters.keys()) {
      if (!seenMonsters.has(id)) {
        monsters.delete(id);
      }
    }

    const seenBullets = new Set<string>();
    if (state.bullets) {
      for (const sb of state.bullets) {
        seenBullets.add(sb.id);
        const existing = bullets.get(sb.id);
        if (existing) {
          existing.x = sb.x;
          existing.y = sb.y;
          existing.vx = sb.vx;
          existing.vy = sb.vy;
          existing.color = sb.color;
        } else {
          bullets.set(sb.id, {
            ...sb,
            renderX: sb.x,
            renderY: sb.y,
          });
        }
      }
    }
    for (const id of bullets.keys()) {
      if (!seenBullets.has(id)) {
        bullets.delete(id);
      }
    }

    if (state.events && state.events.length > 0) {
      handleCombatEvents(state.events);
    }

    updateHud();
  }

  function handleCombatEvents(events: CombatEvent[]): void {
    for (const ev of events) {
      if (ev.kind === 'shoot') {
        const attacker = players.get(ev.playerId);
        if (attacker) {
          attacker.swingTimer = 0.2;
          attacker.swingDir *= -1;
        } else {
          swingToggle *= -1;
        }

        // Muzzle sparks along firing angle
        for (let i = 0; i < 5; i++) {
          const offsetAngle = ev.facing + (Math.random() - 0.5) * 0.55;
          const speed = 80 + Math.random() * 110;
          spawnParticle({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(offsetAngle) * speed,
            vy: Math.sin(offsetAngle) * speed,
            radius: 1.6 + Math.random() * 1.8,
            color: i % 2 === 0 ? ev.color : '#f8fafc',
            glow: true,
            age: 0,
            duration: 0.2 + Math.random() * 0.1,
          });
        }

        if (ev.playerId === myPlayerId) {
          sound.playSlash();
          localCooldown = ATTACK_COOLDOWN_SEC;
        }
      } else if (ev.kind === 'bullet_hit') {
        rings.push({
          x: ev.x,
          y: ev.y,
          color: ev.color,
          maxRadius: ev.targetType === 'wall' ? 18 : 26,
          lineWidth: 2,
          age: 0,
          duration: 0.24,
        });
        for (let i = 0; i < 6; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 45 + Math.random() * 90;
          spawnParticle({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            radius: 1.8 + Math.random() * 1.8,
            color: i % 2 === 0 ? ev.color : '#f8fafc',
            glow: true,
            age: 0,
            duration: 0.24 + Math.random() * 0.1,
          });
        }
      } else if (ev.kind === 'damage') {
        const isSelfDamage = ev.targetType === 'player' && ev.targetId === myPlayerId;
        const isMyHit = ev.attackerId === myPlayerId;

        // Slime lunge animation if monster attacked
        if (ev.attackerId.startsWith('slime_')) {
          const attackerSlime = monsters.get(ev.attackerId);
          if (attackerSlime) {
            attackerSlime.lungeTimer = 0.2;
          }
        }

        // Visual directional knock-recoil on target
        const attackerEntity =
          players.get(ev.attackerId) || monsters.get(ev.attackerId);
        if (attackerEntity) {
          const ang = Math.atan2(ev.y - attackerEntity.renderY, ev.x - attackerEntity.renderX);
          if (ev.targetType === 'monster') {
            const tm = monsters.get(ev.targetId);
            if (tm) {
              tm.recoilX = Math.cos(ang) * 9;
              tm.recoilY = Math.sin(ang) * 9;
            }
          } else {
            const tp = players.get(ev.targetId);
            if (tp) {
              tp.recoilX = Math.cos(ang) * 7;
              tp.recoilY = Math.sin(ang) * 7;
            }
          }
        }

        // Impact sparks
        for (let i = 0; i < 6; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 55 + Math.random() * 95;
          spawnParticle({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            radius: 2 + Math.random() * 2,
            color: ev.targetType === 'monster' ? '#86efac' : '#fca5a5',
            glow: false,
            age: 0,
            duration: 0.28 + Math.random() * 0.15,
          });
        }

        floatingTexts.push({
          x: ev.x + (Math.random() - 0.5) * 14,
          y: ev.y - 24,
          vx: (Math.random() - 0.5) * 26,
          vy: -48,
          text: `-${ev.amount}`,
          color: isSelfDamage ? '#fca5a5' : isMyHit ? '#fef08a' : '#f8fafc',
          size: isSelfDamage ? 17 : 15,
          age: 0,
          duration: 0.78,
        });

        if (isSelfDamage) {
          sound.playHit();
          screenShake = Math.min(6, screenShake + 3.5);
          triggerDamageVignette();
        } else if (isMyHit) {
          sound.playHit();
          screenShake = Math.min(4, screenShake + 1.8);
        }
      } else if (ev.kind === 'xp') {
        if (ev.playerId === myPlayerId) {
          floatingTexts.push({
            x: ev.x,
            y: ev.y - 40,
            vx: 0,
            vy: -38,
            text: `+${ev.amount} XP`,
            color: '#38bdf8',
            size: 15,
            age: 0,
            duration: 1.0,
          });
        }
      } else if (ev.kind === 'level_up') {
        rings.push({
          x: ev.x,
          y: ev.y,
          color: '#fbbf24',
          maxRadius: 84,
          lineWidth: 3.5,
          age: 0,
          duration: 0.75,
        });
        rings.push({
          x: ev.x,
          y: ev.y,
          color: '#fef08a',
          maxRadius: 56,
          lineWidth: 2,
          age: 0,
          duration: 0.55,
        });
        for (let i = 0; i < 16; i++) {
          const ang = (Math.PI * 2 * i) / 16;
          const spd = 65 + Math.random() * 75;
          spawnParticle({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd - 35,
            radius: 2.5 + Math.random() * 2.5,
            color: i % 2 === 0 ? '#fbbf24' : '#fef08a',
            glow: true,
            age: 0,
            duration: 0.65 + Math.random() * 0.25,
          });
        }
        floatingTexts.push({
          x: ev.x,
          y: ev.y - 50,
          vx: 0,
          vy: -30,
          text: `LEVEL ${ev.level}!`,
          color: '#fbbf24',
          size: 20,
          age: 0,
          duration: 1.35,
        });
        if (ev.playerId === myPlayerId) {
          sound.playLevelUp();
        }
      } else if (ev.kind === 'monster_death') {
        rings.push({
          x: ev.x,
          y: ev.y,
          color: '#4ade80',
          maxRadius: 44,
          lineWidth: 2.5,
          age: 0,
          duration: 0.42,
        });
        for (let i = 0; i < 16; i++) {
          const angle = (Math.PI * 2 * i) / 16 + Math.random() * 0.35;
          const speed = 50 + Math.random() * 115;
          spawnParticle({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: 3 + Math.random() * 4,
            color: i % 3 === 0 ? '#86efac' : i % 2 === 0 ? '#4ade80' : '#16a34a',
            glow: false,
            age: 0,
            duration: 0.48 + Math.random() * 0.24,
          });
        }
      } else if (ev.kind === 'player_death') {
        rings.push({
          x: ev.x,
          y: ev.y,
          color: '#ef4444',
          maxRadius: 64,
          lineWidth: 3,
          age: 0,
          duration: 0.6,
        });
        if (ev.playerId === myPlayerId) {
          sound.playDeath();
          deathSubtitle.textContent = 'Your journey is not over...';
        }
      }
    }
  }

  function updateHud(): void {
    const me = myPlayerId ? players.get(myPlayerId) : undefined;
    if (me) {
      hudColorDot.style.backgroundColor = me.color;
      hudPlayerName.textContent = me.name;
      hudKills.textContent = `${me.kills} ${me.kills === 1 ? 'kill' : 'kills'}`;
      hudLevel.textContent = `Lv. ${me.level}`;

      const hpPct = me.max_hp > 0 ? clamp((me.hp / me.max_hp) * 100, 0, 100) : 0;
      hudHpFill.style.width = `${hpPct}%`;
      hudHpText.textContent = `${me.hp} / ${me.max_hp}`;

      const reqXp = me.required_xp || me.level * 100;
      const xpPct = reqXp > 0 ? clamp((me.xp / reqXp) * 100, 0, 100) : 0;
      hudXpFill.style.width = `${xpPct}%`;
      hudXpText.textContent = `${me.xp} / ${reqXp}`;

      if (!me.alive) {
        deathOverlay.classList.remove('hidden');
      } else {
        respawnPending = false;
        respawnBtn.disabled = false;
        deathOverlay.classList.add('hidden');
      }
      syncMobileControlsVisibility();
    }

    const count = players.size;
    hudOnlineCount.textContent = `${count} online`;

    // Leaderboard top 5 by kills
    const sorted = Array.from(players.values())
      .sort((a, b) => b.kills - a.kills || b.level - a.level || a.name.localeCompare(b.name))
      .slice(0, 5);

    leaderboardList.replaceChildren();
    if (sorted.length === 0) {
      const li = document.createElement('li');
      li.className = 'leaderboard-empty';
      li.textContent = 'No champions yet';
      leaderboardList.appendChild(li);
      return;
    }

    sorted.forEach((p, index) => {
      const li = document.createElement('li');
      li.className = `leaderboard-row${p.id === myPlayerId ? ' self' : ''}`;

      const rank = document.createElement('span');
      rank.className = 'lb-rank';
      rank.textContent = `${index + 1}.`;

      const dot = document.createElement('span');
      dot.className = 'lb-dot';
      dot.style.backgroundColor = p.color;

      const nameEl = document.createElement('span');
      nameEl.className = 'lb-name';
      nameEl.textContent = p.name;

      const killsEl = document.createElement('span');
      killsEl.className = 'lb-kills';
      killsEl.textContent = `${p.kills}`;

      li.append(rank, dot, nameEl, killsEl);
      leaderboardList.appendChild(li);
    });
  }

  // Join Form Handler
  joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    sound.unlock();
    const raw = playerNameInput.value.trim();
    if (raw.length === 0) {
      joinError.textContent = 'Please enter a champion name.';
      playerNameInput.focus();
      return;
    }
    if (raw.length > 14) {
      joinError.textContent = 'Name must be 14 characters or fewer.';
      playerNameInput.focus();
      return;
    }
    joinedName = raw;
    connectAndJoin(joinedName);
  });

  function returnToMainMenu(): void {
    intentionalDisconnect = true;
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (socket) {
      const oldSocket = socket;
      if (oldSocket.readyState === WebSocket.OPEN) {
        oldSocket.send(JSON.stringify({ type: 'leave' }));
      }
      socket = null;
      oldSocket.close();
    }

    hasJoined = false;
    isConnecting = false;
    myPlayerId = null;
    respawnPending = false;
    respawnBtn.disabled = false;
    lastServerTime = 0;
    latencyMs = null;
    localCooldown = 0;
    screenShake = 0;
    camera.initialized = false;
    keys.clear();

    players.clear();
    monsters.clear();
    bullets.clear();
    slashes.length = 0;
    floatingTexts.length = 0;
    particles.length = 0;
    rings.length = 0;

    damageVignette.classList.remove('active');
    deathOverlay.classList.add('hidden');
    hud.classList.add('hidden');
    syncMobileControlsVisibility();
    joinError.textContent = '';
    enterWorldBtn.disabled = false;
    enterWorldText.textContent = 'Enter World';
    joinOverlay.classList.remove('hidden');
    playerNameInput.value = joinedName;
    playerNameInput.focus();
  }

  // Main Menu Button Handler
  mainMenuBtn.addEventListener('click', () => {
    sound.unlock();
    returnToMainMenu();
  });

  // Respawn Button Handler
  respawnBtn.addEventListener('click', () => {
    if (!hasJoined || !myPlayerId || respawnPending) return;
    const me = players.get(myPlayerId);
    if (!me || me.alive) return;
    sound.unlock();
    respawnPending = true;
    respawnBtn.disabled = true;
    sendJson({ type: 'respawn' });
  });

  // Trigger Directional Projectile Shot
  function triggerAttack(targetWorldX?: number, targetWorldY?: number): void {
    if (!hasJoined || !myPlayerId) return;
    const me = players.get(myPlayerId);
    if (!me || !me.alive) return;
    sound.unlock();

    let tx = targetWorldX;
    let ty = targetWorldY;
    if (typeof tx !== 'number' || typeof ty !== 'number') {
      if (mouse.active) {
        tx = mouse.x - window.innerWidth / 2 + camera.x;
        ty = mouse.y - window.innerHeight / 2 + camera.y;
      } else {
        tx = me.renderX + Math.cos(currentFacing) * 200;
        ty = me.renderY + Math.sin(currentFacing) * 200;
      }
    }

    if (localCooldown <= 0.02 && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(10);
      } catch {
        // Ignore vibrate restrictions
      }
    }
    sendJson({ type: 'attack', targetX: tx, targetY: ty });
  }

  function sendMovementImmediatelyIfChanged(): void {
    if (!hasJoined || !myPlayerId) return;
    const me = players.get(myPlayerId);
    if (!me || !me.alive) return;
    const now = performance.now();
    if (now - lastQuickInputAt < 20) return;
    const input = computeMovementInput();
    if (
      Math.abs(input.dx - lastSentDx) > 0.02 ||
      Math.abs(input.dy - lastSentDy) > 0.02
    ) {
      lastQuickInputAt = now;
      lastSentDx = input.dx;
      lastSentDy = input.dy;
      sendJson({
        type: 'input',
        dx: input.dx,
        dy: input.dy,
        facing: input.facing,
      });
    }
  }

  // Desktop Keyboard Controls
  window.addEventListener('keydown', (e) => {
    if (!hasJoined) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    const code = e.code;
    if (code === 'Space') {
      e.preventDefault();
      if (!e.repeat) {
        triggerAttack();
      }
      return;
    }
    if (
      code === 'KeyW' ||
      code === 'KeyA' ||
      code === 'KeyS' ||
      code === 'KeyD' ||
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight'
    ) {
      e.preventDefault();
      if (!keys.has(code)) {
        keys.add(code);
        sendMovementImmediatelyIfChanged();
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (keys.delete(e.code)) {
      sendMovementImmediatelyIfChanged();
    }
  });

  window.addEventListener('blur', () => {
    keys.clear();
    resetTouchPads();
    sendMovementImmediatelyIfChanged();
  });

  // Mouse & Touch Canvas Aim + Shoot
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (!hasJoined) return;
    if (e.pointerType === 'touch') {
      touchControlsEnabled = true;
      mouse.active = false;
      syncMobileControlsVisibility();
    } else if (e.button !== 0) {
      return;
    } else {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    }

    const worldX = e.clientX - window.innerWidth / 2 + camera.x;
    const worldY = e.clientY - window.innerHeight / 2 + camera.y;
    const me = myPlayerId ? players.get(myPlayerId) : undefined;
    if (me && me.alive) {
      currentFacing = Math.atan2(worldY - me.renderY, worldX - me.renderX);
    }
    triggerAttack(worldX, worldY);
  });

  // Mobile Virtual Joystick
  const MAX_JOYSTICK_DIST = 40;

  function updateJoystickFromPoint(clientX: number, clientY: number): void {
    const dx = clientX - joystick.originX;
    const dy = clientY - joystick.originY;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, MAX_JOYSTICK_DIST);
    const angle = Math.atan2(dy, dx);

    const thumbX = dist > 0 ? Math.cos(angle) * clampedDist : 0;
    const thumbY = dist > 0 ? Math.sin(angle) * clampedDist : 0;
    joystickThumb.style.transform = `translate(${thumbX}px, ${thumbY}px)`;

    if (dist > 8) {
      joystick.dx = Math.cos(angle);
      joystick.dy = Math.sin(angle);
      if (!shootPad.aiming) {
        currentFacing = angle;
      }
      mouse.active = false;
    } else {
      joystick.dx = 0;
      joystick.dy = 0;
    }
  }

  joystickZone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    sound.unlock();
    touchControlsEnabled = true;
    mouse.active = false;
    const rect = joystickZone.getBoundingClientRect();
    joystick.active = true;
    joystick.pointerId = e.pointerId;
    joystick.originX = rect.left + rect.width / 2;
    joystick.originY = rect.top + rect.height / 2;
    joystickZone.setPointerCapture(e.pointerId);
    updateJoystickFromPoint(e.clientX, e.clientY);
  });

  joystickZone.addEventListener('pointermove', (e) => {
    if (!joystick.active || e.pointerId !== joystick.pointerId) return;
    updateJoystickFromPoint(e.clientX, e.clientY);
  });

  function resetJoystick(e: PointerEvent): void {
    if (!joystick.active || e.pointerId !== joystick.pointerId) return;
    joystick.active = false;
    joystick.pointerId = -1;
    joystick.dx = 0;
    joystick.dy = 0;
    joystickThumb.style.transform = 'translate(0px, 0px)';
    sendMovementImmediatelyIfChanged();
  }

  joystickZone.addEventListener('pointerup', resetJoystick);
  joystickZone.addEventListener('pointercancel', resetJoystick);

  // Mobile Twin-Stick Aim & Shoot Button
  function updateShootPadFromPoint(clientX: number, clientY: number): void {
    const dx = clientX - shootPad.originX;
    const dy = clientY - shootPad.originY;
    const dist = Math.hypot(dx, dy);
    if (dist > 10) {
      const angle = Math.atan2(dy, dx);
      shootPad.aiming = true;
      currentFacing = angle;
      mouse.active = false;
      mobileAttackBtn.classList.add('aiming');
      if (shootAimIndicator) {
        const indX = Math.cos(angle) * 34;
        const indY = Math.sin(angle) * 34;
        shootAimIndicator.style.transform = `translate(${indX}px, ${indY}px)`;
      }
    } else {
      shootPad.aiming = false;
      mobileAttackBtn.classList.remove('aiming');
      if (shootAimIndicator) {
        shootAimIndicator.style.transform = 'translate(0px, 0px)';
      }
    }
  }

  mobileAttackBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    sound.unlock();
    touchControlsEnabled = true;
    mouse.active = false;
    const rect = mobileAttackBtn.getBoundingClientRect();
    shootPad.active = true;
    shootPad.pointerId = e.pointerId;
    shootPad.originX = rect.left + rect.width / 2;
    shootPad.originY = rect.top + rect.height / 2;
    mobileAttackBtn.setPointerCapture(e.pointerId);
    updateShootPadFromPoint(e.clientX, e.clientY);
    triggerAttack();
  });

  mobileAttackBtn.addEventListener('pointermove', (e) => {
    if (!shootPad.active || e.pointerId !== shootPad.pointerId) return;
    updateShootPadFromPoint(e.clientX, e.clientY);
  });

  function resetShootPad(e: PointerEvent): void {
    if (!shootPad.active || e.pointerId !== shootPad.pointerId) return;
    shootPad.active = false;
    shootPad.pointerId = -1;
    shootPad.aiming = false;
    mobileAttackBtn.classList.remove('aiming');
    if (shootAimIndicator) {
      shootAimIndicator.style.transform = 'translate(0px, 0px)';
    }
  }

  mobileAttackBtn.addEventListener('pointerup', resetShootPad);
  mobileAttackBtn.addEventListener('pointercancel', resetShootPad);

  // Compute movement vector & send input at ~20Hz (50ms)
  function computeMovementInput(): { dx: number; dy: number; facing: number } {
    let dx = 0;
    let dy = 0;

    if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) dy += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;

    if (dx === 0 && dy === 0 && joystick.active) {
      dx = joystick.dx;
      dy = joystick.dy;
    }

    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    }

    const me = myPlayerId ? players.get(myPlayerId) : undefined;
    if (me && mouse.active) {
      const worldMouseX = mouse.x - window.innerWidth / 2 + camera.x;
      const worldMouseY = mouse.y - window.innerHeight / 2 + camera.y;
      currentFacing = Math.atan2(worldMouseY - me.renderY, worldMouseX - me.renderX);
    }

    return { dx, dy, facing: currentFacing };
  }

  window.setInterval(() => {
    if (!hasJoined || !myPlayerId) return;
    const me = players.get(myPlayerId);
    if (!me || !me.alive) return;
    const input = computeMovementInput();
    lastSentDx = input.dx;
    lastSentDy = input.dy;
    sendJson({
      type: 'input',
      dx: input.dx,
      dy: input.dy,
      facing: input.facing,
    });
    if (shootPad.active && localCooldown <= 0.02) {
      triggerAttack();
    }
  }, 50);

  // Measure real WebSocket RTT every 3s
  window.setInterval(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      sendJson({ type: 'ping', t: performance.now() });
    }
  }, 3000);

  // Main Animation & Render Loop
  let lastFrameTime = performance.now();

  function frame(now: number): void {
    const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    updateSimulationAndFx(dt);
    render(now);
    requestAnimationFrame(frame);
  }

  function updateSimulationAndFx(dt: number): void {
    const interpFactor = Math.min(1, dt * 18);

    if (localCooldown > 0) {
      localCooldown = Math.max(0, localCooldown - dt);
    }
    if (mobileCooldownCircle) {
      const ratio = localCooldown / ATTACK_COOLDOWN_SEC;
      mobileCooldownCircle.style.strokeDashoffset = `${245 * (1 - ratio)}`;
    }
    if (screenShake > 0) {
      screenShake = Math.max(0, screenShake - dt * 28);
    }

    for (const p of players.values()) {
      // Velocity-assisted target blend eliminates 20Hz micro-step jitter
      const leadX = clamp(p.x + p.vx * 0.022, 20, world.width - 20);
      const leadY = clamp(p.y + p.vy * 0.022, 20, world.height - 20);
      p.renderX = lerp(p.renderX, leadX, interpFactor);
      p.renderY = lerp(p.renderY, leadY, interpFactor);
      p.renderHp = lerp(p.renderHp, p.hp, Math.min(1, dt * 14));

      p.recoilX = lerp(p.recoilX, 0, Math.min(1, dt * 18));
      p.recoilY = lerp(p.recoilY, 0, Math.min(1, dt * 18));

      if (p.id === myPlayerId && mouse.active && p.alive) {
        p.renderFacing = currentFacing;
      } else {
        p.renderFacing = lerpAngle(p.renderFacing, p.facing, interpFactor);
      }

      if (p.flashTimer > 0) p.flashTimer = Math.max(0, p.flashTimer - dt);
      if (p.swingTimer > 0) p.swingTimer = Math.max(0, p.swingTimer - dt);
      if (p.levelAuraTimer > 0) p.levelAuraTimer = Math.max(0, p.levelAuraTimer - dt);

      // Footstep dust motes when moving
      const speed = Math.hypot(p.vx, p.vy);
      if (p.alive && speed > 25) {
        p.stepTimer -= dt;
        if (p.stepTimer <= 0) {
          p.stepTimer = 0.14;
          spawnParticle({
            x: p.renderX + (Math.random() - 0.5) * 10,
            y: p.renderY + 14,
            vx: -p.vx * 0.12 + (Math.random() - 0.5) * 16,
            vy: -p.vy * 0.12 - 6,
            radius: 2 + Math.random() * 1.8,
            color: 'rgba(148, 163, 184, 0.5)',
            glow: false,
            age: 0,
            duration: 0.28,
          });
        }
      }
    }

    for (const m of monsters.values()) {
      m.renderX = lerp(m.renderX, m.x, interpFactor);
      m.renderY = lerp(m.renderY, m.y, interpFactor);
      m.renderHp = lerp(m.renderHp, m.hp, Math.min(1, dt * 14));
      m.renderFacing = lerpAngle(m.renderFacing, m.facing, interpFactor);
      m.recoilX = lerp(m.recoilX, 0, Math.min(1, dt * 18));
      m.recoilY = lerp(m.recoilY, 0, Math.min(1, dt * 18));
      if (m.flashTimer > 0) m.flashTimer = Math.max(0, m.flashTimer - dt);
      if (m.lungeTimer > 0) m.lungeTimer = Math.max(0, m.lungeTimer - dt);
      if (m.spawnTimer > 0) m.spawnTimer = Math.max(0, m.spawnTimer - dt);

      // Subtle slime trail droplet when chasing
      if (m.alive && m.target_id !== null) {
        m.slimeTrailTimer -= dt;
        if (m.slimeTrailTimer <= 0) {
          m.slimeTrailTimer = 0.22;
          spawnParticle({
            x: m.renderX + (Math.random() - 0.5) * 8,
            y: m.renderY + 11,
            vx: 0,
            vy: 0,
            radius: 2 + Math.random() * 1.5,
            color: 'rgba(34, 197, 94, 0.45)',
            glow: false,
            age: 0,
            duration: 0.45,
          });
        }
      }
    }

    // Advance straight-line projectiles smoothly between 20Hz snapshots
    for (const b of bullets.values()) {
      b.renderX += b.vx * dt;
      b.renderY += b.vy * dt;
      b.renderX = lerp(b.renderX, b.x, Math.min(1, dt * 16));
      b.renderY = lerp(b.renderY, b.y, Math.min(1, dt * 16));
    }

    // Drift ambient arena dust motes
    for (const mote of ambientMotes) {
      mote.x += mote.vx * dt;
      mote.y += mote.vy * dt;
      if (mote.x < 0) mote.x += world.width;
      if (mote.x > world.width) mote.x -= world.width;
      if (mote.y < 0) mote.y += world.height;
      if (mote.y > world.height) mote.y -= world.height;
    }

    const me = myPlayerId ? players.get(myPlayerId) : undefined;
    if (me) {
      if (!camera.initialized) {
        camera.x = me.renderX;
        camera.y = me.renderY;
        camera.initialized = true;
      } else {
        const camSmooth = Math.min(1, dt * 15);
        camera.x = lerp(camera.x, me.renderX, camSmooth);
        camera.y = lerp(camera.y, me.renderY, camSmooth);
      }
    }

    for (let i = slashes.length - 1; i >= 0; i--) {
      slashes[i].age += dt;
      if (slashes[i].age >= slashes[i].duration) {
        slashes.splice(i, 1);
      }
    }

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const ft = floatingTexts[i];
      ft.age += dt;
      ft.x += ft.vx * dt;
      ft.y += ft.vy * dt;
      ft.vy *= 0.94;
      if (ft.age >= ft.duration) {
        floatingTexts.splice(i, 1);
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.age += dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.91;
      pt.vy *= 0.91;
      if (pt.age >= pt.duration) {
        particles.splice(i, 1);
      }
    }

    for (let i = rings.length - 1; i >= 0; i--) {
      rings[i].age += dt;
      if (rings[i].age >= rings[i].duration) {
        rings.splice(i, 1);
      }
    }
  }

  function render(now: number): void {
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    ctx.clearRect(0, 0, viewW, viewH);

    // Outer Dark Void Background (#090d16)
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, viewW, viewH);

    const radial = ctx.createRadialGradient(
      viewW * 0.5,
      viewH * 0.4,
      40,
      viewW * 0.5,
      viewH * 0.4,
      Math.max(viewW, viewH) * 0.78,
    );
    radial.addColorStop(0, 'rgba(88, 28, 135, 0.2)');
    radial.addColorStop(1, 'rgba(9, 13, 22, 0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, viewW, viewH);

    // Subtle micro camera shake
    const shakeX = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;
    const shakeY = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;

    const camLeft = camera.x - viewW / 2 - 90;
    const camRight = camera.x + viewW / 2 + 90;
    const camTop = camera.y - viewH / 2 - 90;
    const camBottom = camera.y + viewH / 2 + 90;

    ctx.save();
    const offsetX = viewW / 2 - camera.x + shakeX;
    const offsetY = viewH / 2 - camera.y + shakeY;
    ctx.translate(offsetX, offsetY);

    // 1. Pre-rendered Fantasy Terrain (clipped to visible viewport)
    if (terrainCanvas) {
      const sx = Math.max(0, Math.floor(camLeft));
      const sy = Math.max(0, Math.floor(camTop));
      const ex = Math.min(world.width, Math.ceil(camRight));
      const ey = Math.min(world.height, Math.ceil(camBottom));
      const sw = ex - sx;
      const sh = ey - sy;
      if (sw > 0 && sh > 0) {
        ctx.drawImage(terrainCanvas, sx, sy, sw, sh, sx, sy, sw, sh);
      }
    } else {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, world.width, world.height);
    }

    // 2. Animated Center Sanctuary Rune Rings (if visible)
    const cx = world.width / 2;
    const cy = world.height / 2;
    if (cx + 220 >= camLeft && cx - 220 <= camRight && cy + 220 >= camTop && cy - 220 <= camBottom) {
      drawCenterSanctuary(ctx, cx, cy, now);
    }

    // 3. Glowing Arena Boundary & Crystal Pylons
    drawArenaBorderAndCrystals(ctx, now);

    // 4. Ambient Drifting Arcane Motes (frustum culled)
    const tSec = now * 0.001;
    for (const mote of ambientMotes) {
      if (mote.x < camLeft || mote.x > camRight || mote.y < camTop || mote.y > camBottom) {
        continue;
      }
      const pulse = 0.65 + 0.35 * Math.sin(tSec * 2 + mote.phase);
      ctx.globalAlpha = mote.alpha * pulse;
      ctx.fillStyle = mote.color;
      ctx.beginPath();
      ctx.arc(mote.x, mote.y, mote.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 5. Expanding Shockwave Rings
    for (const r of rings) {
      if (r.x < camLeft || r.x > camRight || r.y < camTop || r.y > camBottom) continue;
      const progress = r.age / r.duration;
      const radius = 14 + r.maxRadius * progress;
      ctx.save();
      ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.lineWidth * (1 - progress * 0.4);
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 6. Monsters (Slimes) - frustum culled
    for (const m of monsters.values()) {
      if (!m.alive) continue;
      if (m.renderX < camLeft || m.renderX > camRight || m.renderY < camTop || m.renderY > camBottom) {
        continue;
      }
      drawSlime(ctx, m, now);
    }

    // 7. Combat & Death Particles - frustum culled
    for (const pt of particles) {
      if (pt.x < camLeft || pt.x > camRight || pt.y < camTop || pt.y > camBottom) continue;
      const alpha = Math.max(0, 1 - pt.age / pt.duration);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (pt.glow) {
        ctx.shadowColor = pt.color;
        ctx.shadowBlur = 8;
      }
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 8. Players (dead beneath living, remote before local)
    const sortedPlayers = Array.from(players.values()).sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? 1 : -1;
      if (a.id === myPlayerId) return 1;
      if (b.id === myPlayerId) return -1;
      return 0;
    });

    for (const p of sortedPlayers) {
      if (p.renderX < camLeft || p.renderX > camRight || p.renderY < camTop || p.renderY > camBottom) {
        continue;
      }
      drawPlayer(ctx, p, p.id === myPlayerId, now);
    }

    // 9. Directional Shard Projectiles & Legacy Slash FX
    for (const b of bullets.values()) {
      if (b.renderX < camLeft || b.renderX > camRight || b.renderY < camTop || b.renderY > camBottom) {
        continue;
      }
      drawBullet(ctx, b);
    }
    for (const s of slashes) {
      drawSlashEffect(ctx, s);
    }

    // 10. Floating Damage & XP Numbers
    for (const ft of floatingTexts) {
      if (ft.x < camLeft || ft.x > camRight || ft.y < camTop || ft.y > camBottom) continue;
      const progress = ft.age / ft.duration;
      const alpha = Math.max(0, 1 - Math.pow(progress, 2.0));
      const popScale = progress < 0.14 ? 0.75 + (progress / 0.14) * 0.45 : Math.max(1, 1.2 - (progress - 0.14) * 0.7);
      ctx.save();
      ctx.translate(ft.x, ft.y);
      ctx.scale(popScale, popScale);
      ctx.globalAlpha = alpha;
      ctx.font = `700 ${ft.size}px 'Outfit', sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(9, 13, 22, 0.92)';
      ctx.strokeText(ft.text, 0, 0);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, 0, 0);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawCenterSanctuary(ctx: CanvasRenderingContext2D, cx: number, cy: number, now: number): void {
    const t = now * 0.0004;
    ctx.save();
    ctx.translate(cx, cy);

    // Outer dashed arcane circle
    ctx.save();
    ctx.rotate(t);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.lineWidth = 2;
    ctx.setLineDash([18, 14]);
    ctx.beginPath();
    ctx.arc(0, 0, 195, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Inner counter-rotating ring with shard nodes
    ctx.save();
    ctx.rotate(-t * 1.4);
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 125, 0, Math.PI * 2);
    ctx.stroke();

    for (let i = 0; i < 4; i++) {
      const a = (Math.PI * i) / 2;
      const sx = Math.cos(a) * 125;
      const sy = Math.sin(a) * 125;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.beginPath();
      ctx.moveTo(sx, sy - 6);
      ctx.lineTo(sx + 5, sy);
      ctx.lineTo(sx, sy + 6);
      ctx.lineTo(sx - 5, sy);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  }

  function drawArenaBorderAndCrystals(ctx: CanvasRenderingContext2D, now: number): void {
    // Crisp glowing boundary wall
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, world.width, world.height);

    // Corner shard crystals sitting just outside the playable boundary
    const pulse = 0.72 + 0.28 * Math.sin(now * 0.003);
    const corners = [
      { x: -12, y: -12, color: '#38bdf8' },
      { x: world.width + 12, y: -12, color: '#a78bfa' },
      { x: -12, y: world.height + 12, color: '#a78bfa' },
      { x: world.width + 12, y: world.height + 12, color: '#38bdf8' },
    ];
    for (const c of corners) {
      ctx.fillStyle = c.color;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y - 16);
      ctx.lineTo(c.x + 12, c.y);
      ctx.lineTo(c.x, c.y + 16);
      ctx.lineTo(c.x - 12, c.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSlime(ctx: CanvasRenderingContext2D, m: RenderMonster, now: number): void {
    const t = now * 0.001;
    const isAggro = m.target_id !== null;
    const hopFreq = m.moving ? (isAggro ? 11 : 7) : 3.2;
    const bounce = m.moving ? Math.abs(Math.sin(t * hopFreq + m.phase)) * (isAggro ? 5.5 : 3.5) : 0;

    const stretch = m.moving
      ? Math.sin(t * hopFreq + m.phase) * 0.11
      : Math.sin(t * 3.2 + m.phase) * 0.05;
    const spawnScale = m.spawnTimer > 0 ? 1 - m.spawnTimer / 0.35 : 1;
    const scaleX = (1 + stretch) * spawnScale;
    const scaleY = (1 - stretch) * spawnScale;

    // Lunge offset during attack
    const lungeDist = m.lungeTimer > 0 ? Math.sin((m.lungeTimer / 0.2) * Math.PI) * 11 : 0;
    const drawX = m.renderX + m.recoilX + Math.cos(m.renderFacing) * lungeDist;
    const drawY = m.renderY + m.recoilY - bounce + Math.sin(m.renderFacing) * lungeDist;
    const r = 18;

    // Dynamic ground shadow (shrinks slightly when hopping)
    const shadowScale = (1 - bounce * 0.03) * spawnScale;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.beginPath();
    ctx.ellipse(
      m.renderX + m.recoilX,
      m.renderY + m.recoilY + 11,
      r * 0.98 * shadowScale,
      r * 0.45 * shadowScale,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    ctx.save();
    ctx.translate(drawX, drawY);
    ctx.scale(scaleX, scaleY);

    // Outer translucent slime dome
    const bodyColor =
      m.flashTimer > 0
        ? '#ffffff'
        : isAggro
          ? 'rgba(16, 185, 129, 0.92)'
          : 'rgba(34, 197, 94, 0.88)';
    ctx.fillStyle = bodyColor;
    ctx.strokeStyle = isAggro ? '#064e3b' : '#14532d';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 2, r, Math.PI, 0, false);
    ctx.quadraticCurveTo(r, 12, 0, 12);
    ctx.quadraticCurveTo(-r, 12, -r, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (m.flashTimer <= 0) {
      // Inner glowing shard nucleus inside the jelly body
      ctx.fillStyle = isAggro ? 'rgba(245, 158, 11, 0.55)' : 'rgba(110, 231, 183, 0.42)';
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(5, 2);
      ctx.lineTo(0, 8);
      ctx.lineTo(-5, 2);
      ctx.closePath();
      ctx.fill();

      // Glossy wet highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath();
      ctx.ellipse(-6, -6, 5.5, 2.8, -0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    // Expressive eyes tracking facing direction
    const lookX = Math.cos(m.renderFacing) * 4.2;
    const lookY = Math.sin(m.renderFacing) * 2.5;
    ctx.fillStyle = isAggro ? '#fef08a' : '#090d16';
    ctx.beginPath();
    ctx.arc(-5 + lookX, 1 + lookY, 2.6, 0, Math.PI * 2);
    ctx.arc(5 + lookX, 1 + lookY, 2.6, 0, Math.PI * 2);
    ctx.fill();

    // Fierce brow slant when chasing
    if (isAggro && m.flashTimer <= 0) {
      ctx.strokeStyle = '#064e3b';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-8 + lookX, -3 + lookY);
      ctx.lineTo(-3 + lookX, -1 + lookY);
      ctx.moveTo(8 + lookX, -3 + lookY);
      ctx.lineTo(3 + lookX, -1 + lookY);
      ctx.stroke();
    }

    ctx.restore();

    // Smooth Health Bar (shown when damaged or chasing)
    if (m.hp < m.max_hp || isAggro) {
      const barW = 40;
      const barH = 5;
      const barX = drawX - barW / 2;
      const barY = drawY - 26;

      ctx.fillStyle = 'rgba(9, 13, 22, 0.88)';
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
      const pct = clamp(m.renderHp / m.max_hp, 0, 1);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(barX, barY, barW * pct, barH);
    }
  }

  function drawPlayer(
    ctx: CanvasRenderingContext2D,
    p: RenderPlayer,
    isLocal: boolean,
    now: number,
  ): void {
    const t = now * 0.001;
    const speed = Math.hypot(p.vx, p.vy);
    const isMoving = speed > 10;
    const walkBob = isMoving ? Math.abs(Math.sin(t * 14 + p.phase)) * 2.8 : Math.sin(t * 3 + p.phase) * 0.8;
    const x = p.renderX + p.recoilX;
    const y = p.renderY + p.recoilY - walkBob;
    const r = 20;

    if (!p.alive) {
      const floatY = Math.sin(t * 2.5 + p.phase) * 3;
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(p.renderX, p.renderY + floatY, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.font = "500 12px 'Outfit', sans-serif";
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.78)';
      ctx.fillText(`${p.name} (Fallen)`, p.renderX, p.renderY - 26 + floatY);
      return;
    }

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.beginPath();
    ctx.ellipse(
      p.renderX + p.recoilX,
      p.renderY + p.recoilY + 15,
      r * 0.92,
      r * 0.44,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // Level-Up Golden Aura
    if (p.levelAuraTimer > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.65, p.levelAuraTimer);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r + 9 + Math.sin(t * 12) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Local player subtle focus & cooldown arc
    if (isLocal) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r + 6, 0, Math.PI * 2);
      ctx.stroke();

      if (localCooldown > 0) {
        const ratio = localCooldown / ATTACK_COOLDOWN_SEC;
        ctx.strokeStyle = 'rgba(248, 250, 252, 0.65)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(x, y, r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - ratio));
        ctx.stroke();
      }
    }

    // Animated Shard Blade & Pauldrons rotated by facing + swing angle
    let swingAngle = 0;
    if (p.swingTimer > 0) {
      const progress = 1 - p.swingTimer / 0.22;
      swingAngle = (-0.95 + progress * 1.9) * p.swingDir;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.renderFacing);

    // Subtle pauldrons / cloak trim behind shoulders
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-4, -r + 3, 7, 0, Math.PI * 2);
    ctx.arc(-4, r - 3, 7, 0, Math.PI * 2);
    ctx.fill();

    // Directional Shard Blade (swings smoothly on attack!)
    ctx.save();
    ctx.rotate(swingAngle);
    ctx.fillStyle = p.swingTimer > 0 ? '#f8fafc' : '#cbd5e1';
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r + 16, 0);
    ctx.lineTo(r - 1, -5.5);
    ctx.lineTo(r + 2, 0);
    ctx.lineTo(r - 1, 5.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    // Character body circle
    ctx.fillStyle = p.flashTimer > 0 ? '#ffffff' : p.color;
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Inner core emblem & specular highlight
    if (p.flashTimer <= 0) {
      ctx.fillStyle = 'rgba(9, 13, 22, 0.22)';
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.beginPath();
      ctx.arc(x - 6, y - 6, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player Name & Level
    const label = `${p.name} · Lv.${p.level}`;
    ctx.font = "600 13px 'Outfit', sans-serif";
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(9, 13, 22, 0.92)';
    ctx.strokeText(label, x, y - 35);
    ctx.fillStyle = isLocal ? '#f8fafc' : '#cbd5e1';
    ctx.fillText(label, x, y - 35);

    // Health bar above player
    const barW = 48;
    const barH = 5;
    const barX = x - barW / 2;
    const barY = y - 29;
    ctx.fillStyle = 'rgba(9, 13, 22, 0.88)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    const pct = p.max_hp > 0 ? clamp(p.renderHp / p.max_hp, 0, 1) : 0;
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(barX, barY, barW * pct, barH);
  }

  function drawBullet(ctx: CanvasRenderingContext2D, b: RenderBullet): void {
    const angle = Math.atan2(b.vy, b.vx);
    ctx.save();
    ctx.translate(b.renderX, b.renderY);
    ctx.rotate(angle);

    // Glowing projectile tail
    const tailGrad = ctx.createLinearGradient(-22, 0, 6, 0);
    tailGrad.addColorStop(0, 'rgba(248, 250, 252, 0)');
    tailGrad.addColorStop(1, b.color);
    ctx.fillStyle = tailGrad;
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.lineTo(2, -4.5);
    ctx.lineTo(2, 4.5);
    ctx.closePath();
    ctx.fill();

    // Shard crystal projectile head
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-2, -5.5);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-2, 5.5);
    ctx.closePath();
    ctx.fill();

    // Bright white inner core
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(1, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawSlashEffect(ctx: CanvasRenderingContext2D, s: SlashFx): void {
    const progress = s.age / s.duration;
    const alpha = Math.max(0, 1 - progress);
    const reach = 76;
    const sweep = Math.PI * 0.78;
    const startAngle = s.facing - sweep * 0.5;
    const endAngle = s.facing + sweep * 0.5;

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.globalAlpha = alpha;

    ctx.strokeStyle = s.color;
    ctx.lineWidth = 16 * (1 - progress * 0.55);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, reach - 8, startAngle, endAngle);
    ctx.stroke();

    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 4.5 * (1 - progress * 0.45);
    ctx.beginPath();
    ctx.arc(0, 0, reach - 3, startAngle + 0.14, endAngle - 0.14);
    ctx.stroke();

    ctx.restore();
  }

  requestAnimationFrame(frame);
}
