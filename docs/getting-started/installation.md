# Installation

Choose the method that works best for you. **npx** is the easiest — zero install, always up to date.

## npx (Recommended)

No installation needed. Just use `npx @overpod/mcp-telegram` directly:

```bash
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH npx @overpod/mcp-telegram login
```

**Requirements:** Node.js 18+

## Global Install

```bash
npm install -g @overpod/mcp-telegram
```

Then run:
```bash
mcp-telegram          # start the MCP server
mcp-telegram login    # QR code login
```

## Pre-Built Binary (No Runtime Needed)

Download standalone binaries from [GitHub Releases](https://github.com/overpod/mcp-telegram/releases) — no Node.js required:

| Platform | Server | Login |
|----------|--------|-------|
| Linux x64 | `mcp-telegram-linux-x64` | `mcp-telegram-login-linux-x64` |
| Linux ARM64 | `mcp-telegram-linux-arm64` | `mcp-telegram-login-linux-arm64` |
| macOS x64 | `mcp-telegram-darwin-x64` | `mcp-telegram-login-darwin-x64` |
| macOS ARM64 (Apple Silicon) | `mcp-telegram-darwin-arm64` | `mcp-telegram-login-darwin-arm64` |
| Windows x64 | `mcp-telegram-windows-x64.exe` | `mcp-telegram-login-windows-x64.exe` |

```bash
# Example for Linux x64
curl -L -o mcp-telegram https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-linux-x64
curl -L -o mcp-telegram-login https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-login-linux-x64
chmod +x mcp-telegram mcp-telegram-login
```

## Docker

Build the image:
```bash
docker build -t mcp-telegram https://github.com/overpod/mcp-telegram.git
```

Login (interactive terminal required):
```bash
docker run -it --rm \
  -e TELEGRAM_API_ID=YOUR_ID \
  -e TELEGRAM_API_HASH=YOUR_HASH \
  -v ~/.mcp-telegram:/root/.mcp-telegram \
  --entrypoint node mcp-telegram dist/qr-login-cli.js
```

Run the server:
```bash
docker run -i --rm \
  -e TELEGRAM_API_ID=YOUR_ID \
  -e TELEGRAM_API_HASH=YOUR_HASH \
  -v ~/.mcp-telegram:/root/.mcp-telegram \
  mcp-telegram
```

::: tip
Login must be done once via terminal. After that, the session is persisted in `~/.mcp-telegram` and reused automatically.
:::

## From Source

```bash
git clone https://github.com/overpod/mcp-telegram.git
cd mcp-telegram
npm install && npm run build
```

## Proxy Support

If Telegram is blocked in your region or you're running in a containerized environment:

```bash
# SOCKS5 proxy
TELEGRAM_PROXY_IP=127.0.0.1 \
TELEGRAM_PROXY_PORT=10808 \
npx @overpod/mcp-telegram

# MTProxy
TELEGRAM_PROXY_IP=proxy.example.com \
TELEGRAM_PROXY_PORT=443 \
TELEGRAM_PROXY_SECRET=ee0000...0000 \
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

## Next Step

→ [Login with QR Code](/getting-started/login)
