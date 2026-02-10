import {createRoot} from "react-dom/client";
import {useGraphState, useWebSocket} from "./hooks";
import {GraphCanvas} from "./components/GraphCanvas";
import "./index.css";

const WS_URL = "ws://localhost:8765";

function Index() {
    const {topology, events, connectionStatus} = useWebSocket(WS_URL);
    const {nodes, edges} = useGraphState(topology, events);

    return (
        <div className="app">
            {topology ? (
                <GraphCanvas nodes={nodes} edges={edges} connectionStatus={connectionStatus}/>
            ) : (
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    color: "#64748b",
                    fontSize: 14
                }}>
                    Waiting for graph topology from WebSocket...
                </div>
            )}
        </div>
    );
}

createRoot(document.getElementById("root")!).render(<Index/>);
