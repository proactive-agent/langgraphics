import {describe, expect, it} from "vitest";
import {computeStatuses} from "../../langgraphics-web/src/hooks/useGraphState";
import type {ExecutionEvent} from "../../langgraphics-web/src/types";

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
