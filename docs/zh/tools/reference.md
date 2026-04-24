# 工具参考

MCP Telegram 提供按类别组织的完整工具集。所有工具通过 MCP 自动发现。

## 认证

| 工具 | 说明 |
|------|------|
| `telegram-status` | 检查连接状态和账户信息 |
| `telegram-login` | 生成认证二维码 |
| `telegram-logout` | 撤销 Telegram 服务器上的会话并删除本地会话文件 |

## 消息

| 工具 | 说明 |
|------|------|
| `telegram-send-message` | 发送消息到任何聊天（支持 `quoteText` 引用原消息片段，以及 Premium `effect` 动画特效） |
| `telegram-edit-message` | 编辑已发送的消息 |
| `telegram-delete-message` | 删除消息 |
| `telegram-forward-message` | 转发消息 |
| `telegram-send-scheduled` | 定时发送消息 |
| `telegram-send-typing` | 发送"正在输入"/上传操作指示 |
| `telegram-translate-message` | 翻译一条或多条消息（需 Premium；会消耗翻译配额） |
| `telegram-get-message-link` | 获取消息的公开 t.me 链接 |

## 定时消息

| 工具 | 说明 |
|------|------|
| `telegram-get-scheduled` | 列出聊天中的定时消息 |
| `telegram-delete-scheduled` | 删除一条或多条定时消息 |

## 阅读

| 工具 | 说明 |
|------|------|
| `telegram-list-chats` | 列出聊天（支持过滤） |
| `telegram-read-messages` | 读取最近消息（支持分页） |
| `telegram-search-messages` | 在特定聊天中搜索 |
| `telegram-search-global` | 跨所有聊天搜索 |
| `telegram-search-chats` | 按名称搜索聊天 |
| `telegram-get-unread` | 获取有未读消息的聊天 |
| `telegram-mark-as-read` | 标记为已读 |
| `telegram-get-replies` | 读取频道帖子下的评论/回复 |
| `telegram-get-unread-mentions` | 列出聊天中未读的 @ 提及（会在服务端标为已读） |
| `telegram-get-unread-reactions` | 列出你消息上未读的回应（会在服务端标为已读） |
| `telegram-get-saved-dialogs` | 列出"收藏消息"内的分类文件夹 |

## 草稿

| 工具 | 说明 |
|------|------|
| `telegram-save-draft` | 在聊天中保存文本草稿（为空则删除） |
| `telegram-get-drafts` | 列出所有含草稿的聊天 |
| `telegram-clear-drafts` | 清除单个聊天的草稿，或全账号清除（需 `confirmAllChats: true`） |

## 论坛话题

| 工具 | 说明 |
|------|------|
| `telegram-list-topics` | 列出论坛话题 |
| `telegram-read-topic-messages` | 读取特定话题的消息 |
| `telegram-create-topic` | 新建话题 |
| `telegram-edit-topic` | 重命名、关闭、隐藏或更新话题 |
| `telegram-delete-topic` | 删除话题及其历史 |

## 投票

| 工具 | 说明 |
|------|------|
| `telegram-create-poll` | 创建投票或测验 |

## 回应

| 工具 | 说明 |
|------|------|
| `telegram-send-reaction` | 给消息添加表情回应 |
| `telegram-get-reactions` | 获取消息的回应 |
| `telegram-set-default-reaction` | 设置账户默认快捷回应表情 |
| `telegram-get-top-reactions` | 获取 Telegram 热门回应表情 |
| `telegram-get-recent-reactions` | 获取最近使用过的回应表情 |

## 贴纸

| 工具 | 说明 |
|------|------|
| `telegram-send-sticker` | 发送贴纸 |
| `telegram-get-installed-stickers` | 已安装的贴纸包列表 |
| `telegram-get-recent-stickers` | 最近使用的贴纸 |
| `telegram-get-sticker-set` | 浏览贴纸包 |
| `telegram-search-sticker-sets` | 搜索贴纸包 |

## 媒体

| 工具 | 说明 |
|------|------|
| `telegram-send-file` | 发送文件、图片或文档 |
| `telegram-download-media` | 下载消息中的媒体 |
| `telegram-get-profile-photo` | 获取头像 |
| `telegram-get-web-preview` | 发送前预览链接的标题/描述/站点 |

## 富媒体发送 (v1.29.0)

