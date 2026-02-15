<p align="center">
  <picture class="github-only">
    <source media="(prefers-color-scheme: light)" srcset="https://github.com/user-attachments/assets/4e168df3-d45f-43fa-bd93-e71f8ca33d24">
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/5bceb55b-0588-4f35-91a9-2287c6db0310">
    <img alt="LangGraphics" src="https://github.com/user-attachments/assets/4e168df3-d45f-43fa-bd93-e71f8ca33d24" width="25%">
  </picture>
</p>

**LangGraphics** is a live visualization tool for [LangGraph](https://github.com/langchain-ai/langgraph) agents. It's
especially useful when working with large networks: graphs with many nodes, branching conditions, and cycles are hard to
reason about from the logs alone.

<p align="center">
  <img alt="Demo" src="https://github.com/user-attachments/assets/1db519fb-0dd9-4fee-8bc8-f6b12cbf1342" width="80%">
</p>

## Why it helps

Seeing the execution path visually makes it immediately obvious which branches were taken, where loops occurred, and
where the agent got stuck or failed. It also helps when onboarding to an unfamiliar graph - a single run tells you more
about the workflow than reading the graph definition ever could.

## How to use

One line is all it takes - wrap the compiled graph of your agent workflow with LangGraphics' `watch` function before
invoking it, and the visualization opens in your browser automatically, tracking the agent in real time.

```python
from langgraph.graph import StateGraph, MessagesState
from langgraphics import watch

workflow = StateGraph(MessagesState)
workflow.add_node(...)
workflow.add_edge(...)

graph = watch(workflow.compile())

await graph.ainvoke({"messages": [...]})
```

Works with any LangGraph agent, no matter how simple or complex the graph is. Add it during a debugging session, or keep
it in while you're actively building - it has no effect on how the agent behaves or what it returns.

## Contribute

Any contribution is welcome. Feel free to open an issue or a discussion if you have any questions not covered here. If
you have any ideas or suggestions, please open a pull request.

## License

Copyright (C) 2026 Artyom Vancyan. [MIT](https://github.com/proactive-agent/langgraphics/blob/main/LICENSE)
