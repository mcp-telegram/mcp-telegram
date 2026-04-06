# Claude Desktop

## Настройка с бинарником (рекомендуется)

1. [Скачайте бинарник](/ru/getting-started/installation) для вашей платформы.

2. Откройте конфигурационный файл Claude Desktop:
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

3. Добавьте сервер Telegram (укажите полный путь к бинарнику):

::: code-group
```json [macOS / Linux]
{
  "mcpServers": {
    "telegram": {
      "command": "/path/to/mcp-telegram",
      "env": {
        "TELEGRAM_API_ID": "YOUR_ID",
        "TELEGRAM_API_HASH": "YOUR_HASH"
      }
    }
  }
}
```

```json [Windows]
{
  "mcpServers": {
    "telegram": {
      "command": "C:\\path\\to\\mcp-telegram-windows-x64.exe",
      "env": {
        "TELEGRAM_API_ID": "YOUR_ID",
        "TELEGRAM_API_HASH": "YOUR_HASH"
      }
    }
  }
}
```
:::

4. **Перезапустите Claude Desktop**.

5. Вы увидите «telegram» в списке MCP-инструментов (🔧 в поле ввода).

## Вход

Можно войти прямо через Claude Desktop:

1. Попросите Claude: **«Выполни telegram-login»**
2. Если QR-код не видно — он сохранён в `~/.mcp-telegram/qr-login.png`
3. Отсканируйте в Telegram (**Настройки → Устройства → Подключить устройство**)
4. **«Выполни telegram-status»** для проверки

## Настройка с npx (альтернатива)

Если у вас есть Node.js 18+:

```json
{
  "mcpServers": {
    "telegram": {
      "command": "npx",
      "args": ["@overpod/mcp-telegram"],
      "env": {
        "TELEGRAM_API_ID": "YOUR_ID",
        "TELEGRAM_API_HASH": "YOUR_HASH"
      }
    }
  }
}
```

## Попробуйте

- *«Какие у меня непрочитанные сообщения в Telegram?»*
- *«Найди в чатах сообщения про встречу»*
- *«Отправь привет @username»*
