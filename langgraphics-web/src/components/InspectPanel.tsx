import {useMemo, type ReactNode, useState} from "react";
import type {Node} from "@xyflow/react";
import {type TreeDataNode} from "antd";
import {Tree} from "antd";
import type {GraphMessage, NodeData, NodeKind, NodeOutputEntry, NodeStepEntry} from "../types";

interface InspectPanelProps {
    topology: GraphMessage | null;
    nodes: Node<NodeData>[];
    nodeOutputLog: NodeOutputEntry[];
    nodeStepLog: NodeStepEntry[];
}

interface NodeMeta {
    depth: number;
    kind: NodeKind | null;
    isStart?: boolean;
    isEnd?: boolean;
}

export function buildDepthMap(topology: GraphMessage): Map<string, NodeMeta> {
    const adj = new Map<string, string[]>();
    for (const n of topology.nodes) adj.set(n.id, []);
    for (const e of topology.edges) adj.get(e.source)?.push(e.target);

    const startNode = topology.nodes.find((n) => n.node_type === "start");
    if (!startNode) return new Map();

    const bfsRank = new Map<string, number>();
    {
        const queue: string[] = [startNode.id];
        bfsRank.set(startNode.id, 0);
        while (queue.length > 0) {
            const cur = queue.shift()!;
            const rank = bfsRank.get(cur)!;
            for (const nxt of adj.get(cur) ?? []) {
                if (!bfsRank.has(nxt)) {
                    bfsRank.set(nxt, rank + 1);
                    queue.push(nxt);
                }
            }
        }
    }

    const onCyclePath = new Set<string>();
    for (const [src, targets] of adj) {
        const sr = bfsRank.get(src) ?? 0;
        for (const tgt of targets) {
            if ((bfsRank.get(tgt) ?? 0) <= sr) onCyclePath.add(src);
        }
    }
    let changed = true;
    while (changed) {
        changed = false;
        for (const [src, targets] of adj) {
            if (!onCyclePath.has(src)) {
                const sr = bfsRank.get(src) ?? 0;
                for (const tgt of targets) {
                    if ((bfsRank.get(tgt) ?? 0) > sr && onCyclePath.has(tgt)) {
                        onCyclePath.add(src);
                        changed = true;
                        break;
                    }
                }
            }
        }
    }

    for (const [id, targets] of adj) {
        const srcRank = bfsRank.get(id) ?? 0;
        adj.set(id, [...targets].sort((a, b) => {
            const ra = bfsRank.get(a) ?? 0, rb = bfsRank.get(b) ?? 0;
            const aBack = ra <= srcRank ? 1 : 0, bBack = rb <= srcRank ? 1 : 0;
            if (aBack !== bBack) return aBack - bBack;
            const aCyc = onCyclePath.has(a) ? 0 : 1, bCyc = onCyclePath.has(b) ? 0 : 1;
            if (aCyc !== bCyc) return aCyc - bCyc;
            return ra - rb;
        }));
    }

    const nodeTypeMap = new Map(topology.nodes.map((n) => [n.id, n.node_type]));
    const nodeKindMap = new Map(topology.nodes.map((n) => [n.id, n.node_kind ?? null]));
    const result = new Map<string, NodeMeta>();

    result.set(startNode.id, {depth: 0, kind: null, isStart: true});

    const endNode = topology.nodes.find((n) => n.node_type === "end");
    if (endNode) result.set(endNode.id, {depth: 0, kind: null, isEnd: true});

    const stack: string[] = [];
    const onStack = new Set<string>();
    const outputDepth = new Map<string, number>();
    const dfsParent = new Map<string, string | null>();
    const visited = new Set<string>();

    function dfs(nodeId: string, parentId: string | null, callDepth: number) {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);
        dfsParent.set(nodeId, parentId);
        stack.push(nodeId);
        onStack.add(nodeId);

        let effective = callDepth;
        for (const target of adj.get(nodeId) ?? []) {
            if (onStack.has(target)) {
                const tp = dfsParent.get(target) ?? null;
                const pd = tp !== null ? (outputDepth.get(tp) ?? 0) : 0;
                if (pd < effective) effective = Math.max(0, pd);
            }
        }
        outputDepth.set(nodeId, effective);
        if (nodeTypeMap.get(nodeId) === "node") {
            result.set(nodeId, {depth: effective, kind: nodeKindMap.get(nodeId) ?? null});
        }
        for (const target of adj.get(nodeId) ?? []) {
            if (onStack.has(target)) {
                const bodyDepth = effective + 1;
                for (let i = stack.length - 2; i >= 0; i--) {
                    const mid = stack[i];
                    if (mid === target) break;
                    if ((outputDepth.get(mid) ?? 0) > bodyDepth) {
                        outputDepth.set(mid, bodyDepth);
                        const m = result.get(mid);
                        if (m) result.set(mid, {...m, depth: bodyDepth});
                    }
                }
            }
        }
        for (const target of adj.get(nodeId) ?? []) {
            if (!onStack.has(target)) dfs(target, nodeId, effective + 1);
        }
        stack.pop();
        onStack.delete(nodeId);
    }

    dfs(startNode.id, null, -1);

    for (const [id, meta] of result) {
        if (!onCyclePath.has(id) && meta.depth !== 0 && !meta.isStart) {
            result.set(id, {...meta, depth: 0});
        }
    }

    return result;
}

