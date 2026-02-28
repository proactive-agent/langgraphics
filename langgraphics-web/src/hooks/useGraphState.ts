import {useMemo} from "react";
import {type Edge, MarkerType, type Node} from "@xyflow/react";
import type {EdgeData, EdgeStatus, ExecutionEvent, GraphMessage, NodeData, NodeStatus} from "../types";
import {computeLayout, type RankDir} from "../layout";

export function computeStatuses(events: ExecutionEvent[]): {
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
            }
            for (const [id, info] of edgeInfo) {
                if (info.target === event.source && edgeStatuses.get(id) === "active") {
                    edgeStatuses.set(id, "traversed");
                }
            }
            edgeStatuses.set(event.edge_id, "active");
            if (nodeStatuses.get(event.target) !== "error") {
                nodeStatuses.set(event.target, "active");
            }
        } else if (event.type === "error") {
            for (const [id, status] of edgeStatuses) {
                if (status === "active") edgeStatuses.set(id, "traversed");
            }
            for (const [id, status] of nodeStatuses) {
                if (status === "active") nodeStatuses.set(id, "completed");
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

export function useGraphState(topology: GraphMessage | null, events: ExecutionEvent[], rankDir: RankDir = "TB") {
    const base = useMemo(() => {
        if (!topology) return {nodes: [] as Node<NodeData>[], edges: [] as Edge<EdgeData>[]};
        return computeLayout(topology, rankDir);
    }, [topology, rankDir]);

    return useMemo(() => {
        if (events.length === 0) return {nodes: base.nodes, edges: base.edges, activeNodeIds: [] as string[]};

        const {nodeStatuses, edgeStatuses} = computeStatuses(events);

        const activeNodeIds: string[] = [];
        const nodes = base.nodes.map((node) => {
            const status = nodeStatuses.get(node.id);
            if (status === "active") activeNodeIds.push(node.id);
            return {...node, className: status};
        });

        const edges = base.edges.map((edge) => {
            const status = edgeStatuses.get(edge.id);
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
    }, [base, events]);
}
