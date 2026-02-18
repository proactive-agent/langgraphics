import asyncio
from functools import partial
from typing import List

from langchain_core.documents import Document
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.retrievers import BaseRetriever
from langchain_core.runnables import RunnableLambda
from langchain_core.tools import BaseTool
from langgraph.graph import END, StateGraph
from langgraph.graph import MessagesState

from langgraphics import watch

PLAN = "plan"
SELECT_TOOL = "select_tool"
CALL_TOOL = "call_tool"
OBSERVE = "observe"
UPDATE_SCRATCHPAD = "update_scratchpad"
REFLECT = "reflect"
REVISE_PLAN = "revise_plan"
CHECK_PROGRESS = "check_progress"
ASK_CLARIFY = "ask_clarify"
INTEGRATE = "integrate"
FINAL_ANSWER = "final_answer"
POSTMORTEM = "postmortem"


async def simulate_node(state, tag, *, human=False):
    await asyncio.sleep(2)
    last = state["messages"][-1].content if state.get("messages") else ""
    cls = HumanMessage if human else AIMessage
    return {"messages": [cls(content=f"[{tag}] processed: {last[:60]}")]}


class SimulatedTool(BaseTool):
    name: str = CALL_TOOL
    description: str = "Simulated tool call"

    def _run(self, *args, **kwargs):
        raise NotImplementedError

    async def ainvoke(self, state, config=None, **kwargs):
        return await simulate_node(state, tag=CALL_TOOL)


class SimulatedRetriever(BaseRetriever):
    def _get_relevant_documents(self, query, **kwargs) -> List[Document]:
        raise NotImplementedError

    async def ainvoke(self, state, config=None, **kwargs):
        return await simulate_node(state, tag=OBSERVE)


builder = StateGraph(MessagesState)
builder.add_node(PLAN, partial(simulate_node, tag=PLAN))
builder.add_node(SELECT_TOOL, partial(simulate_node, tag=SELECT_TOOL))
builder.add_node(CALL_TOOL, SimulatedTool())
builder.add_node(OBSERVE, SimulatedRetriever())
builder.add_node(UPDATE_SCRATCHPAD, partial(simulate_node, tag=UPDATE_SCRATCHPAD))
builder.add_node(
    REFLECT,
    RunnableLambda(lambda state: state)
    | RunnableLambda(partial(simulate_node, tag=REFLECT)),
)
builder.add_node(REVISE_PLAN, partial(simulate_node, tag=REVISE_PLAN))
builder.add_node(CHECK_PROGRESS, partial(simulate_node, tag=CHECK_PROGRESS))
builder.add_node(ASK_CLARIFY, partial(simulate_node, tag=ASK_CLARIFY, human=True))
builder.add_node(INTEGRATE, partial(simulate_node, tag=INTEGRATE))
builder.add_node(FINAL_ANSWER, partial(simulate_node, tag=FINAL_ANSWER))
builder.add_node(POSTMORTEM, partial(simulate_node, tag=POSTMORTEM))
builder.set_entry_point(PLAN)


def decide_next(state):
    n = len(state["messages"])
    if n < 8:
        return SELECT_TOOL
    if 8 <= n < 12:
        return REFLECT
    if 12 <= n < 14:
        return ASK_CLARIFY
    return INTEGRATE


builder.add_edge(PLAN, SELECT_TOOL)
builder.add_edge(SELECT_TOOL, CALL_TOOL)
builder.add_edge(CALL_TOOL, OBSERVE)
builder.add_edge(OBSERVE, UPDATE_SCRATCHPAD)
builder.add_edge(UPDATE_SCRATCHPAD, CHECK_PROGRESS)
builder.add_conditional_edges(
    CHECK_PROGRESS,
    decide_next,
    path_map={
        SELECT_TOOL: SELECT_TOOL,
        REFLECT: REFLECT,
        ASK_CLARIFY: ASK_CLARIFY,
        INTEGRATE: INTEGRATE,
    },
)
builder.add_edge(REFLECT, REVISE_PLAN)
builder.add_edge(REVISE_PLAN, CHECK_PROGRESS)
builder.add_edge(ASK_CLARIFY, PLAN)
builder.add_edge(INTEGRATE, FINAL_ANSWER)
builder.add_edge(FINAL_ANSWER, POSTMORTEM)
builder.add_edge(POSTMORTEM, END)

graph = builder.compile()
graph = watch(graph)

SYSTEM_PROMPT = (
    "You are a helpful research assistant. "
    "Break down the user's request into a plan, select and call the appropriate tools, "
    "reflect on the results, revise the plan as needed, and finally produce a concise answer."
)


async def main():
    await graph.ainvoke(
        {
            "messages": [
                SystemMessage(content=SYSTEM_PROMPT),
                HumanMessage(content="demo request"),
            ]
        }
    )


if __name__ == "__main__":
    asyncio.run(main())
