import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import type {Edge, Node} from "@xyflow/react";
import {useReactFlow} from "@xyflow/react";
import type {EdgeData, NodeData, ViewMode} from "../types";
import type {RankDir} from "../layout";

interface UseFocusOptions {
    nodes: Node<NodeData>[];
    edges: Edge<EdgeData>[];
    activeNodeIds: string[];
    rankDir?: RankDir;
    initialMode?: ViewMode;
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

export function useFocus({nodes, edges, activeNodeIds, rankDir = "TB", initialMode = "auto"}: UseFocusOptions) {
    const {fitView} = useReactFlow();
    const [mode, setMode] = useState<"auto" | "manual">(initialMode);
    const prevMode = useRef<"auto" | "manual">(mode);
    const initialDone = useRef(false);
    const prevFocusKey = useRef<string>("");

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
            prevFocusKey.current = "";
            prevMode.current = mode;
            return;
        }

        if (mode === "auto" && prevMode.current !== "auto") prevFocusKey.current = "";
        prevMode.current = mode;

        if (mode !== "auto") return;

        const focusKey = [...activeNodeIds].sort().join(",");
        if (activeNodeIds.length > 0 && focusKey !== prevFocusKey.current) {
            prevFocusKey.current = focusKey;

            const activeNodes = nodes.filter(
                (n) => activeNodeIds.includes(n.id) && n.data.nodeType === "node",
            );
            if (activeNodes.length > 0) {
                const neighbours = activeNodes.flatMap((n) =>
                    getNeighbourIds(n.id, nodes, edges, isHorizontal),
                );
                fitView({
                    nodes: [...activeNodes.map((n) => ({id: n.id})), ...neighbours],
                    duration: FIT_VIEW_DURATION,
                }).then();
            }
        }
    }, [nodes, edges, activeNodeIds, fitView, mode, isHorizontal]);

    return {isManual, goAuto, goManual, fitContent};
}
