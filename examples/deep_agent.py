import time
from typing import Any

from deepagents import create_deep_agent
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, ToolCall
from langchain_core.messages import BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from langgraphics import watch


class FakeMessageChatModel(BaseChatModel):
    messages: list[Any]
    _index: int = 0

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
        msg = self.messages[self._index % len(self.messages)]
        self._index += 1
        time.sleep(3)
        return ChatResult(generations=[ChatGeneration(message=msg)])

    def bind_tools(self, tools: Any, **kwargs: Any) -> "FakeMessageChatModel":
        return self


_tool_call_msg = AIMessage(
    content="",
    tool_calls=[
        ToolCall(
            name="get_weather",
            args={"city": "San Francisco"},
            id="call-weather-1",
        )
    ],
)
_final_answer_msg = AIMessage(
    content="The weather in San Francisco is always sunny!"
)

llm = FakeMessageChatModel(messages=[_tool_call_msg, _final_answer_msg])


def get_weather(city: str) -> str:
    """Get weather for a given city."""
    return f"It's always sunny in {city}!"


agent = create_deep_agent(
    model=llm,
    tools=[get_weather],
    system_prompt="You are a helpful assistant",
)
agent = watch(agent, open_browser=False)

agent.invoke({"messages": [{"role": "user", "content": "What is the weather in SF?"}]})
