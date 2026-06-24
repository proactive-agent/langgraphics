import pytest
from langchain_core.messages import HumanMessage, SystemMessage

from examples import basic_agent, error_agent, sync_agent
from langgraphics import watch
from langgraphics.topology import extract
from tests.lib.conftest import find_free_port, safe_ainvoke, ws_collect


async def test_linear_message_sequence(simple_graph):
    ws_port = find_free_port()
    viewport = watch(
        simple_graph, port=find_free_port(), ws_port=ws_port, open_browser=False
    )

    async with ws_collect(ws_port) as (messages, done):
        await safe_ainvoke(viewport, {"value": "test"})

    assert messages[0]["type"] == "graph"

    assert messages[1]["type"] == "run_start"
    assert "run_id" in messages[1]

    edge_events = [m for m in messages if m["type"] == "edge_active"]

    assert len(edge_events) == 3

    assert edge_events[0]["source"] == "__start__"
    assert edge_events[0]["target"] == "step_a"

    assert edge_events[1]["source"] == "step_a"
    assert edge_events[1]["target"] == "step_b"

    assert edge_events[2]["source"] == "step_b"
    assert edge_events[2]["target"] == "__end__"

    assert messages[-1]["type"] == "run_end"


async def test_branching_message_sequence(branching_graph):
    ws_port = find_free_port()
    viewport = watch(
        branching_graph, port=find_free_port(), ws_port=ws_port, open_browser=False
    )

    async with ws_collect(ws_port) as (messages, done):
        await safe_ainvoke(viewport, {"value": "test", "counter": 0})

    edge_events = [m for m in messages if m["type"] == "edge_active"]

    assert len(edge_events) == 4, (
        f"Expected 4 edge_active events, got {len(edge_events)}. "
        f"All messages: {[m['type'] for m in messages]}"
    )

    assert edge_events[0]["source"] == "__start__"
    assert edge_events[0]["target"] == "process"

    assert edge_events[1]["source"] == "process"
    assert edge_events[1]["target"] == "process"
    assert edge_events[2]["source"] == "process"
    assert edge_events[2]["target"] == "process"

    assert edge_events[-1]["source"] == "process"
    assert edge_events[-1]["target"] == "__end__"


async def test_error_emits_error_message(error_graph):
    ws_port = find_free_port()
    viewport = watch(
        error_graph, port=find_free_port(), ws_port=ws_port, open_browser=False
    )

    async with ws_collect(ws_port) as (messages, done):
        with pytest.raises((ValueError, TimeoutError)):
            await viewport.ainvoke({"value": "test"})

    assert messages[0]["type"] == "graph"
    assert messages[1]["type"] == "run_start"

    assert len([m for m in messages if m["type"] == "error"]) == 1

    error_msg = next(m for m in messages if m["type"] == "error")
    assert "source" in error_msg
    assert "target" in error_msg


async def test_topology_ws_matches_extract(simple_graph):
    ws_port = find_free_port()
    viewport = watch(
        simple_graph, port=find_free_port(), ws_port=ws_port, open_browser=False
    )

    async with ws_collect(ws_port) as (messages, done):
        await safe_ainvoke(viewport, {"value": "test"})

    assert messages[0] == extract(simple_graph)


async def test_all_edge_ids_exist_in_topology(simple_graph):
    ws_port = find_free_port()
    viewport = watch(
        simple_graph, port=find_free_port(), ws_port=ws_port, open_browser=False
    )

    async with ws_collect(ws_port) as (messages, done):
        await safe_ainvoke(viewport, {"value": "test"})

    valid_edge_ids = {e["id"] for e in messages[0]["edges"]}

    for event in (m for m in messages if m["type"] == "edge_active"):
        assert event["edge_id"] in valid_edge_ids, (
            f"edge_id '{event['edge_id']}' not found in topology edges {valid_edge_ids}"
        )


