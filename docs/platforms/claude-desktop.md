# Claude Desktop

## Setup

1. Open your Claude Desktop config file:
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

2. Add the Telegram server:

```json
{
  "mcpServers": {
    "telegram": {
      "command": "npx",
      "args": ["@overpod/mcp-telegram"],
      "env": {
        "TELEGRAM_API_ID": "YOUR_ID",
        "TELEGRAM_API_HASH": "YOUR_HASH"
      }
    }
  }
}
```

3. **Restart Claude Desktop** (fully quit and reopen).

4. You should see "telegram" in the MCP tools list (🔧 icon in the chat input).

## Login

You can login directly through Claude Desktop — no terminal needed:

1. Ask Claude: **"Run telegram-login"**
2. A QR code will be generated. If the image isn't visible, it's also saved to `~/.mcp-telegram/qr-login.png`
3. Scan it in Telegram (**Settings → Devices → Link Desktop Device**)
4. Ask Claude: **"Run telegram-status"** to verify

## Using Binary Instead of npx

If you downloaded the [pre-built binary](/getting-started/installation#pre-built-binary-no-runtime-needed):

```json
{
  "mcpServers": {
    "telegram": {
      "command": "/path/to/mcp-telegram",
      "env": {
        "TELEGRAM_API_ID": "YOUR_ID",
        "TELEGRAM_API_HASH": "YOUR_HASH"
      }
    }
  }
}
```

## Using Docker

1. [Login via terminal first](/getting-started/login)
2. Add to your config:

```json
{
  "mcpServers": {
    "telegram": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "TELEGRAM_API_ID=YOUR_ID",
        "-e", "TELEGRAM_API_HASH=YOUR_HASH",
        "-v", "~/.mcp-telegram:/root/.mcp-telegram",
        "mcp-telegram"
      ]
    }
  }
}
```

3. Restart Claude Desktop.

## Try It Out

Once connected, try these prompts:

- *"What are my unread Telegram messages?"*
- *"Search my Telegram chats for messages about 'meeting'"*
- *"Send 'Hello!' to @username"*
