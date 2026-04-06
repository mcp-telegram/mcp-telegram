# Claude Desktop

## 设置

1. 打开 Claude Desktop 配置文件：
   - **macOS：** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows：** `%APPDATA%\\Claude\\claude_desktop_config.json`

2. 添加 Telegram 服务器：

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

3. **重启 Claude Desktop**（完全退出后重新打开）。

4. 您应该能在 MCP 工具列表中看到 "telegram"（聊天输入框中的 🔧 图标）。

## 登录

可以直接通过 Claude Desktop 登录 — 无需终端：

1. 让 Claude：**"执行 telegram-login"**
2. 将生成二维码。如果图片不可见，它保存在 `~/.mcp-telegram/qr-login.png`
3. 在 Telegram 中扫描（**设置 → 设备 → 连接桌面设备**）
4. 让 Claude：**"执行 telegram-status"** 验证

## 使用二进制文件

```json
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

## 使用 Docker

1. 先[通过终端登录](/zh/getting-started/login)
2. 添加到配置：

```json
{
  "mcpServers": {
    "telegram": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "TELEGRAM_API_ID=YOUR_ID",
        "-e", "TELEGRAM_API_HASH=YOUR_HASH",
        "-v", "~/.mcp-telegram:/root/.mcp-telegram",
        "mcp-telegram"
      ]
    }
  }
}
```

3. 重启 Claude Desktop。

## 试试看

- *"我 Telegram 有什么未读消息？"*
- *"在聊天中搜索关于会议的消息"*
- *"发送'你好'给 @username"*
