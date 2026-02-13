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

function getNeighbourIds(nodeId: string, nodes: Node<NodeData>[], edges: Edge<EdgeData>[]): any[] {
    const nodeY = new Map<string, number>(nodes.map((n) => [n.id, n.position.y]));
    const selfY = nodeY.get(nodeId) ?? 0;

    let above: { id: string; y: number } | null = null;
    let below: { id: string; y: number } | null = null;

    for (const e of edges) {
        const nbrId = e.source === nodeId ? e.target : e.target === nodeId ? e.source : null;
        if (!nbrId) continue;
        const y = nodeY.get(nbrId) ?? 0;
        if (y < selfY) {
            if (above === null || y > above.y) above = {id: nbrId, y};
        } else {
            if (below === null || y < below.y) below = {id: nbrId, y};
        }
    }

    return [above?.id, below?.id].filter((id): id is string => id !== undefined).map((id) => ({id}));
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
        await fitView({duration: FIT_VIEW_DURATION});
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
                fitView({
                    nodes: [startNode, ...getNeighbourIds(startNode.id, nodes, edges)],
                    duration: 0,
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
                fitView({duration: FIT_VIEW_DURATION}).then();
            } else {
                fitView({
                    nodes: [{id: activeNodeId}, ...getNeighbourIds(activeNodeId, nodes, edges)],
                    duration: FIT_VIEW_DURATION,
                }).then();
            }
        }
    }, [nodes, edges, activeNodeId, fitView, mode]);

    return {isManual, goAuto, goManual};
}
