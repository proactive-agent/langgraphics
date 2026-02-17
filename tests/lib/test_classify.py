import pytest

from langgraphics.topology import classify_node


def test_tool_classified():
    from langchain_core.tools import tool

    @tool
    def dummy(x: str) -> str:
        """test"""
        return x

    assert classify_node(dummy) == "tool"


def test_tool_takes_priority_over_runnable():
    from langchain_core.tools import tool

    @tool
    def my_tool(q: str) -> str:
        """test"""
        return q

    assert classify_node(my_tool) == "tool"


def test_agent_classified():
    from typing import Annotated, TypedDict

    from langgraph.graph import END, StateGraph
    from langgraph.graph.message import add_messages

    class AgentState(TypedDict):
        messages: Annotated[list, add_messages]

    def agent_node(state: AgentState) -> dict:
        return state

    def tools_node(state: AgentState) -> dict:
        return state

    builder = StateGraph(AgentState)
    builder.add_node("agent", agent_node)
    builder.add_node("tools", tools_node)
    builder.set_entry_point("agent")
    builder.add_edge("agent", "tools")
    builder.add_edge("tools", END)
    agent = builder.compile()
    assert classify_node(agent) == "runnable"


def test_create_agent_classified():
    from langchain.agents import create_agent
    from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
    from langchain_core.messages import AIMessage

    model = FakeMessagesListChatModel(responses=[AIMessage(content="")])
    agent = create_agent(model=model, tools=None)
    assert classify_node(agent) == "runnable"


def test_embedding_classified():
    from langchain_core.embeddings import FakeEmbeddings

    assert classify_node(FakeEmbeddings(size=1)) == "embedding"


def test_retriever_classified():
    from langchain_core.documents import Document
    from langchain_core.retrievers import BaseRetriever

    class SimpleRetriever(BaseRetriever):
        def _get_relevant_documents(self, query: str) -> list[Document]:
            return []

    assert classify_node(SimpleRetriever()) == "runnable"


def test_llm_classified():
    from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
    from langchain_core.messages import AIMessage

    model = FakeMessagesListChatModel(responses=[AIMessage(content="")])
    assert classify_node(model) == "runnable"


def test_function_classified():
    from langgraph._internal._runnable import RunnableCallable

    r = RunnableCallable(func=lambda x: x)
    assert classify_node(r) == "runnable"


def test_chain_classified():
    from langchain_core.runnables import RunnableLambda

    chain = RunnableLambda(lambda x: x) | RunnableLambda(lambda x: x)
    assert classify_node(chain) == "runnable"


def test_agent_legacy_classified():
    try:
        from langchain_core.agents import AgentFinish, BaseSingleActionAgent
    except (ImportError, AttributeError):
        pytest.skip("legacy agent classes not in this langchain_core")

    class StubAgent(BaseSingleActionAgent):
        def plan(self, intermediate_steps, **kwargs):
            return AgentFinish(return_values={}, log="")

        @property
        def input_keys(self):
            return []

    assert classify_node(StubAgent()) == "agent"


def test_unknown_classified():
    assert classify_node("foo") == "unknown"
    assert classify_node(42) == "unknown"


def test_runnable_sequence_classified_as_runnable():
    from langchain_core.runnables import RunnableLambda

    chain = RunnableLambda(lambda x: x) | RunnableLambda(lambda x: x)
    assert classify_node(chain) == "runnable"


def test_runnable_parallel_classified_as_runnable():
    from langchain_core.runnables import RunnableLambda, RunnableParallel

    par = RunnableParallel(a=RunnableLambda(lambda x: x))
    assert classify_node(par) == "runnable"


def test_runnable_lambda_classified_as_runnable():
    from langchain_core.runnables import RunnableLambda

    r = RunnableLambda(lambda x: x)
    assert classify_node(r) == "runnable"


def test_classify_via_extract(simple_graph):
    from langgraphics.topology import extract

    topology = extract(simple_graph)
    kinds = {n["name"]: n["node_kind"] for n in topology["nodes"]}

    assert kinds["__start__"] is None
    assert kinds["__end__"] is None
    assert kinds["step_a"] is not None
    assert kinds["step_b"] is not None


def test_start_end_nodes_have_null_kind(simple_graph):
    from langgraphics.topology import extract

    topology = extract(simple_graph)
    for node in topology["nodes"]:
        if node["node_type"] in ("start", "end"):
            assert node["node_kind"] is None


def test_regular_nodes_have_kind(simple_graph):
    from langgraphics.topology import extract

    topology = extract(simple_graph)
    for node in topology["nodes"]:
        if node["node_type"] == "node":
            assert node["node_kind"] is not None
