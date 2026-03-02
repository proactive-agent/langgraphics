<p align="center">
  <picture class="github-only">
    <source media="(prefers-color-scheme: light)" srcset="https://github.com/user-attachments/assets/58ee0608-b00c-4de5-b97a-736dda05d30a">
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/4f750d9e-21c3-4a6f-a07b-d1b51d1186bb">
    <img alt="LangGraphics" src="https://github.com/user-attachments/assets/58ee0608-b00c-4de5-b97a-736dda05d30a" width="250px">
  </picture>
</p>

**LangGraphics** is a live visualization tool for [LangGraph](https://github.com/langchain-ai/langgraph) agents. It's
especially useful when working with large networks: graphs with many nodes, branching conditions, and cycles are hard to
reason about from the logs alone.

<p align="center">
  <img alt="Demo" src="https://github.com/user-attachments/assets/1db519fb-0dd9-4fee-8bc8-f6b12cbf1342" width="800px">
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

## Features

| Feature                 | [LangGraphics](https://github.com/proactive-agent/langgraphics)                        | [LangFuse](https://github.com/langfuse/langfuse)                                       | [LangSmith](https://smith.langchain.com)                                               |
|-------------------------|----------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|
| Fully local             | ![✅](https://github.com/user-attachments/assets/b3c25b41-567c-4c26-bc02-ee3e40fd57c1)  | ![🟥](https://github.com/user-attachments/assets/ebe12afc-ae2e-42b1-a058-e93353ff87c4) | ![🟥](https://github.com/user-attachments/assets/ebe12afc-ae2e-42b1-a058-e93353ff87c4) |
| Standalone              | ![✅](https://github.com/user-attachments/assets/b3c25b41-567c-4c26-bc02-ee3e40fd57c1)  | ![🟥](https://github.com/user-attachments/assets/ebe12afc-ae2e-42b1-a058-e93353ff87c4) | ![🟥](https://github.com/user-attachments/assets/ebe12afc-ae2e-42b1-a058-e93353ff87c4) |
| Easy to learn           | ![✅](https://github.com/user-attachments/assets/b3c25b41-567c-4c26-bc02-ee3e40fd57c1)  | ![🟥](https://github.com/user-attachments/assets/ebe12afc-ae2e-42b1-a058-e93353ff87c4) | ![🟥](https://github.com/user-attachments/assets/ebe12afc-ae2e-42b1-a058-e93353ff87c4) |
| One-line setup          | ![✅](https://github.com/user-attachments/assets/b3c25b41-567c-4c26-bc02-ee3e40fd57c1)  | ![🟥](https://github.com/user-attachments/assets/ebe12afc-ae2e-42b1-a058-e93353ff87c4) | ![🟥](https://github.com/user-attachments/assets/ebe12afc-ae2e-42b1-a058-e93353ff87c4) |
| Data stays local        | ![✅](https://github.com/user-attachments/assets/b3c25b41-567c-4c26-bc02-ee3e40fd57c1)  | ![🟥](https://github.com/user-attachments/assets/ebe12afc-ae2e-42b1-a058-e93353ff87c4) | ![🟥](https://github.com/user-attachments/assets/ebe12afc-ae2e-42b1-a058-e93353ff87c4) |
| No API key required     | ![✅](https://github.com/user-attachments/assets/b3c25b41-567c-4c26-bc02-ee3e40fd57c1)  | ![🟥](https://github.com/user-attachments/assets/ebe12afc-ae2e-42b1-a058-e93353ff87c4) | ![🟥](https://github.com/user-attachments/assets/ebe12afc-ae2e-42b1-a058-e93353ff87c4) |
| Live execution graph    | ![✅](https://github.com/user-attachments/assets/b3c25b41-567c-4c26-bc02-ee3e40fd57c1)  | ![🟥](https://github.com/user-attachments/assets/ebe12afc-ae2e-42b1-a058-e93353ff87c4) | ![🟥](https://github.com/user-attachments/assets/ebe12afc-ae2e-42b1-a058-e93353ff87c4) |
| No refactoring required | ![✅](https://github.com/user-attachments/assets/b3c25b41-567c-4c26-bc02-ee3e40fd57c1)  | ![🟥](https://github.com/user-attachments/assets/ebe12afc-ae2e-42b1-a058-e93353ff87c4) | ![🟥](https://github.com/user-attachments/assets/ebe12afc-ae2e-42b1-a058-e93353ff87c4) |
| Self-hosted             | ![✅](https://github.com/user-attachments/assets/b3c25b41-567c-4c26-bc02-ee3e40fd57c1)  | ![✅](https://github.com/user-attachments/assets/b3c25b41-567c-4c26-bc02-ee3e40fd57c1)  | ![🟥](https://github.com/user-attachments/assets/ebe12afc-ae2e-42b1-a058-e93353ff87c4) |
| No vendor lock-in       | ![✅](https://github.com/user-attachments/assets/b3c25b41-567c-4c26-bc02-ee3e40fd57c1)  | ![✅](https://github.com/user-attachments/assets/b3c25b41-567c-4c26-bc02-ee3e40fd57c1)  | ![🟥](https://github.com/user-attachments/assets/ebe12afc-ae2e-42b1-a058-e93353ff87c4) |
| Unlimited free usage    | ![✅](https://github.com/user-attachments/assets/b3c25b41-567c-4c26-bc02-ee3e40fd57c1)  | ![✅](https://github.com/user-attachments/assets/b3c25b41-567c-4c26-bc02-ee3e40fd57c1)  | ![🟥](https://github.com/user-attachments/assets/ebe12afc-ae2e-42b1-a058-e93353ff87c4) |
| Graph visualization     | ![✅](https://github.com/user-attachments/assets/b3c25b41-567c-4c26-bc02-ee3e40fd57c1)  | ![✅](https://github.com/user-attachments/assets/b3c25b41-567c-4c26-bc02-ee3e40fd57c1)  | ![✅](https://github.com/user-attachments/assets/b3c25b41-567c-4c26-bc02-ee3e40fd57c1)  |
| Cost & latency tracking | ![✅](https://github.com/user-attachments/assets/b3c25b41-567c-4c26-bc02-ee3e40fd57c1)  | ![✅](https://github.com/user-attachments/assets/b3c25b41-567c-4c26-bc02-ee3e40fd57c1)  | ![✅](https://github.com/user-attachments/assets/b3c25b41-567c-4c26-bc02-ee3e40fd57c1)  |
| Prompt evaluation       | ![🟥](https://github.com/user-attachments/assets/ebe12afc-ae2e-42b1-a058-e93353ff87c4) | ![✅](https://github.com/user-attachments/assets/b3c25b41-567c-4c26-bc02-ee3e40fd57c1)  | ![✅](https://github.com/user-attachments/assets/b3c25b41-567c-4c26-bc02-ee3e40fd57c1)  |

## Contribute

Any contribution is welcome. Feel free to open an issue or a discussion if you have any questions not covered here. If
you have any ideas or suggestions, please open a pull request.

## License

Copyright (C) 2026 Artyom Vancyan. [MIT](https://github.com/proactive-agent/langgraphics/blob/main/LICENSE)
