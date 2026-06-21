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
        self.states = {}

    def _build_full_id(self, run: Run) -> str | None:
        parts = [run.name]
        current = run
        top_container = None
        while current.parent_run_id:
            parent = self.run_map.get(str(current.parent_run_id))
            if parent is None:
                break
            if parent.name == "LangGraph":
                current = parent
                continue
            if parent.name in self.viewport.node_names:
                top_container = parent.name
                break
            parts.append(parent.name)
            current = parent
        if top_container is None:
            return None
        parts.reverse()
        full_id = f"{top_container}:{':'.join(parts)}"
        if full_id in self.viewport.predecessors:
            return full_id

    async def _persist_run(self, run: Run) -> None:
        pass

    async def _emit_end(self, run: Run) -> None:
        node_run_id = str(run.parent_run_id) if run.parent_run_id else None
        if node_run_id is None:
            return
        state = self.states.get(run.name)
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
                "metrics": Formatter.metrics(run),
                "state": json.dumps(
                    state,
                    ensure_ascii=False,
                    default=lambda x: x.__dict__,
                ) if state else None,
            }
        )

    async def _on_chain_start(self, run: Run) -> None:
        self.states[run.name] = run.inputs
        if run.name in self.viewport.node_names:
            self.viewport.node_current = run.name
            await self.viewport._emit_edge(run.name)
        else:
            if (full_id := self._build_full_id(run)) is not None:
                await self.viewport._emit_edge(full_id)

    async def _on_chain_end(self, run: Run) -> None:
        async def emit_last_edge(run_name):
            end_id = f"{run_name}:__end__"
            if end_id in self.viewport.predecessors:
                await self.viewport._emit_edge(end_id)

        if run.name in self.viewport.node_names:
            parent = (
                self.run_map.get(str(run.parent_run_id)) if run.parent_run_id else None
            )
            if parent is None or parent.name not in self.viewport.node_names:
                state = self.states.get(run.name)
                await self.viewport.broadcast(
                    {
                        "type": "node_output",
                        "node_id": run.name,
                        "run_id": str(run.id),
                        "node_kind": run.run_type,
                        "status": "error" if run.error else "ok",
                        "input": Formatter.inputs(run),
                        "output": Formatter.outputs(run),
                        "metrics": Formatter.metrics(run),
                        "state": json.dumps(
                            state,
                            ensure_ascii=False,
                            default=lambda x: x.__dict__,
                        ) if state else None,
                    }
                )
                await emit_last_edge(run.name)
        else:
            if (full_id := self._build_full_id(run)) is not None:
                await emit_last_edge(full_id)
            await self._emit_end(run)

    async def _on_chain_error(self, run: Run) -> None:
        if run.name in self.viewport.node_names:
            parent = self.run_map.get(str(run.parent_run_id)) if run.parent_run_id else None
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
                        "metrics": Formatter.metrics(run),
                        "state": json.dumps(
                            self.states.get(run.name),
                            ensure_ascii=False,
                            default=lambda x: x.__dict__,
                        ) if self.states.get(run.name) else None,
                    }
                )
        else:
            await self._emit_end(run)

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
        self.predecessors: dict[str, set[str]] = {}
        for src, tgt in edge_lookup:
            self.predecessors.setdefault(tgt, set()).add(src)
        self.generation: dict[str, int] = {
            n: 0 for pair in edge_lookup for n in pair
            if n == "__start__" or n.endswith(":__start__")
        }
        self.node_names: set[str] = {
            n for pair in edge_lookup for n in pair
            if ":" not in n and n not in {"__start__", "__end__"}
        }
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

    async def _emit_error(self, source: str) -> None:
        target, edge_id = source, None
        for (src, tgt), eid in self.edge_lookup.items():
            if src == source:
                target, edge_id = tgt, eid
                break
        await self.broadcast(
            {
                "type": "error",
                "source": source,
                "target": target,
                "edge_id": edge_id,
            }
        )

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
        kwargs.pop("subgraphs", None)

        try:
            async for namespace, chunk in self.graph.astream(
                input, config=merged_config, stream_mode="updates", subgraphs=True, **kwargs
            ):
                if isinstance(chunk, dict) and not namespace:
                    for node_name, node_result in chunk.items():
                        if node_name == "__metadata__":
                            continue
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
        kwargs.pop("subgraphs", None)

        try:
            async for namespace, chunk in self.graph.astream(
                input, config=merged_config, subgraphs=True, **kwargs
            ):
                if isinstance(chunk, dict) and stream_mode == "updates" and not namespace:
                    for node_name in chunk:
                        if node_name == "__metadata__":
                            continue
                        last_node = node_name
                if not namespace:
                    yield chunk

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
