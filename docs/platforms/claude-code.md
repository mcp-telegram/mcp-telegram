# Claude Code (CLI)

## Setup with Binary (Recommended)

```bash
claude mcp add telegram -s user \
  -e TELEGRAM_API_ID=YOUR_ID \
  -e TELEGRAM_API_HASH=YOUR_HASH \
  -- /path/to/mcp-telegram
```

That's it! The `-s user` flag makes it available across all your projects. No Node.js needed.

## Setup with npx (Alternative)

If you have Node.js 18+:

```bash
claude mcp add telegram -s user \
  -e TELEGRAM_API_ID=YOUR_ID \
  -e TELEGRAM_API_HASH=YOUR_HASH \
  -- npx @overpod/mcp-telegram
```

## Login

If you haven't logged in yet:

```bash
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH ./mcp-telegram-login
```

Scan the QR code in Telegram (**Settings → Devices → Link Desktop Device**).

## Verify

Ask Claude: *"Run telegram-status"* — it should return your account info.

## Try It Out

```
> Summarize my unread Telegram messages
> Search Telegram for "project update" in the last week
> Send "Build passed ✅" to the DevOps group
```
