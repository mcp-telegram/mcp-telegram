# Claude Desktop

## Setup with Binary (Recommended)

1. [Download the binary](/getting-started/installation) for your platform.

2. Open your Claude Desktop config file:
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

3. Add the Telegram server (use the full path to where you saved the binary):

::: code-group
```json [macOS / Linux]
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

```json [Windows]
{
  "mcpServers": {
    "telegram": {
      "command": "C:\\path\\to\\mcp-telegram-windows-x64.exe",
      "env": {
        "TELEGRAM_API_ID": "YOUR_ID",
        "TELEGRAM_API_HASH": "YOUR_HASH"
      }
    }
  }
}
```
:::

4. **Restart Claude Desktop** (fully quit and reopen).

5. You should see "telegram" in the MCP tools list (🔧 icon in the chat input).

## Login

You can login directly through Claude Desktop — no terminal needed:

1. Ask Claude: **"Run telegram-login"**
2. A QR code will be generated. If the image isn't visible, it's also saved to `~/.mcp-telegram/qr-login.png`
3. Scan it in Telegram (**Settings → Devices → Link Desktop Device**)
4. Ask Claude: **"Run telegram-status"** to verify

## Setup with npx (Alternative)

If you have Node.js 18+ installed:

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

## Setup with Docker

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
