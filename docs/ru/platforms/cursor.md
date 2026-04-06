# Cursor / VS Code

## Cursor

1. Откройте **Настройки Cursor** (⌘ + , на macOS, Ctrl + , на Windows/Linux)
2. Перейдите в раздел **MCP**
3. Добавьте MCP-сервер:

::: code-group
```json [Бинарник (рекомендуется)]
{
  "telegram": {
    "command": "/path/to/mcp-telegram",
    "env": {
      "TELEGRAM_API_ID": "YOUR_ID",
      "TELEGRAM_API_HASH": "YOUR_HASH"
    }
  }
}
```

```json [npx (нужен Node.js)]
{
  "telegram": {
    "command": "npx",
    "args": ["@overpod/mcp-telegram"],
    "env": {
      "TELEGRAM_API_ID": "YOUR_ID",
      "TELEGRAM_API_HASH": "YOUR_HASH"
    }
  }
}
```
:::

4. Перезапустите Cursor.

## VS Code

Добавьте ту же конфигурацию в настройки MCP вашего VS Code.

## Вход

Сначала [войдите через терминал](/ru/getting-started/login), затем используйте MCP-сервер в редакторе.

## Примеры

- *«Проверь, не писал ли кто о баге в канале #dev»*
- *«Отправь команде: деплой завершён»*
- *«Найди в Telegram ссылку на документацию API»*
