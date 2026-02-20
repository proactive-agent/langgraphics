import {type ReactNode, useCallback, useEffect, useState} from "react";
import {Background, type ColorMode, type Edge, type Node, type NodeTypes, ReactFlow} from "@xyflow/react";
import {Controls} from "./Controls";
import {CustomNode} from "./CustomNode";
import {useFocus} from "../hooks/useFocus";
import type {EdgeData, ExecutionEvent, NodeData} from "../types";
import type {RankDir} from "../layout";

const nodeTypes: NodeTypes = {custom: CustomNode as NodeTypes[string]};

interface GraphCanvasProps {
    nodes: Node<NodeData>[];
    edges: Edge<EdgeData>[];
    events: ExecutionEvent[];
    activeNodeId: string | null;
    inspect: ReactNode;
    initialRankDir?: RankDir;
    initialColorMode?: ColorMode;
    onRankDirChange?: (v: RankDir) => void;
}

export function GraphCanvas({nodes, edges, events, activeNodeId, inspect, initialColorMode = "system", initialRankDir = "TB", onRankDirChange}: GraphCanvasProps) {
    const [rankDir, setRankDir] = useState<RankDir>(initialRankDir);
    const [colorMode, setColorMode] = useState<ColorMode>(initialColorMode);
    const {isManual, goAuto, goManual, fitContent} = useFocus({nodes, edges, activeNodeId, rankDir});

    const handleRankDirChange = useCallback(async (v: RankDir) => {
        setRankDir(v);
        onRankDirChange?.(v);
        await fitContent();
    }, [onRankDirChange, fitContent])

    useEffect(() => {
        if (events.find(({type}) => ["error", "run_end"].includes(type))) {
            fitContent().then();
        }
    }, [events, fitContent]);

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
                rankDir={rankDir}
                goManual={goManual}
                isManual={isManual}
                colorMode={colorMode}
                setColorMode={setColorMode}
                setRankDir={handleRankDirChange}
            />
            <Background/>
            {inspect}
        </ReactFlow>
    );
}
