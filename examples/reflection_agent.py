import asyncio
from functools import partial
from typing import List

from langchain_core.documents import Document
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.retrievers import BaseRetriever
from langchain_core.runnables import RunnableLambda
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


class SimulatedRetriever(BaseRetriever):
    def _get_relevant_documents(self, query, **kwargs) -> List[Document]:
        raise NotImplementedError

    async def ainvoke(self, state, config=None, **kwargs):
        return await simulate_node(state, tag=REFLECT, human=True)


builder = StateGraph(MessagesState)
builder.add_node(
    GENERATE,
    RunnableLambda(lambda state: state)
    | RunnableLambda(partial(simulate_node, tag=GENERATE)),
)
builder.add_node(REFLECT, SimulatedRetriever())
builder.set_entry_point(GENERATE)


def should_continue(state):
    if len(state["messages"]) > 6:
        return END
    return REFLECT


builder.add_conditional_edges(
    GENERATE, should_continue, path_map={END: END, REFLECT: REFLECT}
)
builder.add_edge(REFLECT, GENERATE)

graph = builder.compile()
graph = watch(graph)


SYSTEM_PROMPT = (
    "You are a helpful writing assistant. "
    "Generate a response, reflect on it to identify improvements, and iterate."
)


async def main():
    await graph.ainvoke(
        {
            "messages": [
                SystemMessage(content=SYSTEM_PROMPT),
                HumanMessage(content="seed"),
            ]
        }
    )


if __name__ == "__main__":
    asyncio.run(main())
