# Mastra

[Mastra](https://mastra.ai) — TypeScript-фреймворк для создания AI-агентов. MCP Telegram интегрируется как MCP-клиент.

## Настройка

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

## Использование с агентом

```typescript
import { Agent } from "@mastra/core";

const agent = new Agent({
  name: "telegram-agent",
  model: openai("gpt-4o"),
  tools: await telegramMcp.getTools(),
  instructions: "Ты полезный ассистент с доступом к Telegram.",
});

const result = await agent.generate("Какие у меня непрочитанные сообщения в Telegram?");
```

## Вход

Сначала [войдите через терминал](/ru/getting-started/login) перед запуском приложения Mastra.
