import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { NodeData } from "../types/graph";
import "../styles/nodes.css";

type CustomNodeProps = NodeProps & { data: NodeData };

export function CustomNode({ data }: CustomNodeProps) {
  const typeClass = `custom-node--${data.nodeType}`;
  const statusClass = `custom-node--${data.status}`;

  return (
    <div className={`custom-node ${typeClass} ${statusClass}`}>
      <Handle
        type="target"
        position={Position.Top}
        style={{ visibility: data.nodeType === "start" ? "hidden" : "visible" }}
      />
      <div className="custom-node__label">{data.label}</div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ visibility: data.nodeType === "end" ? "hidden" : "visible" }}
      />
    </div>
  );
}
