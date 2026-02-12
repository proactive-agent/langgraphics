import asyncio
import json
from typing import Any

import websockets
from websockets.asyncio.server import Server


class Broadcaster:
    def __init__(self, topology: dict[str, Any]) -> None:
        self.connections: set[Any] = set()
        self.topology_json = json.dumps(topology)
        self.loop: asyncio.AbstractEventLoop | None = None
        self.server: Server | None = None

    async def handler(self, websocket: Any) -> None:
        self.connections.add(websocket)
        try:
            await websocket.send(self.topology_json)
            async for _message in websocket:
                pass
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.connections.discard(websocket)

    async def broadcast(self, message: str) -> None:
        if self.connections:
            await asyncio.gather(
                *[c.send(message) for c in self.connections],
                return_exceptions=True,
            )

    def shutdown(self) -> None:
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

        asyncio.run_coroutine_threadsafe(_shutdown(), loop).result(timeout=5)
        self.loop = None
