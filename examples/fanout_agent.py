import asyncio
import operator
import random
from typing import Annotated, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import Send

from langgraphics import watch

RANDOM_FANOUT = False
FANOUT_NODES = ["fanout_a", "fanout_b", "fanout_c"]
FANOUT_CHANCE = 3 / 4


class GraphState(TypedDict):
    initial_result: str
    fanout_results: Annotated[list[str], operator.add]
    final_message: str


async def initial_node(state: GraphState) -> dict:
    await asyncio.sleep(2)
    return {"initial_result": "initial done"}


async def fanout_a(state: GraphState) -> dict:
    await asyncio.sleep(2)
    return {"fanout_results": ["fanout_a done"]}


async def fanout_b(state: GraphState) -> dict:
    await asyncio.sleep(2)
    return {"fanout_results": ["fanout_b done"]}


async def fanout_c(state: GraphState) -> dict:
    await asyncio.sleep(2)
    return {"fanout_results": ["fanout_c done"]}


async def final_node(state: GraphState) -> dict:
    await asyncio.sleep(2)
    return {"final_message": "\n".join(state["fanout_results"])}


def route_fanout(state: GraphState) -> list[Send]:
    chosen = [n for n in FANOUT_NODES if random.random() < FANOUT_CHANCE] or [random.choice(FANOUT_NODES)]
    return [Send(name, state) for name in chosen]


builder = StateGraph(GraphState)

builder.add_node("initial", initial_node)
builder.add_node("fanout_a", fanout_a)
builder.add_node("fanout_b", fanout_b)
builder.add_node("fanout_c", fanout_c)
builder.add_node("final", final_node)

builder.add_edge(START, "initial")

if RANDOM_FANOUT:
    builder.add_conditional_edges("initial", route_fanout, {n: n for n in FANOUT_NODES})
else:
    builder.add_edge("initial", "fanout_a")
    builder.add_edge("initial", "fanout_b")
    builder.add_edge("initial", "fanout_c")

builder.add_edge("fanout_a", "final")
builder.add_edge("fanout_b", "final")
builder.add_edge("fanout_c", "final")
builder.add_edge("final", END)

graph = builder.compile()
graph = watch(graph)


async def main() -> None:
    await graph.ainvoke({"initial_result": "", "fanout_results": [], "final_message": ""})


if __name__ == "__main__":
    asyncio.run(main())
