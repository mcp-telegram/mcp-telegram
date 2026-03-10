# mcp-telegram

MCP server for Telegram userbot (not Bot API). Connects to a real Telegram account via QR code and provides tools for sending/reading messages.

Works with any MCP-compatible client: Mastra, Claude Desktop, Cursor, etc.

## Tools

| Tool | Description |
|------|-------------|
| `telegram-status` | Check connection status |
| `telegram-login` | Login via QR code (returns QR as image) |
| `telegram-send-message` | Send a message to a chat |
| `telegram-list-chats` | List chats with unread counts |
| `telegram-read-messages` | Read recent messages from a chat |

## Quick Start

### 1. Install

```bash
npm install
```

### 2. Configure credentials

Get `api_id` and `api_hash` at [my.telegram.org/apps](https://my.telegram.org/apps).

```bash
cp .env.example .env
```

Fill in `.env`:

```env
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=your_api_hash_here
```

### 3. Login via QR code

```bash
npm run login
```

A QR code will appear in the terminal. Scan it in Telegram:
**Settings → Devices → Link Desktop Device**

The session is saved to `.telegram-session` — no need to login again.

### 4. Start MCP server

```bash
npm start
```

The server runs over stdio (standard MCP transport).

## Connecting to MCP Clients

### Mastra

```typescript
import { MCPClient } from '@mastra/mcp';

const telegramMcp = new MCPClient({
  id: 'telegram-mcp',
  servers: {
    telegram: {
      command: 'npx',
      args: ['tsx', '/path/to/mcp-telegram/src/index.ts'],
      env: {
        TELEGRAM_API_ID: process.env.TELEGRAM_API_ID!,
        TELEGRAM_API_HASH: process.env.TELEGRAM_API_HASH!,
      },
    },
  },
});
```

### Claude Desktop / Cursor / Others

Add to your MCP client config (e.g. `~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "telegram": {
      "command": "npx",
      "args": ["tsx", "/path/to/mcp-telegram/src/index.ts"],
      "env": {
        "TELEGRAM_API_ID": "12345678",
        "TELEGRAM_API_HASH": "your_api_hash_here"
      }
    }
  }
}
```

See `mcp.json.example` for a ready-made template.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run login` | QR code login in terminal |
| `npm start` | Start MCP server |
| `npm run dev` | Start with hot-reload |
| `npm run build` | Build TypeScript |

## Tech Stack

- [MCP SDK](https://github.com/modelcontextprotocol/sdk) — Model Context Protocol
- [GramJS](https://github.com/nicedoc/gramjs) (`telegram`) — Telegram MTProto client
- TypeScript, Node.js

## Security

- `api_id` / `api_hash` stored in `.env` (gitignored)
- Session stored in `.telegram-session` (gitignored)
- Phone number **not required** — QR-only login
- This is a **userbot** (personal account), not a bot — respect [Telegram ToS](https://core.telegram.org/api/terms)
