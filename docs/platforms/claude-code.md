# Claude Code (CLI)

## Setup

Add MCP Telegram with a single command:

```bash
claude mcp add telegram -s user \
  -e TELEGRAM_API_ID=YOUR_ID \
  -e TELEGRAM_API_HASH=YOUR_HASH \
  -- npx @overpod/mcp-telegram
```

That's it! The `-s user` flag makes it available across all your projects.

## Login

If you haven't logged in yet:

```bash
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH npx @overpod/mcp-telegram login
```

Scan the QR code in Telegram (**Settings → Devices → Link Desktop Device**).

## Verify

Ask Claude: *"Run telegram-status"* — it should return your account info.

## Using Binary

```bash
claude mcp add telegram -s user \
  -e TELEGRAM_API_ID=YOUR_ID \
  -e TELEGRAM_API_HASH=YOUR_HASH \
  -- /path/to/mcp-telegram
```

## Try It Out

```
> Summarize my unread Telegram messages
> Search Telegram for "project update" in the last week
> Send "Build passed ✅" to the DevOps group
```
