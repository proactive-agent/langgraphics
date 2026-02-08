import React, { memo, useMemo } from "react";
import { Handle, type NodeProps, type Edge, useStore } from "reactflow";
import type { NodeData } from "../types/graph";
import {
  pairKey,
  uniqSorted,
  safeEdgesFromStore,
  safeNodeAbsPos,
  facingPosition,
  neighborPortId,
} from "../utils/ports";
import "../styles/nodes.css";

/**
 * AutoPorts node: dynamically creates hidden handles facing each neighbor.
 * Supports multiple parallel edges per neighbor pair (one port per edge).
 * Keeps the existing status-based CSS classes for execution visualization.
 */
export const CustomNode = memo(function CustomNode(props: NodeProps) {
  const { id, data: rawData } = props;
  const data = rawData as NodeData;

  const typeClass = `custom-node--${data.nodeType}`;
  const statusClass = `custom-node--${data.status}`;

  const edges = useStore(safeEdgesFromStore) as Edge[];
  const myAbs = useStore((s) => safeNodeAbsPos(s, id));

  // Unique sorted neighbor ids
  const neighbors = useMemo(() => {
    const ns: string[] = [];
    for (const e of edges) {
      if (e.source === id) ns.push(e.target);
      else if (e.target === id) ns.push(e.source);
    }
    return uniqSorted(ns);
  }, [edges, id]);

  // Count parallel edges per neighbor
  const neighborParallelCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const nbr of neighbors) counts.set(nbr, 1);

    const byPair = new Map<string, number>();
    for (const e of edges) {
      const k = pairKey(e.source, e.target);
      byPair.set(k, (byPair.get(k) ?? 0) + 1);
    }

    for (const nbr of neighbors) {
      const k = pairKey(id, nbr);
      counts.set(nbr, Math.max(1, byPair.get(k) ?? 1));
    }
    return counts;
  }, [edges, id, neighbors]);

  // Determine which side each neighbor is on
  const neighborSides = useStore((s) => {
    const me = myAbs ?? safeNodeAbsPos(s, id);
    return neighbors.map((nbrId) => {
      const nbr = safeNodeAbsPos(s, nbrId);
      const pos = me && nbr ? facingPosition(me, nbr) : ("bottom" as const);
      return { neighborId: nbrId, position: pos };
    });
  });

  // Build handle elements with space-evenly positioning per side
  const portHandles = useMemo(() => {
    const bySide = new Map<string, { handleId: string }[]>();

    const sorted = neighborSides
      .slice()
      .sort((a, b) => a.neighborId.localeCompare(b.neighborId));

    for (const p of sorted) {
      const k = neighborParallelCount.get(p.neighborId) ?? 1;
      for (let idx = 0; idx < k; idx++) {
        const handleId = neighborPortId(p.neighborId, idx);
        const arr = bySide.get(p.position) ?? [];
        arr.push({ handleId });
        bySide.set(p.position, arr);
      }
    }

    for (const arr of bySide.values()) {
      arr.sort((a, b) => a.handleId.localeCompare(b.handleId));
    }

    const out: { id: string; pos: string; style: React.CSSProperties }[] = [];

    for (const [side, ports] of bySide.entries()) {
      const count = ports.length;
      if (count === 0) continue;

      const step = 100 / (count + 1);

      for (let i = 0; i < count; i++) {
        const tPct = step * (i + 1);
        const hid = ports[i].handleId;

        const style: React.CSSProperties =
          side === "left" || side === "right"
            ? { top: `${tPct}%`, transform: "translateY(-50%)" }
            : { left: `${tPct}%`, transform: "translateX(-50%)" };

        out.push({ id: hid, pos: side, style });
      }
    }

    return out;
  }, [neighborSides, neighborParallelCount]);

  return (
    <div className={`custom-node ${typeClass} ${statusClass}`}>
      <div className="custom-node__label">{data.label}</div>

      {portHandles.map((p) => (
        <React.Fragment key={p.id}>
          <Handle type="source" id={p.id} position={p.pos as never} style={p.style} />
          <Handle type="target" id={p.id} position={p.pos as never} style={p.style} />
        </React.Fragment>
      ))}
    </div>
  );
});
