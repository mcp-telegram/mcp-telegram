# Cursor / VS Code

## Cursor

1. 打开 **Cursor 设置**
2. 导航到 **MCP** 部分
3. 添加 MCP 服务器：

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

4. 重启 Cursor。

## VS Code

将相同配置添加到 VS Code 的 MCP 设置中。

## 登录

先[通过终端登录](/zh/getting-started/login)。

## 编辑器中的使用场景

- *"检查 #dev 频道是否有人提到了 bug"*
- *"给团队发消息：部署完成"*
- *"在 Telegram 中搜索 API 文档链接"*
