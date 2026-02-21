import json
from typing import Any

from langchain_core.messages import messages_to_dict
from langchain_core.tracers.schemas import Run
from langsmith.utils import (
    get_message_generation_from_outputs,
    get_llm_generation_from_outputs,
    get_messages_from_inputs,
    get_prompt_from_inputs,
    _convert_message,
)


class Formatter:
    @staticmethod
    def serialise(func):
        def wrapper(*args, **kwargs):
            data = func(*args, **kwargs)
            return json.dumps(data, indent=4, ensure_ascii=False)

        return wrapper

    @staticmethod
    def norm(msg: dict[str, Any]) -> dict[str, Any]:
        data: dict[str, Any] = msg.get("data", {})
        if tool_calls := data.get("tool_calls", []):
            fmt_tool = lambda tc: f"{tc.get('name', '?')}({tc.get('args', {})})"
            return {
                "role": msg.get("type", "unknown"),
                "content": ", ".join(map(fmt_tool, tool_calls)),
            }
        return {
            "role": msg.get("type", "unknown"),
            "content": str(data.get("content", "")),
        }

    @classmethod
    @serialise
    def inputs(cls, run: Run) -> list[dict[str, Any]]:
        data: dict[str, Any] = run.inputs or {}
        if run.run_type == "chat_model":
            try:
                messages = messages_to_dict(data["messages"])
            except AttributeError:
                messages = data["messages"][0]
            except KeyError:
                return [data]
            return list(map(cls.norm, get_messages_from_inputs({"messages": messages})))
        elif run.run_type == "chain":
            messages = messages_to_dict(data.get("messages", []))
            return list(map(cls.norm, get_messages_from_inputs({"messages": messages})))
        elif run.run_type == "tool":
            return [{"role": "input", "content": str(data.get("input", ""))}]
        elif run.run_type == "retriever":
            return [{"role": "query", "content": str(data.get("query", ""))}]
        elif run.run_type == "llm":
            return [{"role": "prompt", "content": get_prompt_from_inputs(data)}]
        return []

    @classmethod
    @serialise
    def outputs(cls, run: Run) -> list[dict[str, Any]]:
        if run.error:
            return [{"role": "error", "content": str(run.error)}]
        data: dict[str, Any] = run.outputs or {}
        if run.run_type == "chat_model":
            try:
                message = run.outputs["generations"][0][0]["message"]
                generation = _convert_message(message)
            except IndexError:
                generation = get_message_generation_from_outputs(data)
            return [cls.norm(generation)]
        elif run.run_type == "chain":
            try:
                messages = messages_to_dict(data["messages"].value)
            except AttributeError:
                messages = messages_to_dict(data["messages"])
            except KeyError:
                return [data]
            return list(map(cls.norm, get_messages_from_inputs({"messages": messages})))
        elif run.run_type == "llm":
            return [{"role": "text", "content": get_llm_generation_from_outputs(data)}]
        elif run.run_type == "tool":
            out = data.get("output", "")
            return [{"role": "output", "content": getattr(out, "content", str(out))}]
        elif run.run_type == "retriever":
            return [
                {"role": "document", "content": getattr(d, "page_content", str(d))}
                for d in data.get("documents", [])
            ]
        return []
