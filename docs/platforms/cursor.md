# Cursor / VS Code

## Cursor

1. Open **Cursor Settings** (⌘ + , on macOS, Ctrl + , on Windows/Linux)
2. Navigate to **MCP** section
3. Add a new MCP server with this config:

```json
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

4. Restart Cursor.

## VS Code

Add the same configuration to your VS Code MCP settings (check [VS Code MCP docs](https://code.visualstudio.com/docs) for the current config location — it varies by version).

## Login

[Login via terminal first](/getting-started/login), then use the MCP server in your editor.

## Use Cases in an Editor

MCP Telegram in Cursor/VS Code is great for:

- *"Check if anyone mentioned a bug in the #dev channel"*
- *"Send a message to the team: deployment complete"*
- *"Search Telegram for the API docs link someone shared"*
