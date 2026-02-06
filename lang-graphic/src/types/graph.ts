/** React Flow node and edge data types. */

export type NodeStatus = "idle" | "active" | "completed" | "error";
export type EdgeStatus = "idle" | "active" | "traversed";

export interface NodeData {
  label: string;
  nodeType: "start" | "end" | "node";
  status: NodeStatus;
}

export interface EdgeData {
  conditional: boolean;
  label: string | null;
  status: EdgeStatus;
}
