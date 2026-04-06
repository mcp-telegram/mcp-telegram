# ChatGPT

ChatGPT поддерживает MCP-серверы через десктопное приложение.

## Настройка

1. Откройте настройки **ChatGPT Desktop**
2. Перейдите в раздел MCP/инструменты
3. Добавьте MCP Telegram:

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

4. Сначала [войдите через терминал](/ru/getting-started/login)
5. Перезапустите ChatGPT Desktop

## Облачная версия

Для простейшей настройки используйте **[облачную версию](https://mcp-telegram.com)** — подключитесь по QR-коду за 30 секунд, без локальной установки.
