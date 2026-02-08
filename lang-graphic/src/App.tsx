import { useWebSocket } from "./hooks/useWebSocket";
import { useGraphLayout } from "./hooks/useGraphLayout";
import { useExecutionState } from "./hooks/useExecutionState";
import { GraphCanvas } from "./components/GraphCanvas";
import "./styles/app.css";

const WS_URL = "ws://localhost:8765";

export default function App() {
  const { topology, events, connectionStatus } = useWebSocket(WS_URL);
  const { nodes: baseNodes, edges: baseEdges } = useGraphLayout(topology);
  const { nodes, edges } = useExecutionState(baseNodes, baseEdges, events);

  return (
    <div className="app">
      {topology ? (
        <GraphCanvas nodes={nodes} edges={edges} connectionStatus={connectionStatus} />
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "#64748b",
            fontSize: 14,
          }}
        >
          Waiting for graph topology from WebSocket...
        </div>
      )}
    </div>
  );
}
