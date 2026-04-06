# Claude Code (CLI)

## Настройка с бинарником (рекомендуется)

```bash
claude mcp add telegram -s user \
  -e TELEGRAM_API_ID=YOUR_ID \
  -e TELEGRAM_API_HASH=YOUR_HASH \
  -- /path/to/mcp-telegram
```

Готово! Node.js не нужен.

## Настройка с npx (альтернатива)

```bash
claude mcp add telegram -s user \
  -e TELEGRAM_API_ID=YOUR_ID \
  -e TELEGRAM_API_HASH=YOUR_HASH \
  -- npx @overpod/mcp-telegram
```

## Вход

```bash
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH ./mcp-telegram-login
```

Отсканируйте QR-код в Telegram (**Настройки → Устройства → Подключить устройство**).

## Попробуйте

```
> Подведи итог непрочитанных сообщений в Telegram
> Найди в Telegram сообщения про обновление проекта
> Отправь «Билд прошёл ✅» в группу DevOps
```
