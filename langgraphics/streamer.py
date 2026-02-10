import asyncio
import json
import uuid
from collections.abc import AsyncIterator
from socketserver import TCPServer
from typing import Any


class VisualizedGraph:
    def __init__(
        self,
        graph: Any,
        ws_manager: Any,
        edge_lookup: dict[tuple[str, str], str],
        http_server: TCPServer,
    ) -> None:
        self._graph = graph
        self._ws = ws_manager
        self._edge_lookup = edge_lookup
        self._http_server = http_server

    def __getattr__(self, name: str) -> Any:
        return getattr(self._graph, name)

    @staticmethod
    def _run_start(run_id: str) -> str:
        return json.dumps({"type": "run_start", "run_id": run_id})

    @staticmethod
    def _run_end(run_id: str) -> str:
        return json.dumps({"type": "run_end", "run_id": run_id})

    @staticmethod
    def _edge_active(source: str, target: str, edge_id: str) -> str:
        return json.dumps(
            {
                "type": "edge_active",
                "source": source,
                "target": target,
                "edge_id": edge_id,
            }
        )

    async def _broadcast(self, message: str) -> None:
        if self._ws._loop is None:
            return
        try:
            await asyncio.wrap_future(
                asyncio.run_coroutine_threadsafe(
                    self._ws.broadcast(message), self._ws._loop
                )
            )
        except Exception:
            pass

    def shutdown(self) -> None:
        self._ws.shutdown()
        self._http_server.shutdown()
        print("[langgraphics] Servers stopped.")

    async def ainvoke(self, input: Any, config: Any = None, **kwargs: Any) -> Any:
        run_id = str(uuid.uuid4())[:8]
        await self._broadcast(self._run_start(run_id))

        last_node: str | None = "__start__"
        result: Any = None

        async for chunk in self._graph.astream(
            input, config=config, stream_mode="updates", **kwargs
        ):
            if isinstance(chunk, dict):
                for node_name in chunk:
                    if node_name == "__metadata__":
                        continue
                    edge_id = self._edge_lookup.get((last_node, node_name))
                    if edge_id:
                        await self._broadcast(
                            self._edge_active(last_node, node_name, edge_id)
                        )
                    last_node = node_name
                    result = chunk[node_name]

        edge_id = self._edge_lookup.get((last_node, "__end__"))
        if edge_id:
            await self._broadcast(self._edge_active(last_node, "__end__", edge_id))

        await asyncio.sleep(1)
        await self._broadcast(self._run_end(run_id))
        self.shutdown()
        return result

    async def astream(
        self, input: Any, config: Any = None, **kwargs: Any
    ) -> AsyncIterator:
        run_id = str(uuid.uuid4())[:8]
        await self._broadcast(self._run_start(run_id))

        last_node: str = "__start__"
        stream_mode = kwargs.get("stream_mode", "values")

        async for chunk in self._graph.astream(input, config=config, **kwargs):
            if isinstance(chunk, dict) and stream_mode == "updates":
                for node_name in chunk:
                    if node_name == "__metadata__":
                        continue
                    edge_id = self._edge_lookup.get((last_node, node_name))
                    if edge_id:
                        await self._broadcast(
                            self._edge_active(last_node, node_name, edge_id)
                        )
                    last_node = node_name
            yield chunk

        edge_id = self._edge_lookup.get((last_node, "__end__"))
        if last_node != "__start__" and edge_id:
            await self._broadcast(self._edge_active(last_node, "__end__", edge_id))

        await self._broadcast(self._run_end(run_id))

    def invoke(self, input: Any, config: Any = None, **kwargs: Any) -> Any:
        return asyncio.run(self.ainvoke(input, config=config, **kwargs))
