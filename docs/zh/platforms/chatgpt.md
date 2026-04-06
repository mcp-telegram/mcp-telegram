# ChatGPT

ChatGPT 通过桌面应用支持 MCP 服务器。

## 设置

1. 打开 **ChatGPT Desktop** 设置
2. 导航到 MCP/工具部分
3. 添加 MCP Telegram：

```json
{
  "telegram": {
    "command": "npx",
    "args": ["@overpod/mcp-telegram"],
    "env": {
      "TELEGRAM_API_ID": "YOUR_ID",
      "TELEGRAM_API_HASH": "YOUR_HASH"
    }
  }
}
```

4. 先[通过终端登录](/zh/getting-started/login)
5. 重启 ChatGPT Desktop

## 云版本

最简单的 ChatGPT 设置，使用**[云版本](https://mcp-telegram.com)** — 30 秒内通过二维码连接，无需本地设置。
