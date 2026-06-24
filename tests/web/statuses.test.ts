import {describe, expect, it} from "vitest";
import {computeStatuses} from "../../langgraphics-web/src/hooks/useGraphState";
import type {ExecutionEvent} from "../../langgraphics-web/src/types";

function ea(source: string, target: string, edge_id: string): ExecutionEvent {
    return {type: "edge_active", source, target, edge_id};
}

describe("computeStatuses", () => {
    it("returns empty maps for run_start only", () => {
        const {nodeStatuses, edgeStatuses} = computeStatuses([
            {type: "run_start", run_id: "abc"},
        ]);
        expect(nodeStatuses.size).toBe(0);
        expect(edgeStatuses.size).toBe(0);
    });

    it("sets target node and edge to active on edge_active", () => {
        const {nodeStatuses, edgeStatuses} = computeStatuses([
            {type: "run_start", run_id: "abc"},
            {type: "edge_active", source: "__start__", target: "step_a", edge_id: "e0"},
        ]);
        expect(nodeStatuses.get("step_a")).toBe("active");
        expect(edgeStatuses.get("e0")).toBe("active");
    });

    it("demotes previous active to completed/traversed on next edge_active", () => {
        const {nodeStatuses, edgeStatuses} = computeStatuses([
            {type: "run_start", run_id: "abc"},
            {type: "edge_active", source: "__start__", target: "step_a", edge_id: "e0"},
            {type: "edge_active", source: "step_a", target: "step_b", edge_id: "e1"},
        ]);
        expect(nodeStatuses.get("step_a")).toBe("completed");
        expect(nodeStatuses.get("step_b")).toBe("active");
        expect(edgeStatuses.get("e0")).toBe("traversed");
        expect(edgeStatuses.get("e1")).toBe("active");
    });

    it("finalizes all active to completed/traversed on run_end", () => {
        const {nodeStatuses, edgeStatuses} = computeStatuses([
            {type: "run_start", run_id: "abc"},
            {type: "edge_active", source: "__start__", target: "step_a", edge_id: "e0"},
            {type: "edge_active", source: "step_a", target: "step_b", edge_id: "e1"},
            {type: "edge_active", source: "step_b", target: "__end__", edge_id: "e2"},
            {type: "run_end", run_id: "abc"},
        ]);
        expect(nodeStatuses.get("step_a")).toBe("completed");
        expect(nodeStatuses.get("step_b")).toBe("completed");
        expect(nodeStatuses.get("__end__")).toBe("completed");
        expect(edgeStatuses.get("e0")).toBe("traversed");
        expect(edgeStatuses.get("e1")).toBe("traversed");
        expect(edgeStatuses.get("e2")).toBe("traversed");
    });

    it("sets error status on error event", () => {
        const {nodeStatuses, edgeStatuses} = computeStatuses([
            {type: "run_start", run_id: "abc"},
            {type: "edge_active", source: "__start__", target: "step_a", edge_id: "e0"},
            {type: "error", source: "step_a", target: "step_b", edge_id: "e1"},
        ]);
        expect(nodeStatuses.get("step_a")).toBe("completed");
        expect(nodeStatuses.get("step_b")).toBe("error");
        expect(edgeStatuses.get("e0")).toBe("traversed");
        expect(edgeStatuses.get("e1")).toBe("error");
    });

    it("handles error with null edge_id", () => {
        const {nodeStatuses, edgeStatuses} = computeStatuses([
            {type: "run_start", run_id: "abc"},
            {type: "edge_active", source: "__start__", target: "step_a", edge_id: "e0"},
            {type: "error", source: "step_a", target: "step_a", edge_id: null},
        ]);
        expect(nodeStatuses.get("step_a")).toBe("error");
        expect(edgeStatuses.get("e0")).toBe("traversed");
        expect(edgeStatuses.size).toBe(1);
    });

    it("handles looping graph with repeated node visits", () => {
        const {nodeStatuses, edgeStatuses} = computeStatuses([
            {type: "run_start", run_id: "abc"},
            {type: "edge_active", source: "__start__", target: "process", edge_id: "e0"},
            {type: "edge_active", source: "process", target: "process", edge_id: "e1"},
            {type: "edge_active", source: "process", target: "process", edge_id: "e1"},
            {type: "edge_active", source: "process", target: "__end__", edge_id: "e2"},
            {type: "run_end", run_id: "abc"},
        ]);
        expect(nodeStatuses.get("process")).toBe("completed");
        expect(nodeStatuses.get("__end__")).toBe("completed");
        expect(edgeStatuses.get("e0")).toBe("traversed");
        expect(edgeStatuses.get("e1")).toBe("traversed");
        expect(edgeStatuses.get("e2")).toBe("traversed");
    });

    it("tracks status progression step by step", () => {
        const events: ExecutionEvent[] = [
            {type: "run_start", run_id: "abc"},
        ];

        let result = computeStatuses(events);
        expect(result.nodeStatuses.size).toBe(0);

        events.push({type: "edge_active", source: "__start__", target: "A", edge_id: "e0"});
        result = computeStatuses(events);
        expect(result.nodeStatuses.get("A")).toBe("active");
        expect(result.edgeStatuses.get("e0")).toBe("active");

        events.push({type: "edge_active", source: "A", target: "B", edge_id: "e1"});
        result = computeStatuses(events);
        expect(result.nodeStatuses.get("A")).toBe("completed");
        expect(result.nodeStatuses.get("B")).toBe("active");
        expect(result.edgeStatuses.get("e0")).toBe("traversed");
        expect(result.edgeStatuses.get("e1")).toBe("active");

        events.push({type: "run_end", run_id: "abc"});
        result = computeStatuses(events);
        expect(result.nodeStatuses.get("A")).toBe("completed");
        expect(result.nodeStatuses.get("B")).toBe("completed");
        expect(result.edgeStatuses.get("e0")).toBe("traversed");
        expect(result.edgeStatuses.get("e1")).toBe("traversed");
    });

    it("run_start clears previous run statuses", () => {
        const {nodeStatuses, edgeStatuses} = computeStatuses([
            {type: "run_start", run_id: "run1"},
            {type: "edge_active", source: "__start__", target: "A", edge_id: "e0"},
            {type: "run_end", run_id: "run1"},
            {type: "run_start", run_id: "run2"},
        ]);
        expect(nodeStatuses.size).toBe(0);
        expect(edgeStatuses.size).toBe(0);
    });
});

