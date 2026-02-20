import time
from typing import Annotated, Any, Literal, TypedDict

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langchain_core.messages import AIMessage, ToolCall
from langchain_core.messages import BaseMessage
from langchain_core.messages import HumanMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.tools import tool
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from langgraphics import watch


class FakeMessageChatModel(BaseChatModel):
    messages: list[Any]
    _index: int = 0

    class Config:
        arbitrary_types_allowed = True

    @property
    def _llm_type(self) -> str:
        return "fake-message-chat-model"

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> ChatResult:
        msg = self.messages[self._index % len(self.messages)]
        self._index += 1
        return ChatResult(generations=[ChatGeneration(message=msg)])


@tool
def knowledge_base(query: str) -> str:
    """Retrieve a relevant document from the knowledge base."""
    time.sleep(0.03)
    docs = {
        "life": "The answer to life, the universe, and everything is 42.",
        "python": "Python is a high-level, interpreted programming language.",
    }
    for key, value in docs.items():
        if key in query.lower():
            return value
    return "No relevant document found."


TOOLS = [knowledge_base]
tool_node = ToolNode(TOOLS)


class State(TypedDict):
    messages: Annotated[list, add_messages]


class SummariserState(TypedDict):
    messages: Annotated[list, add_messages]
    summary: str


def _make_summariser_subgraph() -> Any:
    _llm = FakeListChatModel(
        responses=["Summary: the user asked about life and got the answer 42."]
    )

    def summarise(state: SummariserState) -> dict:
        time.sleep(0.02)
        resp = _llm.invoke(state["messages"])
        return {"summary": resp.content, "messages": [resp]}

    sg = StateGraph(SummariserState)
    sg.add_node("summarise", summarise)
    sg.add_edge(START, "summarise")
    sg.add_edge("summarise", END)
    return sg.compile()


_summariser_subgraph = _make_summariser_subgraph()

_tool_call_msg = AIMessage(
    content="",
    tool_calls=[
        ToolCall(
            name="knowledge_base",
            args={"query": "meaning of life"},
            id="call-kb-1",
        )
    ],
)
_final_answer_msg = AIMessage(
    content="Based on the knowledge base, the answer to life is 42."
)
_responder_llm = FakeMessageChatModel(messages=[_tool_call_msg, _final_answer_msg])


def summariser_runner(state: State) -> dict:
    time.sleep(2)
    result = _summariser_subgraph.invoke({"messages": state["messages"], "summary": ""})
    return {"messages": [AIMessage(content=f"[summary] {result['summary']}")]}


def responder(state: State) -> dict:
    time.sleep(2)
    response = _responder_llm.invoke(state["messages"])
    return {"messages": [response]}


def route_after_respond(state: State) -> Literal["tools", "__end__"]:
    last = state["messages"][-1]
    if getattr(last, "tool_calls", None):
        return "tools"
    return "__end__"


def main() -> None:
    builder = StateGraph(State)

    builder.add_node("summariser_runner", summariser_runner)
    builder.add_node("responder", responder)
    builder.add_node("tools", tool_node)

    builder.add_edge(START, "summariser_runner")
    builder.add_edge("summariser_runner", "responder")

    builder.add_conditional_edges(
        "responder",
        route_after_respond,
        {"tools": "tools", "__end__": END},
    )

    builder.add_edge("tools", "responder")

    graph = builder.compile()
    graph = watch(graph, open_browser=False)

    graph.invoke({"messages": [HumanMessage(content="What is the meaning of life?")]})


if __name__ == "__main__":
    main()
