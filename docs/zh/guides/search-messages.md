# 搜索消息

MCP Telegram 提供强大的跨聊天搜索 — 通过关键词在任何聊天中找到任何消息。

## 在特定聊天中搜索

> **你：** 在工程师群中搜索"会议记录"

使用 `telegram-search-messages`，基于 Telegram 服务端搜索（快速，支持百万级消息的聊天）。

## 跨所有聊天搜索

> **你：** 在所有 Telegram 聊天中搜索"发票"

使用 `telegram-search-global` 同时搜索所有聊天。

## 搜索聊天

> **你：** 找到所有关于 AI 的 Telegram 群组

使用 `telegram-search-chats` 按聊天名称搜索。

## 可用搜索工具

| 工具 | 功能 |
|------|------|
| `telegram-search-messages` | 在特定聊天中按关键词搜索 |
| `telegram-search-global` | 跨所有聊天搜索 |
| `telegram-search-chats` | 按名称搜索聊天 |

## 提示

- 搜索在服务端执行 — 即使大型聊天也很快
- 结果包含发送者姓名、日期和消息文本
- 支持大结果集的分页
