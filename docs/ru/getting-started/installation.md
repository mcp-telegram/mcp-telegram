# Установка

## Готовые бинарники (рекомендуется)

Скачайте один файл — **без Node.js, без npm, без зависимостей**. Просто запустите.

Скачать с [GitHub Releases](https://github.com/overpod/mcp-telegram/releases/latest):

| Платформа | Сервер | Вход |
|-----------|--------|------|
| **macOS ARM64** (Apple Silicon) | `mcp-telegram-darwin-arm64` | `mcp-telegram-login-darwin-arm64` |
| **macOS x64** (Intel) | `mcp-telegram-darwin-x64` | `mcp-telegram-login-darwin-x64` |
| **Linux x64** | `mcp-telegram-linux-x64` | `mcp-telegram-login-linux-x64` |
| **Linux ARM64** | `mcp-telegram-linux-arm64` | `mcp-telegram-login-linux-arm64` |
| **Windows x64** | `mcp-telegram-windows-x64.exe` | `mcp-telegram-login-windows-x64.exe` |

::: code-group
```bash [macOS (Apple Silicon)]
curl -L -o mcp-telegram https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-darwin-arm64
curl -L -o mcp-telegram-login https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-login-darwin-arm64
chmod +x mcp-telegram mcp-telegram-login
```

```bash [macOS (Intel)]
curl -L -o mcp-telegram https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-darwin-x64
curl -L -o mcp-telegram-login https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-login-darwin-x64
chmod +x mcp-telegram mcp-telegram-login
```

```bash [Linux x64]
curl -L -o mcp-telegram https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-linux-x64
curl -L -o mcp-telegram-login https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-login-linux-x64
chmod +x mcp-telegram mcp-telegram-login
```

```bash [Linux ARM64]
curl -L -o mcp-telegram https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-linux-arm64
curl -L -o mcp-telegram-login https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-login-linux-arm64
chmod +x mcp-telegram mcp-telegram-login
```

```powershell [Windows]
# Скачайте с GitHub Releases:
# https://github.com/overpod/mcp-telegram/releases/latest
# Файлы: mcp-telegram-windows-x64.exe, mcp-telegram-login-windows-x64.exe
```
:::

::: tip Почему бинарник?
- Не нужно устанавливать рантайм
- Нет конфликтов версий
- Скопировал файл, запустил — всё
- Те же функции, что и в npm-версии
:::

## npx (альтернатива)

Если у вас уже есть Node.js 18+, можно использовать npx:

```bash
npx @overpod/mcp-telegram login   # вход
npx @overpod/mcp-telegram         # запуск сервера
```

## npm — глобальная установка

```bash
npm install -g @overpod/mcp-telegram
mcp-telegram          # запуск сервера
mcp-telegram login    # QR-вход
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

## Из исходников

```bash
git clone https://github.com/overpod/mcp-telegram.git
cd mcp-telegram
npm install && npm run build
```

## Поддержка прокси

Если Telegram заблокирован:

```bash
# SOCKS5 прокси
TELEGRAM_PROXY_IP=127.0.0.1 \
TELEGRAM_PROXY_PORT=10808 \
./mcp-telegram

# MTProxy
TELEGRAM_PROXY_IP=proxy.example.com \
TELEGRAM_PROXY_PORT=443 \
TELEGRAM_PROXY_SECRET=ee0000...0000 \
./mcp-telegram
```

| Переменная | Описание |
|------------|----------|
| `TELEGRAM_PROXY_IP` | Адрес прокси-сервера |
| `TELEGRAM_PROXY_PORT` | Порт прокси-сервера |
| `TELEGRAM_PROXY_SOCKS_TYPE` | `4` или `5` (по умолчанию: `5`) |
| `TELEGRAM_PROXY_SECRET` | Секрет MTProxy |
| `TELEGRAM_PROXY_USERNAME` | Логин для прокси (опционально) |
| `TELEGRAM_PROXY_PASSWORD` | Пароль для прокси (опционально) |

## Следующий шаг

→ [Вход по QR-коду](/ru/getting-started/login)
