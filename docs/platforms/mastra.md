# Mastra

[Mastra](https://mastra.ai) is a TypeScript framework for building AI agents. MCP Telegram integrates as an MCP client.

## Setup

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

## Using with an Agent

```typescript
import { Agent } from "@mastra/core";

const agent = new Agent({
  name: "telegram-agent",
  model: openai("gpt-4o"),
  tools: await telegramMcp.getTools(),
  instructions: "You are a helpful assistant with access to Telegram.",
});

const result = await agent.generate("What are my unread Telegram messages?");
```

## Login

[Login via terminal first](/getting-started/login) before starting your Mastra application.
