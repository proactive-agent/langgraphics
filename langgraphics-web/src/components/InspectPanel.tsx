import Tree from "antd/es/tree";
import type {TreeDataNode} from "antd";
import {useEffect, useMemo, useState} from "react";
import type {NodeEntry} from "../types";

export function InspectPanel({nodeEntries}: { nodeEntries: NodeEntry[] }) {
    const [selectedKey, setSelectedKey] = useState<string>("");

    const expandedKeys = useMemo(() => {
        return nodeEntries.map(({run_id}) => run_id);
    }, [nodeEntries]);

    const selectedEntry = useMemo(() => {
        return nodeEntries.find(({run_id}) => run_id === selectedKey);
    }, [nodeEntries, selectedKey]);

    const treeData = useMemo((): TreeDataNode[] => {
        return nodeEntries.filter(({parent_run_id}) => !parent_run_id).map(entry => ({
            key: entry.run_id,
            title: (
                <span className="inspect-node-label">
                    {entry.node_kind && <img src={`/icons/${entry.node_kind}.svg`} alt={entry.node_kind}/>}
                    {entry.node_id}
                </span>
            ),
            children: nodeEntries.filter(({parent_run_id}) => parent_run_id === entry.run_id).map(child => ({
                isLeaf: true,
                selectable: true,
                key: child.run_id,
                title: (
                    <span className="inspect-step-label">
                        {child.node_kind
                            ? <img
                                alt={child.node_kind}
                                className="inspect-step-icon"
                                src={`/icons/${child.node_kind}.svg`}
                            />
                            : <span className={`inspect-step-status${child.status === "error" ? " error" : ""}`}/>
                        }
                        <span className="inspect-step-name">{child.node_id ?? "step"}</span>
                    </span>
                ),
            })),
        }))
    }, [nodeEntries]);

    useEffect(() => {
        if (nodeEntries.length > 0 && !selectedKey) {
            setSelectedKey(nodeEntries[0].run_id);
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
