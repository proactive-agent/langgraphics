import asyncio
import json
import uuid
from collections.abc import AsyncIterator
from socketserver import TCPServer
from typing import Any

from langchain_core.callbacks import AsyncCallbackHandler


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


class SubStepCallbackHandler(AsyncCallbackHandler):
    def __init__(self, broadcast: Any, node_names: set[str]) -> None:
        self._broadcast = broadcast
        self._node_names = node_names
        self._id_to_name: dict[str, str] = {}
        self.node_run_ids: dict[str, str] = {}

    def _register(self, run_id: Any, parent_run_id: Any, name: str) -> None:
        rid = str(run_id)
        self._id_to_name[rid] = name
        if name in self._node_names:
            parent_name = (
                self._id_to_name.get(str(parent_run_id)) if parent_run_id else None
            )
            if parent_name not in self._node_names:
                self.node_run_ids[name] = rid

    def _parent_is_node(self, parent_run_id: Any) -> bool:
        if not parent_run_id:
            return False
        return self._id_to_name.get(str(parent_run_id)) in self._node_names

    async def _emit_start(
        self, run_id: Any, parent_run_id: Any, name: str, data: Any
    ) -> None:
        if self._parent_is_node(parent_run_id):
            await self._broadcast(
                {
                    "type": "node_step",
                    "event": "start",
                    "run_id": str(run_id),
                    "parent_run_id": str(parent_run_id),
                    "name": name,
                    "data": _serialize_state(data),
                }
            )

    async def _emit_end(self, run_id: Any, parent_run_id: Any, data: Any) -> None:
        if self._parent_is_node(parent_run_id):
            await self._broadcast(
                {
                    "type": "node_step",
                    "event": "end",
                    "run_id": str(run_id),
                    "parent_run_id": str(parent_run_id),
                    "name": None,
                    "data": _serialize_state(data),
                }
            )

    async def on_chain_start(
        self,
        serialized: Any,
        inputs: Any,
        *,
        run_id: Any,
        parent_run_id: Any = None,
        **kwargs: Any,
    ) -> None:
        name = kwargs.get("name") or (serialized or {}).get("name") or "chain"
        self._register(run_id, parent_run_id, name)
        await self._emit_start(run_id, parent_run_id, name, inputs)

    async def on_chain_end(
        self, outputs: Any, *, run_id: Any, parent_run_id: Any = None, **kwargs: Any
    ) -> None:
        await self._emit_end(run_id, parent_run_id, outputs)

    async def on_llm_start(
        self,
        serialized: Any,
        prompts: Any,
        *,
        run_id: Any,
        parent_run_id: Any = None,
        **kwargs: Any,
    ) -> None:
        name = kwargs.get("name") or (serialized or {}).get("name") or "llm"
        self._register(run_id, parent_run_id, name)
        await self._emit_start(run_id, parent_run_id, name, {"prompts": prompts})

    async def on_chat_model_start(
        self,
        serialized: Any,
        messages: Any,
        *,
        run_id: Any,
        parent_run_id: Any = None,
        **kwargs: Any,
    ) -> None:
        name = kwargs.get("name") or (serialized or {}).get("name") or "chat_model"
        self._register(run_id, parent_run_id, name)
        await self._emit_start(
            run_id,
            parent_run_id,
            name,
            {"messages": _serialize_state([[m for m in batch] for batch in messages])},
        )

    async def on_llm_end(
        self, response: Any, *, run_id: Any, parent_run_id: Any = None, **kwargs: Any
    ) -> None:
        try:
            text = response.generations[0][0].text
        except Exception:
            text = str(response)
        await self._emit_end(run_id, parent_run_id, {"output": text})

    async def on_tool_start(
        self,
        serialized: Any,
        input_str: Any,
        *,
        run_id: Any,
        parent_run_id: Any = None,
        **kwargs: Any,
    ) -> None:
        name = (serialized or {}).get("name") or kwargs.get("name") or "tool"
        self._register(run_id, parent_run_id, name)
        await self._emit_start(run_id, parent_run_id, name, {"input": input_str})

    async def on_tool_end(
        self, output: Any, *, run_id: Any, parent_run_id: Any = None, **kwargs: Any
    ) -> None:
        await self._emit_end(run_id, parent_run_id, {"output": output})

    async def on_retriever_start(
        self,
        serialized: Any,
        query: Any,
        *,
        run_id: Any,
        parent_run_id: Any = None,
        **kwargs: Any,
    ) -> None:
        name = (serialized or {}).get("name") or kwargs.get("name") or "retriever"
        self._register(run_id, parent_run_id, name)
        await self._emit_start(run_id, parent_run_id, name, {"query": query})

    async def on_retriever_end(
        self, documents: Any, *, run_id: Any, parent_run_id: Any = None, **kwargs: Any
    ) -> None:
        await self._emit_end(
            run_id, parent_run_id, {"documents": _serialize_state(list(documents))}
        )


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

    def _make_config(
        self, config: Any
    ) -> tuple[dict[str, Any], SubStepCallbackHandler]:
        handler = SubStepCallbackHandler(self._broadcast, self._node_names)
        merged: dict[str, Any] = dict(config or {})
        merged["callbacks"] = list(merged.get("callbacks") or []) + [handler]
        return merged, handler

    async def shutdown(self) -> None:
        await self.ws.shutdown()
        self.http_server.shutdown()

    async def ainvoke(self, input: Any, config: Any = None, **kwargs: Any) -> Any:
        run_id = uuid.uuid4().hex[:8]
        await self._broadcast({"type": "run_start", "run_id": run_id})

        serialized_input = _serialize_state(input)
        await self._broadcast(
            {
                "type": "node_output",
                "node": "__start__",
                "data": serialized_input
                if isinstance(serialized_input, dict)
                else {"input": serialized_input},
                "input": None,
                "run_id": None,
            }
        )

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
                        await self._broadcast(
                            {
                                "type": "node_output",
                                "node": node_name,
                                "data": _serialize_state(node_output),
                                "input": _serialize_state(accumulated_state),
                                "run_id": handler.node_run_ids.get(node_name),
                            }
                        )
                        if isinstance(node_output, dict):
                            accumulated_state = _merge_state(
                                accumulated_state, node_output
                            )
                        last_node = node_name
                        result = node_output

            await self._emit_edge(last_node, "__end__")
            await self._broadcast(
                {
                    "type": "node_output",
                    "node": "__end__",
                    "data": _serialize_state(accumulated_state),
                    "input": _serialize_state(accumulated_state),
                    "run_id": None,
                }
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
        await self._broadcast(
            {
                "type": "node_output",
                "node": "__start__",
                "data": serialized_input
                if isinstance(serialized_input, dict)
                else {"input": serialized_input},
                "input": None,
                "run_id": None,
            }
        )

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
                        await self._broadcast(
                            {
                                "type": "node_output",
                                "node": node_name,
                                "data": _serialize_state(node_output),
                                "input": _serialize_state(accumulated_state),
                                "run_id": handler.node_run_ids.get(node_name),
                            }
                        )
                        if isinstance(node_output, dict):
                            accumulated_state = _merge_state(
                                accumulated_state, node_output
                            )
                        last_node = node_name
                yield chunk

            if last_node != "__start__":
                await self._emit_edge(last_node, "__end__")
                await self._broadcast(
                    {
                        "type": "node_output",
                        "node": "__end__",
                        "data": _serialize_state(accumulated_state),
                        "input": _serialize_state(accumulated_state),
                        "run_id": None,
                    }
                )

            await self._broadcast({"type": "run_end", "run_id": run_id})
        except Exception:
            await self._emit_error(last_node)
            raise

    def invoke(self, input: Any, config: Any = None, **kwargs: Any) -> Any:
        return asyncio.run(self.ainvoke(input, config=config, **kwargs))
