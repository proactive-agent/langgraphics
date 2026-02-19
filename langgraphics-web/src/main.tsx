import {useState} from "react";
import {createRoot} from "react-dom/client";
import {type ColorMode} from "@xyflow/react";
import {ReactFlowProvider} from "@xyflow/react";
import {useWebSocket} from "./hooks/useWebSocket";
import {useGraphState} from "./hooks/useGraphState";
import {GraphCanvas} from "./components/GraphCanvas";
import {InspectPanel} from "./components/InspectPanel";
import type {RankDir} from "./layout";
import "@xyflow/react/dist/style.css";
import "./index.css";

const WS_URL = "ws://localhost:8765";

function parseParams(): {colorMode: ColorMode; rankDir: RankDir} {
    const p = new URLSearchParams(window.location.search);
    const theme = p.get("theme") ?? "system";
    const direction = p.get("direction") ?? "TB";
    return {
        colorMode: (["system", "light", "dark"].includes(theme) ? theme : "system") as ColorMode,
        rankDir: (["TB", "LR"].includes(direction) ? direction : "TB") as RankDir,
    };
}

const {colorMode: initialColorMode, rankDir: initialRankDir} = parseParams();

function Index() {
    const [rankDir, setRankDir] = useState<RankDir>(initialRankDir);
    const {topology, events, nodeOutputLog, nodeStepLog} = useWebSocket(WS_URL);
    const {nodes, edges, activeNodeId} = useGraphState(topology, events, rankDir);

    return (
        <ReactFlowProvider>
            <GraphCanvas
                nodes={nodes}
                edges={edges}
                activeNodeId={activeNodeId}
                initialColorMode={initialColorMode}
                initialRankDir={initialRankDir}
                onRankDirChange={setRankDir}
                inspect={
                    <InspectPanel
                        nodes={nodes}
                        nodeStepLog={nodeStepLog}
                        nodeOutputLog={nodeOutputLog}
                    />
                }
            />
        </ReactFlowProvider>
    );
}

createRoot(document.getElementById("root")!).render(<Index/>);
