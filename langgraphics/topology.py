from typing import Any


def classify_node(data: Any) -> str:
    checks = [
        ("langchain_core.tools", ("BaseTool",), "tool"),
        ("langchain_core.runnables", ("Runnable",), "runnable"),
        ("langchain_core.embeddings", ("Embeddings",), "embedding"),
        ("langchain_core.retrievers", ("BaseRetriever",), "retriever"),
        ("langchain_core.language_models", ("BaseLanguageModel",), "llm"),
        ("langgraph._internal._runnable", ("RunnableCallable",), "function"),
        ("langchain_core.runnables.base", ("RunnableSequence", "RunnableParallel"), "chain"),
        ("langchain_core.agents", ("BaseSingleActionAgent", "BaseMultiActionAgent"), "agent"),
    ]

    for module_path, class_names, label in checks:
        try:
            module = __import__(module_path, fromlist=class_names)
            classes = tuple(getattr(module, name) for name in class_names)
            if isinstance(data, classes):
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
