# 多账户

使用不同的会话路径并行运行多个 Telegram 账户。

## 登录每个账户

```bash
# 工作账户
TELEGRAM_API_ID=ID1 TELEGRAM_API_HASH=HASH1 \\
  TELEGRAM_SESSION_PATH=~/.mcp-telegram/session-work \\
  npx @overpod/mcp-telegram login

# 个人账户
TELEGRAM_API_ID=ID2 TELEGRAM_API_HASH=HASH2 \\
  TELEGRAM_SESSION_PATH=~/.mcp-telegram/session-personal \\
  npx @overpod/mcp-telegram login
```

## 添加为独立 MCP 服务器

### Claude Code

```bash
claude mcp add telegram-work -s user \\
  -e TELEGRAM_API_ID=ID1 \\
  -e TELEGRAM_API_HASH=HASH1 \\
  -e TELEGRAM_SESSION_PATH=~/.mcp-telegram/session-work \\
  -- npx @overpod/mcp-telegram

claude mcp add telegram-personal -s user \\
  -e TELEGRAM_API_ID=ID2 \\
  -e TELEGRAM_API_HASH=HASH2 \\
  -e TELEGRAM_SESSION_PATH=~/.mcp-telegram/session-personal \\
  -- npx @overpod/mcp-telegram
```

### Claude Desktop

```json
{
  "mcpServers": {
    "telegram-work": {
      "command": "npx",
      "args": ["@overpod/mcp-telegram"],
      "env": {
        "TELEGRAM_API_ID": "ID1",
        "TELEGRAM_API_HASH": "HASH1",
        "TELEGRAM_SESSION_PATH": "~/.mcp-telegram/session-work"
      }
    },
    "telegram-personal": {
      "command": "npx",
      "args": ["@overpod/mcp-telegram"],
      "env": {
        "TELEGRAM_API_ID": "ID2",
        "TELEGRAM_API_HASH": "HASH2",
        "TELEGRAM_SESSION_PATH": "~/.mcp-telegram/session-personal"
      }
    }
  }
}
```

每个账户有自己的会话文件 — 互不冲突。

::: warning
一个会话只能被**一个进程同时使用**。在多个进程中使用同一会话文件会导致 `AUTH_KEY_DUPLICATED` 错误。
:::
