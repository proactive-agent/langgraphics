import dagre from "@dagrejs/dagre";
import {Position} from "reactflow";
import type {Edge, Node, XYPosition} from "reactflow";
import type {EdgeData, GraphMessage, NodeData} from "./types";

const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;
const SMALL_NODE_WIDTH = 120;
const SMALL_NODE_HEIGHT = 40;

export function pairKey(a: string, b: string) {
    return a < b ? `${a}--${b}` : `${b}--${a}`;
}

export function uniqSorted(xs: string[]) {
    return Array.from(new Set(xs)).sort((a, b) => a.localeCompare(b));
}

export function safeEdgesFromStore(s: unknown): unknown[] {
    const store = s as Record<string, unknown> | null | undefined;
    return Array.isArray(store?.edges) ? (store.edges as unknown[]) : [];
}

export function safeNodeAbsPos(s: unknown, nodeId: string): XYPosition | null {
    const store = s as Record<string, unknown> | null | undefined;
    const ni = store?.nodeInternals as Map<string, Record<string, unknown>> | undefined;
    if (!ni || typeof ni.get !== "function") return null;
    const n = ni.get(nodeId);
    if (!n) return null;
    const pa = n.positionAbsolute as XYPosition | undefined;
    const p = n.position as XYPosition | undefined;
    return {x: pa?.x ?? p?.x ?? 0, y: pa?.y ?? p?.y ?? 0};
}

export function facingPosition(from: XYPosition, to: XYPosition): Position {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? Position.Right : Position.Left;
    return dy >= 0 ? Position.Bottom : Position.Top;
}

export function neighborPortId(neighborId: string, idx: number) {
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

    for (const node of topology.nodes) {
        const isTerminal = node.node_type === "start" || node.node_type === "end";
        g.setNode(node.id, {
            width: isTerminal ? SMALL_NODE_WIDTH : NODE_WIDTH,
            height: isTerminal ? SMALL_NODE_HEIGHT : NODE_HEIGHT,
        });
    }

    for (const edge of topology.edges) {
        g.setEdge(edge.source, edge.target);
    }

    dagre.layout(g);

    const nodes: Node<NodeData>[] = topology.nodes.map((n) => {
        const pos = g.node(n.id);
        const isTerminal = n.node_type === "start" || n.node_type === "end";
        const w = isTerminal ? SMALL_NODE_WIDTH : NODE_WIDTH;
        const h = isTerminal ? SMALL_NODE_HEIGHT : NODE_HEIGHT;
        return {
            id: n.id,
            type: "custom",
            position: {x: pos.x - w / 2, y: pos.y - h / 2},
            data: {label: n.name, nodeType: n.node_type, status: "idle" as const},
        };
    });

    const edgeIndex = indexEdgesToClosePorts(topology.edges);

    const edges: Edge<EdgeData>[] = topology.edges.map((e) => {
        const idx = edgeIndex.get(e.id) ?? 0;
        return {
            id: e.id,
            source: e.source,
            target: e.target,
            type: "custom",
            sourceHandle: neighborPortId(e.target, idx),
            targetHandle: neighborPortId(e.source, idx),
            data: {conditional: e.conditional, label: e.label, status: "idle" as const},
        };
    });

    return {nodes, edges};
}
