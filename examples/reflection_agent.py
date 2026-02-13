import asyncio
from functools import partial

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.graph import END, StateGraph
from langgraph.graph import MessagesState

from langgraphics import watch

REFLECT = "reflect"
GENERATE = "generate"


async def simulate_node(state, tag, *, human=False):
    await asyncio.sleep(2)
    last = state["messages"][-1].content if state.get("messages") else ""
    cls = HumanMessage if human else AIMessage
    return {"messages": [cls(content=f"[{tag}] processed: {last[:60]}")]}


builder = StateGraph(MessagesState)
builder.add_node(GENERATE, partial(simulate_node, tag=GENERATE))
builder.add_node(REFLECT, partial(simulate_node, tag=REFLECT, human=True))
builder.set_entry_point(GENERATE)


def should_continue(state):
    if len(state["messages"]) > 6:
        return END
    return REFLECT


builder.add_conditional_edges(GENERATE, should_continue, path_map={END: END, REFLECT: REFLECT})
builder.add_edge(REFLECT, GENERATE)

graph = builder.compile()
graph = watch(graph)


async def main():
    await graph.ainvoke({"messages": [HumanMessage(content="seed")]})


if __name__ == "__main__":
    asyncio.run(main())
