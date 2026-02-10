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

from langgraphics.extractor import extract_topology
from langgraphics.streamer import VisualizedGraph

STATIC_DIR = Path(__file__).parent / "static"


class ConnectionManager:
    def __init__(self) -> None:
        self.connections: set[Any] = set()
        self._topology_json: str | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._ws_server: Server | None = None

    def set_topology(self, topology: dict[str, Any]) -> None:
        self._topology_json = json.dumps(topology)

    async def handler(self, websocket: Any) -> None:
        self.connections.add(websocket)
        try:
            if self._topology_json:
                await websocket.send(self._topology_json)
            async for message in websocket:
                data = json.loads(message)
                if data.get("type") == "ping":
                    await websocket.send(json.dumps({"type": "pong"}))
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.connections.discard(websocket)

    async def broadcast(self, message: str) -> None:
        if not self.connections:
            return
        await asyncio.gather(
            *[conn.send(message) for conn in self.connections],
            return_exceptions=True,
        )

    def broadcast_sync(self, message: str) -> None:
        if self._loop is None or not self.connections:
            return
        asyncio.run_coroutine_threadsafe(self.broadcast(message), self._loop)

    def shutdown(self) -> None:
        loop = self._loop
        if loop is None:
            return

        async def _shutdown() -> None:
            if self.connections:
                await asyncio.gather(
                    *[conn.close() for conn in list(self.connections)],
                    return_exceptions=True,
                )
                self.connections.clear()
            if self._ws_server is not None:
                self._ws_server.close()
                await self._ws_server.wait_closed()

        asyncio.run_coroutine_threadsafe(_shutdown(), loop).result(timeout=5)
        self._loop = None


def _start_http_server(host: str, port: int) -> TCPServer:
    handler = partial(SimpleHTTPRequestHandler, directory=str(STATIC_DIR))
    server = TCPServer((host, port), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def _start_ws_server(
    manager: ConnectionManager, host: str, port: int
) -> threading.Thread:
    async def _run() -> None:
        manager._loop = asyncio.get_running_loop()
        server = await serve(manager.handler, host, port)
        manager._ws_server = server
        await server.wait_closed()

    def _thread_target() -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_run())

    thread = threading.Thread(target=_thread_target, daemon=True)
    thread.start()
    return thread


def visualize(
    graph: Any,
    *,
    host: str = "localhost",
    port: int = 8764,
    ws_port: int = 8765,
    open_browser: bool = True,
) -> VisualizedGraph:
    manager = ConnectionManager()
    topology = extract_topology(graph)
    edge_lookup = {(e["source"], e["target"]): e["id"] for e in topology["edges"]}
    manager.set_topology(topology)

    http_server = _start_http_server(host, port)
    _start_ws_server(manager, host, ws_port)

    print(f"[langgraphics] UI:        http://{host}:{port}")
    print(f"[langgraphics] WebSocket: ws://{host}:{ws_port}")

    if open_browser:
        webbrowser.open(f"http://{host}:{port}")

    return VisualizedGraph(graph, manager, edge_lookup, http_server)
