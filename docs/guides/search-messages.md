# Search Messages

MCP Telegram provides powerful search across your chats — find any message, in any chat, by keyword.

## Search in a Specific Chat

> **You:** Search for "meeting notes" in the Engineering group

Uses `telegram-search-messages` with server-side Telegram search (fast, works on chats with millions of messages).

## Search Across All Chats

> **You:** Search all my Telegram chats for "invoice"

Uses `telegram-search-global` to search across every chat at once.

## Find Specific Chats

> **You:** Find all my Telegram groups about AI

Uses `telegram-search-chats` to search by chat name/description.

## Available Search Tools

| Tool | What It Does |
|------|-------------|
| `telegram-search-messages` | Search within a specific chat by keyword |
| `telegram-search-global` | Search across all chats at once |
| `telegram-search-chats` | Find chats by name |

## Tips

- Search is server-side — it's fast even for large chats
- Results include sender name, date, and message text
- Pagination is supported for large result sets
- You can combine with reading: *"Find the last message about 'release' in DevOps and show me the context around it"*
