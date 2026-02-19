import asyncio
import json
import uuid
from collections.abc import AsyncIterator
from socketserver import TCPServer
from typing import Any

from langchain_core.tracers.base import AsyncBaseTracer
from langchain_core.tracers.schemas import Run


def _serialize_state(state: Any) -> Any:
    if isinstance(state, dict):
        return {k: _serialize_state(v) for k, v in state.items()}
    if isinstance(state, (list, tuple)):
        return [_serialize_state(item) for item in state]
    if hasattr(state, "model_dump"):
        return state.model_dump()
    try:
        json.dumps(state)
        return state
    except (TypeError, ValueError):
        return str(state)


def _elapsed_ms(run: Run) -> float | None:
    if run.end_time is None or run.start_time is None:
        return None
    return (run.end_time - run.start_time).total_seconds() * 1000


def _extract_message_content(msg: Any) -> str:
    if isinstance(msg, dict):
        tool_calls = msg.get("kwargs", {}).get("tool_calls")
        if tool_calls:
            names = [tc.get("name", "?") for tc in tool_calls]
            return f"tool_calls={names}"
        return msg.get("kwargs", {}).get("content", "") or msg.get("content", "")
    return getattr(msg, "content", str(msg))


def _output_preview(run: Run) -> str:
    if not run.outputs:
        return ""
    out = run.outputs
    if run.run_type in ("llm", "chat_model"):
        gens = out.get("generations", [[]])[0]
        if gens:
            msg = gens[0].get("message") or gens[0].get("text", "")
            text = _extract_message_content(msg)
            if text:
                return text
    if run.run_type == "tool":
        result = out.get("output", "")
        return getattr(result, "content", None) or str(result)
    for key in ("output", "summary", "answer", "result"):
        if key in out:
            return str(out[key])
    messages = out.get("messages", [])
    if isinstance(messages, list) and messages:
        content = _extract_message_content(messages[-1])
        if content:
            return str(content)
    return ""


def _input_preview(run: Run) -> str:
    if not run.inputs:
        return ""
    inp = run.inputs
    messages = inp.get("messages", [])
    if isinstance(messages, list) and messages:
        flat = (
            messages[-1]
            if not isinstance(messages[-1], list)
            else messages[-1][-1]
            if messages[-1]
            else None
        )
        if flat is not None:
            content = _extract_message_content(flat)
            if content:
                return str(content)
    for key in ("input", "query", "question", "prompt"):
        if key in inp:
            return str(inp[key])
    return ""


class BroadcastingTracer(AsyncBaseTracer):
    def __init__(self, broadcast: Any, node_names: set[str]) -> None:
        super().__init__(_schema_format="original+chat")
        self.broadcast = broadcast
        self.node_names = node_names
        self.node_kinds: dict[str, str] = {}

    async def _persist_run(self, run: Run) -> None:
        pass

    def _find_ancestor_node(self, run: Run) -> str | None:
        parent_id = run.parent_run_id
        while parent_id is not None:
            parent = self.run_map.get(str(parent_id))
            if parent is None:
                break
            if parent.name in self.node_names:
                return str(parent.id)
            parent_id = parent.parent_run_id
        return None

    async def _emit_start(self, run: Run) -> None:
        node_run_id = self._find_ancestor_node(run)
        if node_run_id is None:
            return
        await self.broadcast(
            {
                "type": "node_step",
                "event": "start",
                "run_id": str(run.id),
                "parent_run_id": node_run_id,
                "name": run.name,
                "step_kind": run.run_type,
                "input_preview": _input_preview(run),
            }
        )

    async def _emit_end(self, run: Run) -> None:
        node_run_id = self._find_ancestor_node(run)
        if node_run_id is None:
            return
        await self.broadcast(
            {
                "type": "node_step",
                "event": "end",
                "run_id": str(run.id),
                "parent_run_id": node_run_id,
                "name": run.name,
                "step_kind": run.run_type,
                "elapsed_ms": _elapsed_ms(run),
                "status": "error" if run.error else "ok",
                "output_preview": _output_preview(run),
            }
        )

    async def _on_chain_start(self, run: Run) -> None:
        if run.name not in self.node_names:
            await self._emit_start(run)

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
                        "display": _output_preview(run),
                        "input_display": _input_preview(run),
                    }
                )
        else:
            await self._emit_end(run)

    async def _on_chain_error(self, run: Run) -> None:
        self.node_kinds[run.name] = run.run_type
        if run.name not in self.node_names:
            await self._emit_end(run)

    async def _on_llm_start(self, run: Run) -> None:
        await self._emit_start(run)

    async def _on_chat_model_start(self, run: Run) -> None:
        await self._emit_start(run)

    async def _on_llm_end(self, run: Run) -> None:
        self.node_kinds[run.name] = run.run_type
        await self._emit_end(run)

    async def _on_llm_error(self, run: Run) -> None:
        self.node_kinds[run.name] = run.run_type
        await self._emit_end(run)

    async def _on_tool_start(self, run: Run) -> None:
        await self._emit_start(run)

    async def _on_tool_end(self, run: Run) -> None:
        self.node_kinds[run.name] = run.run_type
        await self._emit_end(run)

    async def _on_tool_error(self, run: Run) -> None:
        self.node_kinds[run.name] = run.run_type
        await self._emit_end(run)

    async def _on_retriever_start(self, run: Run) -> None:
        await self._emit_start(run)

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
