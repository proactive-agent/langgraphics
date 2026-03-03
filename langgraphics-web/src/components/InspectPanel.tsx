import Tree from "antd/es/tree";
import {Collapse, Space} from "antd";
import type {TreeDataNode} from "antd";
import ReactMarkdown from "react-markdown";
import type {ColorMode} from "@xyflow/react";
import {useCallback, useEffect, useMemo, useState} from "react";
import type {NodeEntry} from "../types";
import {Metrics} from "./Metrics";

export function InspectPanel({colorMode, nodeEntries}: { colorMode: ColorMode, nodeEntries: NodeEntry[] }) {
    const [selectedKey, setSelectedKey] = useState<string>("");

    const expandedKeys = useMemo(() => {
        return nodeEntries.map(({run_id}) => run_id);
    }, [nodeEntries]);

    const selectedEntry = useMemo(() => {
        return nodeEntries.find(({run_id}) => run_id === selectedKey);
    }, [nodeEntries, selectedKey]);

    const safeParseJSON = useCallback((str: any) => {
        try {
            return JSON.parse(str ?? "[]");
        } catch {
            return [];
        }
    }, [])

    const state = useMemo(() => {
        if (!selectedEntry?.state) return null;
        return safeParseJSON(selectedEntry?.state);
    }, [selectedEntry, safeParseJSON])

    const system = useMemo(() => {
        const inputs = safeParseJSON(selectedEntry?.input);
        const system = inputs[0] || {};
        return system.role === "system" && inputs.length < 3 ? system : null;
    }, [selectedEntry, safeParseJSON])

    const input = useMemo(() => {
        const input = safeParseJSON(selectedEntry?.input);
        return input[input.length - 1] || null;
    }, [selectedEntry, safeParseJSON])

    const output = useMemo(() => {
        const output = safeParseJSON(selectedEntry?.output);
        return output[output.length - 1] || null;
    }, [selectedEntry, safeParseJSON])

    const sectionMaxHeight = useMemo(() => {
        const reducer: any = (acc: number, curr: boolean) => acc + Number(curr);
        const count = [state, system, input, output].map(Boolean).reduce(reducer, 0);
        return `calc((100vh - 240px) / ${count})`;
    }, [state, system, input, output])

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
                            {selectedEntry.metrics && (
                                <Metrics
                                    colorMode={colorMode}
                                    metrics={selectedEntry.metrics}
                                />
                            )}
                            <Space vertical size={10}>
                                {state && (
                                    <Collapse
                                        defaultActiveKey="state"
                                        styles={{body: {maxHeight: sectionMaxHeight}}}
                                        items={[
                                            {
                                                key: "state",
                                                label: "State",
                                                showArrow: false,
                                                children: <pre>{JSON.stringify(state, null, 2)}</pre>,
                                            },
                                        ]}
                                    />
                                )}
                                {system && (
                                    <Collapse
                                        defaultActiveKey="system"
                                        styles={{body: {maxHeight: sectionMaxHeight}}}
                                        items={[
                                            {
                                                key: "system",
                                                showArrow: false,
                                                label: (
                                                    <>
                                                        <span>System</span>
                                                        <span className="tag">{system.role ?? "unknown"}</span>
                                                    </>
                                                ),
                                                children: (
                                                    system.role
                                                        ? <ReactMarkdown children={system.content.trim()}/>
                                                        : <pre>{JSON.stringify(system, null, 4)}</pre>
                                                ),
                                            },
                                        ]}
                                    />
                                )}
                                {input && (
                                    <Collapse
                                        defaultActiveKey="input"
                                        styles={{body: {maxHeight: sectionMaxHeight}}}
                                        items={[
                                            {
                                                key: "input",
                                                showArrow: false,
                                                label: (
                                                    <>
                                                        <span>Input</span>
                                                        <span className="tag">{input.role ?? "unknown"}</span>
                                                    </>
                                                ),
                                                children: (
                                                    input.role
                                                        ? <ReactMarkdown children={input.content.trim()}/>
                                                        : <pre>{JSON.stringify(input, null, 4)}</pre>
                                                ),
                                            },
                                        ]}
                                    />
                                )}
                                {output && (
                                    <Collapse
                                        defaultActiveKey="output"
                                        styles={{body: {maxHeight: sectionMaxHeight}}}
                                        classNames={{body: `${selectedEntry.node_kind ?? ""} ${selectedEntry.status ?? ""}`}}
                                        items={[
                                            {
                                                key: "output",
                                                showArrow: false,
                                                label: (
                                                    <>
                                                        <span>Output</span>
                                                        <span className="tag">{output.role ?? "unknown"}</span>
                                                    </>
                                                ),
                                                children: (
                                                    output.role
                                                        ? (output.role === "error") ? (
                                                            <pre>{output.content.trim().replace(/^\n+/mg, "\n")}</pre>
                                                        )
                                                        : <ReactMarkdown children={output.content.trim()}/>
                                                        : <pre>{JSON.stringify(output, null, 4)}</pre>
                                                ),
                                            },
                                        ]}
                                    />
                                )}
                            </Space>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
