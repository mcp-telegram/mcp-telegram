# Installation

## Pre-Built Binary (Recommended)

Download a standalone binary — **no Node.js, no npm, no dependencies**. Just one file.

Download from [GitHub Releases](https://github.com/overpod/mcp-telegram/releases/latest):

| Platform | Server | Login |
|----------|--------|-------|
| **macOS ARM64** (Apple Silicon) | `mcp-telegram-darwin-arm64` | `mcp-telegram-login-darwin-arm64` |
| **macOS x64** (Intel) | `mcp-telegram-darwin-x64` | `mcp-telegram-login-darwin-x64` |
| **Linux x64** | `mcp-telegram-linux-x64` | `mcp-telegram-login-linux-x64` |
| **Linux ARM64** | `mcp-telegram-linux-arm64` | `mcp-telegram-login-linux-arm64` |
| **Windows x64** | `mcp-telegram-windows-x64.exe` | `mcp-telegram-login-windows-x64.exe` |

::: code-group
```bash [macOS (Apple Silicon)]
curl -L -o mcp-telegram https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-darwin-arm64
curl -L -o mcp-telegram-login https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-login-darwin-arm64
chmod +x mcp-telegram mcp-telegram-login
```

```bash [macOS (Intel)]
curl -L -o mcp-telegram https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-darwin-x64
curl -L -o mcp-telegram-login https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-login-darwin-x64
chmod +x mcp-telegram mcp-telegram-login
```

```bash [Linux x64]
curl -L -o mcp-telegram https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-linux-x64
curl -L -o mcp-telegram-login https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-login-linux-x64
chmod +x mcp-telegram mcp-telegram-login
```

```bash [Linux ARM64]
curl -L -o mcp-telegram https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-linux-arm64
curl -L -o mcp-telegram-login https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-login-linux-arm64
chmod +x mcp-telegram mcp-telegram-login
```

```powershell [Windows]
# Download from GitHub Releases:
# https://github.com/overpod/mcp-telegram/releases/latest
# Files: mcp-telegram-windows-x64.exe, mcp-telegram-login-windows-x64.exe
```
:::

::: tip Why binary?
- No runtime to install or manage
- No version conflicts
- Copy one file, run it — that's it
- Same features as the npm version
:::

## npx (Alternative)

If you already have Node.js 18+, you can use npx — no install needed:

```bash
npx @overpod/mcp-telegram login   # login
npx @overpod/mcp-telegram         # run server
```

## npm Global Install

```bash
npm install -g @overpod/mcp-telegram
mcp-telegram          # run server
mcp-telegram login    # QR login
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
./mcp-telegram

# MTProxy
TELEGRAM_PROXY_IP=proxy.example.com \
TELEGRAM_PROXY_PORT=443 \
TELEGRAM_PROXY_SECRET=ee0000...0000 \
./mcp-telegram
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
