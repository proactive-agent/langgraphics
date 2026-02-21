import Tree from "antd/es/tree";
import type {TreeDataNode} from "antd";
import {useCallback, useEffect, useMemo, useState} from "react";
import type {NodeEntry} from "../types";

export function InspectPanel({nodeEntries}: { nodeEntries: NodeEntry[] }) {
    const [selectedKey, setSelectedKey] = useState<string>("");

    const expandedKeys = useMemo(() => {
        return nodeEntries.map(({run_id}) => run_id);
    }, [nodeEntries]);

    const selectedEntry = useMemo(() => {
        return nodeEntries.find(({run_id}) => run_id === selectedKey);
    }, [nodeEntries, selectedKey]);

    const system = useMemo(() => {
        const inputs = JSON.parse(selectedEntry?.input ?? "[]");
        const system = inputs[0] || {};
        return system.role === "system" && inputs.length < 3 ? system : null;
    }, [selectedEntry])

    const input = useMemo(() => {
        const input = JSON.parse(selectedEntry?.input ?? "[]");
        return input[input.length - 1] || null;
    }, [selectedEntry])

    const output = useMemo(() => {
        const output = JSON.parse(selectedEntry?.output ?? "[]");
        return output[output.length - 1] || null;
    }, [selectedEntry])

    const getChildren = useCallback((parent: NodeEntry) => {
        return nodeEntries.filter(({parent_run_id}) => parent_run_id === parent.run_id).map(child => {
            const children: TreeDataNode[] = getChildren(child);
            return {
                children,
                selectable: true,
                key: child.run_id,
                isLeaf: children.length === 0,
                title: (
                    <span className={`inspect-step-label ${child.status ?? ""}`}>
                        <img
                            alt={child.node_kind ?? ""}
                            className="inspect-step-icon"
                            src={`/icons/${child.node_kind}.svg`}
                        />
                        {child.node_id ?? "step"}
                    </span>
                ),
            }
        })
    }, [nodeEntries])

    const treeData = useMemo((): TreeDataNode[] => {
        return nodeEntries.filter(({parent_run_id}) => !parent_run_id).map(entry => ({
            key: entry.run_id,
            children: getChildren(entry),
            title: (
                <span className={`inspect-node-label ${entry.status ?? ""}`}>
                    {entry.node_kind && <img src={`/icons/${entry.node_kind}.svg`} alt={entry.node_kind}/>}
                    {entry.node_id}
                </span>
            ),
        }))
    }, [nodeEntries, getChildren]);

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
                            {system && (
                                <div className="inspect-detail-section">
                                    <span className={`inspect-section-label ${system.role ?? ""}`}>
                                        <span>System</span>
                                        <span className="tag">{system.role ?? "unknown"}</span>
                                    </span>
                                    <div className="inspect-detail-text">
                                        {system.role ? system.content : JSON.stringify(system, null, 4)}
                                    </div>
                                </div>
                            )}
                            {input && (
                                <div className="inspect-detail-section">
                                    <span className={`inspect-section-label ${input.role ?? ""}`}>
                                        <span>Input</span>
                                        <span className="tag">{input.role ?? "unknown"}</span>
                                    </span>
                                    <div className="inspect-detail-text">
                                        {input.role ? input.content : JSON.stringify(input, null, 4)}
                                    </div>
                                </div>
                            )}
                            {output && (
                                <div className={`inspect-detail-section ${selectedEntry.node_kind ?? ""}`}>
                                    <span className={`inspect-section-label ${output.role ?? ""}`}>
                                        <span>Output</span>
                                        <span className="tag">{output.role ?? "unknown"}</span>
                                    </span>
                                    <div className={`inspect-detail-text ${selectedEntry.status ?? ""}`}>
                                        {output.role ? output.content : JSON.stringify(output, null, 4)}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
