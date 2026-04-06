# Mastra

[Mastra](https://mastra.ai) 是一个用于构建 AI 代理的 TypeScript 框架。MCP Telegram 作为 MCP 客户端集成。

## 设置

```typescript
import { MCPClient } from "@mastra/mcp";

const telegramMcp = new MCPClient({
  id: "telegram-mcp",
  servers: {
    telegram: {
      command: "npx",
      args: ["@overpod/mcp-telegram"],
      env: {
        TELEGRAM_API_ID: process.env.TELEGRAM_API_ID!,
        TELEGRAM_API_HASH: process.env.TELEGRAM_API_HASH!,
      },
    },
  },
});
```

## 与代理一起使用

```typescript
import { Agent } from "@mastra/core";

const agent = new Agent({
  name: "telegram-agent",
  model: openai("gpt-4o"),
  tools: await telegramMcp.getTools(),
  instructions: "你是一个可以访问 Telegram 的有用助手。",
});

const result = await agent.generate("我 Telegram 有什么未读消息？");
```

## 登录

启动 Mastra 应用之前，先[通过终端登录](/zh/getting-started/login)。
