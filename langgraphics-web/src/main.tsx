import {useState} from "react";
import {createRoot} from "react-dom/client";
import {type ColorMode} from "@xyflow/react";
import {ReactFlowProvider} from "@xyflow/react";
import {useWebSocket} from "./hooks/useWebSocket";
import {useGraphState} from "./hooks/useGraphState";
import {GraphCanvas} from "./components/GraphCanvas";
import {InspectPanel} from "./components/InspectPanel";
import type {ViewMode, InspectorMode} from "./types.ts";
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
    const {nodes, edges, activeNodeIds} = useGraphState(topology, events, rankDir);

    return (
        <ReactFlowProvider>
            <GraphCanvas
                nodes={nodes}
                edges={edges}
                events={events}
                initialMode={mode}
                initialInspect={inspect}
                initialColorMode={theme}
                initialRankDir={direction}
                activeNodeIds={activeNodeIds}
                onRankDirChange={setRankDir}
                inspect={<InspectPanel nodeEntries={nodeEntries}/>}
            />
        </ReactFlowProvider>
    );
}

createRoot(document.getElementById("root")!).render(<Index/>);
