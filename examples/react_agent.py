import asyncio
from functools import partial

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableLambda
from langgraph.graph import END, StateGraph

from __common__ import State, simulate_node
from langgraphics import watch

builder = StateGraph(State)
builder.add_node("plan", partial(simulate_node, tag="plan"))
builder.add_node("observe", partial(simulate_node, tag="observe"))
builder.add_node("update_scratchpad", partial(simulate_node, tag="update_scratchpad"))
builder.add_node(
    "reflect",
    RunnableLambda(lambda state: state)
    | RunnableLambda(partial(simulate_node, tag="reflect")),
)
builder.add_node("revise_plan", partial(simulate_node, tag="revise_plan"))
builder.add_node("check_progress", partial(simulate_node, tag="check_progress"))
builder.add_node("ask_clarify", partial(simulate_node, tag="ask_clarify", human=True))
builder.add_node("integrate", partial(simulate_node, tag="integrate"))
builder.add_node("final_answer", partial(simulate_node, tag="final_answer"))
builder.set_entry_point("plan")


def decide_next(state):
    n = len(state["messages"])
    if n < 8:
        return "observe"
    if 8 <= n < 12:
        return "reflect"
    if 12 <= n < 14:
        return "ask_clarify"
    return "integrate"


builder.add_edge("plan", "observe")
builder.add_edge("observe", "update_scratchpad")
builder.add_edge("update_scratchpad", "check_progress")
builder.add_conditional_edges(
    "check_progress",
    decide_next,
    path_map={
        "observe": "observe",
        "reflect": "reflect",
        "integrate": "integrate",
        "ask_clarify": "ask_clarify",
    },
)
builder.add_edge("reflect", "revise_plan")
builder.add_edge("revise_plan", "check_progress")
builder.add_edge("ask_clarify", "plan")
builder.add_edge("integrate", "final_answer")
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