function DetailSection({title, children}: { title: string; children: ReactNode }) {
    return (
        <div className="inspect-detail-section">
            <span className="inspect-section-label">{title}</span>
            {children}
        </div>
    );
}

function NodeDetail({entry, isStart, isEnd, stepStart, stepEnd}: { entry: NodeOutputEntry | null; isStart: boolean; isEnd: boolean; stepStart: NodeStepEntry | null; stepEnd: NodeStepEntry | null; }) {
    if (!entry) {
        return;
    }

    if (stepStart !== null) {
        return (
            <>
                <DetailSection title="Input">
                    <pre className="inspect-detail-json">{JSON.stringify(stepStart.data, null, 2)}</pre>
                </DetailSection>
                {stepEnd !== null && (
                    <DetailSection title="Output">
                        <pre className="inspect-detail-json">{JSON.stringify(stepEnd.data, null, 2)}</pre>
                    </DetailSection>
                )}
            </>
        );
    }

    if (isStart) {
        const allMessages = entry.data.messages ?? [];
        const promptMsg = allMessages.find((m) => m.type === "system") ?? allMessages[0];
        return (
            <DetailSection title="System prompt">
                {promptMsg
                    ? <div className="inspect-detail-text">{promptMsg.content as string}</div>
                    : <pre className="inspect-detail-json">{JSON.stringify(entry.data, null, 2)}</pre>
                }
            </DetailSection>
        );
    }

    if (isEnd) {
        const allMessages = entry.data.messages ?? [];
        const lastMsg = allMessages.length > 0 ? allMessages[allMessages.length - 1] : null;
        return (
            <DetailSection title="Final answer">
                {lastMsg
                    ? <div className="inspect-detail-text">{lastMsg.content as string}</div>
                    : <pre className="inspect-detail-json">{JSON.stringify(entry.data, null, 2)}</pre>
                }
            </DetailSection>
        );
    }

    const outputMessages = entry.data.messages ?? [];
    const inputMessages = entry.input?.messages ?? [];
    const lastInput = inputMessages.length > 0 ? inputMessages.slice(-1) : null;

    return (
        <>
            {entry.input !== null && (
                <DetailSection title="Input">
                    {lastInput
                        ? lastInput.map((msg, i) => <div key={i}
                                                         className="inspect-detail-text">{msg.content as string}</div>)
                        : <pre className="inspect-detail-json">{JSON.stringify(entry.input, null, 2)}</pre>
                    }
                </DetailSection>
            )}
            <DetailSection title="Output">
                {outputMessages.length > 0
                    ? outputMessages.map((msg, i) => <div key={i}
                                                          className="inspect-detail-text">{msg.content as string}</div>)
                    : Object.keys(entry.data).length > 0
                    && <pre className="inspect-detail-json">{JSON.stringify(entry.data, null, 2)}</pre>
                }
            </DetailSection>
        </>
    );
}

