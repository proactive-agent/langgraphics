import dagre from "@dagrejs/dagre";
import type {Edge, Node, XYPosition} from "reactflow";
import {Position} from "reactflow";
import type {EdgeData, GraphMessage, NodeData} from "./types";

const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;
const SMALL_NODE_WIDTH = 120;
const SMALL_NODE_HEIGHT = 40;

function pairKey(a: string, b: string) {
    return a < b ? `${a}--${b}` : `${b}--${a}`;
}

function facingPosition(from: XYPosition, to: XYPosition): Position {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? Position.Right : Position.Left;
    return dy >= 0 ? Position.Bottom : Position.Top;
}

function neighborPortId(neighborId: string, idx: number) {
    return `nbr:${neighborId}:${idx}`;
}

function indexEdgesToClosePorts(
    edges: { id: string; source: string; target: string }[]
): Map<string, number> {
    const groups = new Map<string, { id: string; source: string; target: string }[]>();
    for (const e of edges) {
        const k = pairKey(e.source, e.target);
        const arr = groups.get(k) ?? [];
        arr.push(e);
        groups.set(k, arr);
    }
    const indexed = new Map<string, number>();
    for (const arr of groups.values()) {
        const sorted = arr.slice().sort((a, b) => a.id.localeCompare(b.id));
        for (let i = 0; i < sorted.length; i++) indexed.set(sorted[i].id, i);
    }
    return indexed;
}

export function computeLayout(topology: GraphMessage): {
    nodes: Node<NodeData>[];
    edges: Edge<EdgeData>[];
} {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({rankdir: "TB", ranksep: 80, nodesep: 40, marginx: 20, marginy: 20});

    for (const n of topology.nodes) {
        const isTerminal = n.node_type === "start" || n.node_type === "end";
        g.setNode(n.id, {
            width: isTerminal ? SMALL_NODE_WIDTH : NODE_WIDTH,
            height: isTerminal ? SMALL_NODE_HEIGHT : NODE_HEIGHT,
        });
    }
    for (const e of topology.edges) g.setEdge(e.source, e.target);
    dagre.layout(g);

    const nodePos = new Map<string, XYPosition>();
    for (const n of topology.nodes) {
        const p = g.node(n.id);
        nodePos.set(n.id, {x: p.x, y: p.y});
    }

    const edgeIndex = indexEdgesToClosePorts(topology.edges);

    const neighborCounts = new Map<string, Map<string, number>>();
    for (const e of topology.edges) {
        const idx = edgeIndex.get(e.id) ?? 0;
        for (const [nodeId, nbrId] of [[e.source, e.target], [e.target, e.source]]) {
            if (!neighborCounts.has(nodeId)) neighborCounts.set(nodeId, new Map());
            const m = neighborCounts.get(nodeId)!;
            m.set(nbrId, Math.max(m.get(nbrId) ?? 0, idx + 1));
        }
    }

    const nodes: Node<NodeData>[] = topology.nodes.map((n) => {
        const isTerminal = n.node_type === "start" || n.node_type === "end";
        const w = isTerminal ? SMALL_NODE_WIDTH : NODE_WIDTH;
        const h = isTerminal ? SMALL_NODE_HEIGHT : NODE_HEIGHT;
        const pos = nodePos.get(n.id)!;

        const bySide = new Map<Position, string[]>();
        const nbrs = Array.from(neighborCounts.get(n.id)?.entries() ?? [])
        .sort(([a], [b]) => a.localeCompare(b));
        for (const [nbrId, count] of nbrs) {
            const side = facingPosition(pos, nodePos.get(nbrId)!);
            const arr = bySide.get(side) ?? [];
            for (let i = 0; i < count; i++) arr.push(neighborPortId(nbrId, i));
            bySide.set(side, arr);
        }
        for (const arr of bySide.values()) arr.sort();

        const handles: NodeData["handles"] = [];
        for (const [side, ids] of bySide.entries()) {
            const step = 100 / (ids.length + 1);
            for (let i = 0; i < ids.length; i++) {
                const tPct = step * (i + 1);
                const style = side === Position.Left || side === Position.Right
                    ? {top: `${tPct}%`, transform: "translateY(-50%)"}
                    : {left: `${tPct}%`, transform: "translateX(-50%)"};
                handles.push({id: ids[i], position: side, style});
            }
        }

        return {
            id: n.id,
            type: "custom",
            position: {x: pos.x - w / 2, y: pos.y - h / 2},
            data: {label: n.name, nodeType: n.node_type, status: "idle" as const, handles},
        };
    });

    const edges: Edge<EdgeData>[] = topology.edges.map((e) => {
        const idx = edgeIndex.get(e.id) ?? 0;
        return {
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: neighborPortId(e.target, idx),
            targetHandle: neighborPortId(e.source, idx),
            data: {conditional: e.conditional, label: e.label, status: "idle" as const},
        };
    });

    return {nodes, edges};
}
