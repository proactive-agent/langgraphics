"""WebSocket protocol message types and serialization helpers."""

from __future__ import annotations

import json
import time

# Message types
GRAPH = "graph"
RUN_START = "run_start"
RUN_END = "run_end"
EDGE_ACTIVE = "edge_active"


def graph_message(nodes: list[dict], edges: list[dict]) -> str:
    return json.dumps({"type": GRAPH, "nodes": nodes, "edges": edges})


def run_start_message(run_id: str) -> str:
    return json.dumps({"type": RUN_START, "run_id": run_id, "timestamp": time.time()})


def run_end_message(run_id: str) -> str:
    return json.dumps({"type": RUN_END, "run_id": run_id, "timestamp": time.time()})


def edge_active_message(source: str, target: str, edge_id: str) -> str:
    return json.dumps({
        "type": EDGE_ACTIVE,
        "source": source,
        "target": target,
        "edge_id": edge_id,
        "timestamp": time.time(),
    })
