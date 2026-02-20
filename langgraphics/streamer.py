import asyncio
import json
import uuid
from collections.abc import AsyncIterator, Iterator
from socketserver import TCPServer
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.tracers.base import AsyncBaseTracer
from langchain_core.tracers.schemas import Run


def _format_message(msg: Any) -> dict:
    """Convert a single message to {"content": ..., "type": ...} format."""
    if isinstance(msg, AIMessage) and msg.tool_calls:
        tc = msg.tool_calls[0]
        return {
            "content": f"{tc['name']}({tc['args']})",
            "type": "tool_use",
        }
    if isinstance(msg, BaseMessage):
        content = msg.content
        if isinstance(content, list):
            content = " ".join(
                block.get("text", "") if isinstance(block, dict) else str(block)
                for block in content
            )
        return {"content": content, "type": msg.type}
    # Fallback for plain dicts (e.g., tool run inputs/outputs)
    d = msg if isinstance(msg, dict) else dict(msg)
    d = d.get("kwargs", d)
    if tool_calls := d.get("tool_calls", []):
        tc = tool_calls[0]
        return {
            "content": f"{tc.get('name', '')}({tc.get('args', {})})",
            "type": tc.get("type", "tool_use"),
        }
    for key in ("input", "output", "summary", "answer", "result"):
        if res := d.get(key):
            if isinstance(res, (BaseMessage, dict)):
                return _format_message(res)
            return {"content": str(res), "type": key}
    return {k: d[k] for k in ("content", "question", "prompt", "query", "type") if k in d}


def _extract_messages(data: Any) -> list:
    """Extract a flat list of messages from run inputs or outputs."""
    if not data:
        return []
    # LLM output format: {"generations": [[{"message": BaseMessage, ...}]]}
    if isinstance(data, dict) and "generations" in data:
        gens = data["generations"]
        if gens and gens[-1]:
            gen = gens[-1][-1]
            msg = gen.get("message") if isinstance(gen, dict) else getattr(gen, "message", None)
            return [msg] if msg is not None else []
        return []
    # Unwrap state wrapper if present, then extract messages list
    if isinstance(data, dict):
        data = data.get("state", data)
        msgs = data.get("messages", data)
        if isinstance(msgs, dict):
            return [msgs]
        data = msgs
    # Flatten batched list format [[msg1, msg2], ...]
    if isinstance(data, list):
        if data and isinstance(data[0], list):
            return data[0]
        return data
    return [data]


def preview(inputs: Any) -> str:
    messages = _extract_messages(inputs or {})
    return json.dumps([_format_message(m) for m in messages], indent=4)


def error_output(error: str) -> str:
    return json.dumps([{"content": error, "type": "error"}], indent=4)


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
                "input": preview(run.inputs),
                "output": error_output(run.error) if run.error else preview(run.outputs),
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
                        "input": preview(run.inputs),
                        "output": error_output(run.error) if run.error else preview(run.outputs),
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
        for src, tgt in edge_lookup:
            self.node_names.add(src)
            self.node_names.add(tgt)
        self.node_names -= {"__start__", "__end__"}

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

    async def _emit_edge(self, source: str, target: str) -> None:
        edge_id = self.edge_lookup.get((source, target))
        if edge_id:
            await self.broadcast(
                {
                    "type": "edge_active",
                    "source": source,
                    "target": target,
                    "edge_id": edge_id,
                }
            )

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
                    for node_name in chunk:
                        if node_name == "__metadata__":
                            continue
                        await self._emit_edge(last_node, node_name)
                        last_node = node_name
                        result = chunk[node_name]

            await self._emit_edge(last_node, "__end__")
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
                        await self._emit_edge(last_node, node_name)
                        last_node = node_name
                yield chunk

            if last_node != "__start__":
                await self._emit_edge(last_node, "__end__")

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
