/** WebSocket hook: connects to the Python langgraph_viz server, parses messages, auto-reconnects. */

import { useCallback, useEffect, useRef, useState } from "react";
import type { GraphMessage, ExecutionEvent, WsMessage } from "../types/protocol";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface UseWebSocketReturn {
  topology: GraphMessage | null;
  events: ExecutionEvent[];
  connectionStatus: ConnectionStatus;
  clearEvents: () => void;
  reconnect: () => void;
}

export function useWebSocket(url: string): UseWebSocketReturn {
  const [topology, setTopology] = useState<GraphMessage | null>(null);
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);

  const clearEvents = useCallback(() => setEvents([]), []);

  const reconnect = useCallback(() => {
    reconnectAttempt.current = 0;
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
    }
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
        if (unmounted) return;
        setConnectionStatus("connected");
        reconnectAttempt.current = 0;
      };

      ws.onmessage = (event) => {
        if (unmounted) return;
        try {
          const msg: WsMessage = JSON.parse(event.data);

          if (msg.type === "graph") {
            setTopology(msg);
            // Clear events on new topology (new connection)
            setEvents([]);
          } else if (msg.type === "pong") {
            // Ignore pong
          } else if (msg.type === "run_start") {
            // Clear previous run events on new run
            setEvents([msg]);
          } else {
            setEvents((prev) => [...prev, msg as ExecutionEvent]);
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        if (unmounted) return;
        setConnectionStatus("disconnected");
        scheduleReconnect();
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    function scheduleReconnect() {
      if (unmounted) return;
      reconnectAttempt.current++;
      reconnectTimer.current = setTimeout(connect, 1000);
    }

    connect();

    // Ping keepalive every 10s
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 10000);

    return () => {
      unmounted = true;
      clearInterval(pingInterval);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [url, reconnectTrigger]);

  return { topology, events, connectionStatus, clearEvents, reconnect };
}
