# Cursor / VS Code

## Cursor

1. 打开 **Cursor 设置**（macOS：⌘ + ,，Windows/Linux：Ctrl + ,）
2. 导航到 **MCP** 部分
3. 添加新的 MCP 服务器：

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

4. 重启 Cursor。

## VS Code

将相同配置添加到 VS Code 的 MCP 设置中。

## 登录

先[通过终端登录](/zh/getting-started/login)，然后在编辑器中使用 MCP 服务器。

## 编辑器中的使用场景

- *"检查 #dev 频道是否有人提到了 bug"*
- *"给团队发消息：部署完成"*
- *"在 Telegram 中搜索某人分享的 API 文档链接"*
