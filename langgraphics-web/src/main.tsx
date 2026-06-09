import {useCallback, useMemo, useState} from "react";
import {createRoot} from "react-dom/client";
import {type ColorMode} from "@xyflow/react";
import {ReactFlowProvider} from "@xyflow/react";
import {useWebSocket} from "./hooks/useWebSocket";
import {useGraphState} from "./hooks/useGraphState";
import {GraphCanvas} from "./components/GraphCanvas";
import type {ExecutionEvent, ViewMode, InspectorMode} from "./types.ts";
import type {RankDir} from "./layout";
import "@xyflow/react/dist/style.css";
import "./index.css";

const WS_URL = "ws://localhost:8765";

function parseParams(): {theme: ColorMode; direction: RankDir, mode: ViewMode, inspect: InspectorMode} {
    const p = new URLSearchParams(window.location.search);
    const mode = p.get("mode") ?? "auto";
    const theme = p.get("theme") ?? "system";
    const inspect = p.get("inspect") ?? "off";
    const direction = p.get("direction") ?? "TB";
    return {
        inspect: (["off", "tree", "full"].includes(inspect) ? inspect : "off") as InspectorMode,
        theme: (["system", "light", "dark"].includes(theme) ? theme : "system") as ColorMode,
        direction: (["TB", "LR"].includes(direction) ? direction : "TB") as RankDir,
        mode: (["auto", "manual"].includes(mode) ? mode : "auto") as ViewMode,
    };
}

const {theme, mode, inspect, direction} = parseParams();

function Index() {
    const [rankDir, setRankDir] = useState<RankDir>(direction);
    const {topology, events, nodeEntries} = useWebSocket(WS_URL);
    const [displayEvents, setDisplayEvents] = useState<ExecutionEvent[]>([]);
    const [displayNodeEntries, setDisplayNodeEntries] = useState<typeof nodeEntries>([]);

    const playEvents = useMemo(() => {
        return displayEvents.length > 0 ? displayEvents : events;
    }, [displayEvents, events]);

    const playNodeEntries = useMemo(() => {
        return displayEvents.length > 0 ? displayNodeEntries : nodeEntries;
    }, [displayEvents, displayNodeEntries, nodeEntries]);

    const isRecording = useMemo(() => {
        return !events.find(({type}) => ["error", "run_end"].includes(type));
    }, [events]);

    const isReplaying = useMemo(() => {
        return !isRecording && displayEvents.length > 0 &&
            !displayEvents.find(({type}) => ["error", "run_end"].includes(type));
    }, [isRecording, displayEvents]);

    const {nodes, edges, activeNodeIds} = useGraphState(topology, playEvents, rankDir);

    const startReplay = useCallback(async () => {
        setDisplayEvents([]);
        setDisplayNodeEntries([]);
        let parentIndex = 0;

        const isSimultaneous = (a: any, b: any) =>
            a.type === "edge_active" && b.type === "edge_active" && (b.source === `${a.target}:__start__`
                || (a.target.endsWith(":__end__") && b.source === a.target.slice(0, -":__end__".length)));

        const batches = events.reduce<ExecutionEvent[][]>((acc, event, i) => {
            if (i > 0 && isSimultaneous(events[i - 1], event)) {
                acc.at(-1)!.push(event);
                return acc;
            }
            return [...acc, [event]];
        }, []);

        for (const batch of batches) {
            for (const event of batch) {
                parentIndex = Math.max(parentIndex, nodeEntries.findIndex(
                    ({node_id}) => node_id === (event as any).source
                ));
            }
            setDisplayEvents(prev => [...prev, ...batch]);
            setDisplayNodeEntries(nodeEntries.slice(0, parentIndex + 1));
            await new Promise<void>(r => setTimeout(r, 1000));
        }

        setDisplayEvents([]);
        setDisplayNodeEntries([]);
    }, [events, nodeEntries]);

    return (
        <ReactFlowProvider>
            <GraphCanvas
                nodes={nodes}
                edges={edges}
                initialMode={mode}
                events={playEvents}
                onReplay={startReplay}
                initialInspect={inspect}
                initialColorMode={theme}
                isRecording={isRecording}
                isReplaying={isReplaying}
                initialRankDir={direction}
                onRankDirChange={setRankDir}
                nodeEntries={playNodeEntries}
                activeNodeIds={activeNodeIds}
            />
        </ReactFlowProvider>
    );
}

createRoot(document.getElementById("root")!).render(<Index/>);
