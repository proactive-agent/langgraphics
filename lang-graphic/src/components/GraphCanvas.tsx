import ReactFlow, {Background, BackgroundVariant, type Edge, type Node, ReactFlowProvider,} from "reactflow";
import "reactflow/dist/style.css";
import {CustomNode} from "./CustomNode";
import {CustomEdge} from "./CustomEdge";
import type {EdgeData, NodeData} from "../types/graph";
import type {ConnectionStatus} from "../hooks/useWebSocket";

const nodeTypes = {custom: CustomNode};
const edgeTypes = {custom: CustomEdge};

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

/** Arrow marker colors matching edge status colors from edges.css. */
const ARROW_MARKERS: { id: string; color: string }[] = [
    {id: "arrow-idle", color: "#94a3b8"},
    {id: "arrow-active", color: "#22c55e"},
    {id: "arrow-traversed", color: "#3b82f6"},
];

export function GraphCanvas({nodes, edges, connectionStatus}: GraphCanvasProps) {
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
            {/* SVG defs for colored arrow markers — referenced by CustomEdge */}
            <svg style={{position: "absolute", width: 0, height: 0}}>
                <defs>
                    {ARROW_MARKERS.map((m) => (
                        <marker
                            key={m.id}
                            id={m.id}
                            viewBox="0 0 10 10"
                            refX="10"
                            refY="5"
                            markerWidth="5"
                            markerHeight="5"
                            orient="auto-start-reverse"
                        >
                            <polyline
                                points="0 0, 10 5, 0 10"
                                fill="none"
                                stroke={m.color}
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </marker>
                    ))}
                </defs>
            </svg>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onInit={(instance) => instance.fitView()}
                defaultEdgeOptions={{type: "custom"}}
                proOptions={{hideAttribution: true}}
                panOnDrag={false}
                zoomOnScroll={false}
                zoomOnPinch={false}
                zoomOnDoubleClick={false}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
            >
                <Background color="white" lineWidth={0.2} gap={25} variant={BackgroundVariant.Lines}/>
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
