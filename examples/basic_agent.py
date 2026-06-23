import asyncio
import time
from typing import Literal

from _common import knowledge_base, State, FakeMessageChatModel
from langchain_core.messages import AIMessage, HumanMessage, ToolCall
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode
from langgraphics import watch

llm = FakeMessageChatModel(messages=[
    AIMessage(
        content="",
        tool_calls=[
            ToolCall(
                name="knowledge_base",
                args={"query": "meaning of life"},
                id="call-kb-1"
            )
        ],
    ),
    AIMessage(
        content="Based on the knowledge base, the answer to life is 42."
    )
])


def summariser_runner(state: State) -> dict:
    time.sleep(2)
    return {"messages": [AIMessage(content="[summary] the user asked about life and got the answer 42.")]}


def responder(state: State) -> dict:
    time.sleep(2)
    return {"messages": [llm.invoke(state["messages"])]}


def route_after_respond(state: State) -> Literal["tools", "__end__"]:
    last = state["messages"][-1]
    if getattr(last, "tool_calls", None):
        return "tools"
    return "__end__"


builder = StateGraph(State)

builder.add_node("summariser_runner", summariser_runner)
builder.add_node("tools", ToolNode([knowledge_base]))
builder.add_node("responder", responder)

builder.add_edge(START, "summariser_runner")
builder.add_edge("tools", "responder")
builder.add_edge("summariser_runner", "responder")

builder.add_conditional_edges(
    "responder",
    route_after_respond,
    {"tools": "tools", "__end__": END}
)

graph = builder.compile()


async def main() -> None:
    agent = watch(graph, open_browser=False)
    await agent.ainvoke({
        "messages": [HumanMessage(content="What is the meaning of life?")]
    })


if __name__ == "__main__":
    asyncio.run(main())
