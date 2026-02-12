import asyncio
import json
import uuid
from collections.abc import AsyncIterator
from socketserver import TCPServer
from typing import Any


class Viewport:
    def __init__(
        self,
        graph: Any,
        ws: Any,
        edge_lookup: dict[tuple[str, str], str],
        http_server: TCPServer,
    ) -> None:
        self.graph = graph
        self.ws = ws
        self.edge_lookup = edge_lookup
        self.http_server = http_server

    def __getattr__(self, name: str) -> Any:
        return getattr(self.graph, name)

    async def _broadcast(self, message: dict[str, Any]) -> None:
        if self.ws.loop is None:
            return
        try:
            await asyncio.wrap_future(
                asyncio.run_coroutine_threadsafe(
                    self.ws.broadcast(json.dumps(message)), self.ws.loop
                )
            )
        except Exception:
            pass

    async def _emit_edge(self, source: str, target: str) -> None:
        edge_id = self.edge_lookup.get((source, target))
        if edge_id:
            await self._broadcast(
                {
                    "type": "edge_active",
                    "source": source,
                    "target": target,
                    "edge_id": edge_id,
                }
            )

    async def _emit_error(self, last_node: str) -> None:
        target = last_node
        edge_id = None
        for (src, tgt), eid in self.edge_lookup.items():
            if src == last_node:
                target = tgt
                edge_id = eid
                break

        await self._broadcast(
            {"type": "error", "source": last_node, "target": target, "edge_id": edge_id}
        )

    def shutdown(self) -> None:
        self.ws.shutdown()
        self.http_server.shutdown()
        print("[langgraphics] Servers stopped.")

    async def ainvoke(self, input: Any, config: Any = None, **kwargs: Any) -> Any:
        run_id = uuid.uuid4().hex[:8]
        await self._broadcast({"type": "run_start", "run_id": run_id})

        last_node = "__start__"
        result: Any = None

        try:
            async for chunk in self.graph.astream(
                input, config=config, stream_mode="updates", **kwargs
            ):
                if isinstance(chunk, dict):
                    for node_name in chunk:
                        if node_name == "__metadata__":
                            continue
                        await self._emit_edge(last_node, node_name)
                        last_node = node_name
                        result = chunk[node_name]

            await self._emit_edge(last_node, "__end__")
            await asyncio.sleep(1)
            await self._broadcast({"type": "run_end", "run_id": run_id})
        except Exception:
            await self._emit_error(last_node)
            raise
        finally:
            self.shutdown()

        return result

    async def astream(
        self, input: Any, config: Any = None, **kwargs: Any
    ) -> AsyncIterator:
        run_id = uuid.uuid4().hex[:8]
        await self._broadcast({"type": "run_start", "run_id": run_id})

        last_node = "__start__"
        stream_mode = kwargs.get("stream_mode", "values")

        try:
            async for chunk in self.graph.astream(input, config=config, **kwargs):
                if isinstance(chunk, dict) and stream_mode == "updates":
                    for node_name in chunk:
                        if node_name == "__metadata__":
                            continue
                        await self._emit_edge(last_node, node_name)
                        last_node = node_name
                yield chunk

            if last_node != "__start__":
                await self._emit_edge(last_node, "__end__")

            await self._broadcast({"type": "run_end", "run_id": run_id})
        except Exception:
            await self._emit_error(last_node)
            raise

    def invoke(self, input: Any, config: Any = None, **kwargs: Any) -> Any:
        return asyncio.run(self.ainvoke(input, config=config, **kwargs))
