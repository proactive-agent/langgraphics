import {useMemo, useState} from "react";
import type {TreeDataNode} from "antd";
import type {Node} from "@xyflow/react";
import type {GraphMessage, NodeData, NodeKind, NodeOutputEntry, NodeStepEntry} from "../types";

export interface NodeMeta {
    depth: number;
    kind: NodeKind | null;
    isStart?: boolean;
    isEnd?: boolean;
}

export function computeDepthMap(topology: GraphMessage): Map<string, NodeMeta> {
    const adj = new Map<string, string[]>();
    for (const n of topology.nodes) adj.set(n.id, []);
    for (const e of topology.edges) adj.get(e.source)?.push(e.target);

    const startNode = topology.nodes.find((n) => n.node_type === "start");
    if (!startNode) return new Map();

    const rank = new Map<string, number>();
    for (let q = [startNode.id], r = 0; q.length > 0; r++) {
        const next: string[] = [];
        for (const id of q)
            if (!rank.has(id)) {
                rank.set(id, r);
                next.push(...(adj.get(id) ?? []));
            }
        q = next;
    }

    const onCycle = new Set<string>();
    for (const [src, tgts] of adj)
        for (const t of tgts)
            if ((rank.get(t) ?? 0) <= (rank.get(src) ?? 0)) onCycle.add(src);
    for (let changed = true; changed;) {
        changed = false;
        for (const [src, tgts] of adj)
            if (!onCycle.has(src))
                for (const t of tgts)
                    if ((rank.get(t) ?? 0) > (rank.get(src) ?? 0) && onCycle.has(t)) {
                        onCycle.add(src);
                        changed = true;
                        break;
                    }
    }

    for (const [id, tgts] of adj) {
        const sr = rank.get(id) ?? 0;
        adj.set(id, [...tgts].sort((a, b) => {
            const ra = rank.get(a) ?? 0, rb = rank.get(b) ?? 0;
            const ba = ra <= sr ? 1 : 0, bb = rb <= sr ? 1 : 0;
            return (ba - bb) || ((onCycle.has(a) ? 0 : 1) - (onCycle.has(b) ? 0 : 1)) || (ra - rb);
        }));
    }

    const nodeInfo = new Map(topology.nodes.map((n) => [n.id, n]));
    const result = new Map<string, NodeMeta>();
    result.set(startNode.id, {depth: 0, kind: null, isStart: true});
    const endNode = topology.nodes.find((n) => n.node_type === "end");
    if (endNode) result.set(endNode.id, {depth: 0, kind: null, isEnd: true});

    const path: string[] = [];
    const pathSet = new Set<string>();
    const outDepth = new Map<string, number>();
    const parent = new Map<string, string | null>();

    (function dfs(id: string, par: string | null, d: number) {
        if (outDepth.has(id)) return;
        parent.set(id, par);
        path.push(id);
        pathSet.add(id);

        let eff = d;
        for (const t of adj.get(id) ?? [])
            if (pathSet.has(t)) {
                const p = parent.get(t);
                const pd = p !== null ? (outDepth.get(p!) ?? 0) : 0;
                if (pd < eff) eff = Math.max(0, pd);
            }
        outDepth.set(id, eff);

        const info = nodeInfo.get(id);
        if (info?.node_type === "node")
            result.set(id, {depth: eff, kind: info.node_kind ?? null});

        for (const t of adj.get(id) ?? [])
            if (pathSet.has(t)) {
                const bd = eff + 1;
                for (let i = path.length - 2; path[i] !== t; i--) {
                    if ((outDepth.get(path[i]) ?? 0) > bd) {
                        outDepth.set(path[i], bd);
                        const m = result.get(path[i]);
                        if (m) result.set(path[i], {...m, depth: bd});
                    }
                }
            }

        for (const t of adj.get(id) ?? [])
            if (!pathSet.has(t)) dfs(t, id, eff + 1);

        path.pop();
        pathSet.delete(id);
    })(startNode.id, null, -1);

    for (const [id, meta] of result)
        if (!onCycle.has(id) && meta.depth !== 0 && !meta.isStart)
            result.set(id, {...meta, depth: 0});

    return result;
}

