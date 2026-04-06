# ChatGPT

ChatGPT supports MCP servers through its desktop app.

## Setup

1. Open **ChatGPT Desktop** settings
2. Navigate to the MCP/tools section
3. Add MCP Telegram:

::: code-group
```json [Binary (recommended)]
{
  "telegram": {
    "command": "/path/to/mcp-telegram",
    "env": {
      "TELEGRAM_API_ID": "YOUR_ID",
      "TELEGRAM_API_HASH": "YOUR_HASH"
    }
  }
}
```

```json [npx (requires Node.js)]
{
  "telegram": {
    "command": "npx",
    "args": ["@overpod/mcp-telegram"],
    "env": {
      "TELEGRAM_API_ID": "YOUR_ID",
      "TELEGRAM_API_HASH": "YOUR_HASH"
    }
  }
}
```
:::

4. [Login via terminal first](/getting-started/login)
5. Restart ChatGPT Desktop

## Cloud Version

For the easiest ChatGPT setup, use the **[cloud version](https://mcp-telegram.com)** — connect with a QR code in 30 seconds, no local setup needed.
