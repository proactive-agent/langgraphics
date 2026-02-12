import asyncio
import json
import socket
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any, TypedDict

import pytest
import websockets
from langgraph.graph import END, StateGraph


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        return s.getsockname()[1]


class SimpleState(TypedDict):
    value: str


class CounterState(TypedDict):
    value: str
    counter: int


@pytest.fixture
def simple_graph() -> StateGraph:
    def step_a(state: SimpleState) -> dict:
        return {"value": state["value"] + "_a"}

    def step_b(state: SimpleState) -> dict:
        return {"value": state["value"] + "_b"}

    builder = StateGraph(SimpleState)
    builder.add_node("step_a", step_a)
    builder.add_node("step_b", step_b)
    builder.set_entry_point("step_a")
    builder.add_edge("step_a", "step_b")
    builder.add_edge("step_b", END)
    return builder.compile()


@pytest.fixture
def branching_graph() -> StateGraph:
    def process(state: CounterState) -> dict:
        return {"value": state["value"] + "_p", "counter": state["counter"] + 1}

    def should_continue(state: CounterState) -> str:
        if state["counter"] >= 3:
            return END
        return "process"

    builder = StateGraph(CounterState)
    builder.add_node("process", process)
    builder.set_entry_point("process")
    builder.add_conditional_edges(
        "process",
        should_continue,
        path_map={END: END, "process": "process"},
    )
    return builder.compile()


@pytest.fixture
def error_graph() -> StateGraph:
    def good_node(state: SimpleState) -> dict:
        return {"value": state["value"] + "_good"}

    def failing_node(state: SimpleState) -> dict:
        raise ValueError("intentional test error")

    builder = StateGraph(SimpleState)
    builder.add_node("good_node", good_node)
    builder.add_node("failing_node", failing_node)
    builder.set_entry_point("good_node")
    builder.add_edge("good_node", "failing_node")
    builder.add_edge("failing_node", END)
    return builder.compile()


@asynccontextmanager
async def ws_collect(
        ws_port: int, timeout: float = 15.0
) -> AsyncIterator[tuple[list[dict], asyncio.Event]]:
    messages: list[dict] = []
    done = asyncio.Event()
    connected = asyncio.Event()

    async def _collect() -> None:
        ws = None
        for _ in range(20):
            try:
                ws = await websockets.connect(f"ws://localhost:{ws_port}")
                break
            except (OSError, ConnectionRefusedError):
                await asyncio.sleep(0.1)

        if ws is None:
            raise RuntimeError(f"Could not connect to ws://localhost:{ws_port}")

        try:
            async for raw in ws:
                msg = json.loads(raw)
                messages.append(msg)
                if msg["type"] == "graph":
                    connected.set()
                if msg["type"] in ("run_end", "error"):
                    done.set()
        except websockets.ConnectionClosed:
            if not done.is_set():
                done.set()

    task = asyncio.create_task(_collect())
    try:
        await asyncio.wait_for(connected.wait(), timeout=5.0)
        yield messages, done
        await asyncio.wait_for(done.wait(), timeout=timeout)
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


async def safe_ainvoke(viewport: Any, input: dict, **kwargs: Any) -> Any:
    try:
        return await viewport.ainvoke(input, **kwargs)
    except TimeoutError:
        pass
