import asyncio
import json
import time

import websockets
from websockets.asyncio.server import serve

DEFAULT_MESSAGES: list[dict] = [
    {"type": "graph", "nodes": [{"id": "__start__", "name": "__start__", "node_type": "start"},
                                {"id": "generate", "name": "generate", "node_type": "node"},
                                {"id": "reflect", "name": "reflect", "node_type": "node"},
                                {"id": "__end__", "name": "__end__", "node_type": "end"}],
     "edges": [{"id": "e0", "source": "__start__", "target": "generate", "conditional": False, "label": None},
               {"id": "e1", "source": "generate", "target": "__end__", "conditional": True, "label": None},
               {"id": "e2", "source": "generate", "target": "reflect", "conditional": True, "label": None},
               {"id": "e3", "source": "reflect", "target": "generate", "conditional": False, "label": None}]},
    {"type": "edge_active", "source": "__start__", "target": "generate", "edge_id": "e0"},
    {"type": "edge_active", "source": "generate", "target": "reflect", "edge_id": "e2"},
    {"type": "edge_active", "source": "reflect", "target": "generate", "edge_id": "e3"},
    {"type": "edge_active", "source": "generate", "target": "reflect", "edge_id": "e2"},
    {"type": "edge_active", "source": "reflect", "target": "generate", "edge_id": "e3"},
    {"type": "edge_active", "source": "generate", "target": "__end__", "edge_id": "e1"},
    {"type": "run_end"},
]

DELAY = 3  # seconds — only applied after edge_* messages

connected: set[websockets.WebSocketServerProtocol] = set()


async def handler(ws: websockets.WebSocketServerProtocol) -> None:
    connected.add(ws)
    print(f"[+] client connected  ({len(connected)} total)")
    try:
        async for _raw in ws:
            pass  # ignore client messages
    except websockets.ConnectionClosed:
        pass
    finally:
        connected.discard(ws)
        print(f"[-] client disconnected  ({len(connected)} total)")


async def broadcast(message: dict) -> None:
    if "timestamp" not in message and message["type"] != "graph":
        message["timestamp"] = time.time()
    payload = json.dumps(message)
    for ws in list(connected):
        try:
            await ws.send(payload)
        except websockets.ConnectionClosed:
            connected.discard(ws)


async def replay(messages: list[dict]) -> None:
    """Wait for at least one client, then replay the message list."""
    print("Waiting for a client to connect …")
    while not connected:
        await asyncio.sleep(0.1)

    print(f"Replaying {len(messages)} messages …")
    for i, msg in enumerate(messages):
        print(f"  [{i + 1}/{len(messages)}] {msg['type']}", end="")
        if "node" in msg:
            print(f"  node={msg['node']}", end="")
        if "source" in msg:
            print(f"  {msg['source']} → {msg['target']}", end="")
        print()

        await broadcast(msg)

        if msg["type"].startswith("edge_"):
            await asyncio.sleep(DELAY)

    print("Done.")


async def main() -> None:
    async with serve(handler, "localhost", 8765):
        print("WebSocket server listening on ws://localhost:8765")
        await replay(DEFAULT_MESSAGES)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nStopped.")
