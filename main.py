import asyncio
import os
from typing import Annotated, TypedDict

from dotenv import load_dotenv
from langchain_openai import AzureChatOpenAI
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition

from langgraph_viz import visualize

load_dotenv()


# 1. Define the State (memory of the agent)
class State(TypedDict):
    messages: Annotated[list, add_messages]


# 2. Define the Tools
def search_tool(query: str):
    """Call to search the web."""
    return "The weather is sunny."


tools = [search_tool]
tool_node = ToolNode(tools)

# 3. Define the Node (agent logic)
llm = AzureChatOpenAI(
    api_version="2024-02-01",
    api_key=os.getenv("AZURE_API_KEY"),
    azure_endpoint=os.getenv("AZURE_ENDPOINT"),
    azure_deployment=os.getenv("AZURE_DEPLOYMENT"),
)
llm_with_tools = llm.bind_tools(tools)


def agent(state: State):
    return {"messages": [llm_with_tools.invoke(state["messages"])]}


# 4. Build the Graph
workflow = StateGraph(State)
workflow.add_node("agent", agent)
workflow.add_node("tools", tool_node)

# Set edges
workflow.add_edge(START, "agent")
# tools_condition checks if the agent wants to use a tool
workflow.add_conditional_edges("agent", tools_condition)
workflow.add_edge("tools", "agent")

# Compile and wrap with visualization
app = workflow.compile()
app = visualize(app)


async def main():
    result = await app.ainvoke(
        {"messages": [{"role": "user", "content": "What is the weather?"}]}
    )
    print(result)


if __name__ == "__main__":
    asyncio.run(main())
