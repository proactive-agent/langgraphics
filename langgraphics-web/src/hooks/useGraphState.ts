import {useMemo} from "react";
import {type Edge, MarkerType, type Node} from "@xyflow/react";
import type {EdgeData, EdgeStatus, ExecutionEvent, GraphMessage, NodeData, NodeStatus} from "../types";
import {computeLayout, type RankDir} from "../layout";

export function computeStatuses(events: ExecutionEvent[], subgraphContainers: Set<string> = new Set()): {
    nodeStatuses: Map<string, NodeStatus>;
    edgeStatuses: Map<string, EdgeStatus>;
} {
    const nodeStatuses = new Map<string, NodeStatus>();
    const edgeStatuses = new Map<string, EdgeStatus>();
    const edgeInfo = new Map<string, {source: string; target: string}>();

    for (const event of events) {
        if (event.type === "run_start") {
            nodeStatuses.clear();
            edgeStatuses.clear();
            edgeInfo.clear();
        } else if (event.type === "edge_active") {
            edgeInfo.set(event.edge_id, {source: event.source, target: event.target});
            if (nodeStatuses.get(event.source) === "active") {
                nodeStatuses.set(event.source, "completed");
                const endChild = `${event.source}:__end__`;
                if (nodeStatuses.get(endChild) === "active") {
                    nodeStatuses.set(endChild, "completed");
                    for (const [id, info] of edgeInfo) {
                        if (info.target === endChild && edgeStatuses.get(id) === "active") {
                            edgeStatuses.set(id, "traversed");
                        }
                    }
                }
            }
            for (const [id, info] of edgeInfo) {
                if (info.target === event.source && edgeStatuses.get(id) === "active") {
                    edgeStatuses.set(id, "traversed");
                }
            }
            const colonIdx = event.target.lastIndexOf(":");
            const parentId = colonIdx > -1 ? event.target.slice(0, colonIdx) : undefined;
            const parentCompleted = parentId !== undefined && nodeStatuses.get(parentId) === "completed";
            edgeStatuses.set(event.edge_id, parentCompleted ? "traversed" : "active");
            if (nodeStatuses.get(event.target) !== "error") {
                nodeStatuses.set(event.target, parentCompleted ? "completed" : "active");
                if (!parentCompleted && subgraphContainers.has(event.target)) {
                    nodeStatuses.set(`${event.target}:__start__`, "active");
                }
            }
        } else if (event.type === "node_output" && event.status === "ok") {
            if (nodeStatuses.get(event.node_id) === "active") {
                nodeStatuses.set(event.node_id, "completed");
                for (const [id, info] of edgeInfo) {
                    if (info.target === event.node_id && edgeStatuses.get(id) === "active") {
                        edgeStatuses.set(id, "traversed");
                    }
                }
            }
        } else if (event.type === "error") {
            for (const [id, status] of edgeStatuses) {
                if (status === "active") edgeStatuses.set(id, "traversed");
            }
            for (const [id, status] of nodeStatuses) {
                if (status === "active") {
                    nodeStatuses.set(id, id === event.source ? "completed" : "error");
                }
            }
            if (event.edge_id) edgeStatuses.set(event.edge_id, "error");
            nodeStatuses.set(event.target, "error");
        } else if (event.type === "run_end") {
            for (const [id, status] of nodeStatuses) {
                if (status === "active") nodeStatuses.set(id, "completed");
            }
            for (const [id, status] of edgeStatuses) {
                if (status === "active") edgeStatuses.set(id, "traversed");
            }
        }
    }

    return {nodeStatuses, edgeStatuses};
}

function collectSubgraphContainers(nodes: GraphMessage["nodes"], prefix: string, out: Set<string>) {
    for (const n of nodes) {
        const id = prefix ? `${prefix}:${n.id}` : n.id;
        if (n.node_type === "subgraph") {
            out.add(id);
            if (n.subgraph) collectSubgraphContainers(n.subgraph.nodes as GraphMessage["nodes"], id, out);
        }
    }
}

export function useGraphState(topology: GraphMessage | null, events: ExecutionEvent[], rankDir: RankDir = "TB") {
    const base = useMemo(() => {
        if (!topology) return {nodes: [] as Node<NodeData>[], edges: [] as Edge<EdgeData>[]};
        return computeLayout(topology, rankDir);
    }, [topology, rankDir]);

    const subgraphContainers = useMemo(() => {
        const out = new Set<string>();
        if (topology) collectSubgraphContainers(topology.nodes, "", out);
        return out;
    }, [topology]);

    return useMemo(() => {
        if (events.length === 0) return {nodes: base.nodes, edges: base.edges, activeNodeIds: [] as string[]};

        const {nodeStatuses, edgeStatuses} = computeStatuses(events, subgraphContainers);

        const resolveStatus = (id: string): NodeStatus | undefined => {
            let current = id;
            while (current.includes(":")) {
                current = current.slice(0, current.lastIndexOf(":"));
                const s = nodeStatuses.get(current);
                if (s === "completed") return s;
            }
        };

        const activeNodeIds: string[] = [];
        const nodes = base.nodes.map((node) => {
            const status = nodeStatuses.get(node.id) ?? (node.parentId ? resolveStatus(node.id) : undefined);
            if (status === "active" && !node.parentId) activeNodeIds.push(node.id);
            return {...node, className: status};
        });

        const edges = base.edges.map((edge) => {
            const lastColon = edge.source.lastIndexOf(":");
            const parentId = lastColon !== -1 ? edge.source.slice(0, lastColon) : undefined;
            const rawStatus = edgeStatuses.get(edge.id)
                ?? (parentId ? (() => {
                    const ps = nodeStatuses.get(parentId) ?? resolveStatus(parentId);
                    if (ps !== "completed") return undefined;
                    return "traversed";
                })() : undefined);
            const status = (rawStatus === "traversed" && nodeStatuses.get(edge.target) === "error")
                ? "error" : rawStatus;
            const conditional = edge.data?.conditional ?? false;
            const className = conditional ? `conditional ${status}` : status;
            const color = status === "error" ? "#ef4444" : status === "active" ? "#22c55e" : status === "traversed" ? "#3b82f6" : undefined;
            const markerEnd = {type: MarkerType.Arrow, ...(color ? {color} : {})};
            if (status && edge.data && status !== edge.data.status) {
                return {
                    ...edge,
                    markerEnd,
                    className,
                    data: {...edge.data, status},
                    animated: status === "active",
                };
            }
            return {...edge, className, animated: status === "active", markerEnd};
        });

        return {nodes, edges, activeNodeIds};
    }, [base, events, subgraphContainers]);
}
