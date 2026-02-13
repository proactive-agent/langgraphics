import {createRoot} from "react-dom/client";
import {ReactFlowProvider} from "@xyflow/react";
import {useWebSocket} from "./hooks/useWebSocket";
import {useGraphState} from "./hooks/useGraphState";
import {GraphCanvas} from "./components/GraphCanvas";
import "@xyflow/react/dist/style.css";
import "./index.css";

const WS_URL = "ws://localhost:8765";

function Index() {
    const {topology, events} = useWebSocket(WS_URL);
    const {nodes, edges, activeNodeId} = useGraphState(topology, events);

    return (
        <ReactFlowProvider>
            <GraphCanvas nodes={nodes} edges={edges} activeNodeId={activeNodeId}/>
        </ReactFlowProvider>
    )
}

createRoot(document.getElementById("root")!).render(<Index/>);
