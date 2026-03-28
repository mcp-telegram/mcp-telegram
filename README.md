# MCP Telegram

[![npm](https://img.shields.io/npm/v/@overpod/mcp-telegram)](https://www.npmjs.com/package/@overpod/mcp-telegram)
[![npm downloads](https://img.shields.io/npm/dm/@overpod/mcp-telegram)](https://www.npmjs.com/package/@overpod/mcp-telegram)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-1.27-green.svg)](https://modelcontextprotocol.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![mcp-telegram MCP server](https://glama.ai/mcp/servers/overpod/mcp-telegram/badges/score.svg)](https://glama.ai/mcp/servers/overpod/mcp-telegram)

> **Hosted version available!** Don't want to self-host? Use [mcp-telegram.com](https://mcp-telegram.com) -- connect Telegram to Claude.ai or ChatGPT in 30 seconds with QR code. No API keys needed.

<p align="center">
  <img src="assets/demo.gif" alt="MCP Telegram demo — connect and summarize chats in Claude" width="700">
</p>

An MCP (Model Context Protocol) server that connects AI assistants like Claude to Telegram via the MTProto protocol. Unlike bots, this runs as a **userbot** -- it operates under your personal Telegram account using [GramJS](https://github.com/nicedoc/gramjs), giving full access to your chats, contacts, and message history.

## Features

- **MTProto protocol** -- direct Telegram API access, not the limited Bot API
- **Userbot** -- operates as your personal account, not a bot
- **Full-featured** -- messaging, reactions, polls, scheduled messages, media, contacts, and more
- **Forum Topics** -- list topics, read per-topic messages, send to specific topics, per-topic unread counts
- **QR code login** -- authenticate by scanning a QR code in the Telegram app
- **Session persistence** -- login once, stay connected across restarts
- **Human-readable output** -- sender names are resolved, not just numeric IDs
- **Works with any MCP client** -- Claude Code, Claude Desktop, ChatGPT, Cursor, VS Code, Mastra, etc.

## Prerequisites

- **Node.js** 18 or later
- **Telegram API credentials** -- `API_ID` and `API_HASH` from [my.telegram.org](https://my.telegram.org)

## Quick Start

### 1. Get Telegram API credentials

1. Go to [my.telegram.org](https://my.telegram.org) and log in with your phone number.
2. Navigate to **API development tools**.
3. Create a new application (any name and platform).
4. Copy the **App api_id** and **App api_hash**.

### 2. Login

```bash
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH npx @overpod/mcp-telegram login
```

A QR code will appear in the terminal. Open Telegram on your phone, go to **Settings > Devices > Link Desktop Device**, and scan the code. The session is saved to `~/.mcp-telegram/session` and reused automatically.

> **Custom session path:** set `TELEGRAM_SESSION_PATH=/path/to/session` to store the session file elsewhere.

### 3. Add to Claude

```bash
claude mcp add telegram -s user \
  -e TELEGRAM_API_ID=YOUR_ID \
  -e TELEGRAM_API_HASH=YOUR_HASH \
  -- npx @overpod/mcp-telegram
```

That's it! Ask Claude to run `telegram-status` to verify.

### Multiple Accounts

Use `TELEGRAM_SESSION_PATH` to run separate Telegram accounts side by side:

```bash
# Login each account with a unique session path
TELEGRAM_API_ID=ID1 TELEGRAM_API_HASH=HASH1 TELEGRAM_SESSION_PATH=~/.mcp-telegram/session-work npx @overpod/mcp-telegram login
TELEGRAM_API_ID=ID2 TELEGRAM_API_HASH=HASH2 TELEGRAM_SESSION_PATH=~/.mcp-telegram/session-personal npx @overpod/mcp-telegram login
```

Then add each as a separate MCP server:

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

Each account gets its own session file — no conflicts.

### Proxy Support

If Telegram is blocked or you're running in a containerized environment (Docker, K3s), use a SOCKS5 or MTProxy:

```bash
# SOCKS5 proxy
TELEGRAM_PROXY_IP=127.0.0.1 \
TELEGRAM_PROXY_PORT=10808 \
npx @overpod/mcp-telegram

# MTProxy
TELEGRAM_PROXY_IP=proxy.example.com \
TELEGRAM_PROXY_PORT=443 \
TELEGRAM_PROXY_SECRET=ee00000000000000000000000000000000 \
npx @overpod/mcp-telegram
```

| Variable | Description |
|----------|-------------|
| `TELEGRAM_PROXY_IP` | Proxy server address |
| `TELEGRAM_PROXY_PORT` | Proxy server port |
| `TELEGRAM_PROXY_SOCKS_TYPE` | `4` or `5` (default: `5`) |
| `TELEGRAM_PROXY_SECRET` | MTProxy secret (enables MTProxy mode) |
| `TELEGRAM_PROXY_USERNAME` | Optional proxy auth |
| `TELEGRAM_PROXY_PASSWORD` | Optional proxy auth |

## Installation Options

### npx (recommended, zero install)

No need to clone or install anything. Just use `npx @overpod/mcp-telegram`.

### Global install

```bash
npm install -g @overpod/mcp-telegram
mcp-telegram          # run server
mcp-telegram login    # QR login
```

### From source

```bash
git clone https://github.com/overpod/mcp-telegram.git
cd mcp-telegram
npm install && npm run build
```

## Usage with MCP Clients

### Claude Code (CLI)

```bash
claude mcp add telegram -s user \
  -e TELEGRAM_API_ID=YOUR_ID \
  -e TELEGRAM_API_HASH=YOUR_HASH \
  -- npx @overpod/mcp-telegram
```

### Claude Desktop

1. Open your config file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

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

3. Restart Claude Desktop.

4. Ask Claude: **"Run telegram-login"** -- a QR code will appear. If the image is not visible, Claude will provide a browser link to view the QR code. Scan it in Telegram (**Settings > Devices > Link Desktop Device**).

5. Ask Claude: **"Run telegram-status"** to verify the connection.

> **Note**: No terminal required! Login works entirely through Claude Desktop.

### Cursor / VS Code

Add the same JSON config above to your MCP settings (Cursor Settings > MCP, or VS Code MCP config).

### Mastra

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

## Available Tools

### Connection

| Tool | Description |
|------|-------------|
| `telegram-status` | Check connection status and current account info |
| `telegram-login` | Authenticate via QR code |

### Messaging

| Tool | Description |
|------|-------------|
| `telegram-send-message` | Send a text message to a chat |
| `telegram-send-file` | Send a file (photo, document, video, etc.) to a chat |
| `telegram-send-reaction` | Send or remove an emoji reaction on a message |
| `telegram-send-scheduled` | Schedule a message for future delivery |
| `telegram-create-poll` | Create a poll (multiple choice or quiz mode) |
| `telegram-edit-message` | Edit a previously sent message |
| `telegram-delete-message` | Delete messages in a chat |
| `telegram-forward-message` | Forward messages between chats |

### Reading

| Tool | Description |
|------|-------------|
| `telegram-list-chats` | List recent dialogs with unread counts, bot/contact markers |
| `telegram-read-messages` | Read recent messages from a chat |
| `telegram-search-chats` | Search for chats, users, or channels by name |
| `telegram-search-messages` | Search messages in a chat by text |
| `telegram-search-global` | Search messages across all public chats and channels |
| `telegram-get-unread` | Get chats with unread messages; forums show per-topic unread breakdown |
| `telegram-get-contact-requests` | Get incoming messages from non-contacts with preview |

### Forum Topics

| Tool | Description |
|------|-------------|
| `telegram-list-topics` | List forum topics in a group with unread counts and status |
| `telegram-read-topic-messages` | Read messages from a specific forum topic |

### Chat Management

| Tool | Description |
|------|-------------|
| `telegram-mark-as-read` | Mark a chat as read |
| `telegram-get-chat-info` | Get detailed info about a chat (name, type, members, bot/contact status) |
| `telegram-get-chat-members` | List members of a group or channel |
| `telegram-join-chat` | Join a group or channel by username or invite link |
| `telegram-pin-message` | Pin a message in a chat |
| `telegram-unpin-message` | Unpin a message in a chat |

### Contacts & Moderation

| Tool | Description |
|------|-------------|
| `telegram-add-contact` | Add a user to your contacts (accept contact request) |
| `telegram-block-user` | Block a user from sending you messages |
| `telegram-report-spam` | Report a chat as spam to Telegram |

### User Info

| Tool | Description |
|------|-------------|
| `telegram-get-contacts` | Get your contacts list with phone numbers |
| `telegram-get-profile` | Get detailed profile info for a user (bio, photo, last seen) |
| `telegram-get-profile-photo` | Get a user's or chat's profile photo (inline or file) |
| `telegram-get-reactions` | Get reactions on a specific message with user details |

### Media

| Tool | Description |
|------|-------------|
| `telegram-download-media` | Download media from a message to a local file |

## Tool Parameters

### Common patterns

Most tools accept `chatId` as a string -- either a numeric ID (e.g., `"-1001234567890"`) or a username (e.g., `"@username"`).

### telegram-send-message

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | yes | Chat ID or @username |
| `text` | string | yes | Message text |
| `replyTo` | number | no | Message ID to reply to |
| `parseMode` | `"md"` / `"html"` | no | Message formatting mode |
| `topicId` | number | no | Forum topic ID to send into (for groups with Topics) |

### telegram-list-topics

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | yes | Chat ID or @username (group with Topics enabled) |
| `limit` | number | no | Max topics to return (default: 100) |

### telegram-read-topic-messages

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | yes | Chat ID or @username |
| `topicId` | number | yes | Topic ID (from `telegram-list-topics`) |
| `limit` | number | no | Number of messages (default: 20) |
| `offsetId` | number | no | Message ID for pagination |

### telegram-list-chats

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | no | Number of chats to return (default: 20) |
| `offsetDate` | number | no | Unix timestamp for pagination |
| `filterType` | `"private"` / `"group"` / `"channel"` / `"contact_requests"` | no | Filter by chat type |

### telegram-read-messages

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | yes | Chat ID or @username |
| `limit` | number | no | Number of messages (default: 10) |
| `offsetId` | number | no | Message ID for pagination |

### telegram-send-file

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | yes | Chat ID or @username |
| `filePath` | string | yes | Absolute path to the file |
| `caption` | string | no | File caption |

### telegram-download-media

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | yes | Chat ID or @username |
| `messageId` | number | yes | Message ID containing media |
| `downloadPath` | string | yes | Absolute path to save the file |

### telegram-forward-message

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fromChatId` | string | yes | Source chat ID or @username |
| `toChatId` | string | yes | Destination chat ID or @username |
| `messageIds` | number[] | yes | Array of message IDs to forward |

### telegram-edit-message

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | yes | Chat ID or @username |
| `messageId` | number | yes | ID of the message to edit |
| `text` | string | yes | New message text |

### telegram-delete-message

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | yes | Chat ID or @username |
| `messageIds` | number[] | yes | Array of message IDs to delete |

### telegram-pin-message

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | yes | Chat ID or @username |
| `messageId` | number | yes | Message ID to pin |
| `silent` | boolean | no | Pin without notification (default: false) |

### telegram-join-chat

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target` | string | yes | Username (@group), link (t.me/group), or invite link (t.me/+xxx) |

### telegram-send-reaction

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | yes | Chat ID or @username |
| `messageId` | number | yes | Message ID to react to |
| `emoji` | string \| string[] | no | Single emoji `"👍"` or array `["👍","🔥"]`. Omit to remove all reactions |
| `addToExisting` | boolean | no | Add to existing reactions instead of replacing (default: false) |

### telegram-send-scheduled

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | yes | Chat ID or @username (use `"me"` or `"self"` for Saved Messages) |
| `text` | string | yes | Message text |
| `scheduleDate` | number | yes | Unix timestamp when to send (must be in the future) |
| `replyTo` | number | no | Message ID to reply to |
| `parseMode` | `"md"` / `"html"` | no | Message formatting mode |

### telegram-create-poll

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | yes | Chat ID or @username |
| `question` | string | yes | Poll question |
| `answers` | string[] | yes | Answer options (2-10 items) |
| `multipleChoice` | boolean | no | Allow multiple answers (default: false) |
| `quiz` | boolean | no | Quiz mode with one correct answer (default: false) |
| `correctAnswer` | number | no | Index of correct answer, 0-based (required for quiz mode) |

### telegram-search-messages

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | yes | Chat ID or @username |
| `query` | string | yes | Search text |
| `limit` | number | no | Max results (default: 20) |

### telegram-search-global

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | yes | Search text |
| `limit` | number | no | Max results (default: 20) |
| `minDate` | number | no | Unix timestamp: only messages after this date |
| `maxDate` | number | no | Unix timestamp: only messages before this date |

### telegram-search-chats

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | yes | Search query (name or username) |
| `limit` | number | no | Max results (default: 10) |

### telegram-get-chat-members

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | yes | Chat ID or @username |
| `limit` | number | no | Number of members (default: 50) |

### telegram-get-contacts

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | no | Number of contacts (default: 50) |

### telegram-get-profile

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | yes | User ID or @username |

### telegram-get-profile-photo

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `entityId` | string | yes | User/Chat/Channel ID or username |
| `savePath` | string | no | Absolute path to save file. If omitted, returns inline base64 image |
| `size` | `"small"` / `"big"` | no | Photo size: small (160x160) or big (640x640). Default: big |

### telegram-get-reactions

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | yes | Chat ID or @username |
| `messageId` | number | yes | Message ID to get reactions for |

### telegram-get-unread

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | no | Number of unread chats (default: 20) |

### telegram-get-contact-requests

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | no | Number of contact requests (default: 20) |

### telegram-add-contact

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | yes | User ID or @username to add |
| `firstName` | string | yes | First name for the contact |
| `lastName` | string | no | Last name for the contact |
| `phone` | string | no | Phone number for the contact |

### telegram-block-user

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | yes | User ID or @username to block |

### telegram-report-spam

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | yes | Chat ID or @username to report |

## Development

```bash
npm run dev        # Start with file watching (tsx)
npm start          # Start the MCP server
npm run login      # QR code login in terminal
npm run build      # Compile TypeScript
npm run lint       # Check code with Biome
npm run lint:fix   # Auto-fix lint issues
npm run format     # Format code with Biome
```

## Project Structure

```
src/
  index.ts            -- MCP server entry point, tool definitions
  telegram-client.ts  -- TelegramService class (GramJS wrapper)
  qr-login-cli.ts     -- CLI utility for QR code login
```

## Tech Stack

- **[TypeScript](https://www.typescriptlang.org/)** -- ES2022, ESM modules
- **[GramJS](https://github.com/nicedoc/gramjs)** (`telegram`) -- Telegram MTProto client
- **[@modelcontextprotocol/sdk](https://modelcontextprotocol.io/)** -- MCP server framework
- **[Zod](https://zod.dev/)** -- Runtime schema validation for tool parameters
- **[Biome](https://biomejs.dev/)** -- Linter and formatter
- **[tsx](https://tsx.is/)** -- TypeScript execution without a build step
- **[dotenv](https://github.com/motdotla/dotenv)** -- Environment variable management

## Security

- API credentials are stored in `.env` (gitignored)
- Session is stored in `~/.mcp-telegram/session` with `0600` permissions (owner-only access)
- Session directory is created with `0700` permissions
- Phone number is **not required** -- QR-only authentication
- This is a **userbot** (personal account), not a bot -- respect the [Telegram Terms of Service](https://core.telegram.org/api/terms)

## License

MIT