| 工具 | 说明 |
|------|------|
| `telegram-send-voice` | 发送语音消息（推荐 OGG/Opus），显示为波形 UI |
| `telegram-send-video-note` | 发送圆形视频消息（MP4，建议正方形，≤60 秒） |
| `telegram-send-location` | 发送地理位置；设置 `livePeriod`（60–86400 秒）以发送实时位置 |
| `telegram-send-venue` | 发送场所卡片（标题、地址、经纬度） |
| `telegram-send-contact` | 发送联系人卡片（手机号、姓名、可选 vCard） |
| `telegram-send-dice` | 发送动画骰子/游戏表情（🎲🎯🎰🏀⚽🎳），返回服务器判定的点数 |
| `telegram-send-album` | 发送 2–10 张图片/视频组成的相册 |

所有 `filePath` 必须为绝对本地文件路径。URL、UNC 共享、路径穿越（`..`）以及 POSIX 伪文件系统（`/proc`、`/sys`、`/dev`、`/run`）将被拒绝。

## 群组

| 工具 | 说明 |
|------|------|
| `telegram-create-group` | 创建群组 |
| `telegram-edit-group` | 编辑标题、描述、头像 |
| `telegram-invite-to-group` | 邀请用户 |
| `telegram-join-chat` | 通过邀请链接加入 |
| `telegram-leave-group` | 离开群组 |
| `telegram-kick-user` | 踢出用户 |
| `telegram-ban-user` | 封禁用户 |
| `telegram-unban-user` | 解除封禁 |
| `telegram-set-admin` | 设为管理员 |
| `telegram-remove-admin` | 撤销管理员 |
| `telegram-get-my-role` | 查看自己的角色和权限 |
| `telegram-set-chat-permissions` | 为所有成员设置默认权限（未指定的标志保留当前值） |
| `telegram-set-slow-mode` | 为超级群组设置慢速模式间隔 |
| `telegram-get-admin-log` | 查看管理员/审核事件日志 |

## 聊天信息

| 工具 | 说明 |
|------|------|
| `telegram-get-chat-info` | 获取聊天详情 |
| `telegram-get-chat-members` | 列出群组/频道成员 |
| `telegram-get-chat-folders` | 列出聊天文件夹 |

## 邀请链接

| 工具 | 说明 |
|------|------|
| `telegram-create-invite-link` | 创建邀请链接 |
| `telegram-get-invite-links` | 列出现有链接 |
| `telegram-revoke-invite-link` | 撤销链接 |

## 联系人

| 工具 | 说明 |
|------|------|
| `telegram-get-contacts` | 联系人列表 |
| `telegram-add-contact` | 添加联系人 |
| `telegram-get-contact-requests` | 查看待处理的联系请求 |

## 审核

| 工具 | 说明 |
|------|------|
| `telegram-block-user` | 屏蔽用户 |
| `telegram-unblock-user` | 取消屏蔽 |
| `telegram-report-spam` | 举报垃圾信息 |

## 个人资料

| 工具 | 说明 |
|------|------|
| `telegram-get-profile` | 获取用户资料 |
| `telegram-update-profile` | 更新自己的资料（姓名、简介、用户名） |

## 账户

| 工具 | 说明 |
|------|------|
| `telegram-get-sessions` | 列出活跃会话（设备） |
| `telegram-terminate-session` | 终止会话 |
| `telegram-set-privacy` | 配置隐私设置 |
| `telegram-set-auto-delete` | 设置消息自动删除计时器 |

## 置顶

| 工具 | 说明 |
|------|------|
| `telegram-pin-message` | 置顶消息 |
| `telegram-unpin-message` | 取消置顶 |

## 聊天设置

| 工具 | 说明 |
|------|------|
| `telegram-mute-chat` | 静音或取消静音通知 |
| `telegram-archive-chat` | 将会话移入/移出"归档"文件夹 |
| `telegram-pin-chat` | 在会话列表中置顶/取消置顶 |
| `telegram-mark-dialog-unread` | 将会话标记为未读或清除未读标记 |

## 管理员开关与定制

| 工具 | 说明 |
|------|------|
| `telegram-toggle-channel-signatures` | 切换频道帖子的签名 |
| `telegram-toggle-anti-spam` | 切换超级群组内置反垃圾（需 `ban_users` 权限） |
| `telegram-toggle-forum-mode` | 启用/禁用论坛模式（禁用会删除所有主题；需要 `confirm: true`） |
| `telegram-toggle-prehistory-hidden` | 对新加入的超级群成员隐藏或显示历史消息 |
| `telegram-set-chat-reactions` | 配置会话允许的表情回应（`all` / `some` / `none`） |
| `telegram-approve-join-request` | 批准或拒绝加入请求 |

## 统计

| 工具 | 说明 |
|------|------|
| `telegram-get-broadcast-stats` | 获取频道统计（`includeGraphs: true` 返回原始图表数据；可能需要 Premium 管理员） |
| `telegram-get-megagroup-stats` | 获取超级群统计（Telegram 限制每个频道约 30 分钟 1 次） |

