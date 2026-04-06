# Login with QR Code

MCP Telegram uses **QR code authentication** — no phone number needed. You scan a code with your Telegram app, just like linking a desktop client.

## Terminal Login

Run the login command:

```bash
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH npx @overpod/mcp-telegram login
```

A QR code will appear in the terminal:

1. Open **Telegram** on your phone
2. Go to **Settings → Devices → Link Desktop Device**
3. Scan the QR code

The session is saved to `~/.mcp-telegram/session` and reused automatically. You only need to login once.

## Login via Claude Desktop

If you're using Claude Desktop, you don't need a terminal at all:

1. Add the MCP server to your config (see [Claude Desktop setup](/platforms/claude-desktop))
2. Restart Claude Desktop
3. Ask Claude: **"Run telegram-login"**
4. A QR code image will be generated
5. If the image isn't visible in Claude, it's saved to `~/.mcp-telegram/qr-login.png`
6. Scan it in Telegram (**Settings → Devices → Link Desktop Device**)

## Login with Binary

```bash
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH ./mcp-telegram-login
```

## Verify Connection

After login, verify everything works:

- **Claude Code:** Ask "Run telegram-status"
- **Claude Desktop:** Ask "Run telegram-status"
- **Any client:** The `telegram-status` tool should return your account info

## Custom Session Path

By default, the session is stored in `~/.mcp-telegram/session`. To use a different location:

```bash
TELEGRAM_SESSION_PATH=/path/to/session npx @overpod/mcp-telegram login
```

This is useful for [running multiple accounts](/guides/multiple-accounts).

## Session Security

- Session file has `0600` permissions (owner-only access)
- Session directory has `0700` permissions
- The session allows full access to your Telegram account — treat it like a password
- One session per process — using the same session in multiple processes causes `AUTH_KEY_DUPLICATED` errors

## Next Step

→ Set up your MCP client: [Claude Desktop](/platforms/claude-desktop) · [Claude Code](/platforms/claude-code) · [Cursor](/platforms/cursor)
