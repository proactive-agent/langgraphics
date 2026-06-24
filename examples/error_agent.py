import asyncio
from functools import partial

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableLambda
from langgraph.graph import END, StateGraph

from __common__ import SimulatedRetriever, SimulatedTool, State, simulate_node
from langgraphics import watch

builder = StateGraph(State)

builder.add_node("plan", partial(simulate_node, tag="plan"))
builder.add_node("select_tool", partial(simulate_node, tag="select_tool"))
builder.add_node("call_tool", SimulatedTool())
builder.add_node(
    "reflect",
    RunnableLambda(lambda state: state)
    | RunnableLambda(lambda state: state["test"])
    | RunnableLambda(partial(simulate_node, tag="reflect")),
)
builder.add_node("revise_plan", partial(simulate_node, tag="revise_plan"))
builder.add_node("check_progress", SimulatedRetriever(tag="check_progress"))
builder.add_node("integrate", partial(simulate_node, tag="integrate"))
builder.add_node("final_answer", partial(simulate_node, tag="final_answer"))
builder.set_entry_point("plan")


def decide_next(state):
    n = len(state["messages"])
    if n < 8:
        return "select_tool"
    if 8 <= n < 10:
        return "reflect"
    return "integrate"


builder.add_edge("plan", "select_tool")
builder.add_edge("select_tool", "call_tool")
builder.add_edge("call_tool", "check_progress")
builder.add_conditional_edges(
    "check_progress",
    decide_next,
    path_map={
        "select_tool": "select_tool",
        "integrate": "integrate",
        "reflect": "reflect",
    },
)
builder.add_edge("revise_plan", "check_progress")
builder.add_edge("integrate", "final_answer")
builder.add_edge("reflect", "revise_plan")
builder.add_edge("final_answer", END)

graph = builder.compile()


async def main():
    agent = watch(graph, open_browser=False)
    await agent.ainvoke({
        "messages": [
            SystemMessage(content="You are a helpful research assistant."),
            HumanMessage(content="demo request"),
        ]
    })


if __name__ == "__main__":
    asyncio.run(main())
