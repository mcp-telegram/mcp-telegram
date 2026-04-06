# Multiple Accounts

Run separate Telegram accounts side by side using different session paths.

## Login Each Account

```bash
# Work account
TELEGRAM_API_ID=ID1 TELEGRAM_API_HASH=HASH1 \
  TELEGRAM_SESSION_PATH=~/.mcp-telegram/session-work \
  npx @overpod/mcp-telegram login

# Personal account
TELEGRAM_API_ID=ID2 TELEGRAM_API_HASH=HASH2 \
  TELEGRAM_SESSION_PATH=~/.mcp-telegram/session-personal \
  npx @overpod/mcp-telegram login
```

## Add as Separate MCP Servers

### Claude Code

```bash
claude mcp add telegram-work -s user \
  -e TELEGRAM_API_ID=ID1 \
  -e TELEGRAM_API_HASH=HASH1 \
  -e TELEGRAM_SESSION_PATH=~/.mcp-telegram/session-work \
  -- npx @overpod/mcp-telegram

claude mcp add telegram-personal -s user \
  -e TELEGRAM_API_ID=ID2 \
  -e TELEGRAM_API_HASH=HASH2 \
  -e TELEGRAM_SESSION_PATH=~/.mcp-telegram/session-personal \
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

Each account gets its own session file — no conflicts.

::: warning
A session can only be used by **one process at a time**. Using the same session file in multiple processes causes `AUTH_KEY_DUPLICATED` errors.
:::
