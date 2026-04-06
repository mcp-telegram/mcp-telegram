---
layout: home
hero:
  name: MCP Telegram
  text: 将 AI 连接到 Telegram
  tagline: 59 个工具 — 消息、群组、贴纸、联系人、搜索等。支持 Claude、ChatGPT、Cursor 及任何 MCP 客户端。
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/getting-started/credentials
    - theme: alt
      text: 下载二进制文件
      link: https://github.com/overpod/mcp-telegram/releases/latest
    - theme: alt
      text: 云版本
      link: https://mcp-telegram.com
features:
  - icon: 📦
    title: 单文件，零依赖
    details: 下载一个文件即可运行。无需 Node.js、npm 或包管理器。支持 Linux、macOS 和 Windows。
  - icon: ⚡
    title: MTProto 协议
    details: 通过 GramJS 直接访问 Telegram 原生协议。完整的个人账户功能 — 无机器人限制。
  - icon: 🔧
    title: 59 个工具
    details: 发送消息、搜索聊天、管理群组、发送贴纸、处理联系人、控制隐私 — 全部通过自然语言。
  - icon: 🖥️
    title: 任何 MCP 客户端
    details: 支持 Claude Desktop、Claude Code、ChatGPT、Cursor、VS Code、Mastra 及任何 MCP 兼容客户端。
  - icon: 📱
    title: 二维码登录
    details: 无需手机号。用 Telegram 应用扫描二维码即可。会话在重启后保持。
  - icon: 🔒
    title: 隐私优先
    details: 所有通信直接发送到 Telegram 服务器。无第三方服务。会话以受限权限存储在本地。
---

## 快速开始

从 [GitHub Releases](https://github.com/overpod/mcp-telegram/releases/latest) 下载您平台的二进制文件，获取 [API 凭证](/zh/getting-started/credentials)，然后连接：

::: code-group
```bash [macOS (Apple Silicon)]
curl -L -o mcp-telegram https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-darwin-arm64
curl -L -o mcp-telegram-login https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-login-darwin-arm64
chmod +x mcp-telegram mcp-telegram-login
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH ./mcp-telegram-login
```

```bash [macOS (Intel)]
curl -L -o mcp-telegram https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-darwin-x64
curl -L -o mcp-telegram-login https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-login-darwin-x64
chmod +x mcp-telegram mcp-telegram-login
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH ./mcp-telegram-login
```

```bash [Linux x64]
curl -L -o mcp-telegram https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-linux-x64
curl -L -o mcp-telegram-login https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-login-linux-x64
chmod +x mcp-telegram mcp-telegram-login
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH ./mcp-telegram-login
```

```powershell [Windows]
# 从 https://github.com/overpod/mcp-telegram/releases/latest 下载
# mcp-telegram-windows-x64.exe
# mcp-telegram-login-windows-x64.exe
$env:TELEGRAM_API_ID="YOUR_ID"; $env:TELEGRAM_API_HASH="YOUR_HASH"; .\mcp-telegram-login-windows-x64.exe
```
:::

在 Telegram 中扫描二维码（**设置 → 设备 → 连接桌面设备**），然后[添加到 MCP 客户端](/zh/platforms/claude-desktop)。

## 使用示例

连接后，直接用自然语言与 AI 助手对话：

> **你：** 总结我 Telegram 的未读消息

> **你：** 在所有聊天中搜索关于"项目截止日期"的消息

> **你：** 发送"下午3点开会"到工程师群

AI 助手在后台使用 MCP Telegram 工具 — 无需记忆任何命令。

## 不想自建？

使用**[云版本](https://mcp-telegram.com)** — 30 秒内通过二维码连接。无需 API 密钥、终端或配置。
