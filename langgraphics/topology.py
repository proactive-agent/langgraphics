from typing import Any


def classify_node(data: Any) -> str:
    checks = [
        ("langchain_core.tools", "BaseTool", "tool"),
        ("langchain_core.language_models", "BaseLanguageModel", "llm"),
        ("langchain_core.embeddings", "Embeddings", "embedding"),
        ("langchain_core.retrievers", "BaseRetriever", "retriever"),
        ("langchain_core.agents", "BaseMultiActionAgent", "agent"),
        ("langchain_core.agents", "BaseSingleActionAgent", "agent"),
        ("langchain_core.runnables.base", "RunnableSequence", "chain"),
        ("langchain_core.runnables.base", "RunnableParallel", "chain"),
        ("langgraph._internal._runnable", "RunnableCallable", "function"),
        ("langchain_core.runnables", "Runnable", "runnable"),
    ]

    for module_path, class_name, label in checks:
        try:
            module = __import__(module_path, fromlist=[class_name])
            cls = getattr(module, class_name)
            if isinstance(data, cls):
                return label
        except (ImportError, AttributeError):
            continue

    return "unknown"


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
                "node_kind": classify_node(node.data)
                if node.name not in ("__start__", "__end__")
                else None,
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
