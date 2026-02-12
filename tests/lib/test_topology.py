from langgraphics.topology import extract


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
