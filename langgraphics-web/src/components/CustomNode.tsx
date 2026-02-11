import React, {memo, useMemo} from "react";
import {type Edge, Handle, type NodeProps, useStore} from "reactflow";
import {facingPosition, neighborPortId, pairKey, safeEdgesFromStore, safeNodeAbsPos, uniqSorted} from "../layout";

export const CustomNode = memo(function CustomNode({id, data}: NodeProps) {
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
        const byPair = new Map<string, number>();
        for (const e of edges) {
            const k = pairKey(e.source, e.target);
            byPair.set(k, (byPair.get(k) ?? 0) + 1);
        }
        const counts = new Map<string, number>();
        for (const nbr of neighbors)
            counts.set(nbr, Math.max(1, byPair.get(pairKey(id, nbr)) ?? 1));
        return counts;
    }, [edges, id, neighbors]);

    const neighborSides = useStore((s) => {
        const me = myAbs ?? safeNodeAbsPos(s, id);
        return neighbors.map((nbrId) => {
            const nbr = safeNodeAbsPos(s, nbrId);
            return {neighborId: nbrId, position: me && nbr ? facingPosition(me, nbr) : ("bottom" as const)};
        });
    });

    const portHandles = useMemo(() => {
        const bySide = new Map<string, string[]>();
        for (const p of neighborSides.slice().sort((a, b) => a.neighborId.localeCompare(b.neighborId))) {
            const k = neighborParallelCount.get(p.neighborId) ?? 1;
            for (let idx = 0; idx < k; idx++) {
                const arr = bySide.get(p.position) ?? [];
                arr.push(neighborPortId(p.neighborId, idx));
                bySide.set(p.position, arr);
            }
        }
        for (const arr of bySide.values()) arr.sort();

        const out: {id: string; pos: string; style: React.CSSProperties}[] = [];
        for (const [side, ids] of bySide.entries()) {
            const step = 100 / (ids.length + 1);
            for (let i = 0; i < ids.length; i++) {
                const tPct = step * (i + 1);
                const style: React.CSSProperties = side === "left" || side === "right"
                    ? {top: `${tPct}%`, transform: "translateY(-50%)"}
                    : {left: `${tPct}%`, transform: "translateX(-50%)"};
                out.push({id: ids[i], pos: side, style});
            }
        }
        return out;
    }, [neighborSides, neighborParallelCount]);

    return (
        <div className="react-flow__node-default">
            <div>{(data as {label: string}).label}</div>
            {portHandles.map((p) => (
                <React.Fragment key={p.id}>
                    <Handle type="source" id={p.id} position={p.pos as never} style={p.style}/>
                    <Handle type="target" id={p.id} position={p.pos as never} style={p.style}/>
                </React.Fragment>
            ))}
        </div>
    );
});
