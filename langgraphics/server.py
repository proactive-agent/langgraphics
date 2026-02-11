import asyncio
import json
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler
from pathlib import Path
from socketserver import TCPServer
from typing import Any

import websockets
from websockets.asyncio.server import Server, serve

from .extractor import extract_topology
from .streamer import VisualizedGraph

STATIC_DIR = Path(__file__).parent / "static"


class ConnectionManager:
    def __init__(self, topology: dict[str, Any]) -> None:
        self._connections: set[Any] = set()
        self._topology_json = json.dumps(topology)
        self._loop: asyncio.AbstractEventLoop | None = None
        self._server: Server | None = None

    async def handler(self, websocket: Any) -> None:
        self._connections.add(websocket)
        try:
            await websocket.send(self._topology_json)
            async for _message in websocket:
                pass
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self._connections.discard(websocket)

    async def broadcast(self, message: str) -> None:
        if self._connections:
            await asyncio.gather(
                *[c.send(message) for c in self._connections],
                return_exceptions=True,
            )

    def shutdown(self) -> None:
        loop = self._loop
        if loop is None:
            return

        async def _shutdown() -> None:
            if self._connections:
                await asyncio.gather(
                    *[c.close() for c in list(self._connections)],
                    return_exceptions=True,
                )
                self._connections.clear()
            if self._server is not None:
                self._server.close()
                await self._server.wait_closed()

        asyncio.run_coroutine_threadsafe(_shutdown(), loop).result(timeout=5)
        self._loop = None


def _start_http_server(host: str, port: int) -> TCPServer:
    handler = partial(SimpleHTTPRequestHandler, directory=str(STATIC_DIR))
    server = TCPServer((host, port), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def _start_ws_server(manager: ConnectionManager, host: str, port: int) -> None:
    async def _run() -> None:
        manager._loop = asyncio.get_running_loop()
        manager._server = await serve(manager.handler, host, port)
        await manager._server.wait_closed()

    def _thread_target() -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_run())

    threading.Thread(target=_thread_target, daemon=True).start()


def visualize(
    graph: Any,
    *,
    host: str = "localhost",
    port: int = 8764,
    ws_port: int = 8765,
    open_browser: bool = True,
) -> VisualizedGraph:
    topology = extract_topology(graph)
    manager = ConnectionManager(topology)
    edge_lookup = {(e["source"], e["target"]): e["id"] for e in topology["edges"]}

    http_server = _start_http_server(host, port)
    _start_ws_server(manager, host, ws_port)

    print(f"[langgraphics] UI:        http://{host}:{port}")
    print(f"[langgraphics] WebSocket: ws://{host}:{ws_port}")

    if open_browser:
        webbrowser.open(f"http://{host}:{port}")

    return VisualizedGraph(graph, manager, edge_lookup, http_server)
