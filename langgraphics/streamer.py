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


def _merge_state(base: dict[str, Any], update: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for k, v in update.items():
        if isinstance(v, list) and isinstance(merged.get(k), list):
            merged[k] = merged[k] + v
        else:
            merged[k] = v
    return merged


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


_STEP_KIND_MAP: dict[str, str] = {
    "llm": "llm",
    "chat_model": "llm",
    "tool": "tool",
    "retriever": "retriever",
    "chain": "chain",
}

_KIND_PRIORITY: list[str] = ["llm", "tool", "retriever", "chain"]


def _step_kind(run: Run) -> str | None:
    return _STEP_KIND_MAP.get(run.run_type or "")


def _best_kind(current: str, candidate: str) -> str:
    if candidate not in _KIND_PRIORITY:
        return current
    if _KIND_PRIORITY.index(candidate) < _KIND_PRIORITY.index(current):
        return candidate
    return current


def _display_text(data: Any) -> str | None:
    if not isinstance(data, dict):
        return None
    messages = data.get("messages", [])
    if isinstance(messages, list) and messages:
        last = messages[-1]
        if isinstance(last, dict):
            content = last.get("content") or last.get("kwargs", {}).get("content", "")
            if content:
                return str(content)
        text = getattr(last, "content", None)
        if text:
            return str(text)
    for key in ("output", "summary", "answer", "result", "input", "query"):
        if key in data and data[key]:
            return str(data[key])
    return None


class BroadcastingTracer(AsyncBaseTracer):
    def __init__(self, broadcast: Any, node_names: set[str]) -> None:
        super().__init__(_schema_format="original+chat")
        self._broadcast_fn = broadcast
        self._node_names = node_names
        self.node_run_ids: dict[str, str] = {}
        self.node_kinds: dict[str, str] = {}

    async def _persist_run(self, run: Run) -> None:
        pass

    def _find_ancestor_node(self, run: Run) -> str | None:
        parent_id = run.parent_run_id
        while parent_id is not None:
            parent = self.run_map.get(str(parent_id))
            if parent is None:
                break
            if parent.name in self._node_names:
                return str(parent.id)
            parent_id = parent.parent_run_id
        return None

    async def _emit_start(self, run: Run) -> None:
        node_run_id = self._find_ancestor_node(run)
        if node_run_id is None:
            return
        await self._broadcast_fn(
            {
                "name": run.name,
                "event": "start",
                "type": "node_step",
                "run_id": str(run.id),
                "step_kind": _step_kind(run),
                "input_preview": _input_preview(run),
                "parent_run_id": node_run_id,
            }
        )

    async def _emit_end(self, run: Run) -> None:
        node_run_id = self._find_ancestor_node(run)
        if node_run_id is None:
            return
        await self._broadcast_fn(
            {
                "name": run.name,
                "event": "end",
                "type": "node_step",
                "run_id": str(run.id),
                "step_kind": _step_kind(run),
                "elapsed_ms": _elapsed_ms(run),
                "status": "error" if run.error else "ok",
                "output_preview": _output_preview(run),
                "parent_run_id": node_run_id,
            }
        )

    async def _on_chain_start(self, run: Run) -> None:
        if run.name in self._node_names:
            parent = (
                self.run_map.get(str(run.parent_run_id)) if run.parent_run_id else None
            )
            if parent is None or parent.name not in self._node_names:
                self.node_run_ids[run.name] = str(run.id)
        else:
            await self._emit_start(run)

    def _record_kind(self, run: Run) -> None:
        kind = _step_kind(run)
        if kind is None:
            return
        node_name = self._find_ancestor_node_name(run)
        if node_name is not None:
            self.node_kinds[node_name] = _best_kind(
                self.node_kinds.get(node_name, "chain"), kind
            )

    def _find_ancestor_node_name(self, run: Run) -> str | None:
        if run.name in self._node_names:
            return run.name
        parent_id = run.parent_run_id
        while parent_id is not None:
            parent = self.run_map.get(str(parent_id))
            if parent is None:
                break
            if parent.name in self._node_names:
                return parent.name
            parent_id = parent.parent_run_id
        return None

    async def _on_chain_end(self, run: Run) -> None:
        self._record_kind(run)
        if run.name not in self._node_names:
            await self._emit_end(run)

    async def _on_chain_error(self, run: Run) -> None:
        self._record_kind(run)
        if run.name not in self._node_names:
            await self._emit_end(run)

    async def _on_llm_start(self, run: Run) -> None:
        await self._emit_start(run)

    async def _on_chat_model_start(self, run: Run) -> None:
        await self._emit_start(run)

    async def _on_llm_end(self, run: Run) -> None:
        self._record_kind(run)
        await self._emit_end(run)

    async def _on_llm_error(self, run: Run) -> None:
        self._record_kind(run)
        await self._emit_end(run)

    async def _on_tool_start(self, run: Run) -> None:
        await self._emit_start(run)

    async def _on_tool_end(self, run: Run) -> None:
        self._record_kind(run)
        await self._emit_end(run)

    async def _on_tool_error(self, run: Run) -> None:
        self._record_kind(run)
        await self._emit_end(run)

    async def _on_retriever_start(self, run: Run) -> None:
        await self._emit_start(run)

    async def _on_retriever_end(self, run: Run) -> None:
        self._record_kind(run)
        await self._emit_end(run)

    async def _on_retriever_error(self, run: Run) -> None:
        self._record_kind(run)
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

    async def _emit_node_output(
        self,
        node: str,
        data: Any,
        input_data: Any = None,
        run_id: str | None = None,
        node_kind: str | None = None,
    ) -> None:
        serialized_data = _serialize_state(data)
        serialized_input = (
            _serialize_state(input_data) if input_data is not None else None
        )
        msg: dict[str, Any] = {
            "node_id": node,
            "type": "node_output",
            "display": _display_text(serialized_data),
            "node_kind": node_kind,
        }
        if serialized_input is not None:
            msg["input_display"] = _display_text(serialized_input)
        if run_id is not None:
            msg["run_id"] = run_id
        await self._broadcast(msg)

    async def ainvoke(self, input: Any, config: Any = None, **kwargs: Any) -> Any:
        run_id = uuid.uuid4().hex[:8]
        await self._broadcast({"type": "run_start", "run_id": run_id})

        serialized_input = _serialize_state(input)
        start_data = (
            serialized_input
            if isinstance(serialized_input, dict)
            else {"input": serialized_input}
        )
        await self._emit_node_output("__start__", start_data)

        result: Any = None
        last_node = "__start__"
        merged_config, handler = self._make_config(config)
        accumulated_state: dict[str, Any] = (
            dict(input) if isinstance(input, dict) else {}
        )

        try:
            async for chunk in self.graph.astream(
                input, config=merged_config, stream_mode="updates", **kwargs
            ):
                if isinstance(chunk, dict):
                    for node_name in chunk:
                        if node_name == "__metadata__":
                            continue
                        await self._emit_edge(last_node, node_name)
                        node_output = chunk[node_name]
                        await self._emit_node_output(
                            node_name,
                            node_output,
                            input_data=accumulated_state,
                            run_id=handler.node_run_ids.get(node_name),
                            node_kind=handler.node_kinds.get(node_name),
                        )
                        if isinstance(node_output, dict):
                            accumulated_state = _merge_state(
                                accumulated_state, node_output
                            )
                        last_node = node_name
                        result = node_output

            await self._emit_edge(last_node, "__end__")
            await self._emit_node_output(
                "__end__", accumulated_state, input_data=accumulated_state
            )
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

        serialized_input = _serialize_state(input)
        start_data = (
            serialized_input
            if isinstance(serialized_input, dict)
            else {"input": serialized_input}
        )
        await self._emit_node_output("__start__", start_data)

        last_node = "__start__"
        merged_config, handler = self._make_config(config)
        stream_mode = kwargs.get("stream_mode", "values")
        accumulated_state: dict[str, Any] = (
            dict(input) if isinstance(input, dict) else {}
        )

        try:
            async for chunk in self.graph.astream(
                input, config=merged_config, **kwargs
            ):
                if isinstance(chunk, dict) and stream_mode == "updates":
                    for node_name in chunk:
                        if node_name == "__metadata__":
                            continue
                        await self._emit_edge(last_node, node_name)
                        node_output = chunk[node_name]
                        await self._emit_node_output(
                            node_name,
                            node_output,
                            input_data=accumulated_state,
                            run_id=handler.node_run_ids.get(node_name),
                            node_kind=handler.node_kinds.get(node_name),
                        )
                        if isinstance(node_output, dict):
                            accumulated_state = _merge_state(
                                accumulated_state, node_output
                            )
                        last_node = node_name
                yield chunk

            if last_node != "__start__":
                await self._emit_edge(last_node, "__end__")
                await self._emit_node_output(
                    "__end__", accumulated_state, input_data=accumulated_state
                )

            await self._broadcast({"type": "run_end", "run_id": run_id})
        except Exception:
            await self._emit_error(last_node)
            raise

    def invoke(self, input: Any, config: Any = None, **kwargs: Any) -> Any:
        return asyncio.run(self.ainvoke(input, config=config, **kwargs))
