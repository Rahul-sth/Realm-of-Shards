import asyncio
from contextlib import asynccontextmanager
import json
from pathlib import Path
import time
from typing import Dict
import uuid

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from game.constants import TICK_DT, WORLD_HEIGHT, WORLD_WIDTH
from game.world import GameWorld

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"

world = GameWorld()
world_lock = asyncio.Lock()
connections: Dict[WebSocket, str] = {}


async def simulation_loop() -> None:
    while True:
        start = time.monotonic()
        async with world_lock:
            world.step(TICK_DT)
            snapshot_text = json.dumps(world.get_snapshot(flush_events=True))
            active_sockets = [
                ws for ws, pid in connections.items() if pid is not None
            ]

        if active_sockets:
            await asyncio.gather(
                *(ws.send_text(snapshot_text) for ws in active_sockets),
                return_exceptions=True,
            )

        elapsed = time.monotonic() - start
        await asyncio.sleep(max(0.0, TICK_DT - elapsed))


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(simulation_loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Realm of Shards", lifespan=lifespan)

if PUBLIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(PUBLIC_DIR)), name="static")


@app.get("/")
async def serve_index() -> FileResponse:
    return FileResponse(str(PUBLIC_DIR / "index.html"))


@app.get("/style.css")
async def serve_css() -> FileResponse:
    return FileResponse(str(PUBLIC_DIR / "style.css"), media_type="text/css")


@app.get("/client.js")
async def serve_js() -> FileResponse:
    return FileResponse(str(PUBLIC_DIR / "client.js"), media_type="application/javascript")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    player_id: str | None = None
    msg_count = 0
    window_start = time.monotonic()
    last_input_at = 0.0

    try:
        while True:
            raw_text = await websocket.receive_text()
            if len(raw_text) > 2048:
                continue

            now = time.monotonic()
            if now - window_start >= 1.0:
                window_start = now
                msg_count = 0
            msg_count += 1
            if msg_count > 60:
                continue

            try:
                data = json.loads(raw_text)
            except json.JSONDecodeError:
                continue

            if not isinstance(data, dict):
                continue

            msg_type = data.get("type")
            if not isinstance(msg_type, str):
                continue

            if msg_type == "join":
                if player_id is not None:
                    continue
                player_id = uuid.uuid4().hex[:8]
                async with world_lock:
                    player = world.add_player(player_id, data.get("name"))
                    connections[websocket] = player.id
                    snapshot = world.get_snapshot(flush_events=False)

                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "welcome",
                            "id": player.id,
                            "world": {"width": WORLD_WIDTH, "height": WORLD_HEIGHT},
                        }
                    )
                )
                await websocket.send_text(json.dumps(snapshot))
                continue

            if player_id is None:
                continue

            if msg_type == "input":
                if now - last_input_at < 0.015:
                    continue
                last_input_at = now
                try:
                    dx = float(data.get("dx", 0.0))
                    dy = float(data.get("dy", 0.0))
                    facing = float(data.get("facing", 0.0))
                except (TypeError, ValueError):
                    continue
                async with world_lock:
                    world.handle_input(player_id, dx, dy, facing)

            elif msg_type == "attack":
                tx = data.get("targetX")
                ty = data.get("targetY")
                target_x = float(tx) if isinstance(tx, (int, float)) else None
                target_y = float(ty) if isinstance(ty, (int, float)) else None
                async with world_lock:
                    world.handle_attack(player_id, target_x, target_y)

            elif msg_type == "respawn":
                async with world_lock:
                    world.handle_respawn(player_id)

            elif msg_type == "leave":
                connections.pop(websocket, None)
                async with world_lock:
                    world.remove_player(player_id)
                player_id = None

            elif msg_type == "ping":
                await websocket.send_text(
                    json.dumps({"type": "pong", "t": data.get("t")})
                )

    except WebSocketDisconnect:
        pass
    finally:
        connections.pop(websocket, None)
        if player_id is not None:
            async with world_lock:
                world.remove_player(player_id)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)