export function useInspectTree(
    topology: GraphMessage | null,
    nodes: Node<NodeData>[],
    nodeOutputLog: NodeOutputEntry[],
    nodeStepLog: NodeStepEntry[],
) {
    const [selectedKey, setSelectedKey] = useState<string>("");

    const depthMap = useMemo(
        () => topology ? computeDepthMap(topology) : new Map<string, NodeMeta>(),
        [topology]);

    const nodeDataMap = useMemo(
        () => new Map(nodes.map((n) => [n.id, n.data])),
        [nodes]);

    const visibleLog = useMemo(
        () => nodeOutputLog.filter((e) => depthMap.has(e.nodeId)),
        [nodeOutputLog, depthMap]);

    const stepsByParent = useMemo(() => {
        const map = new Map<string, NodeStepEntry[]>();
        for (const s of nodeStepLog)
            if (s.event === "start") {
                const arr = map.get(s.parentRunId) ?? [];
                arr.push(s);
                map.set(s.parentRunId, arr);
            }
        return map;
    }, [nodeStepLog]);

    const stepEndMap = useMemo(() => {
        const map = new Map<string, NodeStepEntry>();
        for (const s of nodeStepLog)
            if (s.event === "end") map.set(s.runId, s);
        return map;
    }, [nodeStepLog]);

    const treeData = useMemo(() => {
        const root: TreeDataNode[] = [];
        const stack: { d: number; c: TreeDataNode[] }[] = [{d: -1, c: root}];

        for (let i = 0; i < visibleLog.length; i++) {
            const entry = visibleLog[i];
            const meta = depthMap.get(entry.nodeId)!;
            const key = `log-${i}`;
            const label = nodeDataMap.get(entry.nodeId)?.label ?? entry.nodeId;
            const steps = entry.runId ? (stepsByParent.get(entry.runId) ?? []) : [];

            const children: TreeDataNode[] = steps.map((step, si) => ({
                key: `${key}-step-${si}`, isLeaf: true, selectable: true,
                title: <span className="inspect-step-label">{step.name ?? "step"}</span>,
            }));

            const node: TreeDataNode = {
                key, children,
                title: (
                    <span className="inspect-node-label">
                        {meta.kind && <img src={`/icons/${meta.kind}.svg`} alt={meta.kind}/>}
                        {label}
                    </span>
                ),
            };

            while (stack.length > 1 && stack[stack.length - 1].d >= meta.depth) stack.pop();
            stack[stack.length - 1].c.push(node);
            stack.push({d: meta.depth, c: children});
        }

        return root;
    }, [visibleLog, depthMap, nodeDataMap, stepsByParent]);

    const expandedKeys = useMemo(
        () => visibleLog.map((_, idx) => `log-${idx}`),
        [visibleLog]);

    const selectedParts = selectedKey?.split("-") ?? [];
    const logIdx = selectedKey ? parseInt(selectedParts[1], 10) : null;
    const selectedEntry = logIdx !== null ? (visibleLog[logIdx] ?? null) : null;
    const selectedMeta = selectedEntry ? depthMap.get(selectedEntry.nodeId) : null;

    let stepStart: NodeStepEntry | null = null;
    let stepEnd: NodeStepEntry | null = null;

    if (selectedParts.length === 4 && selectedParts[2] === "step" && selectedEntry?.runId) {
        const stepIdx = parseInt(selectedParts[3], 10);
        const steps = stepsByParent.get(selectedEntry.runId) ?? [];
        stepStart = steps[stepIdx] ?? null;
        if (stepStart) stepEnd = stepEndMap.get(stepStart.runId) ?? null;
    }

    return {
        treeData,
        expandedKeys,
        visibleLog,
        selectedKey,
        setSelectedKey,
        selectedEntry,
        selectedMeta: selectedMeta ?? null,
        stepStart,
        stepEnd,
    };
}