describe("basic_agent statuses", () => {
    const EVENTS: ExecutionEvent[] = [
        {type: "run_start", run_id: "r1"},
        ea("__start__", "summariser_runner", "e0"),
        ea("summariser_runner", "responder", "e3"),
        ea("responder", "tools", "e2"),
        ea("tools", "responder", "e4"),
        ea("responder", "__end__", "e1"),
        {type: "run_end", run_id: "r1"},
    ];

    it("all nodes completed after run_end", () => {
        const {nodeStatuses} = computeStatuses(EVENTS);
        expect(nodeStatuses.get("summariser_runner")).toBe("completed");
        expect(nodeStatuses.get("responder")).toBe("completed");
        expect(nodeStatuses.get("tools")).toBe("completed");
        expect(nodeStatuses.get("__end__")).toBe("completed");
    });

    it("all edges traversed after run_end", () => {
        const {edgeStatuses} = computeStatuses(EVENTS);
        for (const id of ["e0", "e1", "e2", "e3", "e4"]) {
            expect(edgeStatuses.get(id)).toBe("traversed");
        }
    });

    it("responder is active while waiting for tool result (mid-run)", () => {
        const mid = EVENTS.slice(0, 4);
        const {nodeStatuses, edgeStatuses} = computeStatuses(mid);
        expect(nodeStatuses.get("tools")).toBe("active");
        expect(edgeStatuses.get("e2")).toBe("active");
        expect(nodeStatuses.get("responder")).toBe("completed");
    });
});

