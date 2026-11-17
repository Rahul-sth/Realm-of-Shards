(function () {
  function SoundEngine() {
    this.ctx = null;
    this.muted = false;
  }

  SoundEngine.prototype.toggleMute = function () {
    this.muted = !this.muted;
    return this.muted;
  };

  SoundEngine.prototype.unlock = function () {
    if (!this.ctx) {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  };

  SoundEngine.prototype.playSlash = function () {
    if (this.muted || !this.ctx) return;
    var now = this.ctx.currentTime;
    var osc = this.ctx.createOscillator();
    var gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.11);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  };

  SoundEngine.prototype.playHit = function () {
    if (this.muted || !this.ctx) return;
    var now = this.ctx.currentTime;
    var osc = this.ctx.createOscillator();
    var gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.09);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  };

  SoundEngine.prototype.playLevelUp = function () {
    if (this.muted || !this.ctx) return;
    var notes = [523.25, 659.25, 783.99, 1046.5];
    var self = this;
    notes.forEach(function (freq, idx) {
      if (!self.ctx) return;
      var start = self.ctx.currentTime + idx * 0.065;
      var osc = self.ctx.createOscillator();
      var gain = self.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.08, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
      osc.connect(gain);
      gain.connect(self.ctx.destination);
      osc.start(start);
      osc.stop(start + 0.25);
    });
  };

  SoundEngine.prototype.playDeath = function () {
    if (this.muted || !this.ctx) return;
    var now = this.ctx.currentTime;
    var osc = this.ctx.createOscillator();
    var gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.4);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.43);
  };

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function shortestAngleDiff(from, to) {
    var diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
  }

  function lerpAngle(from, to, t) {
    return from + shortestAngleDiff(from, to) * t;
  }

  function seededNoise(x, y) {
    var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  var MAX_PARTICLES = 180;
  var ATTACK_COOLDOWN_SEC = 0.45;

  window.addEventListener('DOMContentLoaded', function () {
    var canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var damageVignette = document.getElementById('damageVignette');
    var joinOverlay = document.getElementById('joinOverlay');
    var joinForm = document.getElementById('joinForm');
    var playerNameInput = document.getElementById('playerNameInput');
    var joinError = document.getElementById('joinError');
    var enterWorldBtn = document.getElementById('enterWorldBtn');
    var enterWorldText = document.getElementById('enterWorldText');

    var hud = document.getElementById('hud');
    var hudColorDot = document.getElementById('hudColorDot');
    var hudPlayerName = document.getElementById('hudPlayerName');
    var hudKills = document.getElementById('hudKills');
    var hudLevel = document.getElementById('hudLevel');
    var hudHpText = document.getElementById('hudHpText');
    var hudHpFill = document.getElementById('hudHpFill');
    var hudXpText = document.getElementById('hudXpText');
    var hudXpFill = document.getElementById('hudXpFill');
    var hudOnlineCount = document.getElementById('hudOnlineCount');
    var hudConnStatus = document.getElementById('hudConnStatus');
    var audioToggleBtn = document.getElementById('audioToggleBtn');
    var leaderboardList = document.getElementById('leaderboardList');

    var deathOverlay = document.getElementById('deathOverlay');
    var deathSubtitle = document.getElementById('deathSubtitle');
    var mainMenuBtn = document.getElementById('mainMenuBtn');
    var respawnBtn = document.getElementById('respawnBtn');

    var mobileControls = document.getElementById('mobileControls');
    var joystickZone = document.getElementById('joystickZone');
    var joystickThumb = document.getElementById('joystickThumb');
    var mobileAttackBtn = document.getElementById('mobileAttackBtn');
    var mobileCooldownCircle = document.getElementById('mobileCooldownCircle');
    var shootAimIndicator = document.getElementById('shootAimIndicator');

    var sound = new SoundEngine();
    var world = { width: 1600, height: 1200 };
    var myPlayerId = null;
    var joinedName = '';
    var hasJoined = false;
    var isConnecting = false;
    var intentionalDisconnect = false;
    var respawnPending = false;
    var reconnectTimer = null;
    var lastServerTime = 0;
    var latencyMs = null;
    var connState = 'disconnected';

    var players = new Map();
    var monsters = new Map();
    var bullets = new Map();
    var slashes = [];
    var floatingTexts = [];
    var particles = [];
    var rings = [];
    var ambientMotes = [];

    var localCooldown = 0;
    var screenShake = 0;
    var vignetteTimer = null;
    var swingToggle = 1;
    var terrainCanvas = null;

    function buildTerrainCache() {
      var off = document.createElement('canvas');
      off.width = world.width;
      off.height = world.height;
      var tctx = off.getContext('2d');
      if (!tctx) return;

      tctx.fillStyle = '#1e293b';
      tctx.fillRect(0, 0, world.width, world.height);

      var tile = 100;
      for (var tx = 0; tx < world.width; tx += tile) {
        for (var ty = 0; ty < world.height; ty += tile) {
          var n = seededNoise(tx * 0.03, ty * 0.03);
          if (n > 0.62) {
            tctx.fillStyle = 'rgba(15, 23, 42, 0.24)';
            tctx.fillRect(tx + 2, ty + 2, tile - 4, tile - 4);
          } else if (n < 0.26) {
            tctx.fillStyle = 'rgba(51, 65, 85, 0.2)';
            tctx.fillRect(tx + 2, ty + 2, tile - 4, tile - 4);
          }

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

      tctx.strokeStyle = '#273549';
      tctx.lineWidth = 1;
      tctx.beginPath();
      for (var gx = 50; gx < world.width; gx += 50) {
        tctx.moveTo(gx, 0);
        tctx.lineTo(gx, world.height);
      }
      for (var gy = 50; gy < world.height; gy += 50) {
        tctx.moveTo(0, gy);
        tctx.lineTo(world.width, gy);
      }
      tctx.stroke();

      var cx = world.width / 2;
      var cy = world.height / 2;
      tctx.strokeStyle = 'rgba(56, 189, 248, 0.055)';
      tctx.lineWidth = 2;
      for (var i = 0; i < 8; i++) {
        var a = (Math.PI * 2 * i) / 8;
        tctx.beginPath();
        tctx.moveTo(cx + Math.cos(a) * 125, cy + Math.sin(a) * 125);
        tctx.lineTo(cx + Math.cos(a) * 650, cy + Math.sin(a) * 520);
        tctx.stroke();
      }

      var daisGrad = tctx.createRadialGradient(cx, cy, 20, cx, cy, 220);
      daisGrad.addColorStop(0, 'rgba(56, 189, 248, 0.09)');
      daisGrad.addColorStop(0.6, 'rgba(99, 102, 241, 0.04)');
      daisGrad.addColorStop(1, 'rgba(30, 41, 59, 0)');
      tctx.fillStyle = daisGrad;
      tctx.beginPath();
      tctx.arc(cx, cy, 220, 0, Math.PI * 2);
      tctx.fill();

      var pads = [
        { x: 220, y: 200, color: 'rgba(56, 189, 248, 0.11)' },
        { x: world.width - 220, y: 200, color: 'rgba(167, 139, 250, 0.11)' },
        { x: 220, y: world.height - 200, color: 'rgba(167, 139, 250, 0.11)' },
        { x: world.width - 220, y: world.height - 200, color: 'rgba(56, 189, 248, 0.11)' },
      ];
      pads.forEach(function (pad) {
        tctx.strokeStyle = pad.color;
        tctx.lineWidth = 2;
        tctx.beginPath();
        tctx.arc(pad.x, pad.y, 64, 0, Math.PI * 2);
        tctx.stroke();
        tctx.beginPath();
        tctx.arc(pad.x, pad.y, 44, 0, Math.PI * 2);
        tctx.stroke();
      });

      terrainCanvas = off;
    }

    function initAmbientMotes() {
      ambientMotes.length = 0;
      var colors = ['#38bdf8', '#a78bfa', '#4ade80'];
      for (var i = 0; i < 42; i++) {
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

    var camera = { x: world.width / 2, y: world.height / 2, initialized: false };
    var keys = new Set();
    var mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, active: false };
    var joystick = { active: false, pointerId: -1, dx: 0, dy: 0, originX: 0, originY: 0 };
    var shootPad = { active: false, pointerId: -1, originX: 0, originY: 0, aiming: false };
    var touchControlsEnabled =
      window.matchMedia('(pointer: coarse)').matches ||
      (navigator.maxTouchPoints || 0) > 0 ||
      'ontouchstart' in window;
    var currentFacing = 0;
    var lastSentDx = 0;
    var lastSentDy = 0;
    var lastQuickInputAt = 0;
    var socket = null;

    function renderConnStatus() {
      hudConnStatus.className = 'conn-status ' + connState;
      if (connState === 'connected') {
        hudConnStatus.textContent = latencyMs !== null ? 'Connected · ' + latencyMs + 'ms' : 'Connected';
      } else if (connState === 'reconnecting') {
        hudConnStatus.textContent = 'Reconnecting...';
      } else {
        hudConnStatus.textContent = 'Disconnected';
      }
    }

    function setConnStatus(state) {
      connState = state;
      renderConnStatus();
    }

    function resizeCanvas() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = window.innerWidth;
      var h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', function () {
      window.setTimeout(resizeCanvas, 100);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', resizeCanvas);
    }

    function resetTouchPads() {
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

    function syncMobileControlsVisibility() {
      var me = myPlayerId ? players.get(myPlayerId) : null;
      var alive = me ? me.alive : true;
      var shouldShow = hasJoined && touchControlsEnabled && alive;
      if (shouldShow) {
        mobileControls.classList.remove('hidden');
        mobileControls.setAttribute('aria-hidden', 'false');
      } else {
        mobileControls.classList.add('hidden');
        mobileControls.setAttribute('aria-hidden', 'true');
        resetTouchPads();
      }
    }

    window.addEventListener('touchstart', function () {
      touchControlsEnabled = true;
      mouse.active = false;
      syncMobileControlsVisibility();
    }, { once: true, passive: true });

    audioToggleBtn.addEventListener('click', function () {
      sound.unlock();
      var muted = sound.toggleMute();
      audioToggleBtn.textContent = muted ? 'Sound Off' : 'Sound On';
    });

    function sendJson(data) {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
      }
    }

    function spawnParticle(pt) {
      if (particles.length >= MAX_PARTICLES) {
        particles.shift();
      }
      particles.push(pt);
    }

    function triggerDamageVignette() {
      if (!damageVignette) return;
      damageVignette.classList.add('active');
      if (vignetteTimer !== null) {
        window.clearTimeout(vignetteTimer);
      }
      vignetteTimer = window.setTimeout(function () {
        damageVignette.classList.remove('active');
        vignetteTimer = null;
      }, 220);
    }

    function connectAndJoin(name) {
      if (isConnecting) return;
      isConnecting = true;
      intentionalDisconnect = false;
      respawnPending = false;
      respawnBtn.disabled = false;
      joinError.textContent = '';
      enterWorldBtn.disabled = true;
      enterWorldText.textContent = 'Connecting...';

      var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      var wsUrl = protocol + '//' + window.location.host + '/ws';

      try {
        socket = new WebSocket(wsUrl);
      } catch (_e) {
        isConnecting = false;
        enterWorldBtn.disabled = false;
        enterWorldText.textContent = 'Enter World';
        joinError.textContent = 'Could not open connection to server.';
        return;
      }

      var activeSocket = socket;

      activeSocket.addEventListener('open', function () {
        if (socket !== activeSocket) return;
        isConnecting = false;
        lastServerTime = 0;
        setConnStatus('connected');
        sendJson({ type: 'join', name: name });
        sendJson({ type: 'ping', t: performance.now() });
      });

      activeSocket.addEventListener('message', function (event) {
        if (socket !== activeSocket) return;
        var msg;
        try {
          msg = JSON.parse(event.data);
        } catch (_e) {
          return;
        }
        if (msg.type === 'welcome') {
          myPlayerId = msg.id;
          if (msg.world && (msg.world.width !== world.width || msg.world.height !== world.height)) {
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

      activeSocket.addEventListener('close', function () {
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
          reconnectTimer = window.setTimeout(function () {
            reconnectTimer = null;
            if (!intentionalDisconnect && joinedName) {
              connectAndJoin(joinedName);
            }
          }, 1500);
        }
      });

      activeSocket.addEventListener('error', function () {
        if (socket !== activeSocket) return;
        setConnStatus('disconnected');
      });
    }

    function applyServerState(state) {
      var seenPlayers = new Set();
      for (var i = 0; i < state.players.length; i++) {
        var sp = state.players[i];
        seenPlayers.add(sp.id);
        var existing = players.get(sp.id);
        if (existing) {
          var tookDamage = sp.hp < existing.hp;
          var leveledUp = sp.level > existing.level;
          var justRespawned = !existing.alive && sp.alive;
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
          if (tookDamage) existing.flashTimer = 0.16;
          if (leveledUp) existing.levelAuraTimer = 1.4;
        } else {
          players.set(sp.id, Object.assign({}, sp, {
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
          }));
        }
      }
      players.forEach(function (_v, id) {
        if (!seenPlayers.has(id)) players.delete(id);
      });

      var seenMonsters = new Set();
      for (var j = 0; j < state.monsters.length; j++) {
        var sm = state.monsters[j];
        seenMonsters.add(sm.id);
        var exM = monsters.get(sm.id);
        if (exM) {
          var mDamaged = sm.hp < exM.hp;
          var respawned = !exM.alive && sm.alive;
          exM.x = sm.x;
          exM.y = sm.y;
          exM.hp = sm.hp;
          exM.max_hp = sm.max_hp;
          exM.target_id = sm.target_id;
          exM.alive = sm.alive;
          exM.facing = sm.facing;
          exM.moving = sm.moving;
          if (respawned) {
            exM.renderX = sm.x;
            exM.renderY = sm.y;
            exM.renderHp = sm.hp;
            exM.spawnTimer = 0.35;
          }
          if (mDamaged) exM.flashTimer = 0.16;
        } else {
          monsters.set(sm.id, Object.assign({}, sm, {
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
          }));
        }
      }
      monsters.forEach(function (_v, id) {
        if (!seenMonsters.has(id)) monsters.delete(id);
      });

      var seenBullets = new Set();
      if (state.bullets) {
        for (var bIdx = 0; bIdx < state.bullets.length; bIdx++) {
          var sb = state.bullets[bIdx];
          seenBullets.add(sb.id);
          var exB = bullets.get(sb.id);
          if (exB) {
            exB.x = sb.x;
            exB.y = sb.y;
            exB.vx = sb.vx;
            exB.vy = sb.vy;
            exB.color = sb.color;
          } else {
            bullets.set(sb.id, Object.assign({}, sb, {
              renderX: sb.x,
              renderY: sb.y,
            }));
          }
        }
      }
      bullets.forEach(function (_v, id) {
        if (!seenBullets.has(id)) bullets.delete(id);
      });

      if (state.events && state.events.length > 0) {
        handleCombatEvents(state.events);
      }
      updateHud();
    }

    function handleCombatEvents(events) {
      for (var i = 0; i < events.length; i++) {
        var ev = events[i];
        if (ev.kind === 'shoot') {
          var attacker = players.get(ev.playerId);
          if (attacker) {
            attacker.swingTimer = 0.2;
            attacker.swingDir *= -1;
          } else {
            swingToggle *= -1;
          }

          for (var s = 0; s < 5; s++) {
            var oa = ev.facing + (Math.random() - 0.5) * 0.55;
            var spd = 80 + Math.random() * 110;
            spawnParticle({
              x: ev.x,
              y: ev.y,
              vx: Math.cos(oa) * spd,
              vy: Math.sin(oa) * spd,
              radius: 1.6 + Math.random() * 1.8,
              color: s % 2 === 0 ? ev.color : '#f8fafc',
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
          for (var bh = 0; bh < 6; bh++) {
            var bha = Math.random() * Math.PI * 2;
            var bhsp = 45 + Math.random() * 90;
            spawnParticle({
              x: ev.x,
              y: ev.y,
              vx: Math.cos(bha) * bhsp,
              vy: Math.sin(bha) * bhsp,
              radius: 1.8 + Math.random() * 1.8,
              color: bh % 2 === 0 ? ev.color : '#f8fafc',
              glow: true,
              age: 0,
              duration: 0.24 + Math.random() * 0.1,
            });
          }
        } else if (ev.kind === 'damage') {
          var isSelf = ev.targetType === 'player' && ev.targetId === myPlayerId;
          var isMyHit = ev.attackerId === myPlayerId;
          if (ev.attackerId && ev.attackerId.indexOf('slime_') === 0) {
            var sl = monsters.get(ev.attackerId);
            if (sl) sl.lungeTimer = 0.2;
          }

          var attackerEnt = players.get(ev.attackerId) || monsters.get(ev.attackerId);
          if (attackerEnt) {
            var ang = Math.atan2(ev.y - attackerEnt.renderY, ev.x - attackerEnt.renderX);
            if (ev.targetType === 'monster') {
              var tm = monsters.get(ev.targetId);
              if (tm) {
                tm.recoilX = Math.cos(ang) * 9;
                tm.recoilY = Math.sin(ang) * 9;
              }
            } else {
              var tp = players.get(ev.targetId);
              if (tp) {
                tp.recoilX = Math.cos(ang) * 7;
                tp.recoilY = Math.sin(ang) * 7;
              }
            }
          }

          for (var d = 0; d < 6; d++) {
            var da = Math.random() * Math.PI * 2;
            var dsp = 55 + Math.random() * 95;
            spawnParticle({
              x: ev.x,
              y: ev.y,
              vx: Math.cos(da) * dsp,
              vy: Math.sin(da) * dsp,
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
            text: '-' + ev.amount,
            color: isSelf ? '#fca5a5' : isMyHit ? '#fef08a' : '#f8fafc',
            size: isSelf ? 17 : 15,
            age: 0,
            duration: 0.78,
          });
          if (isSelf) {
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
              text: '+' + ev.amount + ' XP',
              color: '#38bdf8',
              size: 15,
              age: 0,
              duration: 1.0,
            });
          }
        } else if (ev.kind === 'level_up') {
          rings.push({ x: ev.x, y: ev.y, color: '#fbbf24', maxRadius: 84, lineWidth: 3.5, age: 0, duration: 0.75 });
          rings.push({ x: ev.x, y: ev.y, color: '#fef08a', maxRadius: 56, lineWidth: 2, age: 0, duration: 0.55 });
          for (var l = 0; l < 16; l++) {
            var la = (Math.PI * 2 * l) / 16;
            var lsp = 65 + Math.random() * 75;
            spawnParticle({
              x: ev.x,
              y: ev.y,
              vx: Math.cos(la) * lsp,
              vy: Math.sin(la) * lsp - 35,
              radius: 2.5 + Math.random() * 2.5,
              color: l % 2 === 0 ? '#fbbf24' : '#fef08a',
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
            text: 'LEVEL ' + ev.level + '!',
            color: '#fbbf24',
            size: 20,
            age: 0,
            duration: 1.35,
          });
          if (ev.playerId === myPlayerId) sound.playLevelUp();
        } else if (ev.kind === 'monster_death') {
          rings.push({ x: ev.x, y: ev.y, color: '#4ade80', maxRadius: 44, lineWidth: 2.5, age: 0, duration: 0.42 });
          for (var p = 0; p < 16; p++) {
            var angle = (Math.PI * 2 * p) / 16 + Math.random() * 0.35;
            var speed = 50 + Math.random() * 115;
            spawnParticle({
              x: ev.x,
              y: ev.y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              radius: 3 + Math.random() * 4,
              color: p % 3 === 0 ? '#86efac' : p % 2 === 0 ? '#4ade80' : '#16a34a',
              glow: false,
              age: 0,
              duration: 0.48 + Math.random() * 0.24,
            });
          }
        } else if (ev.kind === 'player_death') {
          rings.push({ x: ev.x, y: ev.y, color: '#ef4444', maxRadius: 64, lineWidth: 3, age: 0, duration: 0.6 });
          if (ev.playerId === myPlayerId) {
            sound.playDeath();
            deathSubtitle.textContent = 'Your journey is not over...';
          }
        }
      }
    }

    function updateHud() {
      var me = myPlayerId ? players.get(myPlayerId) : null;
      if (me) {
        hudColorDot.style.backgroundColor = me.color;
        hudPlayerName.textContent = me.name;
        if (hudKills) hudKills.textContent = me.kills + (me.kills === 1 ? ' kill' : ' kills');
        hudLevel.textContent = 'Lv. ' + me.level;
        var hpPct = me.max_hp > 0 ? clamp((me.hp / me.max_hp) * 100, 0, 100) : 0;
        hudHpFill.style.width = hpPct + '%';
        hudHpText.textContent = me.hp + ' / ' + me.max_hp;
        var reqXp = me.required_xp || me.level * 100;
        var xpPct = reqXp > 0 ? clamp((me.xp / reqXp) * 100, 0, 100) : 0;
        hudXpFill.style.width = xpPct + '%';
        hudXpText.textContent = me.xp + ' / ' + reqXp;
        if (!me.alive) {
          deathOverlay.classList.remove('hidden');
        } else {
          respawnPending = false;
          respawnBtn.disabled = false;
          deathOverlay.classList.add('hidden');
        }
        syncMobileControlsVisibility();
      }

      hudOnlineCount.textContent = players.size + ' online';

      var sorted = Array.from(players.values())
        .sort(function (a, b) {
          return b.kills - a.kills || b.level - a.level || a.name.localeCompare(b.name);
        })
        .slice(0, 5);

      leaderboardList.replaceChildren();
      if (sorted.length === 0) {
        var emptyLi = document.createElement('li');
        emptyLi.className = 'leaderboard-empty';
        emptyLi.textContent = 'No champions yet';
        leaderboardList.appendChild(emptyLi);
        return;
      }

      sorted.forEach(function (p, idx) {
        var li = document.createElement('li');
        li.className = 'leaderboard-row' + (p.id === myPlayerId ? ' self' : '');
        var rank = document.createElement('span');
        rank.className = 'lb-rank';
        rank.textContent = (idx + 1) + '.';
        var dot = document.createElement('span');
        dot.className = 'lb-dot';
        dot.style.backgroundColor = p.color;
        var nameEl = document.createElement('span');
        nameEl.className = 'lb-name';
        nameEl.textContent = p.name;
        var killsEl = document.createElement('span');
        killsEl.className = 'lb-kills';
        killsEl.textContent = String(p.kills);
        li.append(rank, dot, nameEl, killsEl);
        leaderboardList.appendChild(li);
      });
    }

    joinForm.addEventListener('submit', function (e) {
      e.preventDefault();
      sound.unlock();
      var raw = playerNameInput.value.trim();
      if (!raw) {
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

    function returnToMainMenu() {
      intentionalDisconnect = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      if (socket) {
        var oldSocket = socket;
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

      if (damageVignette) damageVignette.classList.remove('active');
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

    mainMenuBtn.addEventListener('click', function () {
      sound.unlock();
      returnToMainMenu();
    });

    respawnBtn.addEventListener('click', function () {
      if (!hasJoined || !myPlayerId || respawnPending) return;
      var me = players.get(myPlayerId);
      if (!me || me.alive) return;
      sound.unlock();
      respawnPending = true;
      respawnBtn.disabled = true;
      sendJson({ type: 'respawn' });
    });

    function triggerAttack(targetWorldX, targetWorldY) {
      if (!hasJoined || !myPlayerId) return;
      var me = players.get(myPlayerId);
      if (!me || !me.alive) return;
      sound.unlock();

      var tx = targetWorldX;
      var ty = targetWorldY;
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
        } catch (_e) {}
      }
      sendJson({ type: 'attack', targetX: tx, targetY: ty });
    }

    function computeMovementInput() {
      var dx = 0;
      var dy = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) dy += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
      if (dx === 0 && dy === 0 && joystick.active) {
        dx = joystick.dx;
        dy = joystick.dy;
      }
      var len = Math.hypot(dx, dy);
      if (len > 0) {
        dx /= len;
        dy /= len;
      }
      var me = myPlayerId ? players.get(myPlayerId) : null;
      if (me && mouse.active) {
        var wx = mouse.x - window.innerWidth / 2 + camera.x;
        var wy = mouse.y - window.innerHeight / 2 + camera.y;
        currentFacing = Math.atan2(wy - me.renderY, wx - me.renderX);
      }
      return { dx: dx, dy: dy, facing: currentFacing };
    }

    function sendMovementImmediatelyIfChanged() {
      if (!hasJoined || !myPlayerId) return;
      var me = players.get(myPlayerId);
      if (!me || !me.alive) return;
      var now = performance.now();
      if (now - lastQuickInputAt < 20) return;
      var input = computeMovementInput();
      if (Math.abs(input.dx - lastSentDx) > 0.02 || Math.abs(input.dy - lastSentDy) > 0.02) {
        lastQuickInputAt = now;
        lastSentDx = input.dx;
        lastSentDy = input.dy;
        sendJson({ type: 'input', dx: input.dx, dy: input.dy, facing: input.facing });
      }
    }

    window.addEventListener('keydown', function (e) {
      if (!hasJoined) return;
      var tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) triggerAttack();
        return;
      }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) !== -1) {
        e.preventDefault();
        if (!keys.has(e.code)) {
          keys.add(e.code);
          sendMovementImmediatelyIfChanged();
        }
      }
    });

    window.addEventListener('keyup', function (e) {
      if (keys.delete(e.code)) sendMovementImmediatelyIfChanged();
    });

    window.addEventListener('blur', function () {
      keys.clear();
      resetTouchPads();
      sendMovementImmediatelyIfChanged();
    });

    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    });

    canvas.addEventListener('pointerdown', function (e) {
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

      var worldX = e.clientX - window.innerWidth / 2 + camera.x;
      var worldY = e.clientY - window.innerHeight / 2 + camera.y;
      var me = myPlayerId ? players.get(myPlayerId) : null;
      if (me && me.alive) {
        currentFacing = Math.atan2(worldY - me.renderY, worldX - me.renderX);
      }
      triggerAttack(worldX, worldY);
    });

    var MAX_JOYSTICK_DIST = 40;
    function updateJoystickFromPoint(clientX, clientY) {
      var dx = clientX - joystick.originX;
      var dy = clientY - joystick.originY;
      var dist = Math.hypot(dx, dy);
      var clamped = Math.min(dist, MAX_JOYSTICK_DIST);
      var angle = Math.atan2(dy, dx);
      var tx = dist > 0 ? Math.cos(angle) * clamped : 0;
      var ty = dist > 0 ? Math.sin(angle) * clamped : 0;
      joystickThumb.style.transform = 'translate(' + tx + 'px, ' + ty + 'px)';
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

    joystickZone.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      sound.unlock();
      touchControlsEnabled = true;
      mouse.active = false;
      var rect = joystickZone.getBoundingClientRect();
      joystick.active = true;
      joystick.pointerId = e.pointerId;
      joystick.originX = rect.left + rect.width / 2;
      joystick.originY = rect.top + rect.height / 2;
      joystickZone.setPointerCapture(e.pointerId);
      updateJoystickFromPoint(e.clientX, e.clientY);
    });

    joystickZone.addEventListener('pointermove', function (e) {
      if (!joystick.active || e.pointerId !== joystick.pointerId) return;
      updateJoystickFromPoint(e.clientX, e.clientY);
    });

    function resetJoystick(e) {
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

    function updateShootPadFromPoint(clientX, clientY) {
      var dx = clientX - shootPad.originX;
      var dy = clientY - shootPad.originY;
      var dist = Math.hypot(dx, dy);
      if (dist > 10) {
        var angle = Math.atan2(dy, dx);
        shootPad.aiming = true;
        currentFacing = angle;
        mouse.active = false;
        mobileAttackBtn.classList.add('aiming');
        if (shootAimIndicator) {
          var indX = Math.cos(angle) * 34;
          var indY = Math.sin(angle) * 34;
          shootAimIndicator.style.transform = 'translate(' + indX + 'px, ' + indY + 'px)';
        }
      } else {
        shootPad.aiming = false;
        mobileAttackBtn.classList.remove('aiming');
        if (shootAimIndicator) {
          shootAimIndicator.style.transform = 'translate(0px, 0px)';
        }
      }
    }

    mobileAttackBtn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      sound.unlock();
      touchControlsEnabled = true;
      mouse.active = false;
      var rect = mobileAttackBtn.getBoundingClientRect();
      shootPad.active = true;
      shootPad.pointerId = e.pointerId;
      shootPad.originX = rect.left + rect.width / 2;
      shootPad.originY = rect.top + rect.height / 2;
      mobileAttackBtn.setPointerCapture(e.pointerId);
      updateShootPadFromPoint(e.clientX, e.clientY);
      triggerAttack();
    });

    mobileAttackBtn.addEventListener('pointermove', function (e) {
      if (!shootPad.active || e.pointerId !== shootPad.pointerId) return;
      updateShootPadFromPoint(e.clientX, e.clientY);
    });

    function resetShootPad(e) {
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

    window.setInterval(function () {
      if (!hasJoined || !myPlayerId) return;
      var me = players.get(myPlayerId);
      if (!me || !me.alive) return;
      var input = computeMovementInput();
      lastSentDx = input.dx;
      lastSentDy = input.dy;
      sendJson({ type: 'input', dx: input.dx, dy: input.dy, facing: input.facing });
      if (shootPad.active && localCooldown <= 0.02) {
        triggerAttack();
      }
    }, 50);

    window.setInterval(function () {
      if (socket && socket.readyState === WebSocket.OPEN) {
        sendJson({ type: 'ping', t: performance.now() });
      }
    }, 3000);

    var lastFrameTime = performance.now();
    function frame(now) {
      var dt = Math.min(0.05, (now - lastFrameTime) / 1000);
      lastFrameTime = now;
      var interp = Math.min(1, dt * 18);

      if (localCooldown > 0) localCooldown = Math.max(0, localCooldown - dt);
      if (mobileCooldownCircle) {
        mobileCooldownCircle.style.strokeDashoffset = String(245 * (1 - localCooldown / ATTACK_COOLDOWN_SEC));
      }
      if (screenShake > 0) screenShake = Math.max(0, screenShake - dt * 28);

      players.forEach(function (p) {
        var leadX = clamp(p.x + p.vx * 0.022, 20, world.width - 20);
        var leadY = clamp(p.y + p.vy * 0.022, 20, world.height - 20);
        p.renderX = lerp(p.renderX, leadX, interp);
        p.renderY = lerp(p.renderY, leadY, interp);
        p.renderHp = lerp(p.renderHp, p.hp, Math.min(1, dt * 14));
        p.recoilX = lerp(p.recoilX, 0, Math.min(1, dt * 18));
        p.recoilY = lerp(p.recoilY, 0, Math.min(1, dt * 18));
        if (p.id === myPlayerId && mouse.active && p.alive) p.renderFacing = currentFacing;
        else p.renderFacing = lerpAngle(p.renderFacing, p.facing, interp);
        if (p.flashTimer > 0) p.flashTimer = Math.max(0, p.flashTimer - dt);
        if (p.swingTimer > 0) p.swingTimer = Math.max(0, p.swingTimer - dt);
        if (p.levelAuraTimer > 0) p.levelAuraTimer = Math.max(0, p.levelAuraTimer - dt);

        if (p.alive && Math.hypot(p.vx, p.vy) > 25) {
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
      });

      monsters.forEach(function (m) {
        m.renderX = lerp(m.renderX, m.x, interp);
        m.renderY = lerp(m.renderY, m.y, interp);
        m.renderHp = lerp(m.renderHp, m.hp, Math.min(1, dt * 14));
        m.renderFacing = lerpAngle(m.renderFacing, m.facing, interp);
        m.recoilX = lerp(m.recoilX, 0, Math.min(1, dt * 18));
        m.recoilY = lerp(m.recoilY, 0, Math.min(1, dt * 18));
        if (m.flashTimer > 0) m.flashTimer = Math.max(0, m.flashTimer - dt);
        if (m.lungeTimer > 0) m.lungeTimer = Math.max(0, m.lungeTimer - dt);
        if (m.spawnTimer > 0) m.spawnTimer = Math.max(0, m.spawnTimer - dt);

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
      });

      bullets.forEach(function (b) {
        b.renderX += b.vx * dt;
        b.renderY += b.vy * dt;
        b.renderX = lerp(b.renderX, b.x, Math.min(1, dt * 16));
        b.renderY = lerp(b.renderY, b.y, Math.min(1, dt * 16));
      });

      ambientMotes.forEach(function (mote) {
        mote.x += mote.vx * dt;
        mote.y += mote.vy * dt;
        if (mote.x < 0) mote.x += world.width;
        if (mote.x > world.width) mote.x -= world.width;
        if (mote.y < 0) mote.y += world.height;
        if (mote.y > world.height) mote.y -= world.height;
      });

      var me = myPlayerId ? players.get(myPlayerId) : null;
      if (me) {
        if (!camera.initialized) {
          camera.x = me.renderX;
          camera.y = me.renderY;
          camera.initialized = true;
        } else {
          var camSmooth = Math.min(1, dt * 15);
          camera.x = lerp(camera.x, me.renderX, camSmooth);
          camera.y = lerp(camera.y, me.renderY, camSmooth);
        }
      }

      for (var i = slashes.length - 1; i >= 0; i--) {
        slashes[i].age += dt;
        if (slashes[i].age >= slashes[i].duration) slashes.splice(i, 1);
      }
      for (var j = floatingTexts.length - 1; j >= 0; j--) {
        floatingTexts[j].age += dt;
        floatingTexts[j].x += floatingTexts[j].vx * dt;
        floatingTexts[j].y += floatingTexts[j].vy * dt;
        floatingTexts[j].vy *= 0.94;
        if (floatingTexts[j].age >= floatingTexts[j].duration) floatingTexts.splice(j, 1);
      }
      for (var k = particles.length - 1; k >= 0; k--) {
        particles[k].age += dt;
        particles[k].x += particles[k].vx * dt;
        particles[k].y += particles[k].vy * dt;
        particles[k].vx *= 0.91;
        particles[k].vy *= 0.91;
        if (particles[k].age >= particles[k].duration) particles.splice(k, 1);
      }
      for (var r = rings.length - 1; r >= 0; r--) {
        rings[r].age += dt;
        if (rings[r].age >= rings[r].duration) rings.splice(r, 1);
      }

      render(now);
      requestAnimationFrame(frame);
    }

    function render(now) {
      var viewW = window.innerWidth;
      var viewH = window.innerHeight;
      ctx.clearRect(0, 0, viewW, viewH);
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, viewW, viewH);

      var radial = ctx.createRadialGradient(viewW * 0.5, viewH * 0.4, 40, viewW * 0.5, viewH * 0.4, Math.max(viewW, viewH) * 0.78);
      radial.addColorStop(0, 'rgba(88, 28, 135, 0.2)');
      radial.addColorStop(1, 'rgba(9, 13, 22, 0)');
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, viewW, viewH);

      var shakeX = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;
      var shakeY = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;
      var camLeft = camera.x - viewW / 2 - 90;
      var camRight = camera.x + viewW / 2 + 90;
      var camTop = camera.y - viewH / 2 - 90;
      var camBottom = camera.y + viewH / 2 + 90;

      ctx.save();
      ctx.translate(viewW / 2 - camera.x + shakeX, viewH / 2 - camera.y + shakeY);

      if (terrainCanvas) {
        var sx = Math.max(0, Math.floor(camLeft));
        var sy = Math.max(0, Math.floor(camTop));
        var ex = Math.min(world.width, Math.ceil(camRight));
        var ey = Math.min(world.height, Math.ceil(camBottom));
        var sw = ex - sx;
        var sh = ey - sy;
        if (sw > 0 && sh > 0) {
          ctx.drawImage(terrainCanvas, sx, sy, sw, sh, sx, sy, sw, sh);
        }
      } else {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, world.width, world.height);
      }

      var cx = world.width / 2;
      var cy = world.height / 2;
      if (cx + 220 >= camLeft && cx - 220 <= camRight && cy + 220 >= camTop && cy - 220 <= camBottom) {
        var rot = now * 0.0004;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.save();
        ctx.rotate(rot);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
        ctx.lineWidth = 2;
        ctx.setLineDash([18, 14]);
        ctx.beginPath();
        ctx.arc(0, 0, 195, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.rotate(-rot * 1.4);
        ctx.strokeStyle = 'rgba(167, 139, 250, 0.15)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 125, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        ctx.restore();
      }

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, world.width, world.height);

      var tSec = now * 0.001;
      ambientMotes.forEach(function (mote) {
        if (mote.x < camLeft || mote.x > camRight || mote.y < camTop || mote.y > camBottom) return;
        ctx.globalAlpha = mote.alpha * (0.65 + 0.35 * Math.sin(tSec * 2 + mote.phase));
        ctx.fillStyle = mote.color;
        ctx.beginPath();
        ctx.arc(mote.x, mote.y, mote.radius, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      rings.forEach(function (ring) {
        if (ring.x < camLeft || ring.x > camRight || ring.y < camTop || ring.y > camBottom) return;
        var progress = ring.age / ring.duration;
        ctx.save();
        ctx.globalAlpha = 1 - progress;
        ctx.strokeStyle = ring.color;
        ctx.lineWidth = ring.lineWidth * (1 - progress * 0.4);
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, 14 + ring.maxRadius * progress, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });

      monsters.forEach(function (m) {
        if (!m.alive) return;
        if (m.renderX < camLeft || m.renderX > camRight || m.renderY < camTop || m.renderY > camBottom) return;
        var isAggro = m.target_id !== null;
        var hopFreq = m.moving ? (isAggro ? 11 : 7) : 3.2;
        var bounce = m.moving ? Math.abs(Math.sin(tSec * hopFreq + m.phase)) * (isAggro ? 5.5 : 3.5) : 0;
        var stretch = m.moving ? Math.sin(tSec * hopFreq + m.phase) * 0.11 : Math.sin(tSec * 3.2 + m.phase) * 0.05;
        var spawnScale = m.spawnTimer > 0 ? 1 - m.spawnTimer / 0.35 : 1;
        var sx = (1 + stretch) * spawnScale;
        var sy = (1 - stretch) * spawnScale;
        var lungeDist = m.lungeTimer > 0 ? Math.sin((m.lungeTimer / 0.2) * Math.PI) * 11 : 0;
        var drawX = m.renderX + m.recoilX + Math.cos(m.renderFacing) * lungeDist;
        var drawY = m.renderY + m.recoilY - bounce + Math.sin(m.renderFacing) * lungeDist;
        var r = 18;
        var shadowScale = (1 - bounce * 0.03) * spawnScale;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
        ctx.beginPath();
        ctx.ellipse(m.renderX + m.recoilX, m.renderY + m.recoilY + 11, r * 0.98 * shadowScale, r * 0.45 * shadowScale, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(drawX, drawY);
        ctx.scale(sx, sy);
        ctx.fillStyle = m.flashTimer > 0 ? '#ffffff' : isAggro ? 'rgba(16, 185, 129, 0.92)' : 'rgba(34, 197, 94, 0.88)';
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
          ctx.fillStyle = isAggro ? 'rgba(245, 158, 11, 0.55)' : 'rgba(110, 231, 183, 0.42)';
          ctx.beginPath();
          ctx.moveTo(0, -5);
          ctx.lineTo(5, 2);
          ctx.lineTo(0, 8);
          ctx.lineTo(-5, 2);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.beginPath();
          ctx.ellipse(-6, -6, 5.5, 2.8, -0.45, 0, Math.PI * 2);
          ctx.fill();
        }
        var lx = Math.cos(m.renderFacing) * 4.2;
        var ly = Math.sin(m.renderFacing) * 2.5;
        ctx.fillStyle = isAggro ? '#fef08a' : '#090d16';
        ctx.beginPath();
        ctx.arc(-5 + lx, 1 + ly, 2.6, 0, Math.PI * 2);
        ctx.arc(5 + lx, 1 + ly, 2.6, 0, Math.PI * 2);
        ctx.fill();
        if (isAggro && m.flashTimer <= 0) {
          ctx.strokeStyle = '#064e3b';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(-8 + lx, -3 + ly);
          ctx.lineTo(-3 + lx, -1 + ly);
          ctx.moveTo(8 + lx, -3 + ly);
          ctx.lineTo(3 + lx, -1 + ly);
          ctx.stroke();
        }
        ctx.restore();

        if (m.hp < m.max_hp || isAggro) {
          var bw = 40;
          var bh = 5;
          var bx = drawX - bw / 2;
          var by = drawY - 26;
          ctx.fillStyle = 'rgba(9, 13, 22, 0.88)';
          ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(bx, by, bw * clamp(m.renderHp / m.max_hp, 0, 1), bh);
        }
      });

      particles.forEach(function (pt) {
        if (pt.x < camLeft || pt.x > camRight || pt.y < camTop || pt.y > camBottom) return;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - pt.age / pt.duration);
        if (pt.glow) {
          ctx.shadowColor = pt.color;
          ctx.shadowBlur = 8;
        }
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      Array.from(players.values())
        .sort(function (a, b) {
          if (a.alive !== b.alive) return a.alive ? 1 : -1;
          if (a.id === myPlayerId) return 1;
          if (b.id === myPlayerId) return -1;
          return 0;
        })
        .forEach(function (p) {
          if (p.renderX < camLeft || p.renderX > camRight || p.renderY < camTop || p.renderY > camBottom) return;
          var r = 20;
          var speed = Math.hypot(p.vx, p.vy);
          var walkBob = speed > 10 ? Math.abs(Math.sin(tSec * 14 + p.phase)) * 2.8 : Math.sin(tSec * 3 + p.phase) * 0.8;
          var x = p.renderX + p.recoilX;
          var y = p.renderY + p.recoilY - walkBob;

          if (!p.alive) {
            var floatY = Math.sin(tSec * 2.5 + p.phase) * 3;
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
            ctx.fillText(p.name + ' (Fallen)', p.renderX, p.renderY - 26 + floatY);
            return;
          }

          ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
          ctx.beginPath();
          ctx.ellipse(p.renderX + p.recoilX, p.renderY + p.recoilY + 15, r * 0.92, r * 0.44, 0, 0, Math.PI * 2);
          ctx.fill();

          if (p.levelAuraTimer > 0) {
            ctx.save();
            ctx.globalAlpha = Math.min(0.65, p.levelAuraTimer);
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(x, y, r + 9 + Math.sin(tSec * 12) * 2, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }

          if (p.id === myPlayerId) {
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, r + 6, 0, Math.PI * 2);
            ctx.stroke();
            if (localCooldown > 0) {
              ctx.strokeStyle = 'rgba(248, 250, 252, 0.65)';
              ctx.lineWidth = 2.5;
              ctx.beginPath();
              ctx.arc(x, y, r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - localCooldown / ATTACK_COOLDOWN_SEC));
              ctx.stroke();
            }
          }

          var swingAngle = 0;
          if (p.swingTimer > 0) {
            swingAngle = (-0.95 + (1 - p.swingTimer / 0.22) * 1.9) * p.swingDir;
          }

          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(p.renderFacing);
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(-4, -r + 3, 7, 0, Math.PI * 2);
          ctx.arc(-4, r - 3, 7, 0, Math.PI * 2);
          ctx.fill();

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

          ctx.fillStyle = p.flashTimer > 0 ? '#ffffff' : p.color;
          ctx.strokeStyle = '#090d16';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

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

          var label = p.name + ' · Lv.' + p.level;
          ctx.font = "600 13px 'Outfit', sans-serif";
          ctx.textAlign = 'center';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(9, 13, 22, 0.92)';
          ctx.strokeText(label, x, y - 35);
          ctx.fillStyle = p.id === myPlayerId ? '#f8fafc' : '#cbd5e1';
          ctx.fillText(label, x, y - 35);

          var bw = 48;
          var bh = 5;
          var bx = x - bw / 2;
          var by = y - 29;
          ctx.fillStyle = 'rgba(9, 13, 22, 0.88)';
          ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(bx, by, bw * clamp(p.renderHp / p.max_hp, 0, 1), bh);
        });

      bullets.forEach(function (b) {
        if (b.renderX < camLeft || b.renderX > camRight || b.renderY < camTop || b.renderY > camBottom) return;
        drawBullet(b);
      });

      slashes.forEach(function (s) {
        var progress = s.age / s.duration;
        var sweep = Math.PI * 0.78;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.globalAlpha = Math.max(0, 1 - progress);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 16 * (1 - progress * 0.55);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, 68, s.facing - sweep * 0.5, s.facing + sweep * 0.5);
        ctx.stroke();
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 4.5 * (1 - progress * 0.45);
        ctx.beginPath();
        ctx.arc(0, 0, 73, s.facing - sweep * 0.5 + 0.14, s.facing + sweep * 0.5 - 0.14);
        ctx.stroke();
        ctx.restore();
      });

      function drawBullet(b) {
        var angle = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(b.renderX, b.renderY);
        ctx.rotate(angle);

        var tailGrad = ctx.createLinearGradient(-22, 0, 6, 0);
        tailGrad.addColorStop(0, 'rgba(248, 250, 252, 0)');
        tailGrad.addColorStop(1, b.color);
        ctx.fillStyle = tailGrad;
        ctx.beginPath();
        ctx.moveTo(-22, 0);
        ctx.lineTo(2, -4.5);
        ctx.lineTo(2, 4.5);
        ctx.closePath();
        ctx.fill();

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

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.arc(1, 0, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      floatingTexts.forEach(function (ft) {
        if (ft.x < camLeft || ft.x > camRight || ft.y < camTop || ft.y > camBottom) return;
        var progress = ft.age / ft.duration;
        var popScale = progress < 0.14 ? 0.75 + (progress / 0.14) * 0.45 : Math.max(1, 1.2 - (progress - 0.14) * 0.7);
        ctx.save();
        ctx.translate(ft.x, ft.y);
        ctx.scale(popScale, popScale);
        ctx.globalAlpha = Math.max(0, 1 - Math.pow(progress, 2.0));
        ctx.font = '700 ' + ft.size + "px 'Outfit', sans-serif";
        ctx.textAlign = 'center';
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = 'rgba(9, 13, 22, 0.92)';
        ctx.strokeText(ft.text, 0, 0);
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, 0, 0);
        ctx.restore();
      });

      ctx.restore();
    }

    requestAnimationFrame(frame);
  });
})();
