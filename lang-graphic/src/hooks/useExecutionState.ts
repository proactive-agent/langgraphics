/** Applies WebSocket execution events to node/edge statuses for React Flow. */

import {useMemo} from "react";
import {type Edge, MarkerType, type Node} from "reactflow";
import type {EdgeData, EdgeStatus, NodeData, NodeStatus} from "../types/graph";
import type {ExecutionEvent} from "../types/protocol";

interface UseExecutionStateReturn {
    nodes: Node<NodeData>[];
    edges: Edge<EdgeData>[];
}

export function useExecutionState(
    baseNodes: Node<NodeData>[],
    baseEdges: Edge<EdgeData>[],
    events: ExecutionEvent[]
): UseExecutionStateReturn {
    return useMemo(() => {
        if (events.length === 0) {
            return {nodes: baseNodes, edges: baseEdges};
        }

        // Build status maps from the event sequence
        const nodeStatuses = new Map<string, NodeStatus>();
        const edgeStatuses = new Map<string, EdgeStatus>();

        for (const event of events) {
            switch (event.type) {
                case "run_start":
                    // Reset all statuses
                    nodeStatuses.clear();
                    edgeStatuses.clear();
                    break;

                case "edge_active":
                    // Mark previously active edges as traversed
                    for (const [id, status] of edgeStatuses) {
                        if (status === "active") {
                            edgeStatuses.set(id, "traversed");
                        }
                    }

                    // Activate the target node at the same time as the edge
                    for (const [id, status] of nodeStatuses) {
                        if (status === "active") {
                            nodeStatuses.set(id, "completed");
                        }
                    }

                    edgeStatuses.set(event.edge_id, "active");
                    nodeStatuses.set(event.target, "active");
                    break;

                case "run_end":
                    // Mark everything as completed/traversed
                    for (const [id, status] of nodeStatuses) {
                        if (status === "active") {
                            nodeStatuses.set(id, "completed");
                        }
                    }
                    for (const [id, status] of edgeStatuses) {
                        if (status === "active") {
                            edgeStatuses.set(id, "traversed");
                        }
                    }
                    break;
            }
        }

        // Apply statuses to nodes
        const nodes = baseNodes.map((node) => {
            const status = nodeStatuses.get(node.id);
            if (status && status !== node.data.status) {
                return {
                    ...node,
                    data: {...node.data, status},
                };
            }
            return node;
        });

        // Apply statuses to edges
        const edges = baseEdges.map((edge) => {
            const status = edgeStatuses.get(edge.id);
            if (status && edge.data && status !== edge.data.status) {
                return {
                    ...edge,
                    data: {...edge.data, status},
                    markerEnd: {
                        type: MarkerType.Arrow,
                    }
                };
            }
            return {
                ...edge,
                markerEnd: {
                    type: MarkerType.Arrow,
                }
            };
        });

        return {nodes, edges};
    }, [baseNodes, baseEdges, events]);
}
