import ReactFlow, {Background, BackgroundVariant, type Edge, type Node, ReactFlowProvider} from "reactflow";
import "reactflow/dist/style.css";
import {CustomNode} from "./CustomNode";
import {CustomEdge} from "./CustomEdge";
import type {EdgeData, NodeData} from "../types";
import type {ConnectionStatus} from "../hooks";

const nodeTypes = {custom: CustomNode};
const edgeTypes = {custom: CustomEdge};

const STATUS_COLOR: Record<ConnectionStatus, string> = {
    connected: "#22c55e",
    connecting: "#f59e0b",
    disconnected: "#ef4444",
};

const STATUS_LABEL: Record<ConnectionStatus, string> = {
    connected: "Connected",
    connecting: "Connecting...",
    disconnected: "Disconnected",
};

const ARROW_MARKERS = [
    {id: "arrow-idle", color: "#94a3b8"},
    {id: "arrow-active", color: "#22c55e"},
    {id: "arrow-traversed", color: "#3b82f6"},
];

interface GraphCanvasProps {
    nodes: Node<NodeData>[];
    edges: Edge<EdgeData>[];
    connectionStatus: ConnectionStatus;
}

export function GraphCanvas({nodes, edges, connectionStatus}: GraphCanvasProps) {
    return (
        <ReactFlowProvider>
            <svg style={{position: "absolute", width: 0, height: 0}}>
                <defs>
                    {ARROW_MARKERS.map((m) => (
                        <marker key={m.id} id={m.id} viewBox="0 0 10 10" refX="10" refY="5"
                                markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                            <polyline points="0 0, 10 5, 0 10" fill="none" stroke={m.color}
                                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </marker>
                    ))}
                </defs>
            </svg>
            <ReactFlow
                nodes={nodes} edges={edges}
                nodeTypes={nodeTypes} edgeTypes={edgeTypes}
                onInit={(instance) => instance.fitView()}
                defaultEdgeOptions={{type: "custom"}}
                proOptions={{hideAttribution: true}}
                panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false}
                zoomOnDoubleClick={false} nodesDraggable={false}
                nodesConnectable={false} elementsSelectable={false}
            >
                <Background color="white" lineWidth={0.2} gap={25} variant={BackgroundVariant.Lines}/>
                <div className="status-indicator">
                    <div
                        className="status-indicator__dot"
                        style={{
                            background: STATUS_COLOR[connectionStatus],
                            boxShadow: connectionStatus === "connected" ? `0 0 6px ${STATUS_COLOR[connectionStatus]}` : undefined,
                        }}
                    />
                    <span>{STATUS_LABEL[connectionStatus]}</span>
                </div>
            </ReactFlow>
        </ReactFlowProvider>
    );
}
