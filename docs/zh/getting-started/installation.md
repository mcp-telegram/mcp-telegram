# 安装

选择最适合您的方式。**npx** 最简单 — 零安装，始终保持最新。

## npx（推荐）

无需安装。直接使用 `npx @overpod/mcp-telegram`：

```bash
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH npx @overpod/mcp-telegram login
```

**要求：** Node.js 18+

## 全局安装

```bash
npm install -g @overpod/mcp-telegram
```

然后运行：
```bash
mcp-telegram          # 启动 MCP 服务器
mcp-telegram login    # 二维码登录
```

## 预编译二进制文件（无需运行时）

从 [GitHub Releases](https://github.com/overpod/mcp-telegram/releases) 下载独立二进制文件 — 无需 Node.js：

| 平台 | 服务器 | 登录 |
|------|--------|------|
| Linux x64 | `mcp-telegram-linux-x64` | `mcp-telegram-login-linux-x64` |
| Linux ARM64 | `mcp-telegram-linux-arm64` | `mcp-telegram-login-linux-arm64` |
| macOS x64 | `mcp-telegram-darwin-x64` | `mcp-telegram-login-darwin-x64` |
| macOS ARM64 (Apple Silicon) | `mcp-telegram-darwin-arm64` | `mcp-telegram-login-darwin-arm64` |
| Windows x64 | `mcp-telegram-windows-x64.exe` | `mcp-telegram-login-windows-x64.exe` |

```bash
# Linux x64 示例
curl -L -o mcp-telegram https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-linux-x64
curl -L -o mcp-telegram-login https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-login-linux-x64
chmod +x mcp-telegram mcp-telegram-login
```

## Docker

构建镜像：
```bash
docker build -t mcp-telegram https://github.com/overpod/mcp-telegram.git
```

登录（需要交互式终端）：
```bash
docker run -it --rm \
  -e TELEGRAM_API_ID=YOUR_ID \
  -e TELEGRAM_API_HASH=YOUR_HASH \
  -v ~/.mcp-telegram:/root/.mcp-telegram \
  --entrypoint node mcp-telegram dist/qr-login-cli.js
```

运行服务器：
```bash
docker run -i --rm \
  -e TELEGRAM_API_ID=YOUR_ID \
  -e TELEGRAM_API_HASH=YOUR_HASH \
  -v ~/.mcp-telegram:/root/.mcp-telegram \
  mcp-telegram
```

::: tip
登录只需一次。之后会话保存在 `~/.mcp-telegram` 中并自动复用。
:::

## 从源码

```bash
git clone https://github.com/overpod/mcp-telegram.git
cd mcp-telegram
npm install && npm run build
```

## 代理支持

如果您所在地区屏蔽了 Telegram 或在容器化环境中运行：

```bash
# SOCKS5 代理
TELEGRAM_PROXY_IP=127.0.0.1 \
TELEGRAM_PROXY_PORT=10808 \
npx @overpod/mcp-telegram

# MTProxy
TELEGRAM_PROXY_IP=proxy.example.com \
TELEGRAM_PROXY_PORT=443 \
TELEGRAM_PROXY_SECRET=ee0000...0000 \
npx @overpod/mcp-telegram
```

| 变量 | 说明 |
|------|------|
| `TELEGRAM_PROXY_IP` | 代理服务器地址 |
| `TELEGRAM_PROXY_PORT` | 代理服务器端口 |
| `TELEGRAM_PROXY_SOCKS_TYPE` | `4` 或 `5`（默认：`5`） |
| `TELEGRAM_PROXY_SECRET` | MTProxy 密钥（启用 MTProxy 模式） |
| `TELEGRAM_PROXY_USERNAME` | 代理认证用户名（可选） |
| `TELEGRAM_PROXY_PASSWORD` | 代理认证密码（可选） |

## 下一步

→ [二维码登录](/zh/getting-started/login)
