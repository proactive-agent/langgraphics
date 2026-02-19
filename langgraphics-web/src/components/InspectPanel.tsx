import Tree from "antd/es/tree";
import type {TreeDataNode} from "antd";
import type {Node} from "@xyflow/react";
import {useMemo, useState, type ReactNode} from "react";
import type {GraphMessage, NodeData, NodeOutputEntry, NodeStepEntry} from "../types";

interface InspectPanelProps {
    topology: GraphMessage | null;
    nodes: Node<NodeData>[];
    nodeOutputLog: NodeOutputEntry[];
    nodeStepLog: NodeStepEntry[];
}

function DetailSection({title, children}: { title: string; children: ReactNode }) {
    return (
        <div className="inspect-detail-section">
            <span className="inspect-section-label">{title}</span>
            {children}
        </div>
    );
}

function NodeDetail({entry, selectedStep}: {
    entry: NodeOutputEntry | null;
    selectedStep: NodeStepEntry | null;
}) {
    if (!entry) return null;

    if (selectedStep !== null) {
        return (
            <>
                {selectedStep.input_preview && (
                    <DetailSection title="Input">
                        <div className="inspect-detail-text">{selectedStep.input_preview}</div>
                    </DetailSection>
                )}
                {selectedStep.output_preview && (
                    <DetailSection title="Output">
                        <div className="inspect-detail-text">{selectedStep.output_preview}</div>
                    </DetailSection>
                )}
            </>
        );
    }

    return (
        <>
            {entry.input_display && (
                <DetailSection title="Input">
                    <div className="inspect-detail-text">{entry.input_display}</div>
                </DetailSection>
            )}
            {entry.display && (
                <DetailSection title="Output">
                    <div className="inspect-detail-text">{entry.display}</div>
                </DetailSection>
            )}
        </>
    );
}

export function InspectPanel({topology, nodes, nodeOutputLog, nodeStepLog}: InspectPanelProps) {
    const [selectedKey, setSelectedKey] = useState<string>("log-0");

    const nodeMap = useMemo(() => {
        if (!topology) return new Map<string, {kind: string | null; isStart: boolean; isEnd: boolean}>();
        return new Map(topology.nodes.map((n) => [n.id, {
            kind: n.node_kind,
            isStart: n.node_type === "start",
            isEnd: n.node_type === "end",
        }]));
    }, [topology]);

    const nodeDataMap = useMemo(
        () => new Map(nodes.map((n) => [n.id, n.data])),
        [nodes]);

    const visibleLog = useMemo(
        () => nodeOutputLog.filter((e) => {
            const info = nodeMap.get(e.node_id);
            return info !== undefined && !info.isStart && !info.isEnd;
        }),
        [nodeOutputLog, nodeMap]);

    const stepsByParent = useMemo(() => {
        const map = new Map<string, NodeStepEntry[]>();
        for (const s of nodeStepLog) {
            const arr = map.get(s.parent_run_id) ?? [];
            arr.push(s);
            map.set(s.parent_run_id, arr);
        }
        return map;
    }, [nodeStepLog]);

    const treeData = useMemo((): TreeDataNode[] =>
        visibleLog.map((entry, i) => {
            const label = nodeDataMap.get(entry.node_id)?.label ?? entry.node_id;
            const steps = entry.run_id ? (stepsByParent.get(entry.run_id) ?? []) : [];

            const children: TreeDataNode[] = steps.map((step, si) => ({
                key: `log-${i}-step-${si}`, isLeaf: true, selectable: true,
                title: (
                    <span className="inspect-step-label">
                        {step.step_kind
                            ? <img className="inspect-step-icon" src={`/icons/${step.step_kind}.svg`} alt={step.step_kind}/>
                            : <span className={`inspect-step-status${step.status === "error" ? " error" : ""}`}/>
                        }
                        <span className="inspect-step-name">{step.name ?? "step"}</span>
                        {step.elapsed_ms != null && (
                            <span className="inspect-step-elapsed">{step.elapsed_ms.toFixed(1)}ms</span>
                        )}
                    </span>
                ),
            }));

            return {
                key: `log-${i}`, children,
                title: (
                    <span className="inspect-node-label">
                        {entry.node_kind && <img src={`/icons/${entry.node_kind}.svg`} alt={entry.node_kind}/>}
                        {label}
                    </span>
                ),
            };
        }),
        [visibleLog, nodeMap, nodeDataMap, stepsByParent]);

    const expandedKeys = useMemo(
        () => visibleLog.map((_, i) => `log-${i}`),
        [visibleLog]);

    const selectedParts = selectedKey?.split("-") ?? [];
    const logIdx = selectedKey ? parseInt(selectedParts[1], 10) : null;
    const selectedEntry = logIdx !== null ? (visibleLog[logIdx] ?? null) : null;

    let selectedStep: NodeStepEntry | null = null;
    if (selectedParts.length === 4 && selectedParts[2] === "step" && selectedEntry?.run_id) {
        const steps = stepsByParent.get(selectedEntry.run_id) ?? [];
        selectedStep = steps[parseInt(selectedParts[3], 10)] ?? null;
    }

    return (
        <div className="inspect-panel">
            <div className="inspect-panel-header">Trace Inspector</div>
            <div className="inspect-panel-body">
                <div className="inspect-tree-pane">
                    {visibleLog.length !== 0 && (
                        <Tree
                            switcherIcon={<span className="ant-tree-switcher-leaf-line"/>}
                            onSelect={([key]) => key && setSelectedKey(key as string)}
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
                        entry={selectedEntry}
                        selectedStep={selectedStep}
                    />
                </div>
            </div>
        </div>
    );
}
