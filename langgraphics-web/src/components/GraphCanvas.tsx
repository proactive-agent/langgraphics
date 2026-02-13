import {Background, type Edge, type Node, type NodeTypes, ReactFlow} from "@xyflow/react";
import {CustomNode} from "./CustomNode";
import {useFocus} from "../hooks/useFocus";
import type {EdgeData, NodeData} from "../types";

const nodeTypes: NodeTypes = {custom: CustomNode as NodeTypes[string]};

interface GraphCanvasProps {
    nodes: Node<NodeData>[];
    edges: Edge<EdgeData>[];
    activeNodeId: string | null;
}

export function GraphCanvas({nodes, edges, activeNodeId}: GraphCanvasProps) {
    const {isManual, goAuto, goManual} = useFocus({nodes, edges, activeNodeId});

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            colorMode="system"
            nodeTypes={nodeTypes}
            proOptions={{hideAttribution: true}}
            zoomOnDoubleClick={false} nodesDraggable={false}
            nodesConnectable={false} elementsSelectable={false}
            panOnDrag={isManual} zoomOnScroll={isManual} zoomOnPinch={isManual}
        >
            <div className="mode-toggle">
                <button className={isManual ? "" : "active"} onClick={goAuto}>Auto</button>
                <button className={isManual ? "active" : ""} onClick={goManual}>Manual</button>
            </div>
            <Background/>
        </ReactFlow>
    );
}
