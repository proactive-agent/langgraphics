import asyncio
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler
from pathlib import Path
from socketserver import TCPServer
from typing import Any, Literal

from websockets.asyncio.server import serve

from .broadcaster import Broadcaster
from .streamer import Viewport
from .topology import extract
from .upstream import sync

DEFAULT_HTTP_PORT = 8764
DEFAULT_WS_PORT = 8765


def start_http_server(host: str, port: int) -> TCPServer:
    static = Path(__file__).parent / "static"
    handler = partial(SimpleHTTPRequestHandler, directory=static)
    server = TCPServer((host, port), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def start_ws_server(manager: Broadcaster, host: str, port: int) -> None:
    async def run() -> None:
        manager.loop = asyncio.get_running_loop()
        manager.server = await serve(manager.handler, host, port)
        await manager.server.wait_closed()

    def thread_target() -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(run())

    threading.Thread(target=thread_target, daemon=True).start()


def watch(
    graph: Any,
    *,
    host: str = "localhost",
    port: int = DEFAULT_HTTP_PORT,
    ws_port: int = DEFAULT_WS_PORT,
    open_browser: bool = True,
    direction: Literal["TB", "LR"] = "TB",
    mode: Literal["auto", "manual"] = "auto",
    inspect: Literal["off", "tree", "full"] = "off",
    theme: Literal["system", "dark", "light"] = "system",
) -> Viewport:
    sync()
    topology = extract(graph)
    manager = Broadcaster(topology)

    def collect_subgraph_edges(nodes: list, prefix: str) -> None:
        for node in nodes:
            if node.get("node_type") == "subgraph" and node.get("subgraph"):
                pid = f"{prefix}:{node['id']}" if prefix else node["id"]
                for e in node["subgraph"]["edges"]:
                    edge_lookup[(f"{pid}:{e['source']}", f"{pid}:{e['target']}")] = f"{pid}:{e['id']}"
                collect_subgraph_edges(node["subgraph"]["nodes"], pid)

    edge_lookup = {(e["source"], e["target"]): e["id"] for e in topology["edges"]}
    collect_subgraph_edges(topology["nodes"], "")

    http_server = start_http_server(host, port)
    start_ws_server(manager, host, ws_port)

    if open_browser:
        defaults = (
            ("mode", mode, "auto"),
            ("theme", theme, "system"),
            ("inspect", inspect, "off"),
            ("direction", direction, "TB"),
            ("ws_port", ws_port, DEFAULT_WS_PORT),
        )
        params = [f"{k}={v}" for k, v, default in defaults if v != default]
        query = ("?" + "&".join(params)) if params else ""
        webbrowser.open(f"http://{host}:{port}{query}")

    return Viewport(graph, manager, edge_lookup, http_server)