describe("sync_agent statuses", () => {
    const EVENTS: ExecutionEvent[] = [
        {type: "run_start", run_id: "r1"},
        ea("__start__", "initial", "e0"),
        ea("initial", "sync_a", "e1"),
        ea("initial", "sync_b", "e2"),
        ea("initial", "sync_c", "e3"),
        ea("sync_a", "final", "e4"),
        ea("sync_b", "final", "e5"),
        ea("sync_c", "final", "e6"),
        ea("final", "__end__", "e7"),
        {type: "run_end", run_id: "r1"},
    ];

    it("all nodes completed after run_end", () => {
        const {nodeStatuses} = computeStatuses(EVENTS);
        for (const n of ["initial", "sync_a", "sync_b", "sync_c", "final", "__end__"]) {
            expect(nodeStatuses.get(n)).toBe("completed");
        }
    });

    it("all edges traversed after run_end", () => {
        const {edgeStatuses} = computeStatuses(EVENTS);
        for (const id of ["e0", "e1", "e2", "e3", "e4", "e5", "e6", "e7"]) {
            expect(edgeStatuses.get(id)).toBe("traversed");
        }
    });

    it("initial is completed and parallel branches are active after fan-out", () => {
        const mid = EVENTS.slice(0, 5);
        const {nodeStatuses, edgeStatuses} = computeStatuses(mid);
        expect(nodeStatuses.get("initial")).toBe("completed");
        expect(nodeStatuses.get("sync_a")).toBe("active");
        expect(nodeStatuses.get("sync_b")).toBe("active");
        expect(nodeStatuses.get("sync_c")).toBe("active");
        expect(edgeStatuses.get("e0")).toBe("traversed");
        expect(edgeStatuses.get("e1")).toBe("active");
        expect(edgeStatuses.get("e2")).toBe("active");
        expect(edgeStatuses.get("e3")).toBe("active");
    });

    it("final is active while parallel branches converge", () => {
        const mid = EVENTS.slice(0, 7);
        const {nodeStatuses} = computeStatuses(mid);
        expect(nodeStatuses.get("sync_a")).toBe("completed");
        expect(nodeStatuses.get("final")).toBe("active");
    });
});

describe("react_agent statuses", () => {
    const EVENTS: ExecutionEvent[] = [
        {type: "run_start", run_id: "r1"},
        ea("__start__", "plan", "e0"),
        ea("plan", "observe", "e8"),
        ea("observe", "update_scratchpad", "e7"),
        ea("update_scratchpad", "check_progress", "e11"),
        ea("check_progress", "observe", "e4"),
        ea("observe", "update_scratchpad", "e7"),
        ea("update_scratchpad", "check_progress", "e11"),
        ea("check_progress", "reflect", "e5"),
        ea("reflect", "revise_plan", "e9"),
        ea("revise_plan", "check_progress", "e10"),
        ea("check_progress", "ask_clarify", "e2"),
        ea("ask_clarify", "plan", "e1"),
        ea("plan", "observe", "e8"),
        ea("observe", "update_scratchpad", "e7"),
        ea("update_scratchpad", "check_progress", "e11"),
        ea("check_progress", "integrate", "e3"),
        ea("integrate", "final_answer", "e6"),
        ea("final_answer", "__end__", "e12"),
        {type: "run_end", run_id: "r1"},
    ];

    it("all nodes completed after full run", () => {
        const {nodeStatuses} = computeStatuses(EVENTS);
        for (const n of [
            "plan", "observe", "update_scratchpad", "check_progress",
            "reflect", "revise_plan", "ask_clarify", "integrate",
            "final_answer", "__end__",
        ]) {
            expect(nodeStatuses.get(n)).toBe("completed");
        }
    });

    it("all edges traversed after full run", () => {
        const {edgeStatuses} = computeStatuses(EVENTS);
        for (const id of ["e0", "e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8", "e9", "e10", "e11", "e12"]) {
            expect(edgeStatuses.get(id)).toBe("traversed");
        }
    });

    it("reflect is active while check_progress routes to it (mid-run)", () => {
        const mid = EVENTS.slice(0, 9);
        const {nodeStatuses, edgeStatuses} = computeStatuses(mid);
        expect(nodeStatuses.get("check_progress")).toBe("completed");
        expect(nodeStatuses.get("reflect")).toBe("active");
        expect(edgeStatuses.get("e5")).toBe("active");
    });

    it("check_progress is active again after revise_plan feeds it back", () => {
        const mid = EVENTS.slice(0, 11);
        const {nodeStatuses} = computeStatuses(mid);
        expect(nodeStatuses.get("revise_plan")).toBe("completed");
        expect(nodeStatuses.get("check_progress")).toBe("active");
    });
});

