import asyncio
import time
from typing import Annotated, Any, List, TypedDict

from langchain_core.documents import Document
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.retrievers import BaseRetriever
from langchain_core.tools import BaseTool, tool
from langgraph.graph.message import add_messages


class FakeMessageChatModel(BaseChatModel):
    messages: list[Any]
    delay: int = 3
    index: int = 0

    class Config:
        arbitrary_types_allowed = True

    @property
    def _llm_type(self) -> str:
        return "fake-message-chat-model"

    def _generate(
            self,
            messages: list[BaseMessage],
            stop: list[str] | None = None,
            run_manager: Any = None,
            **kwargs: Any,
    ) -> ChatResult:
        msg = self.messages[self.index % len(self.messages)]
        self.index += 1
        if self.delay:
            time.sleep(self.delay)
        return ChatResult(generations=[ChatGeneration(message=msg)])

    def bind_tools(self, tools: Any, **kwargs: Any) -> "FakeMessageChatModel":
        return self


class State(TypedDict):
    messages: Annotated[list, add_messages]


class SimulatedTool(BaseTool):
    name: str = "call_tool"
    description: str = "Simulated tool call"

    def _run(self, *args, **kwargs):
        raise NotImplementedError

    async def ainvoke(self, state, config=None, **kwargs):
        return await simulate_node(state, tag=self.name)


class SimulatedRetriever(BaseRetriever):
    tag: str

    def _get_relevant_documents(self, query, **kwargs) -> List[Document]:
        raise NotImplementedError

    async def ainvoke(self, state, config=None, **kwargs):
        return await simulate_node(state, tag=self.tag)


async def simulate_node(state, tag, *, human=False):
    await asyncio.sleep(2)
    last = state["messages"][-1].content if state.get("messages") else ""
    cls = HumanMessage if human else AIMessage
    return {"messages": [cls(content=f"[{tag}] processed: {last[:60]}")]}


@tool
def knowledge_base(query: str) -> str:
    """Retrieve a relevant document from the knowledge base."""
    time.sleep(0.03)
    docs = {
        "life": "The answer to life, the universe, and everything is 42.",
        "python": "Python is a high-level, interpreted programming language.",
    }
    for key, value in docs.items():
        if key in query.lower():
            return value
    return "No relevant document found."
