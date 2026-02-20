import dagre from "@dagrejs/dagre";
import {Position} from "@xyflow/react";
import type {Edge, Node} from "@xyflow/react";
import type {EdgeData, GraphMessage, NodeData} from "./types";

export type RankDir = "TB" | "LR";

const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;
const SMALL_NODE_WIDTH = 120;
const SMALL_NODE_HEIGHT = 40;
const DIRECTIONS_MAP: Record<string, Position> = {
    T: Position.Top, L: Position.Left,
    R: Position.Right, B: Position.Bottom,
};

export function computeLayout(topology: GraphMessage, rankDir: RankDir = "TB"): {
    nodes: Node<NodeData>[];
    edges: Edge<EdgeData>[];
} {
    const RANK_TO = DIRECTIONS_MAP[rankDir[1]] as Position;
    const RANK_FROM = DIRECTIONS_MAP[rankDir[0]] as Position;
    const IS_HORIZONTAL = ["LR", "RL"].includes(rankDir);

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({rankdir: rankDir, ranksep: 80, nodesep: 60, marginx: 20, marginy: 20});

    for (const n of topology.nodes) {
        const isTerminal = n.node_type === "start" || n.node_type === "end";
        g.setNode(n.id, {
            width: isTerminal ? SMALL_NODE_WIDTH : NODE_WIDTH,
            height: isTerminal ? SMALL_NODE_HEIGHT : NODE_HEIGHT,
        });
    }
    for (const e of topology.edges) g.setEdge(e.source, e.target);
    dagre.layout(g);

    const nodeX = new Map<string, number>(topology.nodes.map((n) => [n.id, g.node(n.id).x]));
    const nodeY = new Map<string, number>(topology.nodes.map((n) => [n.id, g.node(n.id).y]));

    const nodeRank = IS_HORIZONTAL ? nodeX : nodeY;
    const nodeCross = IS_HORIZONTAL ? nodeY : nodeX;
    const crossSize = IS_HORIZONTAL ? NODE_HEIGHT : NODE_WIDTH;

    const isBack = (e: { source: string; target: string }) =>
        (nodeRank.get(e.source) ?? 0) >= (nodeRank.get(e.target) ?? 0);

    for (const be of topology.edges.filter(isBack)) {
        const tRank = nodeRank.get(be.target) ?? 0;
        const minRank = Math.min(nodeRank.get(be.source) ?? 0, tRank);
        const maxRank = Math.max(nodeRank.get(be.source) ?? 0, tRank);
        const corridor = ((nodeCross.get(be.source) ?? 0) + (nodeCross.get(be.target) ?? 0)) / 2;

        for (const n of topology.nodes) {
            if (n.id === be.source || n.id === be.target) continue;
            const nRank = nodeRank.get(n.id) ?? 0;
            const nCross = nodeCross.get(n.id) ?? 0;
            if (nRank > minRank && nRank < maxRank && Math.abs(nCross - corridor) < crossSize / 2) {
                nodeCross.set(n.id, nCross - crossSize * 0.5);
            }
        }
    }

    const edgeNeighborCross = new Map<string, number>();
    const buckets = new Map<string, Map<Position, string[]>>();
    const bucket = (nodeId: string, pos: Position) => {
        if (!buckets.has(nodeId)) buckets.set(nodeId, new Map());
        const m = buckets.get(nodeId)!;
        if (!m.has(pos)) m.set(pos, []);
        return m.get(pos)!;
    };

    for (const e of topology.edges) {
        const back = isBack(e);
        bucket(e.source, back ? RANK_FROM : RANK_TO).push(`src:${e.id}`);
        bucket(e.target, back ? RANK_TO : RANK_FROM).push(`tgt:${e.id}`);
        edgeNeighborCross.set(`src:${e.id}`, nodeCross.get(e.target) ?? 0);
        edgeNeighborCross.set(`tgt:${e.id}`, nodeCross.get(e.source) ?? 0);
    }

    for (const positions of buckets.values()) {
        for (const ids of positions.values()) {
            ids.sort((a, b) => (edgeNeighborCross.get(a) ?? 0) - (edgeNeighborCross.get(b) ?? 0));
        }
    }

    const nodes: Node<NodeData>[] = topology.nodes.map((n) => {
        const isTerminal = n.node_type === "start" || n.node_type === "end";
        const w = isTerminal ? SMALL_NODE_WIDTH : NODE_WIDTH;
        const h = isTerminal ? SMALL_NODE_HEIGHT : NODE_HEIGHT;
        const pos = g.node(n.id);

        const handles: NodeData["handles"] = [];
        for (const [position, ids] of buckets.get(n.id) ?? []) {
            const step = 100 / (ids.length + 1);
            ids.forEach((id, i) => handles.push({
                id,
                position,
                type: id.startsWith("src:") ? "source" : "target",
                style: IS_HORIZONTAL
                    ? {top: `${step * (i + 1)}%`, transform: "translateY(-50%)"}
                    : {left: `${step * (i + 1)}%`, transform: "translateX(-50%)"},
            }));
        }

        return {
            id: n.id,
            type: "custom",
            position: {
                x: (nodeX.get(n.id) ?? pos.x) - w / 2,
                y: (nodeY.get(n.id) ?? pos.y) - h / 2,
            },
            data: {label: n.name, nodeType: n.node_type, status: "idle" as const, handles},
        };
    });

    const edges: Edge<EdgeData>[] = topology.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: `src:${e.id}`,
        targetHandle: `tgt:${e.id}`,
        data: {conditional: e.conditional, label: e.label, status: "idle" as const},
    }));

    return {nodes, edges};
}
