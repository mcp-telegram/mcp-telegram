# Claude Desktop

## Настройка

1. Откройте конфигурационный файл Claude Desktop:
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%\\Claude\\claude_desktop_config.json`

2. Добавьте сервер Telegram:

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

3. **Перезапустите Claude Desktop** (полностью закройте и откройте).

4. Вы увидите «telegram» в списке MCP-инструментов (иконка 🔧 в поле ввода чата).

## Вход

Можно войти прямо через Claude Desktop — терминал не нужен:

1. Попросите Claude: **«Выполни telegram-login»**
2. Будет сгенерирован QR-код. Если изображение не видно, оно сохранено в `~/.mcp-telegram/qr-login.png`
3. Отсканируйте в Telegram (**Настройки → Устройства → Подключить устройство**)
4. Попросите Claude: **«Выполни telegram-status»** для проверки

## С бинарником вместо npx

```json
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

## С Docker

1. [Войдите через терминал](/ru/getting-started/login)
2. Добавьте в конфиг:

```json
{
  "mcpServers": {
    "telegram": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "TELEGRAM_API_ID=YOUR_ID",
        "-e", "TELEGRAM_API_HASH=YOUR_HASH",
        "-v", "~/.mcp-telegram:/root/.mcp-telegram",
        "mcp-telegram"
      ]
    }
  }
}
```

3. Перезапустите Claude Desktop.

## Попробуйте

- *«Какие у меня непрочитанные сообщения в Telegram?»*
- *«Найди в чатах сообщения про встречу»*
- *«Отправь привет @username»*
