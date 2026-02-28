import {type ReactNode, useCallback, useEffect, useState} from "react";
import {Background, type ColorMode, type Edge, type Node, type NodeTypes, ReactFlow} from "@xyflow/react";
import {Controls} from "./Controls";
import {CustomNode} from "./CustomNode";
import {useFocus} from "../hooks/useFocus";
import type {EdgeData, ExecutionEvent, InspectorMode, NodeData, ViewMode} from "../types";
import type {RankDir} from "../layout";

const nodeTypes: NodeTypes = {custom: CustomNode as NodeTypes[string]};

interface GraphCanvasProps {
    nodes: Node<NodeData>[];
    edges: Edge<EdgeData>[];
    events: ExecutionEvent[];
    activeNodeIds: string[];
    inspect: ReactNode;
    initialMode: ViewMode;
    initialRankDir?: RankDir;
    initialColorMode?: ColorMode;
    initialInspect?: InspectorMode;
    onRankDirChange?: (v: RankDir) => void;
}

export function GraphCanvas({nodes, edges, events, activeNodeIds, inspect, initialMode = "auto", initialInspect = "off", initialColorMode = "system", initialRankDir = "TB", onRankDirChange}: GraphCanvasProps) {
    const [rankDir, setRankDir] = useState<RankDir>(initialRankDir);
    const [colorMode, setColorMode] = useState<ColorMode>(initialColorMode);
    const [inspectorMode, setInspectorMode] = useState<InspectorMode>(initialInspect);
    const {isManual, goAuto, goManual, fitContent} = useFocus({nodes, edges, activeNodeIds, rankDir, initialMode});

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
            className={`inspector-${inspectorMode}`}
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
                fitContent={fitContent}
                setColorMode={setColorMode}
                inspectorMode={inspectorMode}
                setRankDir={handleRankDirChange}
                setInspectorMode={setInspectorMode}
            />
            <Background/>
            <div className={`inspect-wrapper-${inspectorMode}`}>
                {inspect}
            </div>
        </ReactFlow>
    );
}
