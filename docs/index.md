---
layout: home
hero:
  name: MCP Telegram
  text: Connect AI to Your Telegram
  tagline: 59 tools — messages, groups, stickers, contacts, search, and more. Works with Claude, ChatGPT, Cursor, and any MCP client.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/credentials
    - theme: alt
      text: Download Binary
      link: https://github.com/overpod/mcp-telegram/releases/latest
    - theme: alt
      text: Use Cloud Version
      link: https://mcp-telegram.com
features:
  - icon: 📦
    title: Single Binary, Zero Dependencies
    details: Download one file and run. No Node.js, no npm, no package managers. Works on Linux, macOS, and Windows.
  - icon: ⚡
    title: MTProto, Not Bot API
    details: Direct access to Telegram's native protocol via GramJS. Full power of a real account — no bot limitations.
  - icon: 🔧
    title: 59 Tools
    details: Send messages, search chats, manage groups, send stickers, handle contacts, control privacy — all through natural language.
  - icon: 🖥️
    title: Any MCP Client
    details: Works with Claude Desktop, Claude Code, ChatGPT, Cursor, VS Code, Mastra, and any other MCP-compatible client.
  - icon: 📱
    title: QR Code Login
    details: No phone number needed. Scan a QR code with your Telegram app and you're in. Session persists across restarts.
  - icon: 🔒
    title: Privacy First
    details: All communication goes directly to Telegram servers. No third-party services. Session stored locally with restricted permissions.
---

## Quick Start

Download the binary for your platform from [GitHub Releases](https://github.com/overpod/mcp-telegram/releases/latest), get [API credentials](/getting-started/credentials), and connect:

::: code-group
```bash [macOS (Apple Silicon)]
curl -L -o mcp-telegram https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-darwin-arm64
curl -L -o mcp-telegram-login https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-login-darwin-arm64
chmod +x mcp-telegram mcp-telegram-login
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH ./mcp-telegram-login
```

```bash [macOS (Intel)]
curl -L -o mcp-telegram https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-darwin-x64
curl -L -o mcp-telegram-login https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-login-darwin-x64
chmod +x mcp-telegram mcp-telegram-login
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH ./mcp-telegram-login
```

```bash [Linux x64]
curl -L -o mcp-telegram https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-linux-x64
curl -L -o mcp-telegram-login https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-login-linux-x64
chmod +x mcp-telegram mcp-telegram-login
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH ./mcp-telegram-login
```

```powershell [Windows]
# Download from https://github.com/overpod/mcp-telegram/releases/latest
# mcp-telegram-windows-x64.exe
# mcp-telegram-login-windows-x64.exe
$env:TELEGRAM_API_ID="YOUR_ID"; $env:TELEGRAM_API_HASH="YOUR_HASH"; .\mcp-telegram-login-windows-x64.exe
```
:::

Scan the QR code in Telegram (**Settings → Devices → Link Desktop Device**), then [add to your MCP client](/platforms/claude-desktop).

## Quick Example

Once connected, just talk to your AI assistant naturally:

> **You:** Summarize my unread Telegram messages

> **You:** Search all chats for messages about "project deadline"

> **You:** Send "Meeting at 3pm" to the Engineering group

Your AI assistant uses MCP Telegram tools behind the scenes — no commands to memorize.

## Don't Want to Self-Host?

Use the **[cloud version](https://mcp-telegram.com)** — connect Telegram to Claude.ai or ChatGPT in 30 seconds with a QR code. No API keys, no terminal, no setup.
