import sys

import pytest

from examples import (
    basic_agent,
    error_agent,
    react_agent,
    sub2_agent,
    sync_agent,
)
from langgraphics.topology import extract

if sys.version_info >= (3, 11):
    from examples import deep_agent, sub1_agent

requires_deepagents = pytest.mark.skipif(sys.version_info < (3, 11), reason="deepagents requires py311+")


def test_linear_graph_nodes(simple_graph):
    topology = extract(simple_graph)

    assert topology["type"] == "graph"

    node_names = {n["name"] for n in topology["nodes"]}
    assert "__start__" in node_names
    assert "__end__" in node_names
    assert "step_a" in node_names
    assert "step_b" in node_names


def test_linear_graph_node_types(simple_graph):
    topology = extract(simple_graph)

    node_types = {n["name"]: n["node_type"] for n in topology["nodes"]}
    assert node_types["__start__"] == "start"
    assert node_types["__end__"] == "end"
    assert node_types["step_a"] == "node"
    assert node_types["step_b"] == "node"


def test_edge_ids_are_sequential(simple_graph):
    topology = extract(simple_graph)

    edge_ids = [e["id"] for e in topology["edges"]]
    for i, eid in enumerate(edge_ids):
        assert eid == f"e{i}"


def test_conditional_edges_flagged(branching_graph):
    topology = extract(branching_graph)

    edges_by_source = {}
    for e in topology["edges"]:
        edges_by_source.setdefault(e["source"], []).append(e)

    start_edges = edges_by_source.get("__start__", [])
    assert len(start_edges) == 1
    assert start_edges[0]["conditional"] is False

    process_edges = edges_by_source.get("process", [])
    assert len(process_edges) >= 1
    for e in process_edges:
        assert e["conditional"] is True


def test_edge_labels_none_when_no_data(simple_graph):
    topology = extract(simple_graph)

    for edge in topology["edges"]:
        assert edge["label"] is None or isinstance(edge["label"], str)


def test_basic_agent_node_names():
    topo = extract(basic_agent.graph)
    assert topo["type"] == "graph"
    assert {n["name"] for n in topo["nodes"]} == {
        "__start__", "summariser_runner", "tools", "responder", "__end__"
    }


def test_basic_agent_node_types():
    topo = extract(basic_agent.graph)
    types = {n["name"]: n["node_type"] for n in topo["nodes"]}
    assert types["__start__"] == "start"
    assert types["__end__"] == "end"
    assert types["summariser_runner"] == "node"
    assert types["tools"] == "node"
    assert types["responder"] == "node"


def test_basic_agent_edges():
    topo = extract(basic_agent.graph)
    edges = {(e["source"], e["target"]): e["conditional"] for e in topo["edges"]}
    assert edges == {
        ("__start__", "summariser_runner"): False,
        ("summariser_runner", "responder"): False,
        ("tools", "responder"): False,
        ("responder", "__end__"): True,
        ("responder", "tools"): True,
    }


def test_basic_agent_edge_ids_sequential():
    topo = extract(basic_agent.graph)
    ids = [e["id"] for e in topo["edges"]]
    assert ids == [f"e{i}" for i in range(len(ids))]


def test_sync_agent_node_names():
    topo = extract(sync_agent.graph)
    assert topo["type"] == "graph"
    assert {n["name"] for n in topo["nodes"]} == {
        "__start__", "initial", "sync_a", "sync_b", "sync_c", "final", "__end__"
    }


def test_sync_agent_node_types():
    topo = extract(sync_agent.graph)
    types = {n["name"]: n["node_type"] for n in topo["nodes"]}
    assert types["__start__"] == "start"
    assert types["__end__"] == "end"
    for node in ("initial", "sync_a", "sync_b", "sync_c", "final"):
        assert types[node] == "node"


def test_sync_agent_fan_out_edges():
    topo = extract(sync_agent.graph)
    edges = {(e["source"], e["target"]): e["conditional"] for e in topo["edges"]}
    assert edges[("initial", "sync_a")] is False
    assert edges[("initial", "sync_b")] is False
    assert edges[("initial", "sync_c")] is False


def test_sync_agent_fan_in_edges():
    topo = extract(sync_agent.graph)
    edges = {(e["source"], e["target"]): e["conditional"] for e in topo["edges"]}
    assert edges[("sync_a", "final")] is False
    assert edges[("sync_b", "final")] is False
    assert edges[("sync_c", "final")] is False


def test_sync_agent_edge_count():
    topo = extract(sync_agent.graph)
    assert len(topo["edges"]) == 8


_REACT_NODES = {
    "__start__", "plan", "observe", "update_scratchpad", "reflect",
    "revise_plan", "check_progress", "ask_clarify", "integrate",
    "final_answer", "__end__",
}


def test_react_agent_node_names():
    topo = extract(react_agent.graph)
    assert topo["type"] == "graph"
    assert {n["name"] for n in topo["nodes"]} == _REACT_NODES


