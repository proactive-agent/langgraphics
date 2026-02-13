import {useEffect, useMemo, useRef, useState} from "react";
import {type Edge, MarkerType, type Node} from "@xyflow/react";
import type {EdgeData, EdgeStatus, ExecutionEvent, GraphMessage, NodeData, NodeStatus, WsMessage} from "./types";
import {computeLayout} from "./layout";

const RECONNECT_INTERVAL = 500;
const CONNECTION_TIMEOUT = 500;

export function computeStatuses(events: ExecutionEvent[]): {
    nodeStatuses: Map<string, NodeStatus>;
    edgeStatuses: Map<string, EdgeStatus>;
} {
    const nodeStatuses = new Map<string, NodeStatus>();
    const edgeStatuses = new Map<string, EdgeStatus>();

    for (const event of events) {
        if (event.type === "run_start") {
            nodeStatuses.clear();
            edgeStatuses.clear();
        } else if (event.type === "edge_active") {
            for (const [id, status] of edgeStatuses) {
                if (status === "active") edgeStatuses.set(id, "traversed");
            }
            for (const [id, status] of nodeStatuses) {
                if (status === "active") nodeStatuses.set(id, "completed");
            }
            edgeStatuses.set(event.edge_id, "active");
            nodeStatuses.set(event.target, "active");
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

export function useWebSocket(url: string) {
    const [topology, setTopology] = useState<GraphMessage | null>(null);
    const [events, setEvents] = useState<ExecutionEvent[]>([]);
    const wsRef = useRef<WebSocket | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        let unmounted = false;
        let runDone = false;

        function connect() {
            if (unmounted) return;
            const ws = new WebSocket(url);
            wsRef.current = ws;

            timerRef.current = setTimeout(() => {
                if (ws.readyState !== WebSocket.OPEN) {
                    ws.onopen = null;
                    ws.onmessage = null;
                    ws.onclose = null;
                    ws.onerror = null;
                    timerRef.current = setTimeout(connect, RECONNECT_INTERVAL);
                }
            }, CONNECTION_TIMEOUT);

            ws.onopen = () => {
                clearTimeout(timerRef.current!);
                timerRef.current = null;
            };

            ws.onmessage = (event) => {
                if (unmounted) return;
                try {
                    const msg: WsMessage = JSON.parse(event.data);
                    if (msg.type === "graph") {
                        runDone = false;
                        setTopology(msg);
                        setEvents([]);
                    } else if (msg.type === "run_start") {
                        runDone = false;
                        setEvents([msg]);
                    } else {
                        if (msg.type === "run_end" || msg.type === "error") runDone = true;
                        setEvents((prev) => [...prev, msg as ExecutionEvent]);
                    }
                } catch { /* ignore parse errors */
                }
            };

            ws.onclose = () => {
                if (!unmounted && !runDone) timerRef.current = setTimeout(connect, RECONNECT_INTERVAL);
            };
            ws.onerror = () => ws.close();
        }

        connect();

        return () => {
            unmounted = true;
            if (timerRef.current) clearTimeout(timerRef.current);
            wsRef.current?.close();
        };
    }, [url]);

    return {topology, events};
}

export function useGraphState(topology: GraphMessage | null, events: ExecutionEvent[]) {
    const base = useMemo(() => {
        if (!topology) return {nodes: [] as Node<NodeData>[], edges: [] as Edge<EdgeData>[]};
        return computeLayout(topology);
    }, [topology]);

    return useMemo(() => {
        if (events.length === 0) return {nodes: base.nodes, edges: base.edges, activeNodeId: null as string | null};

        const {nodeStatuses, edgeStatuses} = computeStatuses(events);

        let activeNodeId: string | null = null;
        const nodes = base.nodes.map((node) => {
            const status = nodeStatuses.get(node.id);
            if (status === "active") activeNodeId = node.id;
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

        return {nodes, edges, activeNodeId};
    }, [base, events]);
}
