# ChatGPT

ChatGPT 通过桌面应用支持 MCP 服务器。

## 设置

::: code-group
```json [二进制文件（推荐）]
{
  "telegram": {
    "command": "/path/to/mcp-telegram",
    "env": {
      "TELEGRAM_API_ID": "YOUR_ID",
      "TELEGRAM_API_HASH": "YOUR_HASH"
    }
  }
}
```

```json [npx（需要 Node.js）]
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
:::

先[通过终端登录](/zh/getting-started/login)，然后重启 ChatGPT Desktop。

## 云版本

最简单的设置 — **[云版本](https://mcp-telegram.com)**：30 秒内通过二维码连接。
