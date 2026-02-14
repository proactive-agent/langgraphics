import asyncio
import json
from typing import Any

import websockets
from websockets.asyncio.server import Server


class Broadcaster:
    def __init__(self, topology: dict[str, Any]) -> None:
        self.connections: set[Any] = set()
        self.topology_json = json.dumps(topology)
        self.replay: list[str] = []
        self.loop: asyncio.AbstractEventLoop | None = None
        self.server: Server | None = None

    async def handler(self, websocket: Any) -> None:
        self.connections.add(websocket)
        try:
            await websocket.send(self.topology_json)
            for message in self.replay:
                await websocket.send(message)
            async for _message in websocket:
                pass
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.connections.discard(websocket)

    async def broadcast(self, message: str) -> None:
        msg_type = json.loads(message).get("type")
        if msg_type == "run_start":
            self.replay = [message]
        elif msg_type in ("run_end", "error"):
            self.replay = []
        elif msg_type == "edge_active":
            self.replay.append(message)
        if self.connections:
            await asyncio.gather(
                *[c.send(message) for c in self.connections],
                return_exceptions=True,
            )

    async def shutdown(self) -> None:
        loop = self.loop
        if loop is None:
            return

        async def _shutdown() -> None:
            if self.connections:
                await asyncio.gather(
                    *[c.close() for c in list(self.connections)],
                    return_exceptions=True,
                )
                self.connections.clear()
            if self.server is not None:
                self.server.close()
                await self.server.wait_closed()

        await asyncio.wrap_future(asyncio.run_coroutine_threadsafe(_shutdown(), loop))
        self.loop = None
