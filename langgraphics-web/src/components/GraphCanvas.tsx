import {useEffect, useMemo, useRef, useState} from "react";
import {
    Background,
    type Edge,
    type Node,
    type NodeTypes,
    ReactFlow,
    ReactFlowProvider,
    useReactFlow
} from "@xyflow/react";
import {CustomNode} from "./CustomNode";
import type {EdgeData, NodeData} from "../types";

const nodeTypes: NodeTypes = {custom: CustomNode as NodeTypes[string]};

type ViewMode = "auto" | "manual";

interface GraphCanvasProps {
    nodes: Node<NodeData>[];
    edges: Edge<EdgeData>[];
    activeNodeId: string | null;
}

function getNeighbourIds(nodeId: string, edges: Edge<EdgeData>[]): string[] {
    const ids = new Set<string>();
    for (const e of edges) {
        if (e.source === nodeId) ids.add(e.target);
        if (e.target === nodeId) ids.add(e.source);
    }
    return [...ids];
}

function ViewportController({nodes, edges, activeNodeId, mode}: GraphCanvasProps & { mode: ViewMode }) {
    const {fitView} = useReactFlow();
    const prevMode = useRef<ViewMode>(mode);
    const initialDone = useRef(false);
    const prevFocusId = useRef<string | null>(null);

    useEffect(() => {
        if (nodes.length === 0) return;

        if (!initialDone.current) {
            initialDone.current = true;
            const startNode = nodes.find((n) => n.data.nodeType === "start");
            if (startNode) {
                const neighbourIds = getNeighbourIds(startNode.id, edges);
                fitView({
                    nodes: [startNode, ...neighbourIds.map((id) => ({id}))],
                    duration: 300,
                    padding: 0.3,
                    maxZoom: 1.5,
                });
            }
            prevFocusId.current = null;
            prevMode.current = mode;
            return;
        }

        prevFocusId.current = mode === "auto" && prevMode.current !== "auto" ? null : mode;

        if (mode !== "auto") return;

        if (activeNodeId && activeNodeId !== prevFocusId.current) {
            prevFocusId.current = activeNodeId;

            const activeNode = nodes.find((n) => n.id === activeNodeId);
            if (activeNode?.data.nodeType === "end") {
                fitView({duration: 500, padding: 0.1, maxZoom: 1.5});
            } else {
                const neighbourIds = getNeighbourIds(activeNodeId, edges);
                fitView({
                    nodes: [{id: activeNodeId}, ...neighbourIds.map((id) => ({id}))],
                    duration: 400,
                    padding: 0.3,
                    maxZoom: 1.5,
                });
            }
        }
    }, [nodes, edges, activeNodeId, fitView, mode]);

    return null;
}

export function GraphCanvas({nodes, edges, activeNodeId}: GraphCanvasProps) {
    const [mode, setMode] = useState<ViewMode>("auto");

    const isManual = useMemo(() => mode === "manual", [mode]);

    return (
        <ReactFlowProvider>
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
                <ViewportController nodes={nodes} edges={edges} activeNodeId={activeNodeId} mode={mode}/>
                <Background/>
            </ReactFlow>
        </ReactFlowProvider>
    );
}
