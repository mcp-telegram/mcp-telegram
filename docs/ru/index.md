---
layout: home
hero:
  name: MCP Telegram
  text: Подключите ИИ к Telegram
  tagline: 59 инструментов — сообщения, группы, стикеры, контакты, поиск и многое другое. Работает с Claude, ChatGPT, Cursor и любым MCP-клиентом.
  actions:
    - theme: brand
      text: Начать
      link: /ru/getting-started/credentials
    - theme: alt
      text: Скачать бинарник
      link: https://github.com/overpod/mcp-telegram/releases/latest
    - theme: alt
      text: Облачная версия
      link: https://mcp-telegram.com
features:
  - icon: 📦
    title: Один файл, ноль зависимостей
    details: Скачайте один файл и запустите. Без Node.js, без npm, без пакетных менеджеров. Работает на Linux, macOS и Windows.
  - icon: ⚡
    title: MTProto, не Bot API
    details: Прямой доступ к нативному протоколу Telegram через GramJS. Полная мощь реального аккаунта — без ограничений ботов.
  - icon: 🔧
    title: 59 инструментов
    details: Отправка сообщений, поиск по чатам, управление группами, стикеры, контакты, приватность — всё через естественный язык.
  - icon: 🖥️
    title: Любой MCP-клиент
    details: Работает с Claude Desktop, Claude Code, ChatGPT, Cursor, VS Code, Mastra и любым MCP-совместимым клиентом.
  - icon: 📱
    title: Вход по QR-коду
    details: Номер телефона не нужен. Отсканируйте QR-код в приложении Telegram — и готово. Сессия сохраняется между перезапусками.
  - icon: 🔒
    title: Приватность
    details: Все данные идут напрямую на серверы Telegram. Никаких сторонних сервисов. Сессия хранится локально с ограниченными правами.
---

## Быстрый старт

Скачайте бинарник для вашей платформы с [GitHub Releases](https://github.com/overpod/mcp-telegram/releases/latest), получите [API-ключи](/ru/getting-started/credentials) и подключайтесь:

::: code-group
```bash [macOS (Apple Silicon)]
curl -L -o mcp-telegram https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-darwin-arm64
curl -L -o mcp-telegram-login https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-login-darwin-arm64
chmod +x mcp-telegram mcp-telegram-login
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH ./mcp-telegram-login
```

```bash [macOS (Intel)]
curl -L -o mcp-telegram https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-darwin-x64
curl -L -o mcp-telegram-login https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-login-darwin-x64
chmod +x mcp-telegram mcp-telegram-login
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH ./mcp-telegram-login
```

```bash [Linux x64]
curl -L -o mcp-telegram https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-linux-x64
curl -L -o mcp-telegram-login https://github.com/overpod/mcp-telegram/releases/latest/download/mcp-telegram-login-linux-x64
chmod +x mcp-telegram mcp-telegram-login
TELEGRAM_API_ID=YOUR_ID TELEGRAM_API_HASH=YOUR_HASH ./mcp-telegram-login
```

```powershell [Windows]
# Скачайте с https://github.com/overpod/mcp-telegram/releases/latest
# mcp-telegram-windows-x64.exe
# mcp-telegram-login-windows-x64.exe
$env:TELEGRAM_API_ID="YOUR_ID"; $env:TELEGRAM_API_HASH="YOUR_HASH"; .\mcp-telegram-login-windows-x64.exe
```
:::

Отсканируйте QR-код в Telegram (**Настройки → Устройства → Подключить устройство**), затем [добавьте в MCP-клиент](/ru/platforms/claude-desktop).

## Пример

После подключения просто говорите с ИИ-ассистентом:

> **Вы:** Подведи итог моих непрочитанных сообщений в Telegram

> **Вы:** Найди во всех чатах сообщения про «дедлайн проекта»

> **Вы:** Отправь «Встреча в 15:00» в группу Инженеры

ИИ-ассистент использует инструменты MCP Telegram за кулисами — запоминать команды не нужно.

## Не хотите устанавливать?

Используйте **[облачную версию](https://mcp-telegram.com)** — подключите Telegram к Claude.ai или ChatGPT за 30 секунд по QR-коду. Без API-ключей, без терминала, без настройки.
