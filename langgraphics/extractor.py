"""Extract graph topology from a compiled LangGraph."""

from __future__ import annotations

from typing import Any


def extract_topology(graph: Any) -> dict[str, Any]:
    """
    Extract graph topology as a JSON-serializable dict from a compiled LangGraph.

    Calls graph.get_graph() to get the langchain_core Graph object,
    then normalizes nodes and edges into the WS protocol format.

    Returns:
        {
            "type": "graph",
            "nodes": [{"id": str, "name": str, "node_type": str}, ...],
            "edges": [{"id": str, "source": str, "target": str, "conditional": bool, "label": str|None}, ...]
        }
    """
    raw_graph = graph.get_graph()

    # Build nodes list from the Graph.nodes dict
    # Graph.nodes is dict[str, Node] where Node is NamedTuple(id, name, data, metadata)
    nodes = []
    for node_id, node in raw_graph.nodes.items():
        name = node.name
        if name == "__start__":
            node_type = "start"
        elif name == "__end__":
            node_type = "end"
        else:
            node_type = "node"

        nodes.append({
            "id": node_id,
            "name": name,
            "node_type": node_type,
        })

    # Build edges list from Graph.edges list
    # Edge is NamedTuple(source, target, data, conditional)
    edges = []
    # Build a lookup from node_id -> node_name for edge source/target resolution
    id_to_name = {node_id: node.name for node_id, node in raw_graph.nodes.items()}

    for i, edge in enumerate(raw_graph.edges):
        label = str(edge.data) if edge.data is not None else None
        edges.append({
            "id": f"e{i}",
            "source": edge.source,
            "target": edge.target,
            "conditional": edge.conditional,
            "label": label,
        })

    # Build edge lookup for fast edge_id resolution by (source, target)
    return {
        "type": "graph",
        "nodes": nodes,
        "edges": edges,
    }


def build_edge_lookup(topology: dict[str, Any]) -> dict[tuple[str, str], str]:
    """Build a (source, target) -> edge_id lookup from topology edges."""
    lookup: dict[tuple[str, str], str] = {}
    for edge in topology["edges"]:
        key = (edge["source"], edge["target"])
        lookup[key] = edge["id"]
    return lookup
