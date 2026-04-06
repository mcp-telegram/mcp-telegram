# Решение проблем

## AUTH_KEY_DUPLICATED

**Проблема:** Ошибка `AUTH_KEY_DUPLICATED`.

**Причина:** Сессия Telegram может использоваться только **одним процессом одновременно**. Другой процесс уже использует тот же файл сессии.

**Решение:** Создайте отдельные сессии для каждого окружения:

```bash
TELEGRAM_SESSION_PATH=~/.mcp-telegram/session-local npx @overpod/mcp-telegram login
TELEGRAM_SESSION_PATH=~/.mcp-telegram/session-prod npx @overpod/mcp-telegram login
```

## QR-код не отображается

**Проблема:** QR-код не рендерится в терминале или Claude Desktop.

**Решение:**
- QR-код всегда сохраняется в `~/.mcp-telegram/qr-login.png` — откройте вручную
- В терминале: попробуйте другой эмулятор терминала
- В Claude Desktop: попросите Claude указать путь к файлу

## Ошибка подключения

**Возможные причины:**
1. **Telegram заблокирован** в вашем регионе → используйте [прокси](/ru/getting-started/installation#поддержка-прокси)
2. **Файрвол** блокирует исходящие соединения
3. **Неверные API-ключи** → проверьте на [my.telegram.org](https://my.telegram.org)

## Сессия истекла

**Решение:** Войдите заново:
```bash
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH npx @overpod/mcp-telegram login
```

## Инструменты не отображаются

**Чеклист:**
1. Перезапустили MCP-клиент после добавления конфига?
2. JSON конфиг валидный? (частая ошибка: лишняя запятая)
3. Установлен Node.js 18+? (`node --version`)
4. Попробуйте запустить вручную и проверить ошибки

## npx использует старую версию

**Решение:**
```bash
npx @overpod/mcp-telegram@latest
```
