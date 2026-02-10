import React, {memo, useMemo} from "react";
import {type Edge, Handle, type NodeProps, useStore} from "reactflow";
import type {NodeData} from "../types";
import {facingPosition, neighborPortId, pairKey, safeEdgesFromStore, safeNodeAbsPos, uniqSorted} from "../layout";

export const CustomNode = memo(function CustomNode(props: NodeProps) {
    const {id, data: rawData} = props;
    const data = rawData as NodeData;

    const edges = useStore(safeEdgesFromStore) as Edge[];
    const myAbs = useStore((s) => safeNodeAbsPos(s, id));

    const neighbors = useMemo(() => {
        const ns: string[] = [];
        for (const e of edges) {
            if (e.source === id) ns.push(e.target);
            else if (e.target === id) ns.push(e.source);
        }
        return uniqSorted(ns);
    }, [edges, id]);

    const neighborParallelCount = useMemo(() => {
        const counts = new Map<string, number>();
        const byPair = new Map<string, number>();
        for (const e of edges) {
            const k = pairKey(e.source, e.target);
            byPair.set(k, (byPair.get(k) ?? 0) + 1);
        }
        for (const nbr of neighbors) {
            counts.set(nbr, Math.max(1, byPair.get(pairKey(id, nbr)) ?? 1));
        }
        return counts;
    }, [edges, id, neighbors]);

    const neighborSides = useStore((s) => {
        const me = myAbs ?? safeNodeAbsPos(s, id);
        return neighbors.map((nbrId) => {
            const nbr = safeNodeAbsPos(s, nbrId);
            const pos = me && nbr ? facingPosition(me, nbr) : ("bottom" as const);
            return {neighborId: nbrId, position: pos};
        });
    });

    const portHandles = useMemo(() => {
        const bySide = new Map<string, { handleId: string }[]>();
        const sorted = neighborSides.slice().sort((a, b) => a.neighborId.localeCompare(b.neighborId));

        for (const p of sorted) {
            const k = neighborParallelCount.get(p.neighborId) ?? 1;
            for (let idx = 0; idx < k; idx++) {
                const arr = bySide.get(p.position) ?? [];
                arr.push({handleId: neighborPortId(p.neighborId, idx)});
                bySide.set(p.position, arr);
            }
        }

        for (const arr of bySide.values()) {
            arr.sort((a, b) => a.handleId.localeCompare(b.handleId));
        }

        const out: { id: string; pos: string; style: React.CSSProperties }[] = [];
        for (const [side, ports] of bySide.entries()) {
            const step = 100 / (ports.length + 1);
            for (let i = 0; i < ports.length; i++) {
                const tPct = step * (i + 1);
                const style: React.CSSProperties =
                    side === "left" || side === "right"
                        ? {top: `${tPct}%`, transform: "translateY(-50%)"}
                        : {left: `${tPct}%`, transform: "translateX(-50%)"};
                out.push({id: ports[i].handleId, pos: side, style});
            }
        }
        return out;
    }, [neighborSides, neighborParallelCount]);

    return (
        <div className={`custom-node custom-node--${data.nodeType} custom-node--${data.status}`}>
            <div className="custom-node__label">{data.label}</div>
            {portHandles.map((p) => (
                <React.Fragment key={p.id}>
                    <Handle type="source" id={p.id} position={p.pos as never} style={p.style}/>
                    <Handle type="target" id={p.id} position={p.pos as never} style={p.style}/>
                </React.Fragment>
            ))}
        </div>
    );
});
