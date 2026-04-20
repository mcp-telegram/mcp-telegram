# 工具参考

MCP Telegram 提供按类别组织的完整工具集。所有工具通过 MCP 自动发现。

## 认证

| 工具 | 说明 |
|------|------|
| `telegram-status` | 检查连接状态和账户信息 |
| `telegram-login` | 生成认证二维码 |

## 消息

| 工具 | 说明 |
|------|------|
| `telegram-send-message` | 发送消息到任何聊天 |
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

---

::: tip
无需记忆这些工具。用自然语言描述您的需求 — AI 助手会自动选择合适的工具。
:::
