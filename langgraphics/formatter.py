import json
import pathlib
from collections import deque
from typing import Any

from langchain_core.messages import messages_to_dict
from langchain_core.tracers.schemas import Run


class Formatter:
    models: dict = None

    @classmethod
    def costs(cls, model: str, cached: int, total: int):
        if cls.models is None:
            datadir_path = pathlib.Path(__file__).parent / "metadata"
            with open(datadir_path / "models.json", encoding="utf-8") as fp:
                cls.models = json.load(fp)
        metadata = cls.models.get(model.lower(), {})
        cost = metadata.get("cost", {"cache_read": 0, "output": 0})
        fmt = lambda x: "0.0" if x == 0 else f"{x:.8f}".rstrip("0").rstrip(".")
        return {
            "cached": fmt((cached / 1e6) * cost["cache_read"]),
            "total": fmt((total / 1e6) * cost["output"]),
        }

    @staticmethod
    def latency(seconds: float) -> str:
        if seconds >= 60:
            return "%dm %ds" % (
                int(seconds) // 60,
                int(seconds) % 60,
            )

        if seconds < 1:
            return "%dms" % round(seconds * 1000)

        return "%ds %dms" % (int(seconds), int((seconds % int(seconds)) * 1000))

    @staticmethod
    def serialize(func):
        def wrapper(*args, **kwargs):
            return json.dumps(
                ensure_ascii=False,
                obj=func(*args, **kwargs),
                default=lambda x: x.__dict__,
            )

        return wrapper

    @staticmethod
    def extract(data: dict, key: str):
        def bfs():
            queue = deque([data])
            while queue:
                current = queue.popleft()
                if isinstance(current, dict):
                    if key in current:
                        yield current[key]
                    queue.extend(current.values())
                elif isinstance(current, (list, tuple)):
                    queue.extend(current)

        return next(bfs(), None)

    @classmethod
    def metrics(cls, run: Run) -> dict[str, Any]:
        model_name = cls.extract(run.extra, "ls_model_name") or "unknown"
        total_tokens = cls.extract(run.outputs, "total_tokens") or 0
        cached_tokens = cls.extract(run.outputs, "cached_tokens") or 0
        return {
            "latency": cls.latency((run.end_time - run.start_time).total_seconds()),
            "costs": cls.costs(model_name, cached_tokens, total_tokens),
            "tokens": {"cached": cached_tokens, "total": total_tokens},
        }

    @staticmethod
    def norm(msg: dict[str, Any]) -> dict[str, Any]:
        if "lc" in msg:
            msg = {
                "type": msg["id"][-1].replace("Message", "").lower(),
                "data": msg["kwargs"],
            }
        data: dict[str, Any] = msg.get("data", {})
        if tool_calls := data.get("tool_calls", []):
            fmt_tool = lambda tc: f"{tc.get('name', '?')}({tc.get('args', {})})"
            return {
                "role": msg.get("type", "unknown"),
                "content": ", ".join(map(fmt_tool, tool_calls)),
            }
        role = msg.get("type", "unknown")
        content = data.get("content", "")
        if content and isinstance(content, list):
            content = content[-1].get("text", "")
        return {"role": role, "content": str(content)}

    @classmethod
    @serialize
    def inputs(cls, run: Run) -> list[dict[str, Any]]:
        data: dict[str, Any] = run.inputs or {}
        if run.run_type == "chat_model":
            try:
                messages = messages_to_dict(data["messages"])
            except AttributeError:
                messages = data["messages"][0]
            except KeyError:
                return [data]
            return list(map(cls.norm, messages))
        elif run.run_type == "chain":
            messages = messages_to_dict(data.get("messages", []))
            return list(map(cls.norm, messages))
        elif run.run_type == "tool":
            return [{"role": "input", "content": str(data.get("input", ""))}]
        elif run.run_type == "retriever":
            return [{"role": "query", "content": str(data.get("query", ""))}]
        elif run.run_type == "llm":
            if "prompts" in data:
                return [{"role": "prompt", "content": data["prompts"][0]}]
            return [{"role": "prompt", "content": data["prompt"]}]
        return []

    @classmethod
    @serialize
    def outputs(cls, run: Run) -> list[dict[str, Any]]:
        if run.error:
            return [{"role": "error", "content": str(run.error)}]
        data: dict[str, Any] = run.outputs or {}
        if run.run_type == "chat_model":
            return [cls.norm(cls.extract(data, "message"))]
        elif run.run_type == "chain":
            try:
                messages = messages_to_dict(data["messages"].value)
            except AttributeError:
                messages = messages_to_dict(data["messages"])
            except KeyError:
                return [data]
            return list(map(cls.norm, messages))
        elif run.run_type == "llm":
            return [{"role": "text", "content": data["generations"][0]["text"]}]
        elif run.run_type == "tool":
            out = data.get("output", "")
            return [{"role": "output", "content": getattr(out, "content", str(out))}]
        elif run.run_type == "retriever":
            return [
                {"role": "document", "content": getattr(d, "page_content", str(d))}
                for d in data.get("documents", [])
            ]
        return []
