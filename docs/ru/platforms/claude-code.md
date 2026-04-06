# Claude Code (CLI)

## Настройка

Добавьте MCP Telegram одной командой:

```bash
claude mcp add telegram -s user \\
  -e TELEGRAM_API_ID=YOUR_ID \\
  -e TELEGRAM_API_HASH=YOUR_HASH \\
  -- npx @overpod/mcp-telegram
```

Готово! Флаг `-s user` делает его доступным во всех проектах.

## Вход

Если ещё не входили:

```bash
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH npx @overpod/mcp-telegram login
```

Отсканируйте QR-код в Telegram (**Настройки → Устройства → Подключить устройство**).

## Проверка

Попросите Claude: *«Выполни telegram-status»* — должна вернуться информация об аккаунте.

## Попробуйте

```
> Подведи итог непрочитанных сообщений в Telegram
> Найди в Telegram сообщения про обновление проекта
> Отправь «Билд прошёл ✅» в группу DevOps
```
