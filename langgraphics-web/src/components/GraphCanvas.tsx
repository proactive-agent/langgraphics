import {Background, type Edge, type Node, type NodeTypes, ReactFlow, ReactFlowProvider} from "@xyflow/react";
import {CustomNode} from "./CustomNode";
import type {EdgeData, NodeData} from "../types";

const nodeTypes: NodeTypes = {custom: CustomNode as NodeTypes[string]};

interface GraphCanvasProps {
    nodes: Node<NodeData>[];
    edges: Edge<EdgeData>[];
}

export function GraphCanvas({nodes, edges}: GraphCanvasProps) {
    return (
        <ReactFlowProvider>
            <ReactFlow
                fitView
                nodes={nodes}
                edges={edges}
                colorMode="system"
                nodeTypes={nodeTypes}
                proOptions={{hideAttribution: true}}
                zoomOnDoubleClick={false} nodesDraggable={false}
                nodesConnectable={false} elementsSelectable={false}
                panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false}
            >
                <Background/>
            </ReactFlow>
        </ReactFlowProvider>
    );
}
