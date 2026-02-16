import asyncio
from functools import partial

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.graph import END, StateGraph
from langgraph.graph import MessagesState

from langgraphics import watch

PLAN = "plan"
SELECT_TOOL = "select_tool"
CALL_TOOL = "call_tool"
REFLECT = "reflect"
REVISE_PLAN = "revise_plan"
CHECK_PROGRESS = "check_progress"
INTEGRATE = "integrate"
FINAL_ANSWER = "final_answer"


async def simulate_node(state, tag, *, human=False):
    await asyncio.sleep(2)
    last = state["messages"][-1].content if state.get("messages") else ""
    cls = HumanMessage if human else AIMessage
    return {"messages": [cls(content=f"[{tag}] processed: {last[:60]}")]}


builder = StateGraph(MessagesState)
builder.add_node(PLAN, partial(simulate_node, tag=PLAN))
builder.add_node(SELECT_TOOL, partial(simulate_node, tag=SELECT_TOOL))
builder.add_node(CALL_TOOL, partial(simulate_node, tag=CALL_TOOL))
builder.add_node(REFLECT, partial(simulate_node, tag=REFLECT))
builder.add_node(REVISE_PLAN, partial(simulate_node, tag=REVISE_PLAN))
builder.add_node(CHECK_PROGRESS, partial(simulate_node, tag=CHECK_PROGRESS))
builder.add_node(INTEGRATE, partial(simulate_node, tag=INTEGRATE))
builder.add_node(FINAL_ANSWER, partial(simulate_node, tag=FINAL_ANSWER))
builder.set_entry_point(PLAN)


def decide_next(state):
    n = len(state["messages"])
    if n < 8:
        return SELECT_TOOL
    if 8 <= n < 10:
        return REFLECT
    return INTEGRATE


builder.add_edge(PLAN, SELECT_TOOL)
builder.add_edge(SELECT_TOOL, CALL_TOOL)
builder.add_edge(CALL_TOOL, CHECK_PROGRESS)
builder.add_conditional_edges(
    CHECK_PROGRESS,
    decide_next,
    path_map={
        SELECT_TOOL: SELECT_TOOL,
        INTEGRATE: INTEGRATE,
        REFLECT: REFLECT,
    },
)
builder.add_edge(REVISE_PLAN, CHECK_PROGRESS)
builder.add_edge(INTEGRATE, FINAL_ANSWER)
builder.add_edge(REFLECT, REVISE_PLAN)
builder.add_edge(FINAL_ANSWER, END)

graph = builder.compile()
graph = watch(graph)


async def main():
    await graph.ainvoke({"messages": [HumanMessage(content="demo request")]})


if __name__ == "__main__":
    asyncio.run(main())
