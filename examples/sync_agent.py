import asyncio

from _common import State
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.graph import END, START, StateGraph
from langgraphics import watch


async def initial_node(state: State) -> dict:
    await asyncio.sleep(2)
    return {"messages": [AIMessage(content="initial done")]}


async def sync_a(state: State) -> dict:
    await asyncio.sleep(2)
    return {"messages": [AIMessage(content="sync_a done")]}


async def sync_b(state: State) -> dict:
    await asyncio.sleep(2)
    return {"messages": [AIMessage(content="sync_b done")]}


async def sync_c(state: State) -> dict:
    await asyncio.sleep(2)
    return {"messages": [AIMessage(content="sync_c done")]}


async def final_node(state: State) -> dict:
    await asyncio.sleep(2)
    return {"messages": [AIMessage(content="final aggregation done")]}


builder = StateGraph(State)

builder.add_node("initial", initial_node)
builder.add_node("sync_a", sync_a)
builder.add_node("sync_b", sync_b)
builder.add_node("sync_c", sync_c)
builder.add_node("final", final_node)

builder.add_edge(START, "initial")
builder.add_edge("initial", "sync_a")
builder.add_edge("initial", "sync_b")
builder.add_edge("initial", "sync_c")
builder.add_edge("sync_a", "final")
builder.add_edge("sync_b", "final")
builder.add_edge("sync_c", "final")
builder.add_edge("final", END)

graph = builder.compile()


async def main() -> None:
    agent = watch(graph, open_browser=False)
    await agent.ainvoke({"messages": [HumanMessage(content="Run sync analysis.")]})


if __name__ == "__main__":
    asyncio.run(main())
