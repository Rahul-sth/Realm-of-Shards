import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { GameWorld } from './server/gameEngine.ts';
import {
  TICK_DT,
  TICK_INTERVAL_MS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './server/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

interface ClientMeta {
  playerId: string | null;
  msgCount: number;
  windowStart: number;
  lastInputAt: number;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const world = new GameWorld();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, world: { width: WORLD_WIDTH, height: WORLD_HEIGHT } });
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: 2048,
  });

  const clientMetaMap = new WeakMap<WebSocket, ClientMeta>();

  wss.on('connection', (ws: WebSocket) => {
    const meta: ClientMeta = {
      playerId: null,
      msgCount: 0,
      windowStart: Date.now(),
      lastInputAt: 0,
    };
    clientMetaMap.set(ws, meta);

    ws.on('message', (rawData) => {
      const now = Date.now();
      if (now - meta.windowStart >= 1000) {
        meta.windowStart = now;
        meta.msgCount = 0;
      }
      meta.msgCount += 1;
      // Rate limit protection: max 60 messages per second per connection
      if (meta.msgCount > 60) {
        return;
      }

      let msg: Record<string, unknown>;
      try {
        const text = typeof rawData === 'string' ? rawData : rawData.toString('utf8');
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return;
        }
        msg = parsed as Record<string, unknown>;
      } catch {
        return;
      }

      const type = msg.type;
      if (typeof type !== 'string') return;

      if (type === 'join') {
        if (meta.playerId !== null) return;
        const playerId = crypto.randomUUID().slice(0, 8);
        meta.playerId = playerId;
        const player = world.addPlayer(playerId, msg.name);

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'welcome',
              id: player.id,
              world: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
            }),
          );
          ws.send(JSON.stringify(world.getSnapshot(false)));
        }
        return;
      }

      if (!meta.playerId) return;

      if (type === 'input') {
        // Protect against excessive input bursts (< 15ms apart)
        if (now - meta.lastInputAt < 15) return;
        meta.lastInputAt = now;

        const dx = Number(msg.dx);
        const dy = Number(msg.dy);
        const facing = Number(msg.facing);
        if (
          !Number.isFinite(dx) ||
          !Number.isFinite(dy) ||
          !Number.isFinite(facing)
        ) {
          return;
        }
        world.handleInput(meta.playerId, dx, dy, facing);
      } else if (type === 'attack') {
        const targetX = typeof msg.targetX === 'number' ? msg.targetX : undefined;
        const targetY = typeof msg.targetY === 'number' ? msg.targetY : undefined;
        world.handleAttack(meta.playerId, targetX, targetY);
      } else if (type === 'respawn') {
        world.handleRespawn(meta.playerId);
      } else if (type === 'leave') {
        world.removePlayer(meta.playerId);
        meta.playerId = null;
      } else if (type === 'ping') {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pong', t: msg.t }));
        }
      }
    });

    ws.on('close', () => {
      if (meta.playerId) {
        world.removePlayer(meta.playerId);
        meta.playerId = null;
      }
    });

    ws.on('error', () => {
      if (meta.playerId) {
        world.removePlayer(meta.playerId);
        meta.playerId = null;
      }
    });
  });

  // Authoritative 20Hz simulation & broadcast loop
  setInterval(() => {
    world.step(TICK_DT);
    if (wss.clients.size === 0) {
      // Flush events even if nobody is connected to keep queue bounded
      world.getSnapshot(true);
      return;
    }

    const payload = JSON.stringify(world.getSnapshot(true));
    for (const client of wss.clients) {
      const meta = clientMetaMap.get(client);
      if (client.readyState === WebSocket.OPEN && meta?.playerId) {
        client.send(payload);
      }
    }
  }, TICK_INTERVAL_MS);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Realm of Shards server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Realm of Shards server:', err);
  process.exit(1);
});
