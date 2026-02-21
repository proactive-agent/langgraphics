import json
import uuid
from typing import Any
from unittest.mock import MagicMock

from langchain_core.documents import Document
from langchain_core.load import dumpd
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from langgraphics.formatter import Formatter


def make_run(
    run_type: str,
    inputs: dict[str, Any] | None = None,
    outputs: dict[str, Any] | None = None,
    error: str | None = None,
) -> MagicMock:
    run = MagicMock()
    run.id = uuid.uuid4()
    run.run_type = run_type
    run.inputs = inputs or {}
    run.outputs = outputs or {}
    run.error = error
    return run


def parsed_inputs(run) -> list[dict]:
    return json.loads(Formatter.inputs(run))


def parsed_outputs(run) -> list[dict]:
    return json.loads(Formatter.outputs(run))


class TestChatModelInputs:
    def test_human_message(self):
        run = make_run(
            "chat_model", inputs={"messages": [[dumpd(HumanMessage(content="Hello"))]]}
        )
        result = parsed_inputs(run)
        assert result == [{"role": "human", "content": "Hello"}]

    def test_system_then_human(self):
        run = make_run(
            "chat_model",
            inputs={
                "messages": [
                    [
                        dumpd(SystemMessage(content="You are helpful")),
                        dumpd(HumanMessage(content="What is 2+2?")),
                    ]
                ]
            },
        )
        result = parsed_inputs(run)
        assert result == [
            {"role": "system", "content": "You are helpful"},
            {"role": "human", "content": "What is 2+2?"},
        ]

    def test_tool_call_message(self):
        msg = AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "search",
                    "args": {"q": "foo"},
                    "id": "c1",
                    "type": "tool_call",
                }
            ],
        )
        run = make_run("chat_model", inputs={"messages": [[dumpd(msg)]]})
        result = parsed_inputs(run)
        assert len(result) == 1
        assert result[0]["role"] == "ai"
        assert "search" in result[0]["content"]
        assert "foo" in result[0]["content"]

    def test_empty_messages(self):
        run = make_run("chat_model", inputs={"messages": [[]]})
        result = parsed_inputs(run)
        assert result == []

    def test_missing_messages_key(self):
        run = make_run("chat_model", inputs={})
        result = parsed_inputs(run)
        assert isinstance(result, list)


class TestChatModelOutputs:
    def _make_output(self, msg) -> dict:
        return {"generations": [[{"message": dumpd(msg)}]]}

    def test_ai_message(self):
        run = make_run(
            "chat_model",
            outputs=self._make_output(AIMessage(content="The answer is 42.")),
        )
        result = parsed_outputs(run)
        assert result == [{"role": "ai", "content": "The answer is 42."}]

    def test_tool_call_output(self):
        msg = AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "calculator",
                    "args": {"a": 1, "b": 2},
                    "id": "c2",
                    "type": "tool_call",
                }
            ],
        )
        run = make_run("chat_model", outputs=self._make_output(msg))
        result = parsed_outputs(run)
        assert len(result) == 1
        assert result[0]["role"] == "ai"
        assert "calculator" in result[0]["content"]

    def test_error_overrides_output(self):
        run = make_run(
            "chat_model",
            outputs=self._make_output(AIMessage(content="irrelevant")),
            error="Something went wrong",
        )
        result = parsed_outputs(run)
        assert result == [{"role": "error", "content": "Something went wrong"}]


class TestLlmInputsOutputs:
    def test_single_prompt(self):
        run = make_run("llm", inputs={"prompts": ["Summarise this text."]})
        result = parsed_inputs(run)
        assert result == [{"role": "prompt", "content": "Summarise this text."}]

    def test_llm_text_output(self):
        run = make_run("llm", outputs={"generations": [{"text": "Summary here."}]})
        result = parsed_outputs(run)
        assert result == [{"role": "text", "content": "Summary here."}]

    def test_llm_error(self):
        run = make_run("llm", error="Token limit exceeded")
        result = parsed_outputs(run)
        assert result == [{"role": "error", "content": "Token limit exceeded"}]


class TestToolInputsOutputs:
    def test_string_input(self):
        run = make_run("tool", inputs={"input": "search query"})
        result = parsed_inputs(run)
        assert result == [{"role": "input", "content": "search query"}]

    def test_string_output(self):
        run = make_run("tool", outputs={"output": "search result"})
        result = parsed_outputs(run)
        assert result == [{"role": "output", "content": "search result"}]

    def test_tool_message_output(self):
        tool_msg = ToolMessage(content="42", tool_call_id="c1")
        run = make_run("tool", outputs={"output": tool_msg})
        result = parsed_outputs(run)
        assert result == [{"role": "output", "content": "42"}]

    def test_tool_error(self):
        run = make_run("tool", error="Tool failed")
        result = parsed_outputs(run)
        assert result == [{"role": "error", "content": "Tool failed"}]


class TestRetrieverInputsOutputs:
    def test_query_input(self):
        run = make_run("retriever", inputs={"query": "meaning of life"})
        result = parsed_inputs(run)
        assert result == [{"role": "query", "content": "meaning of life"}]

    def test_documents_output(self):
        docs = [
            Document(page_content="The answer is 42."),
            Document(page_content="It depends."),
        ]
        run = make_run("retriever", outputs={"documents": docs})
        result = parsed_outputs(run)
        assert result == [
            {"role": "document", "content": "The answer is 42."},
            {"role": "document", "content": "It depends."},
        ]

    def test_empty_documents(self):
        run = make_run("retriever", outputs={"documents": []})
        result = parsed_outputs(run)
        assert result == []


class TestChainInputsOutputs:
    def test_chain_input_messages(self):
        run = make_run(
            "chain", inputs={"messages": [HumanMessage(content="What is AI?")]}
        )
        result = parsed_inputs(run)
        assert result == [{"role": "human", "content": "What is AI?"}]

    def test_chain_output_messages(self):
        run = make_run(
            "chain",
            outputs={
                "messages": [
                    AIMessage(content="AI stands for Artificial Intelligence.")
                ]
            },
        )
        result = parsed_outputs(run)
        assert result == [
            {"role": "ai", "content": "AI stands for Artificial Intelligence."}
        ]

    def test_chain_no_messages(self):
        run = make_run("chain", inputs={})
        result = parsed_inputs(run)
        assert result == []

    def test_chain_error(self):
        run = make_run("chain", error="Graph error")
        result = parsed_outputs(run)
        assert result == [{"role": "error", "content": "Graph error"}]


class TestNorm:
    def test_plain_message(self):
        msg = {"type": "human", "data": {"content": "Hello"}}
        assert Formatter.norm(msg) == {"role": "human", "content": "Hello"}

    def test_tool_calls(self):
        msg = {
            "type": "ai",
            "data": {"tool_calls": [{"name": "fn", "args": {"x": 1}}]},
        }
        result = Formatter.norm(msg)
        assert result["role"] == "ai"
        assert "fn" in result["content"]
        assert "x" in result["content"]

    def test_list_content(self):
        msg = {"type": "ai", "data": {"content": [{"text": "Block content"}]}}
        assert Formatter.norm(msg) == {"role": "ai", "content": "Block content"}

    def test_missing_data(self):
        msg = {"type": "system"}
        result = Formatter.norm(msg)
        assert result["role"] == "system"
        assert result["content"] == ""
