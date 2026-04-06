# Troubleshooting

## AUTH_KEY_DUPLICATED

**Problem:** You see `AUTH_KEY_DUPLICATED` error.

**Cause:** A Telegram session can only be used by **one process at a time**. Another process (or another MCP client) is already using the same session file.

**Fix:** Create separate sessions for each environment:

```bash
# For local dev
TELEGRAM_SESSION_PATH=~/.mcp-telegram/session-local npx @overpod/mcp-telegram login

# For production
TELEGRAM_SESSION_PATH=~/.mcp-telegram/session-prod npx @overpod/mcp-telegram login
```

Set `TELEGRAM_SESSION_PATH` in each environment's MCP config accordingly.

## QR Code Not Visible

**Problem:** The QR code doesn't render in your terminal or Claude Desktop.

**Fix:**
- The QR code is always saved to `~/.mcp-telegram/qr-login.png` — open it manually
- In terminal: try a different terminal emulator (some don't support Unicode block characters)
- In Claude Desktop: ask Claude to describe the file path so you can open the image

## Connection Timeout

**Problem:** The server starts but can't connect to Telegram.

**Possible causes:**
1. **Telegram is blocked** in your region → use a [proxy](/getting-started/installation#proxy-support)
2. **Firewall** blocking outgoing connections → allow TCP to Telegram's servers
3. **Invalid API credentials** → double-check your `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` at [my.telegram.org](https://my.telegram.org)

## Session Expired

**Problem:** You were logged in before but now get authentication errors.

**Fix:** Login again:
```bash
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH npx @overpod/mcp-telegram login
```

Sessions can expire if:
- You terminated the session from another device (Settings → Devices)
- Telegram invalidated the session for security reasons
- The session file was corrupted

## Tools Not Showing Up

**Problem:** Your MCP client doesn't show Telegram tools.

**Checklist:**
1. Did you restart your MCP client after adding the config?
2. Is the config JSON valid? (common: trailing comma, wrong path)
3. Is Node.js 18+ installed? (`node --version`)
4. Try running manually: `TELEGRAM_API_ID=X TELEGRAM_API_HASH=Y npx @overpod/mcp-telegram` — check for errors

## npx Runs Old Version

**Problem:** `npx @overpod/mcp-telegram` uses a cached old version.

**Fix:**
```bash
npx @overpod/mcp-telegram@latest
```

Or clear the npx cache:
```bash
npx clear-npx-cache
```
