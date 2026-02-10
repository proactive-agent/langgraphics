from typing import Any


def extract_topology(graph: Any) -> dict[str, Any]:
    raw = graph.get_graph()

    nodes = []
    for node_id, node in raw.nodes.items():
        node_type = {"__start__": "start", "__end__": "end"}.get(node.name, "node")
        nodes.append({"id": node_id, "name": node.name, "node_type": node_type})

    edges = []
    for i, edge in enumerate(raw.edges):
        edges.append({
            "id": f"e{i}",
            "source": edge.source,
            "target": edge.target,
            "conditional": edge.conditional,
            "label": str(edge.data) if edge.data is not None else None,
        })

    return {"type": "graph", "nodes": nodes, "edges": edges}
