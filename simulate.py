import asyncio
import json
import sys
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
    {"type": "edge_active", "source": "__start__", "target": "generate", "edge_id": "e0",
     "timestamp": 1770567010.5599875},
    {"type": "node_start", "node": "generate", "task_id": "1458c991", "timestamp": 1770567010.560994},
    {"type": "node_end", "node": "generate", "task_id": "1458c991", "timestamp": 1770567010.8648126},
    {"type": "edge_active", "source": "generate", "target": "reflect", "edge_id": "e2",
     "timestamp": 1770567028.4029257},
    {"type": "node_start", "node": "reflect", "task_id": "373e5c72", "timestamp": 1770567028.404925},
    {"type": "node_end", "node": "reflect", "task_id": "373e5c72", "timestamp": 1770567028.7148867},
    {"type": "edge_active", "source": "reflect", "target": "generate", "edge_id": "e3", "timestamp": 1770567051.482183},
    {"type": "node_start", "node": "generate", "task_id": "12f672fc", "timestamp": 1770567051.4828851},
    {"type": "node_end", "node": "generate", "task_id": "12f672fc", "timestamp": 1770567051.7982628},
    {"type": "edge_active", "source": "generate", "target": "reflect", "edge_id": "e2", "timestamp": 1770567237.000307},
    {"type": "node_start", "node": "reflect", "task_id": "090d269c", "timestamp": 1770567237.0019295},
    {"type": "node_end", "node": "reflect", "task_id": "090d269c", "timestamp": 1770567237.314677},
    {"type": "edge_active", "source": "reflect", "target": "generate", "edge_id": "e3",
     "timestamp": 1770567310.5677922},
    {"type": "node_start", "node": "generate", "task_id": "d1c8b9e7", "timestamp": 1770567310.5684195},
    {"type": "node_end", "node": "generate", "task_id": "d1c8b9e7", "timestamp": 1770567310.8824415},
    {"type": "edge_active", "source": "generate", "target": "__end__", "edge_id": "e1",
     "timestamp": 1770567364.1234567},
]

DELAY = 1  # seconds between messages

connected: set[websockets.WebSocketServerProtocol] = set()


async def handler(ws: websockets.WebSocketServerProtocol) -> None:
    connected.add(ws)
    print(f"[+] client connected  ({len(connected)} total)")
    try:
        async for raw in ws:
            msg = json.loads(raw)
            if msg.get("type") == "ping":
                await ws.send(json.dumps({"type": "pong"}))
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

    print(f"Replaying {len(messages)} messages (interval={DELAY}s) …")
    for i, msg in enumerate(messages):
        print(f"  [{i + 1}/{len(messages)}] {msg['type']}", end="")
        if "node" in msg:
            print(f"  node={msg['node']}", end="")
        if "source" in msg:
            print(f"  {msg['source']} → {msg['target']}", end="")
        print()

        await broadcast(msg)

        if i < len(messages) - 1:
            await asyncio.sleep(DELAY)

    print("Done.")


async def main(messages: list[dict]) -> None:
    async with serve(handler, "localhost", 8765):
        print("WebSocket server listening on ws://localhost:8765")
        await replay(messages)


if __name__ == "__main__":
    messages = DEFAULT_MESSAGES
    if len(sys.argv) > 1:
        with open(sys.argv[1]) as f:
            messages = json.load(f)
        print(f"Loaded {len(messages)} messages from {sys.argv[1]}")

    try:
        asyncio.run(main(messages))
    except KeyboardInterrupt:
        print("\nStopped.")
