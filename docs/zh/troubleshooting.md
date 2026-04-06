# 故障排除

## AUTH_KEY_DUPLICATED

**问题：** 出现 `AUTH_KEY_DUPLICATED` 错误。

**原因：** Telegram 会话同一时间只能被**一个进程使用**。另一个进程已在使用相同的会话文件。

**解决：** 为每个环境创建独立会话：

```bash
TELEGRAM_SESSION_PATH=~/.mcp-telegram/session-local npx @overpod/mcp-telegram login
TELEGRAM_SESSION_PATH=~/.mcp-telegram/session-prod npx @overpod/mcp-telegram login
```

## 二维码不显示

**问题：** 二维码在终端或 Claude Desktop 中无法渲染。

**解决：**
- 二维码始终保存在 `~/.mcp-telegram/qr-login.png` — 手动打开
- 终端中：尝试其他终端模拟器
- Claude Desktop：让 Claude 告诉您文件路径

## 连接超时

**可能原因：**
1. **Telegram 被屏蔽** → 使用[代理](/zh/getting-started/installation#代理支持)
2. **防火墙**阻止出站连接
3. **API 凭证无效** → 在 [my.telegram.org](https://my.telegram.org) 检查

## 会话过期

**解决：** 重新登录：
```bash
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH npx @overpod/mcp-telegram login
```

## 工具不显示

**检查清单：**
1. 添加配置后重启了 MCP 客户端？
2. JSON 配置有效？（常见错误：多余的逗号）
3. 安装了 Node.js 18+？（`node --version`）
4. 尝试手动运行检查错误

## npx 使用旧版本

**解决：**
```bash
npx @overpod/mcp-telegram@latest
```
