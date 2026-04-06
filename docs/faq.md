# FAQ

## Is this a bot?

No. MCP Telegram runs as a **userbot** — it operates under your personal Telegram account, not a bot account. This means it has access to all your chats, contacts, and history, just like the Telegram app on your phone.

## Is it safe?

Yes. All communication goes directly from your machine to Telegram's servers via the MTProto protocol. No data passes through third-party services. The session file is stored locally with restricted permissions (0600).

## Will my account get banned?

MCP Telegram uses the official Telegram API (MTProto) through GramJS. As long as you don't abuse it (mass spam, automated flooding, scraping), your account should be fine. Use it responsibly and respect the [Telegram Terms of Service](https://core.telegram.org/api/terms).

## Do I need to keep a terminal open?

No. MCP Telegram runs as part of your MCP client (Claude Desktop, Cursor, etc.). When your MCP client is open, the server runs. When you close it, the server stops. No separate terminal or process management needed.

## Can I use it with multiple Telegram accounts?

Yes! See the [Multiple Accounts](/guides/multiple-accounts) guide.

## What's the difference between self-hosted and cloud?

| | Self-hosted | Cloud ([mcp-telegram.com](https://mcp-telegram.com)) |
|---|---|---|
| **Setup** | Get API keys, install, login via QR | Just scan QR code |
| **Where it runs** | Your machine | Our servers |
| **Cost** | Free (open source) | Free tier + paid plans |
| **Clients** | Any MCP client | Claude.ai, ChatGPT |
| **Privacy** | Full control | Messages processed on our servers |

## Does it work with channels?

Yes. You can read channel messages, search channels, and if you're an admin, send messages and manage the channel.

## Does it support forum groups (topics)?

Yes. Full support — list topics, read per-topic messages, send to specific topics, and see per-topic unread counts.

## How many tools are there?

**59 tools** as of v1.24.0, covering messaging, search, groups, stickers, contacts, moderation, account management, and more. See the [full reference](/tools/reference).

## Can I use it without Node.js?

Yes! Download [pre-built binaries](https://github.com/overpod/mcp-telegram/releases) — standalone executables for Linux, macOS, and Windows. No runtime needed.
