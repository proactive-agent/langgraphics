import asyncio
import json
import uuid
from collections.abc import AsyncIterator
from socketserver import TCPServer
from typing import Any

from langchain_core.tracers.base import AsyncBaseTracer
from langchain_core.tracers.schemas import Run


def parse_message(msg: Any) -> dict | list:
    msg = dict(msg)
    msg = msg.get("kwargs", msg)
    if tool_calls := msg.get("tool_calls", []):
        tool_call = tool_calls[0]
        return {
            "content": tool_call.get("name", "")
            + "("
            + str(tool_call.get("args", {}))
            + ")",
            "type": tool_call.get("type", ""),
        }
    for k in ("input", "output", "summary", "answer", "result"):
        if res := msg.get(k):
            if isinstance(res, list) and res:
                try:
                    return parse_message(res[0].update)
                except AttributeError:
                    parse_message(res[0])
            elif isinstance(res, dict):
                return res
            elif res.__class__.__module__ != "builtins":
                return parse_message(res)
            else:
                return {k: res}
    return {
        k: msg[k]
        for k in ("content", "question", "prompt", "query", "type")
        if k in msg
    }


def preview(inputs: Any) -> str:
    messages = []
    inputs = inputs or {}
    if "generations" in inputs:
        inputs = inputs["generations"][-1][-1]["message"]
    inputs = inputs.get("messages", inputs)
    if isinstance(inputs, list):
        if inputs:
            messages = inputs
            if isinstance(inputs[0], list):
                messages = inputs[0]
    elif isinstance(inputs, dict):
        inputs = inputs.get("state", inputs)
        messages = inputs.get("messages", inputs)
        if isinstance(messages, dict):
            messages = [messages]
    return json.dumps(list(map(parse_message, messages)), indent=4)


class BroadcastingTracer(AsyncBaseTracer):
    def __init__(self, broadcast: Any, node_names: set[str]) -> None:
        super().__init__(_schema_format="original+chat")
        self.broadcast = broadcast
        self.node_names = node_names
        self.node_kinds: dict[str, str] = {}

    async def _persist_run(self, run: Run) -> None:
        pass

    async def _emit_end(self, run: Run) -> None:
        node_run_id = str(run.parent_run_id) if run.parent_run_id else None
        if node_run_id is None:
            return
        await self.broadcast(
            {
                "type": "node_output",
                "run_id": str(run.id),
                "parent_run_id": node_run_id,
                "node_id": run.name,
                "node_kind": run.run_type,
                "status": "error" if run.error else "ok",
                "input": preview(run.inputs),
                "output": preview(run.outputs),
            }
        )

    async def _on_chain_end(self, run: Run) -> None:
        self.node_kinds[run.name] = run.run_type
        if run.name in self.node_names:
            parent = (
                self.run_map.get(str(run.parent_run_id)) if run.parent_run_id else None
            )
            if parent is None or parent.name not in self.node_names:
                await self.broadcast(
                    {
                        "type": "node_output",
                        "node_id": run.name,
                        "run_id": str(run.id),
                        "node_kind": self.node_kinds.get(run.name),
                        "input": preview(run.inputs),
                        "output": preview(run.outputs),
                    }
                )
        else:
            await self._emit_end(run)

    async def _on_chain_error(self, run: Run) -> None:
        self.node_kinds[run.name] = run.run_type
        if run.name not in self.node_names:
            await self._emit_end(run)

    async def _on_llm_end(self, run: Run) -> None:
        self.node_kinds[run.name] = run.run_type
        await self._emit_end(run)

    async def _on_llm_error(self, run: Run) -> None:
        self.node_kinds[run.name] = run.run_type
        await self._emit_end(run)

    async def _on_tool_end(self, run: Run) -> None:
        self.node_kinds[run.name] = run.run_type
        await self._emit_end(run)

    async def _on_tool_error(self, run: Run) -> None:
        self.node_kinds[run.name] = run.run_type
        await self._emit_end(run)

    async def _on_retriever_end(self, run: Run) -> None:
        self.node_kinds[run.name] = run.run_type
        await self._emit_end(run)

    async def _on_retriever_error(self, run: Run) -> None:
        self.node_kinds[run.name] = run.run_type
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
        self.edge_lookup = edge_lookup
        self.http_server = http_server
        node_names: set[str] = set()
        for src, tgt in edge_lookup:
            node_names.add(src)
            node_names.add(tgt)
        node_names -= {"__start__", "__end__"}
        self._node_names = node_names

    def __getattr__(self, name: str) -> Any:
        return getattr(self.graph, name)

    async def _broadcast(self, message: dict[str, Any]) -> None:
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

    def _make_config(self, config: Any) -> tuple[dict[str, Any], BroadcastingTracer]:
        tracer = BroadcastingTracer(self._broadcast, self._node_names)
        merged: dict[str, Any] = dict(config or {})
        merged["callbacks"] = list(merged.get("callbacks") or []) + [tracer]
        return merged, tracer

    async def shutdown(self) -> None:
        await self.ws.shutdown()
        self.http_server.shutdown()

    async def ainvoke(self, input: Any, config: Any = None, **kwargs: Any) -> Any:
        run_id = uuid.uuid4().hex[:8]
        await self._broadcast({"type": "run_start", "run_id": run_id})

        result: Any = None
        last_node = "__start__"
        merged_config, _ = self._make_config(config)

        try:
            async for chunk in self.graph.astream(
                input, config=merged_config, stream_mode="updates", **kwargs
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
            await self.shutdown()

        return result

    async def astream(
        self, input: Any, config: Any = None, **kwargs: Any
    ) -> AsyncIterator:
        run_id = uuid.uuid4().hex[:8]
        await self._broadcast({"type": "run_start", "run_id": run_id})

        last_node = "__start__"
        merged_config, _ = self._make_config(config)
        stream_mode = kwargs.get("stream_mode", "values")

        try:
            async for chunk in self.graph.astream(
                input, config=merged_config, **kwargs
            ):
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