def test_react_agent_node_types():
    topo = extract(react_agent.graph)
    types = {n["name"]: n["node_type"] for n in topo["nodes"]}
    assert types["__start__"] == "start"
    assert types["__end__"] == "end"
    for node in _REACT_NODES - {"__start__", "__end__"}:
        assert types[node] == "node"


def test_react_agent_check_progress_has_four_conditional_edges():
    topo = extract(react_agent.graph)
    outgoing = [e for e in topo["edges"] if e["source"] == "check_progress"]
    assert len(outgoing) == 4
    assert all(e["conditional"] for e in outgoing)
    assert {e["target"] for e in outgoing} == {"observe", "reflect", "ask_clarify", "integrate"}


def test_react_agent_unconditional_chain():
    topo = extract(react_agent.graph)
    edges = {(e["source"], e["target"]): e["conditional"] for e in topo["edges"]}
    for pair in [
        ("__start__", "plan"), ("plan", "observe"), ("observe", "update_scratchpad"),
        ("update_scratchpad", "check_progress"), ("reflect", "revise_plan"),
        ("revise_plan", "check_progress"), ("ask_clarify", "plan"),
        ("integrate", "final_answer"), ("final_answer", "__end__"),
    ]:
        assert edges[pair] is False


def test_react_agent_edge_count():
    topo = extract(react_agent.graph)
    assert len(topo["edges"]) == 13


_ERROR_NODES = {
    "__start__", "plan", "select_tool", "call_tool", "reflect",
    "revise_plan", "check_progress", "integrate", "final_answer", "__end__",
}


def test_error_agent_node_names():
    topo = extract(error_agent.graph)
    assert topo["type"] == "graph"
    assert {n["name"] for n in topo["nodes"]} == _ERROR_NODES


def test_error_agent_node_types():
    topo = extract(error_agent.graph)
    types = {n["name"]: n["node_type"] for n in topo["nodes"]}
    assert types["__start__"] == "start"
    assert types["__end__"] == "end"
    for node in _ERROR_NODES - {"__start__", "__end__"}:
        assert types[node] == "node"


def test_error_agent_check_progress_conditional_edges():
    topo = extract(error_agent.graph)
    outgoing = [e for e in topo["edges"] if e["source"] == "check_progress"]
    assert len(outgoing) == 3
    assert all(e["conditional"] for e in outgoing)
    assert {e["target"] for e in outgoing} == {"select_tool", "reflect", "integrate"}


def test_error_agent_unconditional_edges():
    topo = extract(error_agent.graph)
    edges = {(e["source"], e["target"]): e["conditional"] for e in topo["edges"]}
    for pair in [
        ("__start__", "plan"), ("plan", "select_tool"), ("select_tool", "call_tool"),
        ("call_tool", "check_progress"), ("reflect", "revise_plan"),
        ("revise_plan", "check_progress"), ("integrate", "final_answer"),
        ("final_answer", "__end__"),
    ]:
        assert edges[pair] is False


def test_error_agent_edge_count():
    topo = extract(error_agent.graph)
    assert len(topo["edges"]) == 11


_DEEP_NODES = {
    "__start__", "model", "tools",
    "TodoListMiddleware.after_model", "PatchToolCallsMiddleware.before_agent",
    "__end__",
}


@requires_deepagents
def test_deep_agent_node_names():
    topo = extract(deep_agent.graph)
    assert topo["type"] == "graph"
    assert {n["name"] for n in topo["nodes"]} == _DEEP_NODES


@requires_deepagents
def test_deep_agent_node_types():
    topo = extract(deep_agent.graph)
    types = {n["name"]: n["node_type"] for n in topo["nodes"]}
    assert types["__start__"] == "start"
    assert types["__end__"] == "end"
    for node in _DEEP_NODES - {"__start__", "__end__"}:
        assert types[node] == "node"


@requires_deepagents
def test_deep_agent_entry_edge():
    topo = extract(deep_agent.graph)
    edges = {(e["source"], e["target"]): e["conditional"] for e in topo["edges"]}
    assert edges[("__start__", "PatchToolCallsMiddleware.before_agent")] is False
    assert edges[("PatchToolCallsMiddleware.before_agent", "model")] is False
    assert edges[("model", "TodoListMiddleware.after_model")] is False


@requires_deepagents
def test_deep_agent_after_model_has_three_conditional_edges():
    topo = extract(deep_agent.graph)
    outgoing = [e for e in topo["edges"] if e["source"] == "TodoListMiddleware.after_model"]
    assert len(outgoing) == 3
    assert all(e["conditional"] for e in outgoing)
    assert {e["target"] for e in outgoing} == {"model", "tools", "__end__"}


@requires_deepagents
def test_deep_agent_edge_count():
    topo = extract(deep_agent.graph)
    assert len(topo["edges"]) == 7


@requires_deepagents
def test_sub1_agent_node_names():
    topo = extract(sub1_agent.graph)
    assert topo["type"] == "graph"
    assert {n["name"] for n in topo["nodes"]} == {
        "__start__", "router", "error", "deep_agent", "summarizer", "__end__"
    }


