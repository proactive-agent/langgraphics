/** Dagre-based auto-layout: converts graph topology to positioned React Flow nodes/edges. */

import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "reactflow";
import type { GraphMessage } from "../types/protocol";
import type { NodeData, EdgeData } from "../types/graph";
import { indexEdgesToClosePorts, neighborPortId } from "./ports";

const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;
const SMALL_NODE_WIDTH = 120;
const SMALL_NODE_HEIGHT = 40;
const RANK_SEP = 80;
const NODE_SEP = 40;

export function computeLayout(topology: GraphMessage): {
  nodes: Node<NodeData>[];
  edges: Edge<EdgeData>[];
} {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    ranksep: RANK_SEP,
    nodesep: NODE_SEP,
    marginx: 20,
    marginy: 20,
  });

  // Add nodes with appropriate sizing
  for (const node of topology.nodes) {
    const isTerminal = node.node_type === "start" || node.node_type === "end";
    g.setNode(node.id, {
      width: isTerminal ? SMALL_NODE_WIDTH : NODE_WIDTH,
      height: isTerminal ? SMALL_NODE_HEIGHT : NODE_HEIGHT,
    });
  }

  // Add edges
  for (const edge of topology.edges) {
    g.setEdge(edge.source, edge.target);
  }

  // Run layout
  dagre.layout(g);

  // Map to React Flow nodes
  const nodes: Node<NodeData>[] = topology.nodes.map((n) => {
    const pos = g.node(n.id);
    const isTerminal = n.node_type === "start" || n.node_type === "end";
    const w = isTerminal ? SMALL_NODE_WIDTH : NODE_WIDTH;
    const h = isTerminal ? SMALL_NODE_HEIGHT : NODE_HEIGHT;

    return {
      id: n.id,
      type: "custom",
      position: {
        x: pos.x - w / 2,
        y: pos.y - h / 2,
      },
      data: {
        label: n.name,
        nodeType: n.node_type,
        status: "idle" as const,
      },
    };
  });

  // Build parallel-edge index for handle assignment
  const edgeIndex = indexEdgesToClosePorts(topology.edges);

  // Map to React Flow edges with neighbor-port handles
  const edges: Edge<EdgeData>[] = topology.edges.map((e) => {
    const idx = edgeIndex.get(e.id) ?? 0;

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: "custom",
      sourceHandle: neighborPortId(e.target, idx),
      targetHandle: neighborPortId(e.source, idx),
      data: {
        conditional: e.conditional,
        label: e.label,
        status: "idle" as const,
      },
    };
  });

  return { nodes, edges };
}
