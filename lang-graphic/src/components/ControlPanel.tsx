import type { ConnectionStatus } from "../hooks/useWebSocket";

interface ControlPanelProps {
  status: ConnectionStatus;
  onClearEvents: () => void;
  onReconnect: () => void;
}

const statusColors: Record<ConnectionStatus, string> = {
  connected: "#22c55e",
  connecting: "#f59e0b",
  disconnected: "#ef4444",
};

const statusLabels: Record<ConnectionStatus, string> = {
  connected: "Connected",
  connecting: "Connecting...",
  disconnected: "Disconnected",
};

export function ControlPanel({ status, onClearEvents, onReconnect }: ControlPanelProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 16px",
        background: "#1e293b",
        borderBottom: "1px solid #334155",
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: statusColors[status],
            boxShadow:
              status === "connected"
                ? `0 0 6px ${statusColors[status]}`
                : undefined,
          }}
        />
        <span style={{ color: "#94a3b8" }}>{statusLabels[status]}</span>
      </div>

      <div style={{ flex: 1 }} />

      <span style={{ color: "#475569", fontSize: 12 }}>LangGraph Viz</span>

      <button
        onClick={onReconnect}
        style={{
          padding: "3px 10px",
          fontSize: 11,
          background: "#334155",
          border: "1px solid #475569",
          borderRadius: 4,
          color: "#94a3b8",
        }}
      >
        Reconnect
      </button>

      <button
        onClick={onClearEvents}
        style={{
          padding: "3px 10px",
          fontSize: 11,
          background: "#334155",
          border: "1px solid #475569",
          borderRadius: 4,
          color: "#94a3b8",
          cursor: "pointer",
        }}
      >
        Reset
      </button>
    </div>
  );
}
