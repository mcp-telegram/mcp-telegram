# 获取 Telegram API 凭证

使用 MCP Telegram 之前，您需要从 Telegram 获取 **API ID** 和 **API Hash**。免费获取，大约需要 2 分钟。

## 步骤说明

### 1. 访问 my.telegram.org

在浏览器中打开 [my.telegram.org](https://my.telegram.org)，使用手机号登录（包含国家代码，例如 `+8613800138000`）。

### 2. 进入 API Development Tools

登录后，点击 **"API development tools"**。

### 3. 创建应用

填写表单：
- **App title** — 任意名称（例如 "My MCP"）
- **Short name** — 任意（例如 "mymcp"）
- **Platform** — 随意选择（不影响功能）
- **Description** — 留空或填写任意内容

点击 **Create application**。

### 4. 复制凭证

您将看到两个值：
- **App api_id** — 数字，例如 `12345678`
- **App api_hash** — 字符串，例如 `a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4`

保存这些值 — 安装和登录时需要使用。

::: tip
这些凭证用于向 Telegram 标识您的应用。它们**不是**登录凭证 — 您将通过二维码单独进行身份验证。
:::

::: warning
请妥善保管 API 凭证。不要提交到公开仓库。使用环境变量。
:::

## 下一步

→ [安装 MCP Telegram](/zh/getting-started/installation)
