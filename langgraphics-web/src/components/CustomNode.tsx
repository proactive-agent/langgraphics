import {memo} from "react";
import {Handle, type Node, type NodeProps} from "@xyflow/react";
import type {NodeData} from "../types";

type CustomNodeType = Node<NodeData>;

export const CustomNode = memo(function CustomNode({data}: NodeProps<CustomNodeType>) {
    const {label, handles} = data;
    return (
        <div className="react-flow__node-default">
            <div>{label}</div>
            {handles.map((h, i) => (
                <Handle key={i} type={h.type} id={h.id} position={h.position} style={h.style}/>
            ))}
        </div>
    );
});
