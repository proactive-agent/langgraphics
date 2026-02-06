import { getBezierPath, type EdgeProps } from "@xyflow/react";
import type { EdgeData } from "../types/graph";
import "../styles/edges.css";

type CustomEdgeProps = EdgeProps & { data: EdgeData };

export function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: CustomEdgeProps) {
  const status = data.status;
  const conditional = data.conditional;
  const label = data.label;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
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
        markerEnd={markerEnd}
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
}
