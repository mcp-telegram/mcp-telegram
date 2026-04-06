# Claude Code (CLI)

## 设置

一条命令添加 MCP Telegram：

```bash
claude mcp add telegram -s user \\
  -e TELEGRAM_API_ID=YOUR_ID \\
  -e TELEGRAM_API_HASH=YOUR_HASH \\
  -- npx @overpod/mcp-telegram
```

完成！`-s user` 使其在所有项目中可用。

## 登录

如果尚未登录：

```bash
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH npx @overpod/mcp-telegram login
```

在 Telegram 中扫描二维码（**设置 → 设备 → 连接桌面设备**）。

## 验证

让 Claude：*"执行 telegram-status"* — 应返回您的账户信息。

## 试试看

```
> 总结我 Telegram 的未读消息
> 在 Telegram 中搜索"项目更新"
> 发送"构建通过 ✅"到 DevOps 群
```
