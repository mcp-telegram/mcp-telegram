# Список изменений

<VersionBadge version="1.26.0" /> Текущая версия

Все заметные изменения в MCP Telegram. Полные сравнения версий — на [GitHub Releases](https://github.com/mcp-telegram/mcp-telegram/releases).

## 1.26.0 — 2026-04-20 {#v1-26-0}

### Добавлено (29 новых инструментов)

**Phase 2 — админ-переключатели, кастомизация, статистика (8)**
- `telegram-toggle-channel-signatures`, `telegram-toggle-anti-spam`, `telegram-toggle-forum-mode` (при отключении удаляет темы; требует `confirm: true`)
- `telegram-toggle-prehistory-hidden`, `telegram-set-chat-reactions`
- `telegram-approve-join-request`
- `telegram-get-broadcast-stats`, `telegram-get-megagroup-stats`

**Phase 3 — инлайн-боты, кнопки, обновления в реальном времени (7)**
- `telegram-inline-query`, `telegram-inline-query-send`
- `telegram-press-button`, `telegram-get-message-buttons`
- `telegram-get-state`, `telegram-get-updates`, `telegram-get-channel-updates` (курсоры хранит клиент)

**Phase 4 — истории, бусты, Business (8)**
- `telegram-get-all-stories`, `telegram-get-peer-stories`, `telegram-get-stories-by-id`, `telegram-get-story-views`
- `telegram-get-my-boosts`, `telegram-get-boosts-status`, `telegram-get-boosts-list`
- `telegram-get-business-chat-links`

**Phase 4 opt-in (6, по env-флагам)**
- `MCP_TELEGRAM_ENABLE_GROUP_CALLS=1` → `telegram-get-group-call`, `telegram-get-group-call-participants`
- `MCP_TELEGRAM_ENABLE_STARS=1` → `telegram-get-stars-status`, `telegram-get-stars-transactions`
- `MCP_TELEGRAM_ENABLE_QUICK_REPLIES=1` → `telegram-get-quick-replies`, `telegram-get-quick-reply-messages`

## 1.25.0 — 2026-04-20 {#v1-25-0}

### Добавлено
- **Отложенные сообщения** — `telegram-get-scheduled`, `telegram-delete-scheduled`
- **Треды и комментарии** — `telegram-get-replies` для комментариев под постом канала
- **Ссылка на сообщение** — `telegram-get-message-link` возвращает публичную t.me-ссылку
- **Упоминания и непрочитанные реакции** — `telegram-get-unread-mentions`, `telegram-get-unread-reactions`
- **Перевод** — `telegram-translate-message` (нужен Telegram Premium)
- **Индикатор набора** — `telegram-send-typing`
- **Управление диалогами** — `telegram-archive-chat`, `telegram-pin-chat`, `telegram-mark-dialog-unread`
- **Черновики** — `telegram-save-draft`, `telegram-get-drafts`, `telegram-clear-drafts`
- **Saved Messages папки** — `telegram-get-saved-dialogs`
- **Админ-лог** — `telegram-get-admin-log`
- **Каталог реакций** — `telegram-set-default-reaction`, `telegram-get-top-reactions`, `telegram-get-recent-reactions`
- **Права чата и slow mode** — `telegram-set-chat-permissions`, `telegram-set-slow-mode`
- **CRUD топиков форума** — `telegram-create-topic`, `telegram-edit-topic`, `telegram-delete-topic`
- **Превью веб-страницы** — `telegram-get-web-preview`

### Исправлено
- `telegram-set-chat-permissions` теперь сливает новые флаги с текущими `defaultBannedRights` — опущенные флаги сохраняют текущее значение, а не сбрасываются молча
- `telegram-clear-drafts` требует `chatId` или `confirmAllChats: true` для очистки черновиков во всех чатах
- `telegram-get-unread-mentions` / `-reactions` переведены в annotation `WRITE` — эти методы помечают перечисленные элементы прочитанными на сервере
- `telegram-translate-message` переведён в `WRITE`; `toLang` валидируется, `messageIds` ограничен 1–100
- `telegram-delete-scheduled` ограничивает `messageIds` диапазоном 1–100 положительных int
- `telegram-set-default-reaction` валидирует длину emoji (1–8 символов)
- `telegram-get-web-preview` отвергает URL кроме `http(s)` — защита от использования Telegram как SSRF-прокси
- `telegram-send-typing` троттлит не-`cancel` действия до одного раза в 10 с на чат
- `telegram-get-saved-dialogs` больше не возвращает всегда-ноль `unreadCount`
- `telegram-create-topic` берёт ID нового топика из `UpdateNewChannelMessage` (authoritative) и падает явно, если источника нет
- `telegram-save-draft` сбрасывает `replyTo`, когда текст пустой — чтобы не получать `MESSAGE_EMPTY` при очистке черновика

## v1.24.1 <Badge type="tip" text="актуальная" /> {#v1.24.1}
**2026-04-20**

### Изменено
- Зависимости обновлены до последних версий: `@modelcontextprotocol/sdk` 1.29.0, `dotenv` 17.4.2, `@biomejs/biome` 2.4.12, `typescript` 6.0.3, `@types/node` 25.6.0

## v1.24.0 {#v1.24.0}
**2026-04-06**

### Добавлено
- **Стикеры** — 5 новых инструментов (59 всего): `telegram-get-sticker-set`, `telegram-search-sticker-sets`, `telegram-get-installed-stickers`, `telegram-send-sticker`, `telegram-get-recent-stickers`
- **Готовые бинарники** — самостоятельные исполняемые файлы без зависимостей для Linux (x64/ARM64), macOS (x64/ARM64), Windows (x64)
- **Сайт документации** — на VitePress с поддержкой языков (English, Русский, 中文)

## v1.23.0 {#v1.23.0}
**2026-04-05**

### Добавлено
- 11 новых инструментов (22 всего): реакции, редактирование/удаление/пересылка сообщений, чтение, диалоги, информация о чате, отправка файлов, контакты, опросы, топики
- Управление аккаунтом: сессии, приватность, автоудаление, профиль

## v1.22.0 {#v1.22.0}
**2026-04-01**

### Добавлено
- Индикаторы набора текста (10 типов действий)
- Получение сообщения по ID

## v1.21.0 {#v1.21.0}
**2026-04-01**

### Добавлено
- Публичный доступ к GramJS клиенту

## v1.20.0 {#v1.20.0}
**2026-03-31**

### Добавлено
- Автоматическое ограничение запросов с обработкой FLOOD_WAIT
- `send-message` возвращает `messageId`

## v1.19.0 {#v1.19.0}
**2026-03-30**

### Добавлено
- Поддержка Docker
- Неблокирующий запуск
- QR-код сохраняется локально

## v1.18.0 — v1.14.0 {#v1.18.0}
**2026-03-28**

### Добавлено
- Проверка роли в чате
- Резолюция чатов по имени
- Управление группами: приглашение, кик, бан, редактирование
- Создание групп
- SOCKS5 и MTProxy

## v1.13.0 — v1.12.0 {#v1.13.0}
**2026-03-26**

### Изменено
- Рефакторинг инструментов в модульные файлы
- Миграция на `registerTool()` API

## v1.11.0 — v1.9.0 {#v1.11.0}
**2026-03-18 — 2026-03-23**

### Добавлено
- Полная поддержка реакций
- Топики форумов
- Несколько аккаунтов
- Безопасное хранение сессии

## v1.8.0 — v1.5.0 {#v1.8.0}
**2026-03-16 — 2026-03-18**

### Добавлено
- Управление контактами, блокировка, жалобы на спам
- Реакции, отложенные сообщения, опросы
- Безопасное хранение сессии

## v1.4.0 — v1.1.0 {#v1.4.0}
**2026-03-11 — 2026-03-15**

### Добавлено
- Каталоги Glama.ai и Smithery
- Медиа, контакты, профили, пагинация, форвард, удаление

## v1.0.0 {#v1.0.0}
**2026-03-10**

### 🎉 Первый релиз
- MCP-сервер для Telegram userbot
- Чтение и отправка сообщений
- Вход по QR-коду
- Интеграция GramJS/MTProto
