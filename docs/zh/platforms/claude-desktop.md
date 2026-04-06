# Claude Desktop

## 使用二进制文件设置（推荐）

1. [下载二进制文件](/zh/getting-started/installation)。

2. 打开 Claude Desktop 配置文件：
   - **macOS：** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows：** `%APPDATA%\Claude\claude_desktop_config.json`

3. 添加 Telegram 服务器（使用二进制文件的完整路径）：

::: code-group
```json [macOS / Linux]
{
  "mcpServers": {
    "telegram": {
      "command": "/path/to/mcp-telegram",
      "env": {
        "TELEGRAM_API_ID": "YOUR_ID",
        "TELEGRAM_API_HASH": "YOUR_HASH"
      }
    }
  }
}
```

```json [Windows]
{
  "mcpServers": {
    "telegram": {
      "command": "C:\\path\\to\\mcp-telegram-windows-x64.exe",
      "env": {
        "TELEGRAM_API_ID": "YOUR_ID",
        "TELEGRAM_API_HASH": "YOUR_HASH"
      }
    }
  }
}
```
:::

4. **重启 Claude Desktop**。

5. 在 MCP 工具列表中可以看到 "telegram"。

## 登录

直接通过 Claude Desktop 登录：

1. 让 Claude：**"执行 telegram-login"**
2. 如果图片不可见，它保存在 `~/.mcp-telegram/qr-login.png`
3. 在 Telegram 中扫描
4. **"执行 telegram-status"** 验证

## 使用 npx（替代方案）

如果已安装 Node.js 18+：

```json
{
  "mcpServers": {
    "telegram": {
      "command": "npx",
      "args": ["@overpod/mcp-telegram"],
      "env": {
        "TELEGRAM_API_ID": "YOUR_ID",
        "TELEGRAM_API_HASH": "YOUR_HASH"
      }
    }
  }
}
```

## 试试看

- *"我 Telegram 有什么未读消息？"*
- *"在聊天中搜索关于会议的消息"*
- *"发送'你好'给 @username"*
