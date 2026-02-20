import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import type {Edge, Node} from "@xyflow/react";
import {useReactFlow} from "@xyflow/react";
import type {EdgeData, NodeData} from "../types";
import type {RankDir} from "../layout";

interface UseFocusOptions {
    nodes: Node<NodeData>[];
    edges: Edge<EdgeData>[];
    activeNodeId: string | null;
    rankDir?: RankDir;
}

const FIT_VIEW_DURATION = 1500;

function getNeighbourIds(nodeId: string, nodes: Node<NodeData>[], edges: Edge<EdgeData>[], isHorizontal: boolean): any[] {
    const nodeRank = new Map<string, number>(
        nodes.map((n) => [n.id, isHorizontal ? n.position.x : n.position.y]),
    );
    const selfRank = nodeRank.get(nodeId) ?? 0;

    let before: { id: string; rank: number } | null = null;
    let after: { id: string; rank: number } | null = null;

    for (const e of edges) {
        const nbrId = e.source === nodeId ? e.target : e.target === nodeId ? e.source : null;
        if (!nbrId) continue;
        const rank = nodeRank.get(nbrId) ?? 0;
        if (rank < selfRank) {
            if (before === null || rank > before.rank) before = {id: nbrId, rank};
        } else {
            if (after === null || rank < after.rank) after = {id: nbrId, rank};
        }
    }

    return [before?.id, after?.id].filter((id): id is string => id !== undefined).map((id) => ({id}));
}

export function useFocus({nodes, edges, activeNodeId, rankDir = "TB"}: UseFocusOptions) {
    const {fitView} = useReactFlow();
    const [mode, setMode] = useState<"auto" | "manual">("auto");
    const prevMode = useRef<"auto" | "manual">(mode);
    const initialDone = useRef(false);
    const prevFocusId = useRef<string | null>(null);

    const isManual = useMemo(() => mode === "manual", [mode]);
    const isHorizontal = useMemo(() => ["LR", "RL"].includes(rankDir), [rankDir]);

    const fitContent = useCallback(async () => {
        await fitView({duration: FIT_VIEW_DURATION});
    }, [fitView])

    const goAuto = useCallback(async () => {
        setMode("auto");
        await fitContent();
    }, [fitContent])

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
                    nodes: [startNode, ...getNeighbourIds(startNode.id, nodes, edges, isHorizontal)],
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

        if (nodes.some((n) => n.className === "error")) {
            fitView({duration: FIT_VIEW_DURATION}).then();
        } else if (activeNodeId && activeNodeId !== prevFocusId.current) {
            prevFocusId.current = activeNodeId;

            const activeNode = nodes.find((n) => n.id === activeNodeId);
            if (activeNode?.data.nodeType === "end") {
                fitView({duration: FIT_VIEW_DURATION}).then();
            } else {
                fitView({
                    nodes: [{id: activeNodeId}, ...getNeighbourIds(activeNodeId, nodes, edges, isHorizontal)],
                    duration: FIT_VIEW_DURATION,
                }).then();
            }
        }
    }, [nodes, edges, activeNodeId, fitView, mode, isHorizontal]);

    return {isManual, goAuto, goManual, fitContent};
}
