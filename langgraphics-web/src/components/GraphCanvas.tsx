import {useState} from "react";
import {Background, type ColorMode, type Edge, type Node, type NodeTypes, ReactFlow} from "@xyflow/react";
import {Controls} from "./Controls";
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
    const [colorMode, setColorMode] = useState<ColorMode>("system");
    const {isManual, goAuto, goManual} = useFocus({nodes, edges, activeNodeId});

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            colorMode={colorMode}
            nodeTypes={nodeTypes}
            proOptions={{hideAttribution: true}}
            zoomOnDoubleClick={false} nodesDraggable={false}
            nodesConnectable={false} elementsSelectable={false}
            panOnDrag={isManual} zoomOnScroll={isManual} zoomOnPinch={isManual}
        >
            <Controls
                goAuto={goAuto}
                goManual={goManual}
                isManual={isManual}
                colorMode={colorMode}
                setColorMode={setColorMode}
            />
            <Background/>
        </ReactFlow>
    );
}
