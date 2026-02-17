from typing import Any


def _classify_node(data: Any) -> str:
    try:
        from langchain_core.tools import BaseTool

        if isinstance(data, BaseTool):
            return "tool"
    except ImportError:
        pass

    try:
        from langchain_core.language_models import BaseLanguageModel

        if isinstance(data, BaseLanguageModel):
            return "llm"
    except ImportError:
        pass

    try:
        from langchain_core.embeddings import Embeddings

        if isinstance(data, Embeddings):
            return "embedding"
    except ImportError:
        pass

    try:
        from langchain_core.retrievers import BaseRetriever

        if isinstance(data, BaseRetriever):
            return "retriever"
    except ImportError:
        pass

    try:
        from langchain_core.agents import BaseSingleActionAgent, BaseMultiActionAgent

        if isinstance(data, (BaseSingleActionAgent, BaseMultiActionAgent)):
            return "agent"
    except ImportError:
        pass

    try:
        from langchain_core.runnables.base import RunnableSequence, RunnableParallel

        if isinstance(data, (RunnableSequence, RunnableParallel)):
            return "chain"
    except ImportError:
        pass

    try:
        from langgraph._internal._runnable import RunnableCallable

        if isinstance(data, RunnableCallable):
            return "function"
    except ImportError:
        pass

    try:
        from langchain_core.runnables import Runnable

        if isinstance(data, Runnable):
            return "runnable"
    except ImportError:
        pass

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
                "node_kind": _classify_node(node.data)
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
