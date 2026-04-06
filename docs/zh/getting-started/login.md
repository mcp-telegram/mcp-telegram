# 二维码登录

MCP Telegram 使用**二维码认证** — 无需手机号。

## 使用二进制文件登录

```bash
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH ./mcp-telegram-login
```

终端将显示二维码：

1. 打开手机上的 **Telegram**
2. 进入 **设置 → 设备 → 连接桌面设备**
3. 扫描二维码

会话保存在 `~/.mcp-telegram/session`，自动复用。只需登录一次。

## 使用 npx 登录

```bash
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH npx @overpod/mcp-telegram login
```

## 通过 Claude Desktop 登录

无需终端：

1. 将 MCP 服务器添加到配置（见 [Claude Desktop 设置](/zh/platforms/claude-desktop)）
2. 重启 Claude Desktop
3. 让 Claude：**"执行 telegram-login"**
4. 将生成二维码图片
5. 如果图片不可见，它保存在 `~/.mcp-telegram/qr-login.png`
6. 在 Telegram 中扫描（**设置 → 设备 → 连接桌面设备**）

## 验证连接

登录后，让助手执行 `telegram-status` 验证。

## 自定义会话路径

```bash
TELEGRAM_SESSION_PATH=/path/to/session ./mcp-telegram-login
```

在[使用多个账户](/zh/guides/multiple-accounts)时很有用。

## 会话安全

- 会话文件权限为 `0600`（仅所有者可访问）
- 会话目录权限为 `0700`
- 会话提供完全访问权限 — 请像对待密码一样保管
- 每个进程一个会话 — 多进程使用同一会话导致 `AUTH_KEY_DUPLICATED` 错误

## 下一步

→ 设置 MCP 客户端：[Claude Desktop](/zh/platforms/claude-desktop) · [Claude Code](/zh/platforms/claude-code) · [Cursor](/zh/platforms/cursor)
