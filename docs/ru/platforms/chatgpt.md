# ChatGPT

ChatGPT поддерживает MCP-серверы через десктопное приложение.

## Настройка

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

Сначала [войдите через терминал](/ru/getting-started/login), затем перезапустите ChatGPT Desktop.

## Облачная версия

Для простейшей настройки — **[облачная версия](https://mcp-telegram.com)**: подключитесь по QR-коду за 30 секунд.
