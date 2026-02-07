"""WebSocket server and the public visualize() function."""

from __future__ import annotations

import asyncio
import json
import threading
import webbrowser
from typing import Any

import websockets
from websockets.asyncio.server import serve

from langgraph_viz.extractor import extract_topology, build_edge_lookup
from langgraph_viz.streamer import VisualizedGraph


class ConnectionManager:
    """Manages connected WebSocket clients and broadcasts messages."""

    def __init__(self) -> None:
        self.connections: set[Any] = set()
        self._topology_json: str | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_topology(self, topology: dict[str, Any]) -> None:
        from langgraph_viz.protocol import graph_message
        self._topology_json = json.dumps(topology)

    async def handler(self, websocket: Any) -> None:
        self.connections.add(websocket)
        try:
            # Send topology on connect
            if self._topology_json:
                await websocket.send(self._topology_json)
            # Keep connection alive
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
        """Thread-safe broadcast that schedules on the WS event loop."""
        if self._loop is None or not self.connections:
            return
        asyncio.run_coroutine_threadsafe(self.broadcast(message), self._loop)


def visualize(
    graph: Any,
    *,
    host: str = "localhost",
    port: int = 8765,
    open_browser: bool = False,
) -> VisualizedGraph:
    """
    Wrap a compiled LangGraph to stream execution events over WebSocket.

    Args:
        graph: A compiled LangGraph (result of workflow.compile())
        host: WebSocket server bind address
        port: WebSocket server port
        open_browser: Whether to auto-open the frontend URL

    Returns:
        A VisualizedGraph wrapper that proxies calls and streams events.
    """
    manager = ConnectionManager()
    topology = extract_topology(graph)
    edge_lookup = build_edge_lookup(topology)
    manager.set_topology(topology)

    async def _run_server() -> None:
        manager._loop = asyncio.get_running_loop()
        async with serve(manager.handler, host, port):
            print(f"[langgraph_viz] WebSocket server running on ws://{host}:{port}")
            await asyncio.Future()  # run forever

    def _thread_target() -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_run_server())

    server_thread = threading.Thread(target=_thread_target)
    server_thread.start()

    if open_browser:
        webbrowser.open("http://localhost:5173")

    return VisualizedGraph(graph, manager, edge_lookup, server_thread)
