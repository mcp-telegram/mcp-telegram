# Claude Code (CLI)

## 使用二进制文件设置（推荐）

```bash
claude mcp add telegram -s user \
  -e TELEGRAM_API_ID=YOUR_ID \
  -e TELEGRAM_API_HASH=YOUR_HASH \
  -- /path/to/mcp-telegram
```

完成！无需 Node.js。

## 使用 npx（替代方案）

```bash
claude mcp add telegram -s user \
  -e TELEGRAM_API_ID=YOUR_ID \
  -e TELEGRAM_API_HASH=YOUR_HASH \
  -- npx @overpod/mcp-telegram
```

## 登录

```bash
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH ./mcp-telegram-login
```

在 Telegram 中扫描二维码。

## 试试看

```
> 总结我 Telegram 的未读消息
> 在 Telegram 中搜索"项目更新"
> 发送"构建通过 ✅"到 DevOps 群
```
