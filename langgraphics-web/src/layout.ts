import dagre from "@dagrejs/dagre";
import {Position} from "@xyflow/react";
import type {Edge, Node} from "@xyflow/react";
import type {EdgeData, GraphMessage, NodeData, SubgraphTopology} from "./types";

export type RankDir = "TB" | "LR";

const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;
const SMALL_NODE_WIDTH = 120;
const SMALL_NODE_HEIGHT = 40;
const SUBGRAPH_PADDING = 40;
const SUBGRAPH_HEADER_HEIGHT = 36;
const DIRECTIONS_MAP: Record<string, Position> = {
    T: Position.Top, L: Position.Left,
    R: Position.Right, B: Position.Bottom,
};

function _computeSubgraphLayout(
    subgraph: SubgraphTopology,
    parentId: string,
    rankDir: RankDir,
): {nodes: Node<NodeData>[]; edges: Edge<EdgeData>[]; width: number; height: number} {
    const RANK_TO = DIRECTIONS_MAP[rankDir[1]] as Position;
    const RANK_FROM = DIRECTIONS_MAP[rankDir[0]] as Position;
    const IS_HORIZONTAL = ["LR", "RL"].includes(rankDir);

    const innerLayouts = new Map<string, ReturnType<typeof _computeSubgraphLayout>>();
    for (const n of subgraph.nodes) {
        if (n.node_type === "subgraph" && n.subgraph) {
            innerLayouts.set(n.id, _computeSubgraphLayout(n.subgraph, `${parentId}:${n.id}`, rankDir));
        }
    }

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({rankdir: rankDir, ranksep: 60, nodesep: 40, marginx: 30, marginy: 0});

    for (const n of subgraph.nodes) {
        const inner = innerLayouts.get(n.id);
        const isTerminal = n.node_type === "start" || n.node_type === "end";
        g.setNode(n.id, inner
            ? {width: inner.width, height: inner.height}
            : {width: isTerminal ? SMALL_NODE_WIDTH : NODE_WIDTH, height: isTerminal ? SMALL_NODE_HEIGHT : NODE_HEIGHT}
        );
    }
    for (const e of subgraph.edges) g.setEdge(e.source, e.target);
    dagre.layout(g);

    const nodeX = new Map<string, number>(subgraph.nodes.map((n) => [n.id, g.node(n.id).x]));
    const nodeY = new Map<string, number>(subgraph.nodes.map((n) => [n.id, g.node(n.id).y]));
    const nodeRank = IS_HORIZONTAL ? nodeX : nodeY;
    const nodeCross = IS_HORIZONTAL ? nodeY : nodeX;
    const crossSize = IS_HORIZONTAL ? NODE_HEIGHT : NODE_WIDTH;

    const isBack = (e: {source: string; target: string}) =>
        (nodeRank.get(e.source) ?? 0) >= (nodeRank.get(e.target) ?? 0);

    for (const be of subgraph.edges.filter(isBack)) {
        const tRank = nodeRank.get(be.target) ?? 0;
        const minRank = Math.min(nodeRank.get(be.source) ?? 0, tRank);
        const maxRank = Math.max(nodeRank.get(be.source) ?? 0, tRank);
        const corridor = ((nodeCross.get(be.source) ?? 0) + (nodeCross.get(be.target) ?? 0)) / 2;
        for (const n of subgraph.nodes) {
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

    for (const e of subgraph.edges) {
        const back = isBack(e);
        bucket(e.source, back ? RANK_FROM : RANK_TO).push(`src:${parentId}:${e.id}`);
        bucket(e.target, back ? RANK_TO : RANK_FROM).push(`tgt:${parentId}:${e.id}`);
        edgeNeighborCross.set(`src:${parentId}:${e.id}`, nodeCross.get(e.target) ?? 0);
        edgeNeighborCross.set(`tgt:${parentId}:${e.id}`, nodeCross.get(e.source) ?? 0);
    }

    for (const positions of buckets.values()) {
        for (const ids of positions.values()) {
            ids.sort((a, b) => (edgeNeighborCross.get(a) ?? 0) - (edgeNeighborCross.get(b) ?? 0));
        }
    }

    const {width: gWidth = 0, height: gHeight = 0} = g.graph();

    const nodes: Node<NodeData>[] = subgraph.nodes.map((n) => {
        const inner = innerLayouts.get(n.id);
        const isTerminal = n.node_type === "start" || n.node_type === "end";
        const w = inner ? inner.width : (isTerminal ? SMALL_NODE_WIDTH : NODE_WIDTH);
        const h = inner ? inner.height : (isTerminal ? SMALL_NODE_HEIGHT : NODE_HEIGHT);
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

        const node: Node<NodeData> = {
            id: `${parentId}:${n.id}`,
            type: "custom",
            parentId,
            extent: "parent" as const,
            position: {
                x: (nodeX.get(n.id) ?? pos.x) - w / 2 + SUBGRAPH_PADDING / 2,
                y: (nodeY.get(n.id) ?? pos.y) - h / 2 + SUBGRAPH_HEADER_HEIGHT + SUBGRAPH_PADDING / 2,
            },
            data: {label: n.name, nodeType: n.node_type as NodeData["nodeType"], status: "idle" as const, handles},
        };
        if (inner) node.style = {width: inner.width, height: inner.height};
        return node;
    });

    const edges: Edge<EdgeData>[] = subgraph.edges.map((e) => ({
        id: `${parentId}:${e.id}`,
        source: `${parentId}:${e.source}`,
        target: `${parentId}:${e.target}`,
        sourceHandle: `src:${parentId}:${e.id}`,
        targetHandle: `tgt:${parentId}:${e.id}`,
        data: {conditional: e.conditional, label: e.label, status: "idle" as const},
    }));

    const allNodes = [...nodes];
    const allEdges = [...edges];
    for (const inner of innerLayouts.values()) {
        allNodes.push(...inner.nodes);
        allEdges.push(...inner.edges);
    }

    return {
        nodes: allNodes,
        edges: allEdges,
        width: gWidth + SUBGRAPH_PADDING,
        height: gHeight + SUBGRAPH_HEADER_HEIGHT + SUBGRAPH_PADDING,
    };
}

export function computeLayout(topology: GraphMessage, rankDir: RankDir = "TB"): {
    nodes: Node<NodeData>[];
    edges: Edge<EdgeData>[];
} {
    const RANK_TO = DIRECTIONS_MAP[rankDir[1]] as Position;
    const RANK_FROM = DIRECTIONS_MAP[rankDir[0]] as Position;
    const IS_HORIZONTAL = ["LR", "RL"].includes(rankDir);

    const subgraphLayouts = new Map<string, ReturnType<typeof _computeSubgraphLayout>>();
    for (const n of topology.nodes) {
        if (n.node_type === "subgraph" && n.subgraph) {
            subgraphLayouts.set(n.id, _computeSubgraphLayout(n.subgraph, n.id, rankDir));
        }
    }

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({rankdir: rankDir, ranksep: 80, nodesep: 60, marginx: 20, marginy: 20});

    for (const n of topology.nodes) {
        const sg = subgraphLayouts.get(n.id);
        const isTerminal = n.node_type === "start" || n.node_type === "end";
        g.setNode(n.id, sg
            ? {width: sg.width, height: sg.height}
            : {width: isTerminal ? SMALL_NODE_WIDTH : NODE_WIDTH, height: isTerminal ? SMALL_NODE_HEIGHT : NODE_HEIGHT},
        );
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

    const outerNodes: Node<NodeData>[] = topology.nodes.map((n) => {
        const sg = subgraphLayouts.get(n.id);
        const isTerminal = n.node_type === "start" || n.node_type === "end";
        const w = sg ? sg.width : (isTerminal ? SMALL_NODE_WIDTH : NODE_WIDTH);
        const h = sg ? sg.height : (isTerminal ? SMALL_NODE_HEIGHT : NODE_HEIGHT);
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

        const node: Node<NodeData> = {
            id: n.id,
            type: "custom",
            position: {
                x: (nodeX.get(n.id) ?? pos.x) - w / 2,
                y: (nodeY.get(n.id) ?? pos.y) - h / 2,
            },
            data: {label: n.name, nodeType: n.node_type, status: "idle" as const, handles},
        };
        if (sg) node.style = {width: sg.width, height: sg.height};
        return node;
    });

    const outerEdges: Edge<EdgeData>[] = topology.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: `src:${e.id}`,
        targetHandle: `tgt:${e.id}`,
        data: {conditional: e.conditional, label: e.label, status: "idle" as const},
    }));

    const allNodes = [...outerNodes];
    const allEdges = [...outerEdges];
    for (const sgLayout of subgraphLayouts.values()) {
        allNodes.push(...sgLayout.nodes);
        allEdges.push(...sgLayout.edges);
    }

    return {nodes: allNodes, edges: allEdges};
}
