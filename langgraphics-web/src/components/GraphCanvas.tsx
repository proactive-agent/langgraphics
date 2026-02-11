import ReactFlow, {Background, BackgroundVariant, type Edge, type Node, ReactFlowProvider} from "reactflow";
import "reactflow/dist/style.css";
import {CustomNode} from "./CustomNode";
import type {EdgeData, NodeData} from "../types";
import type {ConnectionStatus} from "../hooks";

const nodeTypes = {custom: CustomNode};

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

interface GraphCanvasProps {
    nodes: Node<NodeData>[];
    edges: Edge<EdgeData>[];
    connectionStatus: ConnectionStatus;
}

export function GraphCanvas({nodes, edges, connectionStatus}: GraphCanvasProps) {
    return (
        <ReactFlowProvider>
            <ReactFlow
                nodes={nodes} edges={edges}
                nodeTypes={nodeTypes}
                onInit={(instance) => instance.fitView()}
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
