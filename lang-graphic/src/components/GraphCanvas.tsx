import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CustomNode } from "./CustomNode";
import { CustomEdge } from "./CustomEdge";
import type { NodeData, EdgeData } from "../types/graph";

const nodeTypes = { custom: CustomNode };
const edgeTypes = { custom: CustomEdge };

interface GraphCanvasProps {
  nodes: Node<NodeData>[];
  edges: Edge<EdgeData>[];
}

export function GraphCanvas({ nodes, edges }: GraphCanvasProps) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onInit={(instance) => instance.fitView()}
      minZoom={0.1}
      maxZoom={2.5}
      defaultEdgeOptions={{ type: "custom" }}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#334155" gap={20} size={1} />
      <Controls
        style={{ background: "#1e293b", border: "1px solid #334155" }}
      />
      <MiniMap
        nodeColor={(n) => {
          const data = n.data as NodeData;
          switch (data.status) {
            case "active":
              return "#22c55e";
            case "completed":
              return "#3b82f6";
            case "error":
              return "#ef4444";
            default:
              return "#64748b";
          }
        }}
        maskColor="rgba(15, 23, 42, 0.7)"
        style={{
          background: "#1e293b",
          border: "1px solid #334155",
          bottom: 10,
          right: 10,
        }}
      />
    </ReactFlow>
  );
}
