import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {type Edge, MarkerType, type Node} from "reactflow";
import type {EdgeData, EdgeStatus, ExecutionEvent, GraphMessage, NodeData, NodeStatus, WsMessage} from "./types";
import {computeLayout} from "./layout";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export function useWebSocket(url: string) {
    const [topology, setTopology] = useState<GraphMessage | null>(null);
    const [events, setEvents] = useState<ExecutionEvent[]>([]);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [reconnectTrigger, setReconnectTrigger] = useState(0);

    const reconnect = useCallback(() => {
        if (reconnectTimer.current) {
            clearTimeout(reconnectTimer.current);
            reconnectTimer.current = null;
        }
        wsRef.current?.close();
        setReconnectTrigger((t) => t + 1);
    }, []);

    useEffect(() => {
        let unmounted = false;

        function connect() {
            if (unmounted) return;
            setConnectionStatus("connecting");
            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                if (!unmounted) {
                    setConnectionStatus("connected");
                }
            };

            ws.onmessage = (event) => {
                if (unmounted) return;
                try {
                    const msg: WsMessage = JSON.parse(event.data);
                    if (msg.type === "graph") {
                        setTopology(msg);
                        setEvents([]);
                    } else if (msg.type === "pong") { /* ignore */
                    } else if (msg.type === "run_start") {
                        setEvents([msg]);
                    } else {
                        setEvents((prev) => [...prev, msg as ExecutionEvent]);
                    }
                } catch { /* ignore parse errors */
                }
            };

            ws.onclose = () => {
                if (!unmounted) {
                    setConnectionStatus("disconnected");
                    scheduleReconnect();
                }
            };
            ws.onerror = () => {
                ws.close();
            };
        }

        function scheduleReconnect() {
            if (unmounted) return;
            reconnectTimer.current = setTimeout(connect, 1000);
        }

        connect();

        const pingInterval = setInterval(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({type: "ping"}));
            }
        }, 10000);

        return () => {
            unmounted = true;
            clearInterval(pingInterval);
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            wsRef.current?.close();
        };
    }, [url, reconnectTrigger]);

    return {topology, events, connectionStatus, reconnect};
}

export function useGraphState(topology: GraphMessage | null, events: ExecutionEvent[]) {
    const base = useMemo(() => {
        if (!topology) return {nodes: [] as Node<NodeData>[], edges: [] as Edge<EdgeData>[]};
        return computeLayout(topology);
    }, [topology]);

    return useMemo(() => {
        if (events.length === 0) return base;

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
            } else if (event.type === "run_end") {
                for (const [id, status] of nodeStatuses) {
                    if (status === "active") nodeStatuses.set(id, "completed");
                }
                for (const [id, status] of edgeStatuses) {
                    if (status === "active") edgeStatuses.set(id, "traversed");
                }
            }
        }

        const nodes = base.nodes.map((node) => {
            const status = nodeStatuses.get(node.id);
            return status && status !== node.data.status ? {...node, data: {...node.data, status}} : node;
        });

        const edges = base.edges.map((edge) => {
            const status = edgeStatuses.get(edge.id);
            const markerEnd = {type: MarkerType.Arrow};
            if (status && edge.data && status !== edge.data.status) {
                return {...edge, animated: status === "active", data: {...edge.data, status}, markerEnd};
            }
            return {...edge, animated: status === "active", markerEnd};
        });

        return {nodes, edges};
    }, [base, events]);
}
