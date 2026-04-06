# Несколько аккаунтов

Запускайте несколько аккаунтов Telegram параллельно, используя разные пути к сессиям.

## Вход в каждый аккаунт

```bash
# Рабочий аккаунт
TELEGRAM_API_ID=ID1 TELEGRAM_API_HASH=HASH1 \\
  TELEGRAM_SESSION_PATH=~/.mcp-telegram/session-work \\
  npx @overpod/mcp-telegram login

# Личный аккаунт
TELEGRAM_API_ID=ID2 TELEGRAM_API_HASH=HASH2 \\
  TELEGRAM_SESSION_PATH=~/.mcp-telegram/session-personal \\
  npx @overpod/mcp-telegram login
```

## Добавить как отдельные MCP-серверы

### Claude Code

```bash
claude mcp add telegram-work -s user \\
  -e TELEGRAM_API_ID=ID1 \\
  -e TELEGRAM_API_HASH=HASH1 \\
  -e TELEGRAM_SESSION_PATH=~/.mcp-telegram/session-work \\
  -- npx @overpod/mcp-telegram

claude mcp add telegram-personal -s user \\
  -e TELEGRAM_API_ID=ID2 \\
  -e TELEGRAM_API_HASH=HASH2 \\
  -e TELEGRAM_SESSION_PATH=~/.mcp-telegram/session-personal \\
  -- npx @overpod/mcp-telegram
```

### Claude Desktop

```json
{
  "mcpServers": {
    "telegram-work": {
      "command": "npx",
      "args": ["@overpod/mcp-telegram"],
      "env": {
        "TELEGRAM_API_ID": "ID1",
        "TELEGRAM_API_HASH": "HASH1",
        "TELEGRAM_SESSION_PATH": "~/.mcp-telegram/session-work"
      }
    },
    "telegram-personal": {
      "command": "npx",
      "args": ["@overpod/mcp-telegram"],
      "env": {
        "TELEGRAM_API_ID": "ID2",
        "TELEGRAM_API_HASH": "HASH2",
        "TELEGRAM_SESSION_PATH": "~/.mcp-telegram/session-personal"
      }
    }
  }
}
```

Каждый аккаунт получает свой файл сессии — без конфликтов.

::: warning
Сессия может использоваться только **одним процессом одновременно**. Использование одного файла сессии в нескольких процессах вызывает ошибку `AUTH_KEY_DUPLICATED`.
:::