## 内联机器人与按钮

| 工具 | 说明 |
|------|------|
| `telegram-inline-query` | 在会话上下文中向内联机器人发起查询（queryId 有效期 ≈ 1 分钟） |
| `telegram-inline-query-send` | 根据 queryId + 结果 id 发送内联机器人结果 |
| `telegram-press-button` | 按 row/col 或原始 data 点击消息的回调按钮 |
| `telegram-get-message-buttons` | 列出消息 reply-markup 的按钮、索引和类型 |

## 实时更新（轮询）

游标由客户端保存——Agent 在多次调用之间自行维护 `{pts, qts, date}`。

| 工具 | 说明 |
|------|------|
| `telegram-get-state` | 初始化轮询游标（`pts`, `qts`, `date`, `seq`） |
| `telegram-get-updates` | 根据已知游标获取全局更新（`DifferenceTooLong` 时返回历史回退提示） |
| `telegram-get-channel-updates` | 按频道游标获取该频道的更新 |

## 故事（Stories）

| 工具 | 说明 |
|------|------|
| `telegram-get-all-stories` | 跨联系人列出故事并返回分页状态 |
| `telegram-get-peer-stories` | 列出单个 peer 发布的故事 |
| `telegram-get-stories-by-id` | 按 id 获取特定故事 |
| `telegram-get-story-views` | 列出自己故事的查看记录（完整统计需 Premium） |

## 故事写入（v1.30.0）

| 工具 | 说明 |
|------|------|
| `telegram-send-story` | 发布照片或视频故事，支持隐私控制、时长和防转发标志 |
| `telegram-edit-story` | 编辑故事：替换媒体、更新说明或更改隐私设置 |
| `telegram-delete-stories` | 删除一个或多个故事（不可撤销；需 `confirm: true`） |
| `telegram-react-to-story` | 对故事添加表情反应；传 `""` 取消反应 |
| `telegram-export-story-link` | 获取公开故事的 `t.me/…` 分享链接 |
| `telegram-read-stories` | 将故事标记为已查看（直到指定 ID） |
| `telegram-toggle-story-pinned` | 在个人资料中置顶/取消置顶故事 |
| `telegram-toggle-story-pinned-to-top` | 将故事固定到置顶行顶部；传 `[]` 清除 |
| `telegram-activate-stealth-mode` | 隐藏故事查看记录（需要 Telegram Premium） |
| `telegram-get-stories-archive` | 分页获取已过期故事的存档 |
| `telegram-report-story` | 通过多步骤流程举报故事 |

## 讨论组（v1.30.0）

| 工具 | 说明 |
|------|------|
| `telegram-get-discussion-message` | 获取频道帖子的讨论组信息（discussionGroupId、unreadCount 等） |
| `telegram-get-groups-for-discussion` | 列出可链接为频道讨论组的群组 |

## 已读回执（v1.30.0）

| 工具 | 说明 |
|------|------|
| `telegram-get-message-read-participants` | 列出小型群组中读过某条消息的成员（≤100 人，≤7 天） |
| `telegram-get-outbox-read-date` | 获取私聊中对方阅读您发出消息的时间 |

## 助推与 Business

| 工具 | 说明 |
|------|------|
| `telegram-get-my-boosts` | 列出你当前分配的助推槽位 |
| `telegram-get-boosts-status` | 频道/超级群的助推状态 |
| `telegram-get-boosts-list` | 列出频道的助推者（管理员） |
| `telegram-get-business-chat-links` | 列出你的 Telegram Business 会话链接 |

## 按需启用（env 门控）

以下工具仅在对应环境变量启用时注册。

| 工具 | Env 变量 |
|------|---------|
| `telegram-get-group-call` | `MCP_TELEGRAM_ENABLE_GROUP_CALLS=1` |
| `telegram-get-group-call-participants` | `MCP_TELEGRAM_ENABLE_GROUP_CALLS=1` |
| `telegram-get-stars-status` | `MCP_TELEGRAM_ENABLE_STARS=1` |
| `telegram-get-stars-transactions` | `MCP_TELEGRAM_ENABLE_STARS=1` |
| `telegram-get-quick-replies` | `MCP_TELEGRAM_ENABLE_QUICK_REPLIES=1` |
| `telegram-get-quick-reply-messages` | `MCP_TELEGRAM_ENABLE_QUICK_REPLIES=1` |

---

::: tip
无需记忆这些工具。用自然语言描述您的需求 — AI 助手会自动选择合适的工具。
:::
