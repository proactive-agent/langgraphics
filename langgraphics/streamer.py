"""VisualizedGraph wrapper that intercepts graph execution and broadcasts events."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator
from socketserver import TCPServer
from typing import TYPE_CHECKING, Any

from langgraphics import protocol

if TYPE_CHECKING:
    from langgraphics.server import ConnectionManager


class VisualizedGraph:
    """
    Wraps a compiled LangGraph (Pregel) and broadcasts execution events
    to connected WebSocket clients.

    Supports ainvoke() and astream() with real-time event streaming.
    Also delegates all other attribute access to the underlying graph.
    """

    def __init__(
            self,
            graph: Any,
            ws_manager: ConnectionManager,
            edge_lookup: dict[tuple[str, str], str],
            http_server: TCPServer,
    ) -> None:
        self._graph = graph
        self._ws = ws_manager
        self._edge_lookup = edge_lookup
        self._http_server = http_server

    def __getattr__(self, name: str) -> Any:
        # Delegate anything not explicitly defined to the underlying graph
        return getattr(self._graph, name)

    async def _broadcast(self, message: str) -> None:
        """Broadcast a message to all connected WS clients, waiting for delivery."""
        if self._ws._loop is None:
            return
        future = asyncio.run_coroutine_threadsafe(
            self._ws.broadcast(message), self._ws._loop
        )
        # Wrap the concurrent.futures.Future into an asyncio.Future so we can
        # await it without blocking the caller's event loop.
        try:
            await asyncio.wrap_future(future)
        except Exception:
            pass

    def shutdown(self) -> None:
        """Gracefully stop both the HTTP and WebSocket servers.

        1. Closes all WebSocket connections and stops the WS server.
        2. Stops the HTTP server.

        Safe to call multiple times — subsequent calls are no-ops.
        """
        self._ws.shutdown()
        self._http_server.shutdown()
        print("[langgraph-viz] Servers stopped.")

    async def ainvoke(self, input: Any, config: Any = None, **kwargs: Any) -> Any:
        """
        Invoke the graph, streaming execution events to the frontend.

        Uses astream with stream_mode="updates" internally to track
        which nodes execute and in what order.
        """
        run_id = str(uuid.uuid4())[:8]
        await self._broadcast(protocol.run_start_message(run_id))

        last_node: str | None = "__start__"
        result: Any = None

        async for chunk in self._graph.astream(
                input, config=config, stream_mode="updates", **kwargs
        ):
            # In "updates" mode, each chunk is a dict: {node_name: output}
            if isinstance(chunk, dict):
                for node_name in chunk:
                    if node_name == "__metadata__":
                        continue

                    # Emit edge_active if we can infer the transition
                    edge_key = (last_node, node_name)
                    edge_id = self._edge_lookup.get(edge_key)
                    if edge_id:
                        await self._broadcast(
                            protocol.edge_active_message(last_node, node_name, edge_id)
                        )

                    last_node = node_name
                    result = chunk[node_name]

        # Emit final edge to __end__
        if last_node is not None:
            edge_key = (last_node, "__end__")
            edge_id = self._edge_lookup.get(edge_key)
            if edge_id:
                await self._broadcast(
                    protocol.edge_active_message(last_node, "__end__", edge_id)
                )

        await asyncio.sleep(1)
        await self._broadcast(protocol.run_end_message(run_id))
        self.shutdown()
        return result

    async def astream(
            self, input: Any, config: Any = None, **kwargs: Any
    ) -> AsyncIterator:
        """
        Stream graph execution, forwarding events to the frontend while
        yielding chunks to the caller as normal.
        """
        run_id = str(uuid.uuid4())[:8]
        await self._broadcast(protocol.run_start_message(run_id))

        last_node: str = "__start__"
        stream_mode = kwargs.get("stream_mode", "values")

        async for chunk in self._graph.astream(input, config=config, **kwargs):
            # Try to extract node info from updates-style chunks
            if isinstance(chunk, dict) and stream_mode == "updates":
                for node_name in chunk:
                    if node_name == "__metadata__":
                        continue
                    task_id = str(uuid.uuid4())[:8]

                    edge_key = (last_node, node_name)
                    edge_id = self._edge_lookup.get(edge_key)
                    if edge_id:
                        await self._broadcast(
                            protocol.edge_active_message(last_node, node_name, edge_id)
                        )

                    last_node = node_name

            yield chunk

        # Emit final edge to __end__
        if last_node != "__start__":
            edge_key = (last_node, "__end__")
            edge_id = self._edge_lookup.get(edge_key)
            if edge_id:
                await self._broadcast(
                    protocol.edge_active_message(last_node, "__end__", edge_id)
                )

        await self._broadcast(protocol.run_end_message(run_id))

    def invoke(self, input: Any, config: Any = None, **kwargs: Any) -> Any:
        """Synchronous invoke — runs ainvoke in an event loop."""
        return asyncio.run(self.ainvoke(input, config=config, **kwargs))
