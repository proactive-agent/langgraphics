/** Hook that computes dagre layout when topology changes. */

import { useMemo } from "react";
import type { Node, Edge } from "@xyflow/react";
import type { GraphMessage } from "../types/protocol";
import type { NodeData, EdgeData } from "../types/graph";
import { computeLayout } from "../utils/layout";

interface UseGraphLayoutReturn {
  nodes: Node<NodeData>[];
  edges: Edge<EdgeData>[];
}

const EMPTY: UseGraphLayoutReturn = { nodes: [], edges: [] };

export function useGraphLayout(
  topology: GraphMessage | null
): UseGraphLayoutReturn {
  return useMemo(() => {
    if (!topology) return EMPTY;
    return computeLayout(topology);
  }, [topology]);
}
