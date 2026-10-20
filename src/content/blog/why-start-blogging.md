---
title: '第一篇：为什么开始写博客'
description: '这是一篇示例文章，演示博客的写法：标题、列表、引用和代码块。'
pubDate: 2026-10-20
tags: ['随笔']
---

> 📌 这是一篇**示例文章**，用来演示博客的样式和写法。你可以直接修改它，也可以删掉它，换成你自己的第一篇。

## 为什么要写

最近一直在做投研 Agent，读了很多资料，也踩了不少坑。脑子里想清楚了，不等于真的理解了；写下来、讲给别人听，才能检验自己是不是真懂。

所以打算在这里记录三类内容：

1. **AI Agent 实践**：deepagents 的用法、踩坑和心得
2. **架构思考**：投研 Agent 的控制平面、多 Agent 协作、权限隔离
3. **基金学习笔记**：从零开始学 ETF 投资

## 代码示例

博客支持代码高亮，比如一个最小的 deepagents 例子：

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    tools=[],
    system_prompt="你是一名投研助手，回答要简洁、有依据。",
)

result = agent.invoke({"messages": [{"role": "user", "content": "什么是 ETF？"}]})
print(result["messages"][-1].content)
```

行内代码也可以，比如 `npm run dev`。

## 接下来

先保持每两周一篇的节奏，写得不好也没关系，写出来最重要。
