import {describe, expect, it} from "vitest";
import {computeDepthMap} from "../../langgraphics-web/src/hooks/useInspectTree";
import type {GraphMessage} from "../../langgraphics-web/src/types";

function topo(nodes: GraphMessage["nodes"], edges: GraphMessage["edges"]): GraphMessage {
    return {type: "graph", nodes, edges};
}

function n(id: string, type: "start" | "end" | "node" = "node"): GraphMessage["nodes"][0] {
    return {id, name: id, node_type: type, node_kind: type === "node" ? "function" : null};
}

function e(id: string, source: string, target: string, conditional = false): GraphMessage["edges"][0] {
    return {id, source, target, conditional, label: null};
}

describe("computeDepthMap", () => {
    it("returns empty map when no start node", () => {
        const result = computeDepthMap(topo(
            [n("A"), n("B")],
            [e("e0", "A", "B")],
        ));
        expect(result.size).toBe(0);
    });

    it("marks start node with isStart and depth 0", () => {
        const result = computeDepthMap(topo(
            [n("__start__", "start"), n("A"), n("__end__", "end")],
            [e("e0", "__start__", "A"), e("e1", "A", "__end__")],
        ));
        const start = result.get("__start__");
        expect(start).toBeDefined();
        expect(start!.isStart).toBe(true);
        expect(start!.depth).toBe(0);
    });

    it("marks end node with isEnd and depth 0", () => {
        const result = computeDepthMap(topo(
            [n("__start__", "start"), n("A"), n("__end__", "end")],
            [e("e0", "__start__", "A"), e("e1", "A", "__end__")],
        ));
        const end = result.get("__end__");
        expect(end).toBeDefined();
        expect(end!.isEnd).toBe(true);
        expect(end!.depth).toBe(0);
    });

    it("assigns depth 0 to linear chain nodes", () => {
        const result = computeDepthMap(topo(
            [n("__start__", "start"), n("A"), n("B"), n("C"), n("__end__", "end")],
            [e("e0", "__start__", "A"), e("e1", "A", "B"), e("e2", "B", "C"), e("e3", "C", "__end__")],
        ));
        expect(result.get("A")!.depth).toBe(0);
        expect(result.get("B")!.depth).toBe(0);
        expect(result.get("C")!.depth).toBe(0);
    });

    it("nests cycle nodes under their parent depth", () => {
        const result = computeDepthMap(topo(
            [n("__start__", "start"), n("decide"), n("A"), n("B"), n("__end__", "end")],
            [
                e("e0", "__start__", "decide"),
                e("e1", "decide", "A"),
                e("e2", "A", "B"),
                e("e3", "B", "decide"),
                e("e4", "decide", "__end__"),
            ],
        ));
        expect(result.get("decide")!.depth).toBeGreaterThanOrEqual(0);
        expect(result.get("A")!.depth).toBeGreaterThan(result.get("decide")!.depth);
        expect(result.get("B")!.depth).toBe(0);
    });

    it("keeps non-cycle nodes at depth 0 even if adjacent to cycle", () => {
        const result = computeDepthMap(topo(
            [n("__start__", "start"), n("loop_entry"), n("loop_body"), n("exit"), n("__end__", "end")],
            [
                e("e0", "__start__", "loop_entry"),
                e("e1", "loop_entry", "loop_body"),
                e("e2", "loop_body", "loop_entry"),
                e("e3", "loop_entry", "exit"),
                e("e4", "exit", "__end__"),
            ],
        ));
        expect(result.get("exit")!.depth).toBe(0);
    });

    it("preserves node_kind from topology", () => {
        const result = computeDepthMap(topo(
            [
                n("__start__", "start"),
                {id: "A", name: "A", node_type: "node", node_kind: "llm"},
                {id: "B", name: "B", node_type: "node", node_kind: "tool"},
                n("__end__", "end"),
            ],
            [e("e0", "__start__", "A"), e("e1", "A", "B"), e("e2", "B", "__end__")],
        ));
        expect(result.get("A")!.kind).toBe("llm");
        expect(result.get("B")!.kind).toBe("tool");
    });

    it("sets kind to null for start and end nodes", () => {
        const result = computeDepthMap(topo(
            [n("__start__", "start"), n("A"), n("__end__", "end")],
            [e("e0", "__start__", "A"), e("e1", "A", "__end__")],
        ));
        expect(result.get("__start__")!.kind).toBeNull();
        expect(result.get("__end__")!.kind).toBeNull();
    });

    it("includes only node-type nodes in result (not start/end as regular)", () => {
        const result = computeDepthMap(topo(
            [n("__start__", "start"), n("A"), n("__end__", "end")],
            [e("e0", "__start__", "A"), e("e1", "A", "__end__")],
        ));
        expect(result.size).toBe(3);
        expect(result.has("A")).toBe(true);
    });

    it("handles two-node cycle", () => {
        const result = computeDepthMap(topo(
            [n("__start__", "start"), n("A"), n("B"), n("__end__", "end")],
            [
                e("e0", "__start__", "A"),
                e("e1", "A", "B"),
                e("e2", "B", "A"),
                e("e3", "A", "__end__"),
            ],
        ));
        expect(result.has("A")).toBe(true);
        expect(result.has("B")).toBe(true);
        expect(result.get("B")!.depth).toBe(0);
    });

    it("handles diamond graph without cycles", () => {
        const result = computeDepthMap(topo(
            [n("__start__", "start"), n("A"), n("B"), n("C"), n("D"), n("__end__", "end")],
            [
                e("e0", "__start__", "A"),
                e("e1", "A", "B"),
                e("e2", "A", "C"),
                e("e3", "B", "D"),
                e("e4", "C", "D"),
                e("e5", "D", "__end__"),
            ],
        ));
        expect(result.get("A")!.depth).toBe(0);
        expect(result.get("B")!.depth).toBe(0);
        expect(result.get("C")!.depth).toBe(0);
        expect(result.get("D")!.depth).toBe(0);
    });

    it("handles complex cycle with conditional exit", () => {
        const result = computeDepthMap(topo(
            [
                n("__start__", "start"),
                n("plan"), n("select_tool"), n("call_tool"), n("check"), n("finalize"),
                n("__end__", "end"),
            ],
            [
                e("e0", "__start__", "plan"),
                e("e1", "plan", "select_tool"),
                e("e2", "select_tool", "call_tool"),
                e("e3", "call_tool", "check"),
                e("e4", "check", "select_tool"),
                e("e5", "check", "finalize"),
                e("e6", "finalize", "__end__"),
            ],
        ));
        expect(result.get("finalize")!.depth).toBe(0);
        expect(result.get("select_tool")!.depth).toBeGreaterThan(0);
        expect(result.get("call_tool")!.depth).toBeGreaterThan(0);
        expect(result.get("check")!.depth).toBe(0);
    });

    it("replicates reactmini_agent network and matches inspect tree depths", () => {
        const nodes: GraphMessage["nodes"] = [
            n("__start__", "start"),
            n("plan"),
            n("select_tool"),
            {id: "call_tool", name: "call_tool", node_type: "node", node_kind: "tool"},
            n("reflect"),
            n("revise_plan"),
            {id: "check_progress", name: "check_progress", node_type: "node", node_kind: "retriever"},
            n("integrate"),
            n("final_answer"),
            n("__end__", "end"),
        ];
        const edges: GraphMessage["edges"] = [
            e("e0", "__start__", "plan"),
            e("e1", "plan", "select_tool"),
            e("e2", "select_tool", "call_tool"),
            e("e3", "call_tool", "check_progress"),
            e("e4", "check_progress", "select_tool", true),
            e("e5", "check_progress", "integrate", true),
            e("e6", "check_progress", "reflect", true),
            e("e7", "reflect", "revise_plan"),
            e("e8", "revise_plan", "check_progress"),
            e("e9", "integrate", "final_answer"),
            e("e10", "final_answer", "__end__"),
        ];
        const result = computeDepthMap(topo(nodes, edges));
        expect(result.get("__start__")!.depth).toBe(0);
        expect(result.get("__end__")!.depth).toBe(0);
        expect(result.get("plan")!.depth).toBe(0);
        expect(result.get("select_tool")!.depth).toBe(1);
        expect(result.get("call_tool")!.depth).toBe(1);
        expect(result.get("check_progress")!.depth).toBe(0);
        expect(result.get("reflect")!.depth).toBe(1);
        expect(result.get("revise_plan")!.depth).toBe(1);
        expect(result.get("integrate")!.depth).toBe(0);
        expect(result.get("final_answer")!.depth).toBe(0);
        expect(result.get("call_tool")!.kind).toBe("tool");
        expect(result.get("check_progress")!.kind).toBe("retriever");
    });
});
