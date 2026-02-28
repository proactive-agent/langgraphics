import asyncio
import json
import uuid
from collections.abc import AsyncIterator, Iterator
from socketserver import TCPServer
from typing import Any

from langchain_core.tracers.base import AsyncBaseTracer
from langchain_core.tracers.schemas import Run

from .formatter import Formatter


class BroadcastingTracer(AsyncBaseTracer):
    def __init__(self, viewport: "Viewport") -> None:
        super().__init__(_schema_format="original+chat")
        self.viewport = viewport

    async def _persist_run(self, run: Run) -> None:
        pass

    async def _emit_end(self, run: Run) -> None:
        node_run_id = str(run.parent_run_id) if run.parent_run_id else None
        if node_run_id is None:
            return
        await self.viewport.broadcast(
            {
                "type": "node_output",
                "run_id": str(run.id),
                "parent_run_id": node_run_id,
                "node_id": run.name,
                "node_kind": run.run_type,
                "status": "error" if run.error else "ok",
                "input": Formatter.inputs(run),
                "output": Formatter.outputs(run),
            }
        )

    async def _on_chain_start(self, run: Run) -> None:
        if run.name in self.viewport.node_names:
            self.viewport.node_current = run.name

    async def _on_chain_end(self, run: Run) -> None:
        if run.name in self.viewport.node_names:
            parent = (
                self.run_map.get(str(run.parent_run_id)) if run.parent_run_id else None
            )
            if parent is None or parent.name not in self.viewport.node_names:
                await self.viewport.broadcast(
                    {
                        "type": "node_output",
                        "node_id": run.name,
                        "run_id": str(run.id),
                        "node_kind": run.run_type,
                        "status": "error" if run.error else "ok",
                        "input": Formatter.inputs(run),
                        "output": Formatter.outputs(run),
                    }
                )
        else:
            await self._emit_end(run)

    async def _on_chain_error(self, run: Run) -> None:
        await self._on_chain_end(run)

    async def _on_llm_end(self, run: Run) -> None:
        await self._emit_end(run)

    async def _on_llm_error(self, run: Run) -> None:
        await self._emit_end(run)

    async def _on_tool_end(self, run: Run) -> None:
        await self._emit_end(run)

    async def _on_tool_error(self, run: Run) -> None:
        await self._emit_end(run)

    async def _on_retriever_end(self, run: Run) -> None:
        await self._emit_end(run)

    async def _on_retriever_error(self, run: Run) -> None:
        await self._emit_end(run)


class Viewport:
    def __init__(
        self,
        graph: Any,
        ws: Any,
        edge_lookup: dict[tuple[str, str], str],
        http_server: TCPServer,
    ) -> None:
        self.ws = ws
        self.graph = graph
        self.node_current = None
        self.edge_lookup = edge_lookup
        self.http_server = http_server
        self.node_names: set[str] = set()
        self.predecessors: dict[str, set[str]] = {}
        for src, tgt in edge_lookup:
            self.node_names.add(src)
            self.node_names.add(tgt)
            self.predecessors.setdefault(tgt, set()).add(src)
        self.node_names -= {"__start__", "__end__"}
        self.generation: dict[str, int] = {"__start__": 0}
        self.linked: set[tuple[str, int, str]] = set()

    def __getattr__(self, name: str) -> Any:
        return getattr(self.graph, name)

    async def broadcast(self, message: dict[str, Any]) -> None:
        message_str = json.dumps(message)
        self.ws.record(message_str)
        if self.ws.loop is None:
            return
        try:
            await asyncio.wrap_future(
                asyncio.run_coroutine_threadsafe(
                    self.ws.broadcast(message_str), self.ws.loop
                )
            )
        except Exception:
            pass

    async def _emit_edge(self, target: str) -> None:
        for source in self.predecessors.get(target, set()):
            if (src_gen := self.generation.get(source)) is None:
                continue
            if (key := (source, src_gen, target)) in self.linked:
                continue
            self.linked.add(key)
            if edge_id := self.edge_lookup.get((source, target)):
                await self.broadcast(
                    {
                        "type": "edge_active",
                        "source": source,
                        "target": target,
                        "edge_id": edge_id,
                    }
                )
        self.generation[target] = self.generation.get(target, -1) + 1

    async def _emit_error(self, last_node: str) -> None:
        for (src, tgt), eid in self.edge_lookup.items():
            if src == last_node and tgt == self.node_current:
                await self.broadcast(
                    {
                        "type": "error",
                        "edge_id": eid,
                        "source": last_node,
                        "target": self.node_current,
                    }
                )
                break

    def _make_config(self, config: Any) -> dict[str, Any]:
        tracer = BroadcastingTracer(self)
        merged: dict[str, Any] = dict(config or {})
        merged["callbacks"] = list(merged.get("callbacks") or []) + [tracer]
        return merged

    async def shutdown(self) -> None:
        await self.ws.shutdown()
        self.http_server.shutdown()

    async def ainvoke(self, input: Any, config: Any = None, **kwargs: Any) -> Any:
        run_id = uuid.uuid4().hex[:8]
        await self.broadcast({"type": "run_start", "run_id": run_id})

        result: Any = None
        last_node = "__start__"
        merged_config = self._make_config(config)

        try:
            async for chunk in self.graph.astream(
                input, config=merged_config, stream_mode="updates", **kwargs
            ):
                if isinstance(chunk, dict):
                    for node_name, node_result in chunk.items():
                        if node_name == "__metadata__":
                            continue
                        await self._emit_edge(node_name)
                        last_node = node_name
                        result = node_result

            await self._emit_edge("__end__")
            await self.broadcast({"type": "run_end", "run_id": run_id})
        except Exception:
            await self._emit_error(last_node)
            raise
        finally:
            await self.shutdown()

        return result

    def invoke(self, input: Any, config: Any = None, **kwargs: Any) -> Any:
        return asyncio.run(self.ainvoke(input, config=config, **kwargs))

    async def astream(
        self, input: Any, config: Any = None, **kwargs: Any
    ) -> AsyncIterator:
        run_id = uuid.uuid4().hex[:8]
        await self.broadcast({"type": "run_start", "run_id": run_id})

        last_node = "__start__"
        merged_config = self._make_config(config)
        stream_mode = kwargs.get("stream_mode", "values")

        try:
            async for chunk in self.graph.astream(
                input, config=merged_config, **kwargs
            ):
                if isinstance(chunk, dict) and stream_mode == "updates":
                    for node_name in chunk:
                        if node_name == "__metadata__":
                            continue
                        await self._emit_edge(node_name)
                        last_node = node_name
                yield chunk

            if len(self.generation) > 1:
                await self._emit_edge("__end__")

            await self.broadcast({"type": "run_end", "run_id": run_id})
        except Exception:
            await self._emit_error(last_node)
            raise

    def stream(self, input: Any, config: Any = None, **kwargs: Any) -> Iterator:
        loop = asyncio.new_event_loop()
        ait = self.astream(input, config=config, **kwargs).__aiter__()
        try:
            while True:
                try:
                    yield loop.run_until_complete(ait.__anext__())
                except StopAsyncIteration:
                    break
        finally:
            loop.close()