async def test_basic_agent_edge_sequence():
    ws_port = find_free_port()
    viewport = watch(
        basic_agent.graph, port=find_free_port(), ws_port=ws_port, open_browser=False
    )

    async with ws_collect(ws_port, timeout=30.0) as (messages, done):
        await safe_ainvoke(
            viewport, {"messages": [HumanMessage(content="What is the meaning of life?")]}
        )

    assert messages[0]["type"] == "graph"
    assert messages[1]["type"] == "run_start"
    assert messages[-1]["type"] == "run_end"

    edge_events = [m for m in messages if m["type"] == "edge_active"]
    path = [(e["source"], e["target"]) for e in edge_events]

    assert path == [
        ("__start__", "summariser_runner"),
        ("summariser_runner", "responder"),
        ("responder", "tools"),
        ("tools", "responder"),
        ("responder", "__end__"),
    ]


async def test_basic_agent_edge_ids_match_topology():
    ws_port = find_free_port()
    viewport = watch(
        basic_agent.graph, port=find_free_port(), ws_port=ws_port, open_browser=False
    )

    async with ws_collect(ws_port, timeout=30.0) as (messages, done):
        await safe_ainvoke(
            viewport, {"messages": [HumanMessage(content="What is the meaning of life?")]}
        )

    valid_ids = {e["id"] for e in messages[0]["edges"]}
    for event in (m for m in messages if m["type"] == "edge_active"):
        assert event["edge_id"] in valid_ids


async def test_sync_agent_all_edges_fire():
    ws_port = find_free_port()
    viewport = watch(
        sync_agent.graph, port=find_free_port(), ws_port=ws_port, open_browser=False
    )

    async with ws_collect(ws_port, timeout=20.0) as (messages, done):
        await safe_ainvoke(
            viewport, {"messages": [HumanMessage(content="Run sync analysis.")]}
        )

    assert messages[0]["type"] == "graph"
    assert messages[1]["type"] == "run_start"
    assert messages[-1]["type"] == "run_end"

    edge_events = [m for m in messages if m["type"] == "edge_active"]
    assert len(edge_events) == 8

    pairs = [(e["source"], e["target"]) for e in edge_events]

    assert pairs[0] == ("__start__", "initial")

    assert set(pairs[1:4]) == {
        ("initial", "sync_a"), ("initial", "sync_b"), ("initial", "sync_c")
    }

    assert set(pairs[4:7]) == {
        ("sync_a", "final"), ("sync_b", "final"), ("sync_c", "final")
    }

    assert pairs[7] == ("final", "__end__")


async def test_error_agent_emits_error_event():
    ws_port = find_free_port()
    viewport = watch(
        error_agent.graph, port=find_free_port(), ws_port=ws_port, open_browser=False
    )

    async with ws_collect(ws_port, timeout=30.0) as (messages, done):
        with pytest.raises(Exception):
            await viewport.ainvoke({
                "messages": [
                    SystemMessage(content="You are a helpful research assistant."),
                    HumanMessage(content="demo request"),
                ]
            })

    assert messages[0]["type"] == "graph"
    assert messages[1]["type"] == "run_start"
    assert any(m["type"] == "error" for m in messages)

    error_msg = next(m for m in messages if m["type"] == "error")
    assert error_msg["source"] == "check_progress"
    assert error_msg["target"] == "reflect"


async def test_error_agent_edge_sequence_before_error():
    ws_port = find_free_port()
    viewport = watch(
        error_agent.graph, port=find_free_port(), ws_port=ws_port, open_browser=False
    )

    async with ws_collect(ws_port, timeout=30.0) as (messages, done):
        with pytest.raises(Exception):
            await viewport.ainvoke({
                "messages": [
                    SystemMessage(content="You are a helpful research assistant."),
                    HumanMessage(content="demo request"),
                ]
            })

    edge_events = [m for m in messages if m["type"] == "edge_active"]
    assert len(edge_events) == 8
    pairs = [(e["source"], e["target"]) for e in edge_events]
    assert pairs == [
        ("__start__", "plan"),
        ("plan", "select_tool"),
        ("select_tool", "call_tool"),
        ("call_tool", "check_progress"),
        ("check_progress", "select_tool"),
        ("select_tool", "call_tool"),
        ("call_tool", "check_progress"),
        ("check_progress", "reflect"),
    ]