@requires_deepagents
def test_sub1_agent_subgraph_node_types():
    topo = extract(sub1_agent.graph)
    types = {n["name"]: n["node_type"] for n in topo["nodes"]}
    assert types["__start__"] == "start"
    assert types["__end__"] == "end"
    assert types["router"] == "node"
    assert types["summarizer"] == "node"
    assert types["error"] == "subgraph"
    assert types["deep_agent"] == "subgraph"


@requires_deepagents
def test_sub1_agent_parallel_branches_from_router():
    topo = extract(sub1_agent.graph)
    edges = {(e["source"], e["target"]): e["conditional"] for e in topo["edges"]}
    assert edges[("router", "error")] is False
    assert edges[("router", "deep_agent")] is False


@requires_deepagents
def test_sub1_agent_fan_in_to_summarizer():
    topo = extract(sub1_agent.graph)
    edges = {(e["source"], e["target"]): e["conditional"] for e in topo["edges"]}
    assert edges[("error", "summarizer")] is False
    assert edges[("deep_agent", "summarizer")] is False
    assert edges[("summarizer", "__end__")] is False


@requires_deepagents
def test_sub1_agent_error_subgraph_structure():
    topo = extract(sub1_agent.graph)
    error_node = next(n for n in topo["nodes"] if n["name"] == "error")
    sub_names = {n["name"] for n in error_node["subgraph"]["nodes"]}
    assert {"plan", "select_tool", "call_tool", "reflect", "check_progress"} <= sub_names


@requires_deepagents
def test_sub1_agent_deep_subgraph_structure():
    topo = extract(sub1_agent.graph)
    da_node = next(n for n in topo["nodes"] if n["name"] == "deep_agent")
    sub_names = {n["name"] for n in da_node["subgraph"]["nodes"]}
    assert {"model", "tools", "TodoListMiddleware.after_model",
            "PatchToolCallsMiddleware.before_agent"} <= sub_names


@requires_deepagents
def test_sub1_agent_edge_count():
    topo = extract(sub1_agent.graph)
    assert len(topo["edges"]) == 6


def test_sub2_agent_top_level_node_names():
    topo = extract(sub2_agent.graph)
    assert topo["type"] == "graph"
    assert {n["name"] for n in topo["nodes"]} == {
        "__start__", "subgraph", "summariser_runner", "responder", "tools", "__end__"
    }


def test_sub2_agent_subgraph_node_type():
    topo = extract(sub2_agent.graph)
    types = {n["name"]: n["node_type"] for n in topo["nodes"]}
    assert types["subgraph"] == "subgraph"
    assert types["summariser_runner"] == "node"
    assert types["responder"] == "node"
    assert types["tools"] == "node"


def test_sub2_agent_top_level_edges():
    topo = extract(sub2_agent.graph)
    edges = {(e["source"], e["target"]): e["conditional"] for e in topo["edges"]}
    assert edges[("__start__", "summariser_runner")] is False
    assert edges[("summariser_runner", "subgraph")] is False
    assert edges[("subgraph", "responder")] is False
    assert edges[("tools", "responder")] is False
    assert edges[("responder", "__end__")] is True
    assert edges[("responder", "tools")] is True


def test_sub2_agent_subgraph_inner_nodes():
    topo = extract(sub2_agent.graph)
    sg = next(n for n in topo["nodes"] if n["name"] == "subgraph")
    assert {n["name"] for n in sg["subgraph"]["nodes"]} == {
        "__start__", "node1", "node2a", "node2b", "node3", "__end__"
    }


def test_sub2_agent_subgraph_parallel_branches():
    topo = extract(sub2_agent.graph)
    sg = next(n for n in topo["nodes"] if n["name"] == "subgraph")
    edges = {(e["source"], e["target"]): e["conditional"] for e in sg["subgraph"]["edges"]}
    assert edges[("node1", "node2a")] is False
    assert edges[("node1", "node2b")] is False
    assert edges[("node2a", "node3")] is False
    assert edges[("node2b", "node3")] is False


def test_sub2_agent_node2a_subgraph_three_inner_nodes():
    topo = extract(sub2_agent.graph)
    sg = next(n for n in topo["nodes"] if n["name"] == "subgraph")
    node2a = next(n for n in sg["subgraph"]["nodes"] if n["name"] == "node2a")
    assert node2a["node_type"] == "subgraph"
    assert {n["name"] for n in node2a["subgraph"]["nodes"]} == {
        "__start__", "node1", "node2", "node3", "__end__"
    }


def test_sub2_agent_node2b_subgraph_two_inner_nodes():
    topo = extract(sub2_agent.graph)
    sg = next(n for n in topo["nodes"] if n["name"] == "subgraph")
    node2b = next(n for n in sg["subgraph"]["nodes"] if n["name"] == "node2b")
    assert node2b["node_type"] == "subgraph"
    assert {n["name"] for n in node2b["subgraph"]["nodes"]} == {
        "__start__", "node1", "node2", "__end__"
    }
