import {Position} from "@xyflow/react";

export type NodeStatus = "idle" | "active" | "completed" | "error";
export type EdgeStatus = "idle" | "active" | "traversed" | "error";

export interface NodeHandle {
    id: string;
    position: Position;
    type: "source" | "target";
    style: { top?: string; left?: string; transform: string };
}

export interface NodeData extends Record<string, unknown> {
    label: string;
    nodeType: "start" | "end" | "node";
    status: NodeStatus;
    handles: NodeHandle[];
}

export interface EdgeData extends Record<string, unknown> {
    conditional: boolean;
    label: string | null;
    status: EdgeStatus;
}

export interface ProtocolNode {
    id: string;
    name: string;
    node_type: "start" | "end" | "node";
}

export interface ProtocolEdge {
    id: string;
    source: string;
    target: string;
    conditional: boolean;
    label: string | null;
}

export interface GraphMessage {
    type: "graph";
    nodes: ProtocolNode[];
    edges: ProtocolEdge[];
}

export interface RunStartMessage {
    type: "run_start";
    run_id: string;
}

export interface RunEndMessage {
    type: "run_end";
    run_id: string;
}

export interface NodeStartMessage {
    type: "node_start";
    node: string;
    task_id: string;
}

export interface NodeEndMessage {
    type: "node_end";
    node: string;
    task_id: string;
}

export interface EdgeActiveMessage {
    type: "edge_active";
    source: string;
    target: string;
    edge_id: string;
}

export interface ErrorMessage {
    type: "error";
    source: string;
    target: string;
    edge_id: string | null;
}

export interface PongMessage {
    type: "pong";
}

export type WsMessage =
    | GraphMessage | RunStartMessage | RunEndMessage
    | NodeStartMessage | NodeEndMessage | EdgeActiveMessage | ErrorMessage | PongMessage;

export type ExecutionEvent =
    | RunStartMessage | RunEndMessage | NodeStartMessage | NodeEndMessage | EdgeActiveMessage | ErrorMessage;
