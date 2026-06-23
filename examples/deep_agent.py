import asyncio

from _common import FakeMessageChatModel
from deepagents import create_deep_agent
from langchain_core.messages import AIMessage, HumanMessage, ToolCall
from langgraphics import watch

llm = FakeMessageChatModel(messages=[
    AIMessage(
        content="",
        tool_calls=[
            ToolCall(
                name="get_weather",
                args={"city": "San Francisco"},
                id="call-weather-1",
            )
        ],
    ),
    AIMessage(
        content="The weather in San Francisco is always sunny!"
    )
])


def get_weather(city: str) -> str:
    """Get weather for a given city."""
    return f"It's always sunny in {city}!"


graph = create_deep_agent(
    model=llm,
    tools=[get_weather],
    system_prompt="You are a helpful assistant",
)


async def main() -> None:
    agent = watch(graph, open_browser=False)
    await agent.ainvoke({
        "messages": [HumanMessage(content="What is the weather in SF?")]
    })


if __name__ == "__main__":
    asyncio.run(main())
