from typing import Any

from langgraph.graph.state import CompiledStateGraph


def extract(graph: Any) -> dict[str, Any]:
    raw = graph.get_graph()

    return {
        "type": "graph",
        "nodes": [
            {
                "id": node_id,
                "name": node.name,
                "node_type": {
                    "__end__": "end",
                    "__start__": "start",
                }.get(node.name, "node"),
                **({
                   "node_type": "subgraph",
                   "subgraph": extract(node.data),
               } if isinstance(node.data, CompiledStateGraph) else {})
            }
            for node_id, node in raw.nodes.items()
        ],
        "edges": [
            {
                "id": f"e{i}",
                "source": edge.source,
                "target": edge.target,
                "conditional": edge.conditional,
                "label": str(edge.data) if edge.data is not None else None,
            }
            for i, edge in enumerate(raw.edges)
        ],
    }
