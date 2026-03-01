import json
from collections import deque
from typing import Any

from langchain_core.messages import messages_to_dict
from langchain_core.tracers.schemas import Run


class Formatter:
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
        return {
            "latency": (run.end_time - run.start_time).total_seconds(),
            "tokens": cls.extract(run.outputs, "total_tokens"),
            # TODO: get the cost from the model costs metadata - coming soon
            # "cost": cls.extract(run.extra, "model"),  # model_name
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
