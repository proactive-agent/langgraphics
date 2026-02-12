import dagre from "@dagrejs/dagre";
import {Position} from "@xyflow/react";
import type {Edge, Node} from "@xyflow/react";
import type {EdgeData, GraphMessage, NodeData} from "./types";

const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;
const SMALL_NODE_WIDTH = 120;
const SMALL_NODE_HEIGHT = 40;

export function computeLayout(topology: GraphMessage): {
    nodes: Node<NodeData>[];
    edges: Edge<EdgeData>[];
} {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({rankdir: "TB", ranksep: 80, nodesep: 60, marginx: 20, marginy: 20});

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
    const isBack = (e: { source: string; target: string }) => (nodeY.get(e.source) ?? 0) >= (nodeY.get(e.target) ?? 0);

    const edgeNeighborX = new Map<string, number>();
    const buckets = new Map<string, Map<Position, string[]>>();
    const bucket = (nodeId: string, pos: Position) => {
        if (!buckets.has(nodeId)) buckets.set(nodeId, new Map());
        const m = buckets.get(nodeId)!;
        if (!m.has(pos)) m.set(pos, []);
        return m.get(pos)!;
    };

    for (const e of topology.edges) {
        const back = isBack(e);
        bucket(e.source, back ? Position.Top : Position.Bottom).push(`src:${e.id}`);
        bucket(e.target, back ? Position.Bottom : Position.Top).push(`tgt:${e.id}`);
        edgeNeighborX.set(`src:${e.id}`, nodeX.get(e.target) ?? 0);
        edgeNeighborX.set(`tgt:${e.id}`, nodeX.get(e.source) ?? 0);
    }

    for (const positions of buckets.values()) {
        for (const ids of positions.values()) {
            ids.sort((a, b) => (edgeNeighborX.get(a) ?? 0) - (edgeNeighborX.get(b) ?? 0));
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
                style: {left: `${step * (i + 1)}%`, transform: "translateX(-50%)"},
            }));
        }

        return {
            id: n.id,
            type: "custom",
            position: {x: pos.x - w / 2, y: pos.y - h / 2},
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
