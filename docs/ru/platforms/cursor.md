# Cursor / VS Code

## Cursor

1. Откройте **Настройки Cursor** (⌘ + , на macOS, Ctrl + , на Windows/Linux)
2. Перейдите в раздел **MCP**
3. Добавьте новый MCP-сервер:

```json
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

4. Перезапустите Cursor.

## VS Code

Добавьте ту же конфигурацию в настройки MCP вашего VS Code.

## Вход

Сначала [войдите через терминал](/ru/getting-started/login), затем используйте MCP-сервер в редакторе.

## Примеры использования

- *«Проверь, не писал ли кто-нибудь о баге в канале #dev»*
- *«Отправь команде сообщение: деплой завершён»*
- *«Найди в Telegram ссылку на документацию API, которую кто-то кидал»*
