import {memo} from "react";
import {Handle, type Node, type NodeProps} from "@xyflow/react";
import type {NodeData} from "../types";

export const CustomNode = memo(function CustomNode({data}: NodeProps<Node<NodeData>>) {
    const {label, handles, nodeType} = data;
    return (
        <div className={nodeType === "subgraph" ? "subgraph-group" : "react-flow__node-default"}>
            <div className={nodeType === "subgraph" ? "subgraph-group-label" : ""}>{label}</div>
            {handles.map((h, i) => (
                <Handle key={i} type={h.type} id={h.id} position={h.position} style={h.style}/>
            ))}
        </div>
    );
});