describe("error_agent statuses", () => {
    const EVENTS: ExecutionEvent[] = [
        {type: "run_start", run_id: "r1"},
        ea("__start__", "plan", "e0"),
        ea("plan", "select_tool", "e6"),
        ea("select_tool", "call_tool", "e9"),
        ea("call_tool", "check_progress", "e1"),
        ea("check_progress", "select_tool", "e4"),
        ea("select_tool", "call_tool", "e9"),
        ea("call_tool", "check_progress", "e1"),
        ea("check_progress", "reflect", "e3"),
        {type: "error", source: "check_progress", target: "reflect", edge_id: "e3"},
    ];

    it("reflect node has error status", () => {
        const {nodeStatuses} = computeStatuses(EVENTS);
        expect(nodeStatuses.get("reflect")).toBe("error");
    });

    it("error edge e3 has error status", () => {
        const {edgeStatuses} = computeStatuses(EVENTS);
        expect(edgeStatuses.get("e3")).toBe("error");
    });

    it("completed nodes are marked correctly", () => {
        const {nodeStatuses} = computeStatuses(EVENTS);
        expect(nodeStatuses.get("plan")).toBe("completed");
        expect(nodeStatuses.get("select_tool")).toBe("completed");
        expect(nodeStatuses.get("call_tool")).toBe("completed");
        expect(nodeStatuses.get("check_progress")).toBe("completed");
    });

    it("traversed edges before error are marked correctly", () => {
        const {edgeStatuses} = computeStatuses(EVENTS);
        for (const id of ["e0", "e6", "e9", "e1", "e4"]) {
            expect(edgeStatuses.get(id)).toBe("traversed");
        }
    });

    it("check_progress is active before error (mid-run)", () => {
        const mid = EVENTS.slice(0, 8);
        const {nodeStatuses, edgeStatuses} = computeStatuses(mid);
        expect(nodeStatuses.get("check_progress")).toBe("active");
        expect(edgeStatuses.get("e1")).toBe("active");
    });
});

describe("deep_agent statuses", () => {
    const PATCH = "PatchToolCallsMiddleware.before_agent";
    const AFTER = "TodoListMiddleware.after_model";

    const EVENTS: ExecutionEvent[] = [
        {type: "run_start", run_id: "r1"},
        ea("__start__", PATCH, "e4"),
        ea(PATCH, "model", "e0"),
        ea("model", AFTER, "e5"),
        ea(AFTER, "tools", "e3"),
        ea("tools", "model", "e6"),
        ea("model", AFTER, "e5"),
        ea(AFTER, "__end__", "e1"),
        {type: "run_end", run_id: "r1"},
    ];

    it("all nodes completed after run_end", () => {
        const {nodeStatuses} = computeStatuses(EVENTS);
        expect(nodeStatuses.get(PATCH)).toBe("completed");
        expect(nodeStatuses.get("model")).toBe("completed");
        expect(nodeStatuses.get(AFTER)).toBe("completed");
        expect(nodeStatuses.get("tools")).toBe("completed");
        expect(nodeStatuses.get("__end__")).toBe("completed");
    });

    it("used edges are traversed; unused conditional edge is absent", () => {
        const {edgeStatuses} = computeStatuses(EVENTS);
        for (const id of ["e0", "e1", "e3", "e4", "e5", "e6"]) {
            expect(edgeStatuses.get(id)).toBe("traversed");
        }
        expect(edgeStatuses.has("e2")).toBe(false);
    });

    it("tools is active after first after_model routes to it (mid-run)", () => {
        const mid = EVENTS.slice(0, 5);
        const {nodeStatuses, edgeStatuses} = computeStatuses(mid);
        expect(nodeStatuses.get("tools")).toBe("active");
        expect(edgeStatuses.get("e3")).toBe("active");
        expect(nodeStatuses.get(AFTER)).toBe("completed");
    });
});

