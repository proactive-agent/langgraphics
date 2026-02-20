import Tree from "antd/es/tree";
import type {TreeDataNode} from "antd";
import {useEffect, useMemo, useState} from "react";
import type {NodeEntry} from "../types";

function buildTree(entries: NodeEntry[], parentRunId: string | null | undefined): TreeDataNode[] {
    return entries
        .filter(e => (e.parent_run_id ?? null) === (parentRunId ?? null))
        .map(entry => {
            const children = buildTree(entries, entry.run_id);
            const isLeaf = children.length === 0;
            return {
                key: entry.run_id,
                isLeaf,
                title: isLeaf ? (
                    <span className="inspect-step-label">
                        {entry.node_kind
                            ? <img
                                alt={entry.node_kind}
                                className="inspect-step-icon"
                                src={`/icons/${entry.node_kind}.svg`}
                            />
                            : <span className={`inspect-step-status${entry.status === "error" ? " error" : ""}`}/>
                        }
                        <span className="inspect-step-name">{entry.node_id ?? "step"}</span>
                    </span>
                ) : (
                    <span className="inspect-node-label">
                        {entry.node_kind && <img src={`/icons/${entry.node_kind}.svg`} alt={entry.node_kind}/>}
                        {entry.node_id}
                    </span>
                ),
                children: isLeaf ? undefined : children,
            };
        });
}

export function InspectPanel({nodeEntries}: { nodeEntries: NodeEntry[] }) {
    const [selectedKey, setSelectedKey] = useState<string>("");

    const expandedKeys = useMemo(() => {
        return nodeEntries.map(({run_id}) => run_id);
    }, [nodeEntries]);

    const selectedEntry = useMemo(() => {
        return nodeEntries.find(({run_id}) => run_id === selectedKey);
    }, [nodeEntries, selectedKey]);

    const treeData = useMemo((): TreeDataNode[] => {
        return buildTree(nodeEntries, null);
    }, [nodeEntries]);

    useEffect(() => {
        if (nodeEntries.length > 0 && !selectedKey) {
            setSelectedKey(nodeEntries.find(e => !e.parent_run_id)?.run_id ?? nodeEntries[0].run_id);
        }
    }, [nodeEntries, selectedKey]);

    return (
        <div className="inspect-panel">
            <div className="inspect-panel-header">Trace Inspector</div>
            <div className="inspect-panel-body">
                <div className="inspect-tree-pane">
                    {nodeEntries.length !== 0 && (
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
                    {selectedEntry && (
                        <>
                            {selectedEntry.input && (
                                <div className="inspect-detail-section">
                                    <span className="inspect-section-label">Input</span>
                                    <div className="inspect-detail-text">{selectedEntry.input}</div>
                                </div>
                            )}
                            {selectedEntry.output && (
                                <div className="inspect-detail-section">
                                    <span className="inspect-section-label">Output</span>
                                    <div className="inspect-detail-text">{selectedEntry.output}</div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
