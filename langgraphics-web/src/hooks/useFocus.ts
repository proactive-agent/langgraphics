import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import type {Edge, Node} from "@xyflow/react";
import {useReactFlow} from "@xyflow/react";
import type {EdgeData, NodeData} from "../types";

interface UseFocusOptions {
    nodes: Node<NodeData>[];
    edges: Edge<EdgeData>[];
    activeNodeId: string | null;
}

const FIT_VIEW_DURATION = 1500;

function getNeighbourIds(nodeId: string, edges: Edge<EdgeData>[]): string[] {
    const ids = new Set<string>();
    for (const e of edges) {
        if (e.source === nodeId) ids.add(e.target);
        if (e.target === nodeId) ids.add(e.source);
    }
    return [...ids];
}

export function useFocus({nodes, edges, activeNodeId}: UseFocusOptions) {
    const {fitView} = useReactFlow();
    const [mode, setMode] = useState<"auto" | "manual">("auto");
    const prevMode = useRef<"auto" | "manual">(mode);
    const initialDone = useRef(false);
    const prevFocusId = useRef<string | null>(null);

    const isManual = useMemo(() => mode === "manual", [mode]);

    const goAuto = useCallback(async () => {
        setMode("auto");
        await fitView({duration: FIT_VIEW_DURATION, padding: 0.1, maxZoom: 1.5});
    }, [fitView])

    const goManual = useCallback(() => {
        setMode("manual");
    }, [])

    useEffect(() => {
        if (nodes.length === 0) return;

        if (!initialDone.current) {
            initialDone.current = true;
            const startNode = nodes.find((n) => n.data.nodeType === "start");
            if (startNode) {
                const neighbourIds = getNeighbourIds(startNode.id, edges);
                fitView({
                    nodes: [startNode, ...neighbourIds.map((id) => ({id}))],
                    duration: FIT_VIEW_DURATION,
                    padding: 0.3,
                    maxZoom: 1.5,
                }).then();
            }
            prevFocusId.current = null;
            prevMode.current = mode;
            return;
        }

        if (mode === "auto" && prevMode.current !== "auto") prevFocusId.current = null;
        prevMode.current = mode;

        if (mode !== "auto") return;

        if (activeNodeId && activeNodeId !== prevFocusId.current) {
            prevFocusId.current = activeNodeId;

            const activeNode = nodes.find((n) => n.id === activeNodeId);
            if (activeNode?.data.nodeType === "end") {
                fitView({duration: FIT_VIEW_DURATION, padding: 0.1, maxZoom: 1.5}).then();
            } else {
                const neighbourIds = getNeighbourIds(activeNodeId, edges);
                fitView({
                    nodes: [{id: activeNodeId}, ...neighbourIds.map((id) => ({id}))],
                    duration: FIT_VIEW_DURATION,
                    padding: 0.3,
                    maxZoom: 1.5,
                }).then();
            }
        }
    }, [nodes, edges, activeNodeId, fitView, mode]);

    return {isManual, goAuto, goManual};
}
