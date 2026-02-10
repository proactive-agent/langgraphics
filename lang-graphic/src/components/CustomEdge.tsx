import {memo} from "react";
import {type Edge, type EdgeProps, getBezierPath, useStore} from "reactflow";
import type {EdgeData} from "../types";
import {pairKey, safeEdgesFromStore} from "../layout";

export const CustomEdge = memo(function CustomEdge(props: EdgeProps | any) {
    const {
        id, source, target, sourceHandle, targetHandle,
        sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
        data: rawData,
    } = props;

    const data = rawData as EdgeData | undefined;
    const status = data?.status ?? "idle";
    const conditional = data?.conditional ?? false;
    const label = data?.label ?? null;

    const edges = useStore(safeEdgesFromStore) as Edge[];

    const portKey = `${pairKey(source, target)}|${sourceHandle ?? ""}|${targetHandle ?? ""}`;
    const group = edges
    .filter((e) => `${pairKey(e.source, e.target)}|${e.sourceHandle ?? ""}|${e.targetHandle ?? ""}` === portKey)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));

    const idx = group.findIndex((e) => e.id === id);
    const n = group.length;
    const delta = n <= 1 ? 0 : (idx - (n - 1) / 2) * 6;

    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const len = Math.max(1, Math.hypot(dx, dy));
    const px = (-dy / len) * delta;
    const py = (dx / len) * delta;

    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX: sourceX + px, sourceY: sourceY + py, sourcePosition,
        targetX: targetX + px, targetY: targetY + py, targetPosition,
        curvature: 0.2,
    });

    const statusClass = `custom-edge custom-edge--${status}${conditional ? " custom-edge--conditional" : ""}`;

    return (
        <>
            <path id={id} className={statusClass} d={edgePath} markerEnd={`url(#arrow-${status})`}/>
            {status === "active" && (
                <circle className="custom-edge__dot" r={2}>
                    <animateMotion dur="0.75s" path={edgePath} repeatCount="indefinite"/>
                </circle>
            )}
            {label && <text x={labelX} y={labelY - 10} className="custom-edge__label">{label}</text>}
        </>
    );
});
