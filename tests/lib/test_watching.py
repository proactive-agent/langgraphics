import pytest

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
