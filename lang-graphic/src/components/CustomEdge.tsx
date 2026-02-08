import { memo } from "react";
import { getBezierPath, useStore, type EdgeProps, type Edge } from "reactflow";
import type { EdgeData } from "../types/graph";
import { pairKey, safeEdgesFromStore } from "../utils/ports";
import "../styles/edges.css";

/**
 * Custom edge with:
 * - Parallel edge curve offsets (when multiple edges share the same ports)
 * - Status-based CSS classes for execution visualization
 * - Animated dot on active edges
 * - Conditional edge dashes + labels
 */
export const CustomEdge = memo(function CustomEdge(props: EdgeProps) {
  const {
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    data: rawData,
  } = props;

  const data = rawData as EdgeData | undefined;
  const status = data?.status ?? "idle";
  const conditional = data?.conditional ?? false;
  const label = data?.label ?? null;

  const edges = useStore(safeEdgesFromStore) as Edge[];

  // Find edges sharing the exact same pair of ports for curve offset
  const portKey = `${pairKey(source, target)}|${sourceHandle ?? ""}|${targetHandle ?? ""}`;
  const group = edges
    .filter(
      (e) =>
        `${pairKey(e.source, e.target)}|${e.sourceHandle ?? ""}|${e.targetHandle ?? ""}` ===
        portKey
    )
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));

  const idx = group.findIndex((e) => e.id === id);
  const n = group.length;

  // Perpendicular offset for parallel edges sharing the same ports
  const gap = 6;
  const delta = n <= 1 ? 0 : (idx - (n - 1) / 2) * gap;

  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.max(1, Math.hypot(dx, dy));
  const px = (-dy / len) * delta;
  const py = (dx / len) * delta;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: sourceX + px,
    sourceY: sourceY + py,
    sourcePosition,
    targetX: targetX + px,
    targetY: targetY + py,
    targetPosition,
    curvature: 0.2,
  });

  const statusClass = `custom-edge custom-edge--${status}${
    conditional ? " custom-edge--conditional" : ""
  }`;

  return (
    <>
      <path
        id={id}
        className={statusClass}
        d={edgePath}
        markerEnd={markerEnd as string | undefined}
      />
      {status === "active" && (
        <circle className="custom-edge__dot" r={4}>
          <animateMotion
            dur="0.6s"
            repeatCount="indefinite"
            path={edgePath}
          />
        </circle>
      )}
      {label && (
        <text x={labelX} y={labelY - 10} className="custom-edge__label">
          {label}
        </text>
      )}
    </>
  );
});
