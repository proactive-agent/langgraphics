/** Utilities for the auto-ports / neighbor-based handle system. */

import type { XYPosition } from "reactflow";
import { Position } from "reactflow";

/** Canonical undirected key for a pair of node ids. */
export function pairKey(a: string, b: string) {
  return a < b ? `${a}--${b}` : `${b}--${a}`;
}

/** Deduplicate and sort an array of strings. */
export function uniqSorted(xs: string[]) {
  return Array.from(new Set(xs)).sort((a, b) => a.localeCompare(b));
}

/** Safely read edges array from React Flow internal store. */
export function safeEdgesFromStore(s: unknown): unknown[] {
  const store = s as Record<string, unknown> | null | undefined;
  return Array.isArray(store?.edges) ? store.edges as unknown[] : [];
}

/** Safely read a node's absolute position from React Flow internal store. */
export function safeNodeAbsPos(s: unknown, nodeId: string): XYPosition | null {
  const store = s as Record<string, unknown> | null | undefined;
  const ni = store?.nodeInternals as Map<string, Record<string, unknown>> | undefined;
  if (!ni || typeof ni.get !== "function") return null;
  const n = ni.get(nodeId);
  if (!n) return null;
  const pa = n.positionAbsolute as XYPosition | undefined;
  const p = n.position as XYPosition | undefined;
  return {
    x: pa?.x ?? p?.x ?? 0,
    y: pa?.y ?? p?.y ?? 0,
  };
}

/** Determine which side of `from` faces `to`. */
export function facingPosition(from: XYPosition, to: XYPosition): Position {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy))
    return dx >= 0 ? Position.Right : Position.Left;
  return dy >= 0 ? Position.Bottom : Position.Top;
}

/** Handle id for a specific neighbor + parallel index. */
export function neighborPortId(neighborId: string, idx: number) {
  return `nbr:${neighborId}:${idx}`;
}

/**
 * For each unordered pair of nodes, assign stable indices 0..k-1
 * to their parallel edges (sorted by edge id).
 */
export function indexEdgesToClosePorts(
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
