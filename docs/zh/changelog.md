# 更新日志

<VersionBadge version="1.26.0" /> 当前版本

MCP Telegram 的所有重要更改。完整版本对比见 [GitHub Releases](https://github.com/mcp-telegram/mcp-telegram/releases)。

## 1.26.0 — 2026-04-20 {#v1-26-0}

### 新增（29 个新工具）

**Phase 2 — 管理员开关、定制、统计（8 个）**
- `telegram-toggle-channel-signatures`、`telegram-toggle-anti-spam`、`telegram-toggle-forum-mode`（禁用会删除所有主题，需 `confirm: true`）
- `telegram-toggle-prehistory-hidden`、`telegram-set-chat-reactions`
- `telegram-approve-join-request`
- `telegram-get-broadcast-stats`、`telegram-get-megagroup-stats`

**Phase 3 — 内联机器人、按钮、实时更新（7 个）**
- `telegram-inline-query`、`telegram-inline-query-send`
- `telegram-press-button`、`telegram-get-message-buttons`
- `telegram-get-state`、`telegram-get-updates`、`telegram-get-channel-updates`（游标由客户端保存）

**Phase 4 — 故事、助推、Business（8 个）**
- `telegram-get-all-stories`、`telegram-get-peer-stories`、`telegram-get-stories-by-id`、`telegram-get-story-views`
- `telegram-get-my-boosts`、`telegram-get-boosts-status`、`telegram-get-boosts-list`
- `telegram-get-business-chat-links`

**Phase 4 按需启用（6 个，env 门控）**
- `MCP_TELEGRAM_ENABLE_GROUP_CALLS=1` → `telegram-get-group-call`、`telegram-get-group-call-participants`
- `MCP_TELEGRAM_ENABLE_STARS=1` → `telegram-get-stars-status`、`telegram-get-stars-transactions`
- `MCP_TELEGRAM_ENABLE_QUICK_REPLIES=1` → `telegram-get-quick-replies`、`telegram-get-quick-reply-messages`

## 1.25.0 — 2026-04-20 {#v1-25-0}

### 新增
- **定时消息** — `telegram-get-scheduled`、`telegram-delete-scheduled`
- **话题与回复** — `telegram-get-replies`（频道帖子评论）
- **消息链接** — `telegram-get-message-link` 返回公开的 t.me URL
- **提及与未读回应** — `telegram-get-unread-mentions`、`telegram-get-unread-reactions`
- **翻译** — `telegram-translate-message`（需要 Telegram Premium）
- **输入状态** — `telegram-send-typing`
- **会话管理** — `telegram-archive-chat`、`telegram-pin-chat`、`telegram-mark-dialog-unread`
- **草稿** — `telegram-save-draft`、`telegram-get-drafts`、`telegram-clear-drafts`
- **Saved Messages 文件夹** — `telegram-get-saved-dialogs`
- **管理员日志** — `telegram-get-admin-log`
- **回应目录** — `telegram-set-default-reaction`、`telegram-get-top-reactions`、`telegram-get-recent-reactions`
- **聊天权限与慢速模式** — `telegram-set-chat-permissions`、`telegram-set-slow-mode`
- **论坛话题 CRUD** — `telegram-create-topic`、`telegram-edit-topic`、`telegram-delete-topic`
- **网页预览** — `telegram-get-web-preview`

### 修复
- `telegram-set-chat-permissions` 现在会与当前的 `defaultBannedRights` 合并 — 未指定的标志保留原值，而非被静默清除
- `telegram-clear-drafts` 需要提供 `chatId` 或 `confirmAllChats: true` 才能清除所有聊天的草稿
- `telegram-get-unread-mentions` / `-reactions` 标注为 `WRITE` — 调用会在服务端将列出的项目标为已读
- `telegram-translate-message` 标注为 `WRITE`；`toLang` 经过校验，`messageIds` 上限 1–100
- `telegram-delete-scheduled` 将 `messageIds` 限制为 1–100 个正整数
- `telegram-set-default-reaction` 校验 emoji 长度（1–8 个字符）
- `telegram-get-web-preview` 拒绝非 `http(s)` URL，防止被用作 SSRF 代理
- `telegram-send-typing` 对非 `cancel` 动作按聊天每 10 秒限流一次
- `telegram-get-saved-dialogs` 不再返回始终为零的 `unreadCount` 字段
- `telegram-create-topic` 从 `UpdateNewChannelMessage` 读取新话题 ID（权威来源），两者都不可用时明确抛错
- `telegram-save-draft` 在文本为空时丢弃 `replyTo`，避免清空草稿时触发 `MESSAGE_EMPTY`

## v1.24.1 <Badge type="tip" text="最新" /> {#v1.24.1}
**2026-04-20**

### 变更
- 依赖升级到最新版本：`@modelcontextprotocol/sdk` 1.29.0、`dotenv` 17.4.2、`@biomejs/biome` 2.4.12、`typescript` 6.0.3、`@types/node` 25.6.0

## v1.24.0 {#v1.24.0}
**2026-04-06**

### 新增
- **贴纸工具** — 5 个新工具（共 59 个）：`telegram-get-sticker-set`、`telegram-search-sticker-sets`、`telegram-get-installed-stickers`、`telegram-send-sticker`、`telegram-get-recent-stickers`
- **预编译二进制文件** — 零依赖独立可执行文件，支持 Linux (x64/ARM64)、macOS (x64/ARM64)、Windows (x64)
- **文档网站** — 基于 VitePress，支持多语言（English、Русский、中文）

## v1.23.0 {#v1.23.0}
**2026-04-05**

### 新增
- 11 个新工具（共 22 个）：回应、编辑/删除/转发消息、标记已读、对话、聊天信息、发送文件、添加联系人、创建投票、管理话题
- 账户管理：会话、隐私、自动删除、个人资料

## v1.22.0 {#v1.22.0}
**2026-04-01**

### 新增
- 输入指示器（10 种操作类型）
- 按 ID 获取消息

## v1.21.0 — v1.20.0 {#v1.21.0}
**2026-03-31 — 2026-04-01**

### 新增
- GramJS 客户端公开访问器
- 自动限流与 FLOOD_WAIT 处理
- `send-message` 返回 `messageId`

## v1.19.0 {#v1.19.0}
**2026-03-30**

### 新增
- Docker 支持
- 非阻塞启动
- 本地 QR 码备用方案

## v1.18.0 — v1.14.0 {#v1.18.0}
**2026-03-28**

### 新增
- 群组管理：邀请、踢出、封禁、编辑
- 创建群组
- SOCKS5 和 MTProxy 支持
- 按显示名称解析聊天

## v1.13.0 — v1.9.0 {#v1.13.0}
**2026-03-18 — 2026-03-26**

### 新增/变更
- 工具重构为模块化文件
- 完整回应支持
- 论坛话题
- 多账户支持
- 安全会话存储

## v1.8.0 — v1.5.0 {#v1.8.0}
**2026-03-16 — 2026-03-18**

### 新增
- 联系人管理、屏蔽、举报
- 回应、定时消息、投票

## v1.4.0 — v1.1.0 {#v1.4.0}
**2026-03-11 — 2026-03-15**

### 新增
- Glama.ai 和 Smithery 目录
- 媒体、联系人、个人资料、分页、转发、删除

## v1.0.0 {#v1.0.0}
**2026-03-10**

### 🎉 首次发布
- Telegram userbot MCP 服务器
- 消息读取和发送
- 二维码登录
- GramJS/MTProto 集成
