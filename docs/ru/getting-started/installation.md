# Установка

Выберите подходящий способ. **npx** — самый простой, без установки, всегда актуальная версия.

## npx (рекомендуется)

Установка не нужна. Просто используйте `npx @overpod/mcp-telegram`:

```bash
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH npx @overpod/mcp-telegram login
```

**Требования:** Node.js 18+

## Глобальная установка

```bash
npm install -g @overpod/mcp-telegram
```

Затем:
```bash
mcp-telegram          # запуск MCP-сервера
mcp-telegram login    # вход по QR-коду
```

## Готовые бинарники (без Node.js)

Скачайте с [GitHub Releases](https://github.com/overpod/mcp-telegram/releases) — самостоятельные исполняемые файлы, Node.js не нужен:

| Платформа | Сервер | Вход |
|-----------|--------|------|
| Linux x64 | `mcp-telegram-linux-x64` | `mcp-telegram-login-linux-x64` |
| Linux ARM64 | `mcp-telegram-linux-arm64` | `mcp-telegram-login-linux-arm64` |
| macOS x64 | `mcp-telegram-darwin-x64` | `mcp-telegram-login-darwin-x64` |
| macOS ARM64 (Apple Silicon) | `mcp-telegram-darwin-arm64` | `mcp-telegram-login-darwin-arm64` |
| Windows x64 | `mcp-telegram-windows-x64.exe` | `mcp-telegram-login-windows-x64.exe` |

```bash
# Пример для Linux x64
curl -L -o mcp-telegram https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-linux-x64
curl -L -o mcp-telegram-login https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-login-linux-x64
chmod +x mcp-telegram mcp-telegram-login
```

## Docker

Сборка образа:
```bash
docker build -t mcp-telegram https://github.com/overpod/mcp-telegram.git
```

Вход (нужен интерактивный терминал):
```bash
docker run -it --rm \
  -e TELEGRAM_API_ID=YOUR_ID \
  -e TELEGRAM_API_HASH=YOUR_HASH \
  -v ~/.mcp-telegram:/root/.mcp-telegram \
  --entrypoint node mcp-telegram dist/qr-login-cli.js
```

Запуск сервера:
```bash
docker run -i --rm \
  -e TELEGRAM_API_ID=YOUR_ID \
  -e TELEGRAM_API_HASH=YOUR_HASH \
  -v ~/.mcp-telegram:/root/.mcp-telegram \
  mcp-telegram
```

::: tip
Вход нужен только один раз. После этого сессия сохраняется в `~/.mcp-telegram` и используется автоматически.
:::

## Из исходников

```bash
git clone https://github.com/overpod/mcp-telegram.git
cd mcp-telegram
npm install && npm run build
```

## Поддержка прокси

Если Telegram заблокирован в вашем регионе или вы работаете в контейнеризированной среде:

```bash
# SOCKS5 прокси
TELEGRAM_PROXY_IP=127.0.0.1 \
TELEGRAM_PROXY_PORT=10808 \
npx @overpod/mcp-telegram

# MTProxy
TELEGRAM_PROXY_IP=proxy.example.com \
TELEGRAM_PROXY_PORT=443 \
TELEGRAM_PROXY_SECRET=ee0000...0000 \
npx @overpod/mcp-telegram
```

| Переменная | Описание |
|------------|----------|
| `TELEGRAM_PROXY_IP` | Адрес прокси-сервера |
| `TELEGRAM_PROXY_PORT` | Порт прокси-сервера |
| `TELEGRAM_PROXY_SOCKS_TYPE` | `4` или `5` (по умолчанию: `5`) |
| `TELEGRAM_PROXY_SECRET` | Секрет MTProxy (включает режим MTProxy) |
| `TELEGRAM_PROXY_USERNAME` | Логин для прокси (опционально) |
| `TELEGRAM_PROXY_PASSWORD` | Пароль для прокси (опционально) |

## Следующий шаг

→ [Вход по QR-коду](/ru/getting-started/login)