describe("sub1_agent statuses", () => {
    const EVENTS: ExecutionEvent[] = [
        {type: "run_start", run_id: "r1"},
        ea("__start__", "router", "e0"),
        ea("router", "error", "e4"),
        ea("router", "deep_agent", "e3"),
        ea("error", "summarizer", "e2"),
        ea("deep_agent", "summarizer", "e1"),
        ea("summarizer", "__end__", "e5"),
        {type: "run_end", run_id: "r1"},
    ];

    it("all outer nodes completed after run_end", () => {
        const {nodeStatuses} = computeStatuses(EVENTS);
        for (const n of ["router", "error", "deep_agent", "summarizer", "__end__"]) {
            expect(nodeStatuses.get(n)).toBe("completed");
        }
    });

    it("all outer edges traversed after run_end", () => {
        const {edgeStatuses} = computeStatuses(EVENTS);
        for (const id of ["e0", "e1", "e2", "e3", "e4", "e5"]) {
            expect(edgeStatuses.get(id)).toBe("traversed");
        }
    });

    it("both parallel branches active after router fans out", () => {
        const mid = EVENTS.slice(0, 4);
        const {nodeStatuses, edgeStatuses} = computeStatuses(mid);
        expect(nodeStatuses.get("router")).toBe("completed");
        expect(nodeStatuses.get("error")).toBe("active");
        expect(nodeStatuses.get("deep_agent")).toBe("active");
        expect(edgeStatuses.get("e4")).toBe("active");
        expect(edgeStatuses.get("e3")).toBe("active");
    });
});

describe("sub2_agent statuses", () => {
    const EVENTS: ExecutionEvent[] = [
        {type: "run_start", run_id: "r1"},
        ea("__start__", "summariser_runner", "e0"),
        ea("summariser_runner", "subgraph", "e4"),
        ea("subgraph", "responder", "e3"),
        ea("responder", "tools", "e2"),
        ea("tools", "responder", "e5"),
        ea("responder", "__end__", "e1"),
        {type: "run_end", run_id: "r1"},
    ];

    it("all outer nodes completed after run_end", () => {
        const {nodeStatuses} = computeStatuses(EVENTS);
        for (const n of ["summariser_runner", "subgraph", "responder", "tools", "__end__"]) {
            expect(nodeStatuses.get(n)).toBe("completed");
        }
    });

    it("all outer edges traversed after run_end", () => {
        const {edgeStatuses} = computeStatuses(EVENTS);
        for (const id of ["e0", "e1", "e2", "e3", "e4", "e5"]) {
            expect(edgeStatuses.get(id)).toBe("traversed");
        }
    });

    it("subgraph node is active while it executes (mid-run)", () => {
        const mid = EVENTS.slice(0, 3);
        const {nodeStatuses, edgeStatuses} = computeStatuses(mid);
        expect(nodeStatuses.get("summariser_runner")).toBe("completed");
        expect(nodeStatuses.get("subgraph")).toBe("active");
        expect(edgeStatuses.get("e4")).toBe("active");
    });

    it("tools is active and responder completed during tool call (mid-run)", () => {
        const mid = EVENTS.slice(0, 5);
        const {nodeStatuses, edgeStatuses} = computeStatuses(mid);
        expect(nodeStatuses.get("responder")).toBe("completed");
        expect(nodeStatuses.get("tools")).toBe("active");
        expect(edgeStatuses.get("e2")).toBe("active");
    });
});
