# 安装

## 预编译二进制文件（推荐）

下载独立二进制文件 — **无需 Node.js、npm 或任何依赖**。只需一个文件。

从 [GitHub Releases](https://github.com/overpod/mcp-telegram/releases/latest) 下载：

| 平台 | 服务器 | 登录 |
|------|--------|------|
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
# 从 GitHub Releases 下载：
# https://github.com/overpod/mcp-telegram/releases/latest
# 文件：mcp-telegram-windows-x64.exe, mcp-telegram-login-windows-x64.exe
```
:::

::: tip 为什么选择二进制文件？
- 无需安装运行时
- 无版本冲突
- 复制一个文件，运行 — 就这么简单
- 与 npm 版本功能完全相同
:::

## npx（替代方案）

如果已安装 Node.js 18+，可以使用 npx：

```bash
npx @overpod/mcp-telegram login   # 登录
npx @overpod/mcp-telegram         # 运行服务器
```

## npm 全局安装

```bash
npm install -g @overpod/mcp-telegram
mcp-telegram          # 运行服务器
mcp-telegram login    # 二维码登录
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

## 从源码

```bash
git clone https://github.com/overpod/mcp-telegram.git
cd mcp-telegram
npm install && npm run build
```

## 代理支持

如果 Telegram 被屏蔽：

```bash
# SOCKS5 代理
TELEGRAM_PROXY_IP=127.0.0.1 \
TELEGRAM_PROXY_PORT=10808 \
./mcp-telegram

# MTProxy
TELEGRAM_PROXY_IP=proxy.example.com \
TELEGRAM_PROXY_PORT=443 \
TELEGRAM_PROXY_SECRET=ee0000...0000 \
./mcp-telegram
```

| 变量 | 说明 |
|------|------|
| `TELEGRAM_PROXY_IP` | 代理服务器地址 |
| `TELEGRAM_PROXY_PORT` | 代理服务器端口 |
| `TELEGRAM_PROXY_SOCKS_TYPE` | `4` 或 `5`（默认：`5`） |
| `TELEGRAM_PROXY_SECRET` | MTProxy 密钥 |
| `TELEGRAM_PROXY_USERNAME` | 代理用户名（可选） |
| `TELEGRAM_PROXY_PASSWORD` | 代理密码（可选） |

## 下一步

→ [二维码登录](/zh/getting-started/login)
