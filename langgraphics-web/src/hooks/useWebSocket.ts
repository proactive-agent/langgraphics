import {useEffect, useRef, useState} from "react";
import type {ExecutionEvent, GraphMessage, NodeOutputEntry, NodeStepEntry, WsMessage} from "../types";

const RECONNECT_INTERVAL = 500;
const CONNECTION_TIMEOUT = 500;

export function useWebSocket(url: string) {
    const [events, setEvents] = useState<ExecutionEvent[]>([]);
    const [nodeStepLog, setNodeStepLog] = useState<NodeStepEntry[]>([]);
    const [nodeOutputLog, setNodeOutputLog] = useState<NodeOutputEntry[]>([]);
    const [topology, setTopology] = useState<GraphMessage | null>(null);
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
                        setNodeStepLog([]);
                        setNodeOutputLog([]);
                    } else if (msg.type === "run_start") {
                        runDone = false;
                        setEvents([msg]);
                        setNodeStepLog([]);
                        setNodeOutputLog([]);
                    } else if (msg.type === "node_output") {
                        const {type: _, ...entry} = msg;
                        setNodeOutputLog((prev) => [...prev, entry]);
                    } else if (msg.type === "node_step") {
                        const {type: _, event, ...fields} = msg;
                        if (event === "start") {
                            setNodeStepLog((prev) => [...prev, fields]);
                        } else {
                            setNodeStepLog((prev) => {
                                const idx = prev.findLastIndex((e) => e.run_id === msg.run_id);
                                if (idx === -1) return prev;
                                const updated = [...prev];
                                updated[idx] = {...updated[idx], ...fields};
                                return updated;
                            });
                        }
                    } else {
                        if (msg.type === "run_end" || msg.type === "error") runDone = true;
                        setEvents((prev) => [...prev, msg as ExecutionEvent]);
                    }
                } catch {
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

    return {topology, events, nodeStepLog, nodeOutputLog};
}
