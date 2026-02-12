import {createRoot} from "react-dom/client";
import {useGraphState, useWebSocket} from "./hooks";
import {GraphCanvas} from "./components/GraphCanvas";
import "@xyflow/react/dist/style.css";
import "./index.css";

const WS_URL = "ws://localhost:8765";

function Index() {
    const {topology, events} = useWebSocket(WS_URL);
    const {nodes, edges} = useGraphState(topology, events);

    return <GraphCanvas nodes={nodes} edges={edges}/>;
}

createRoot(document.getElementById("root")!).render(<Index/>);