function buildTreeData(
    visibleLog: NodeOutputEntry[],
    depthMap: Map<string, NodeMeta>,
    nodeDataMap: Map<string, NodeData>,
    stepsByParent: Map<string, NodeStepEntry[]>,
): TreeDataNode[] {
    const flat: { key: string; depth: number; node: TreeDataNode; }[] = visibleLog.map((entry, idx) => {
        const meta = depthMap.get(entry.nodeId)!;
        const label = nodeDataMap.get(entry.nodeId)?.label ?? entry.nodeId;
        const key = `log-${idx}`;

        const steps = entry.runId ? (stepsByParent.get(entry.runId) ?? []) : [];
        const stepChildren: TreeDataNode[] = steps.map((step, si) => ({
            isLeaf: true,
            selectable: true,
            key: `${key}-step-${si}`,
            title: <span className="inspect-step-label">{step.name ?? "step"}</span>,
        }));

        return {
            key,
            depth: meta.depth,
            node: {
                key,
                children: stepChildren,
                title: (
                    <span className="inspect-node-label">
                        {label}
                        {meta.kind && <span className="inspect-node-kind">({meta.kind})</span>}
                    </span>
                ),
            },
        };
    });

    const root: TreeDataNode[] = [];
    const stack: { depth: number; structChildren: TreeDataNode[] }[] = [
        {depth: -1, structChildren: root},
    ];

    for (const entry of flat) {
        while (stack.length > 1 && stack[stack.length - 1].depth >= entry.depth) {
            stack.pop();
        }
        const parent = stack[stack.length - 1].structChildren;
        parent.push(entry.node);
        const ownChildren = entry.node.children as TreeDataNode[];
        stack.push({depth: entry.depth, structChildren: ownChildren});
    }

    return root;
}

export function InspectPanel({topology, nodes, nodeOutputLog, nodeStepLog}: InspectPanelProps) {
    const [selectedKey, setSelectedKey] = useState<any>("");

    const nodeDataMap = useMemo(
        () => new Map(nodes.map((n) => [n.id, n.data])),
        [nodes]);

    const depthMap = useMemo(
        () => topology ? buildDepthMap(topology) : new Map<string, NodeMeta>(),
        [topology]);

    const visibleLog = nodeOutputLog.filter((entry) => depthMap.has(entry.nodeId));

    const stepsByParent = useMemo(() => {
        const map = new Map<string, NodeStepEntry[]>();
        for (const s of nodeStepLog) {
            if (s.event === "start") {
                const arr = map.get(s.parentRunId) ?? [];
                arr.push(s);
                map.set(s.parentRunId, arr);
            }
        }
        return map;
    }, [nodeStepLog]);

    const stepEndMap = useMemo(() => {
        const map = new Map<string, NodeStepEntry>();
        for (const s of nodeStepLog) {
            if (s.event === "end") map.set(s.runId, s);
        }
        return map;
    }, [nodeStepLog]);

    const treeData = useMemo(
        () => buildTreeData(visibleLog, depthMap, nodeDataMap, stepsByParent),
        [visibleLog, depthMap, nodeDataMap, stepsByParent]);

    const expandedKeys = useMemo(
        () => visibleLog.map((_, idx) => `log-${idx}`),
        [visibleLog.length]);

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

    return (
        <div className="inspect-panel">
            <div className="inspect-panel-header">Trace Inspector</div>
            <div className="inspect-panel-body">
                <div className="inspect-tree-pane">
                    {visibleLog.length !== 0 && (
                        <Tree
                            switcherIcon={<span className="ant-tree-switcher-leaf-line"/>}
                            onSelect={([key]) => key && setSelectedKey(key)}
                            selectedKeys={[selectedKey]}
                            expandedKeys={expandedKeys}
                            treeData={treeData}
                            blockNode
                            showLine
                        />
                    )}
                </div>
                <div className="inspect-detail-pane">
                    <NodeDetail
                        isStart={selectedMeta?.isStart ?? false}
                        isEnd={selectedMeta?.isEnd ?? false}
                        entry={selectedEntry}
                        stepStart={stepStart}
                        stepEnd={stepEnd}
                    />
                </div>
            </div>
        </div>
    );
}
