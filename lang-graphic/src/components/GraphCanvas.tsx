import ReactFlow, {
  ReactFlowProvider,
  BackgroundVariant,
  Background,
  type Node,
  type Edge,
} from "reactflow";
import "reactflow/dist/style.css";
import { CustomNode } from "./CustomNode";
import { CustomEdge } from "./CustomEdge";
import type { NodeData, EdgeData } from "../types/graph";
import type { ConnectionStatus } from "../hooks/useWebSocket";

const nodeTypes = { custom: CustomNode };
const edgeTypes = { custom: CustomEdge };

const statusColors: Record<ConnectionStatus, string> = {
  connected: "#22c55e",
  connecting: "#f59e0b",
  disconnected: "#ef4444",
};

const statusLabels: Record<ConnectionStatus, string> = {
  connected: "Connected",
  connecting: "Connecting...",
  disconnected: "Disconnected",
};

interface GraphCanvasProps {
  nodes: Node<NodeData>[];
  edges: Edge<EdgeData>[];
  connectionStatus: ConnectionStatus;
}

export function GraphCanvas({ nodes, edges, connectionStatus }: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <style>{`
        .react-flow__handle {
          opacity: 0;
          width: 0px;
          height: 0px;
          border: none;
        }
      `}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={(instance) => instance.fitView()}
        defaultEdgeOptions={{ type: "custom" }}
        proOptions={{ hideAttribution: true }}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background color="white" lineWidth={0.2} gap={25} variant={BackgroundVariant.Lines} />
        <div className="status-indicator">
          <div
            className="status-indicator__dot"
            style={{
              background: statusColors[connectionStatus],
              boxShadow:
                connectionStatus === "connected"
                  ? `0 0 6px ${statusColors[connectionStatus]}`
                  : undefined,
            }}
          />
          <span>{statusLabels[connectionStatus]}</span>
        </div>
      </ReactFlow>
    </ReactFlowProvider>
  );
}
