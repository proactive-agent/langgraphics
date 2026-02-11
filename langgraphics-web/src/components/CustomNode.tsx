import {memo} from "react";
import {Handle, type NodeProps} from "reactflow";
import type {NodeData} from "../types";

export const CustomNode = memo(function CustomNode({data}: NodeProps) {
    const {label, handles} = data as NodeData;
    return (
        <div className="react-flow__node-default">
            <div>{label}</div>
            {handles.map((h, i) => (
                <Handle key={i} type={h.type} id={h.id} position={h.position} style={h.style}/>
            ))}
        </div>
    );
});
