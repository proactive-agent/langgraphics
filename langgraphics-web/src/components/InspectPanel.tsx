import Tree from "antd/es/tree";
import {type ReactNode} from "react";
import type {Node} from "@xyflow/react";
import type {GraphMessage, NodeData, NodeOutputEntry, NodeStepEntry} from "../types";
import {useInspectTree} from "../hooks/useInspectTree.tsx";

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

function NodeDetail({entry, isStart, isEnd, stepStart, stepEnd}: {
    entry: NodeOutputEntry | null;
    isStart: boolean;
    isEnd: boolean;
    stepStart: NodeStepEntry | null;
    stepEnd: NodeStepEntry | null;
}) {
    if (!entry) return;

    if (stepStart !== null) {
        let input = stepStart.data;
        let output = stepEnd !== null ? stepEnd.data : stepEnd;
        const toString = (d: any) => typeof d === "string" ? d : JSON.stringify(d, null, 2);
        if (typeof stepStart.data === "object") {
            const messages = stepStart.data.messages;
            input = Array.isArray(messages) ? messages[messages.length - 1].content : stepStart.data;
        }
        if (stepEnd !== null && typeof stepEnd.data === "object") {
            const messages = stepEnd.data.messages;
            output = Array.isArray(messages) ? messages[messages.length - 1].content : stepStart.data;
        }
        return (
            <>
                <DetailSection title="Input">
                    <pre className="inspect-detail-json">{toString(input)}</pre>
                </DetailSection>
                {stepEnd !== null && (
                    <DetailSection title="Output">
                        <pre className="inspect-detail-json">{toString(output)}</pre>
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

export function InspectPanel({topology, nodes, nodeOutputLog, nodeStepLog}: InspectPanelProps) {
    const {
        treeData, expandedKeys, visibleLog,
        selectedKey, setSelectedKey,
        selectedEntry, selectedMeta,
        stepStart, stepEnd,
    } = useInspectTree(topology, nodes, nodeOutputLog, nodeStepLog);

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
