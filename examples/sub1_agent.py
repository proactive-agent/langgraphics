import asyncio

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.graph import END, START, StateGraph

from __common__ import State
from deep_agent import graph as deep_subagent
from error_agent import graph as error_subagent
from langgraphics import watch


async def router(state: State) -> dict:
    await asyncio.sleep(1)
    return state


def summarizer(state: State) -> dict:
    return {
        "summary": "error agent demonstrated error handling; deep agent retrieved weather data.",
        "messages": [AIMessage(content="[summary] parallel execution complete")],
    }


builder = StateGraph(State)

builder.add_node("router", router)
builder.add_node("error", error_subagent)
builder.add_node("deep_agent", deep_subagent)
builder.add_node("summarizer", summarizer)

builder.add_edge(START, "router")
builder.add_edge("router", "error")
builder.add_edge("router", "deep_agent")
builder.add_edge("error", "summarizer")
builder.add_edge("deep_agent", "summarizer")
builder.add_edge("summarizer", END)

graph = builder.compile()


async def main() -> None:
    agent = watch(graph, open_browser=False)
    await agent.ainvoke({
        "messages": [HumanMessage(content="Run parallel analysis.")]
    })


if __name__ == "__main__":
    asyncio.run(main())
