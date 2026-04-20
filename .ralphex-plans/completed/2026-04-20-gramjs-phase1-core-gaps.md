# GramJS Coverage — Phase 1: Core Gaps

## Overview

Добавить 15 недостающих MCP-инструментов поверх GramJS, чтобы приблизить охват к возможностям обычного Telegram-клиента. Фокус: пробелы в messaging, диалогах, черновиках, админ-функциях групп/каналов, реакциях, поиске и медиа. Без realtime, inline-ботов, stories — они в последующих фазах.

Каждая новая тула:
- Живёт в одном из существующих модулей `src/tools/*.ts` (никаких новых файлов категорий без нужды).
- Добавляет метод в `TelegramService` класс в `src/telegram-client.ts`, если функциональности там ещё нет. Тула — только обёртка.
- Использует `registerTool()` с корректной аннотацией (`READ_ONLY` / `WRITE` / `DESTRUCTIVE`).
- Все текстовые ответы проходят через `sanitize()` (UTF-16 защита).
- Все вызовы GramJS уходят через существующий `RateLimiter` (FLOOD_WAIT retry) — смотри как это сделано в текущих тулах.
- В начале обработчика — `requireConnection()`.
- Именование: `telegram-<kebab-case-action>` (например `telegram-get-scheduled`).

## Context

- Files involved:
  - `src/tools/messages.ts` — инструменты задач 1-6
  - `src/tools/chats.ts` — инструменты задач 7, 12-14
  - `src/tools/reactions.ts` — инструменты задачи 11
  - `src/tools/account.ts` — инструменты задач 8-9
  - `src/tools/media.ts` — инструмент задачи 15
  - `src/telegram-client.ts` — новые методы `TelegramService`
  - `src/tools/shared.ts` — хелперы (не модифицировать сигнатуры)
  - `README.md` — раздел со списком инструментов (обновить после всех Task)
  - `docs/tools/reference.md`, `docs/ru/tools/reference.md`, `docs/zh/tools/reference.md` — справочник инструментов (en/ru/zh — синхронизировать все три)
  - `docs/changelog.md`, `docs/ru/changelog.md`, `docs/zh/changelog.md` — если меняем CHANGELOG.md, синхронизировать

- Related patterns:
  - Look at `telegram-send-message`, `telegram-read-messages`, `telegram-get-profile` как эталон tool-хендлера
  - Look at `TelegramService.sendMessage`, `TelegramService.getMessages`, `TelegramService.getChatInfo` как эталон service-метода
  - GramJS API доступен через `this.client.invoke(new Api.<ns>.<Method>({...}))` или высокоуровневые методы `this.client.sendMessage(...)` — предпочитать высокоуровневые где возможно

- Dependencies:
  - `telegram` (GramJS) уже в deps, ничего ставить не нужно
  - `zod ^4` для схем
  - `@modelcontextprotocol/sdk` — `registerTool` API

## Development Approach

- **Testing approach**: Regular — сначала реализация, потом минимальный тест (mock TelegramService где есть, иначе проверить через typecheck+lint).
- **CRITICAL**: каждая задача должна добавлять валидацию через `pnpm typecheck` и `pnpm lint` — они обязаны проходить перед переходом к следующей задаче.
- **CRITICAL**: НЕ хардкодить счётчик инструментов в описаниях, README, CHANGELOG. Никаких фраз типа "61 tools" или "adds 15 new tools" — писать "new tools" / "additional coverage" без числа.
- **CRITICAL**: НЕ ломать имена существующих тулов и их поведение.
- **CRITICAL**: UTF-16 sanitize для ВСЕХ text-ответов, содержащих пользовательский контент (имена, сообщения, описания чатов).
- **CRITICAL**: tool annotations: READ_ONLY для чтения, WRITE для обычных действий, DESTRUCTIVE для удаления/бана/сброса.
- **CRITICAL**: НЕ добавлять комментарии в коде без нужды. Именование говорит само за себя.
- **CRITICAL**: НЕ коммитить в main напрямую — Ralphex работает в git worktree.
- Complete each task fully before moving to the next.

## Implementation Steps

### Task 1: Scheduled messages — чтение и удаление

**Files:**
- Modify: `src/telegram-client.ts` (новые методы `getScheduledMessages`, `deleteScheduledMessages`)
- Modify: `src/tools/messages.ts` (новые тулы `telegram-get-scheduled`, `telegram-delete-scheduled`)

- [x] Добавить `TelegramService.getScheduledMessages(chatId: string)` используя `Api.messages.GetScheduledHistory` → вернуть массив `{ id, date, text, media? }`
- [x] Добавить `TelegramService.deleteScheduledMessages(chatId: string, messageIds: number[])` используя `Api.messages.DeleteScheduledMessages`
- [x] Зарегистрировать `telegram-get-scheduled` (READ_ONLY) — параметр `chatId`, вывод `[#id] [date] text` через `sanitize()`
- [x] Зарегистрировать `telegram-delete-scheduled` (DESTRUCTIVE) — параметры `chatId`, `messageIds` (array of number)
- [x] Проверить: `pnpm typecheck` — без ошибок
- [x] Проверить: `pnpm lint` — без ошибок

### Task 2: Thread/comments под постом канала

**Files:**
- Modify: `src/telegram-client.ts` (новый метод `getReplies`)
- Modify: `src/tools/messages.ts` (новая тула `telegram-get-replies`)

- [x] Добавить `TelegramService.getReplies(chatId: string, messageId: number, limit: number)` используя `Api.messages.GetReplies` — вернуть массив сообщений в том же формате, что и `getMessages`
- [x] Зарегистрировать `telegram-get-replies` (READ_ONLY) — параметры `chatId`, `messageId`, `limit` (default 20)
- [x] Вывод включает message ID `[#id]`, sender, date, text, реакции (через `formatReactions`), media
- [x] sanitize применён
- [x] Проверить: `pnpm typecheck` + `pnpm lint`

### Task 3: Ссылка t.me на сообщение

**Files:**
- Modify: `src/telegram-client.ts` (новый метод `getMessageLink`)
- Modify: `src/tools/messages.ts` (новая тула `telegram-get-message-link`)

- [x] Добавить `TelegramService.getMessageLink(chatId: string, messageId: number, thread?: boolean)` используя `Api.channels.ExportMessageLink` → вернуть `{ link, html }`
- [x] Зарегистрировать `telegram-get-message-link` (READ_ONLY) — параметры `chatId`, `messageId`, `thread?` (boolean, default false)
- [x] Обработать случай, когда чат не публичный — возвращать понятную ошибку через `fail()`
- [x] Проверить: `pnpm typecheck` + `pnpm lint`

### Task 4: Непрочитанные упоминания и реакции

**Files:**
- Modify: `src/telegram-client.ts` (методы `getUnreadMentions`, `getUnreadReactions`)
- Modify: `src/tools/messages.ts` (тулы `telegram-get-unread-mentions`, `telegram-get-unread-reactions`)

- [x] Добавить `TelegramService.getUnreadMentions(chatId: string, limit: number)` используя `Api.messages.GetUnreadMentions`
- [x] Добавить `TelegramService.getUnreadReactions(chatId: string, limit: number)` используя `Api.messages.GetUnreadReactions`
- [x] Зарегистрировать обе тулы (READ_ONLY), формат вывода как в `telegram-read-messages` — включая реакции
- [x] Проверить: `pnpm typecheck` + `pnpm lint`

### Task 5: Перевод сообщения (Premium)

**Files:**
- Modify: `src/telegram-client.ts` (метод `translateText`)
- Modify: `src/tools/messages.ts` (тула `telegram-translate-message`)

- [x] Добавить `TelegramService.translateText(chatId: string, messageIds: number[], toLang: string)` используя `Api.messages.TranslateText`
- [x] Зарегистрировать `telegram-translate-message` (READ_ONLY) — параметры `chatId`, `messageIds`, `toLang` (ISO 639-1, например "en", "ru")
- [x] Обработать ошибку Premium-требования (вернуть понятный текст через `fail()`)
- [x] Проверить: `pnpm typecheck` + `pnpm lint`

### Task 6: Typing indicator

**Files:**
- Modify: `src/telegram-client.ts` (метод `sendTyping`)
- Modify: `src/tools/messages.ts` (тула `telegram-send-typing`)

- [x] Добавить `TelegramService.sendTyping(chatId: string, action?: "typing"|"upload_photo"|"upload_document"|"cancel")` используя `Api.messages.SetTyping` с соответствующим `SendMessageAction`
- [x] Зарегистрировать `telegram-send-typing` (WRITE) — default action "typing"
- [x] Проверить: `pnpm typecheck` + `pnpm lint`

### Task 7: Архивирование и закрепление диалогов

**Files:**
- Modify: `src/telegram-client.ts` (методы `archiveChat`, `unarchiveChat`, `pinDialog`, `unpinDialog`, `markDialogUnread`)
- Modify: `src/tools/chats.ts` (тулы `telegram-archive-chat`, `telegram-pin-chat`, `telegram-mark-dialog-unread`)

- [x] Добавить `archiveChat(chatId, archive: boolean)` используя `Api.folders.EditPeerFolders` (folderId 1 = archive, 0 = main)
- [x] Добавить `pinDialog(chatId, pin: boolean)` используя `Api.messages.ToggleDialogPin`
- [x] Добавить `markDialogUnread(chatId, unread: boolean)` используя `Api.messages.MarkDialogUnread`
- [x] Зарегистрировать `telegram-archive-chat` (WRITE) — `chatId`, `archive: boolean`
- [x] Зарегистрировать `telegram-pin-chat` (WRITE) — `chatId`, `pin: boolean`
- [x] Зарегистрировать `telegram-mark-dialog-unread` (WRITE) — `chatId`, `unread: boolean`
- [x] Проверить: `pnpm typecheck` + `pnpm lint`

### Task 8: Drafts CRUD

**Files:**
- Modify: `src/telegram-client.ts` (методы `saveDraft`, `getAllDrafts`, `clearAllDrafts`)
- Modify: `src/tools/account.ts` (тулы `telegram-save-draft`, `telegram-get-drafts`, `telegram-clear-drafts`)

- [x] Добавить `saveDraft(chatId: string, text: string, replyTo?: number)` через `Api.messages.SaveDraft` (пустой text = удалить черновик)
- [x] Добавить `getAllDrafts()` через `Api.messages.GetAllDrafts` → массив `{ chatId, chatTitle, text, date }`
- [x] Добавить `clearAllDrafts()` через `Api.messages.ClearAllDrafts`
- [x] Зарегистрировать `telegram-save-draft` (WRITE) — `chatId`, `text`, `replyTo?`
- [x] Зарегистрировать `telegram-get-drafts` (READ_ONLY) — без параметров, список через sanitize()
- [x] Зарегистрировать `telegram-clear-drafts` (DESTRUCTIVE) — без параметров
- [x] Проверить: `pnpm typecheck` + `pnpm lint`

### Task 9: Saved Messages — новые "папки" (Saved Dialogs)

**Files:**
- Modify: `src/telegram-client.ts` (метод `getSavedDialogs`)
- Modify: `src/tools/account.ts` (тула `telegram-get-saved-dialogs`)

- [x] Добавить `getSavedDialogs(limit: number)` через `Api.messages.GetSavedDialogs` → массив `{ peerId, peerTitle, lastMsgId, unreadCount }`
- [x] Зарегистрировать `telegram-get-saved-dialogs` (READ_ONLY) — параметр `limit` (default 20)
- [x] Проверить: `pnpm typecheck` + `pnpm lint`

### Task 10: Админ-лог канала/группы

**Files:**
- Modify: `src/telegram-client.ts` (метод `getAdminLog`)
- Modify: `src/tools/chats.ts` (тула `telegram-get-admin-log`)

- [x] Добавить `getAdminLog(chatId: string, limit: number, q?: string)` используя `Api.channels.GetAdminLog` — для supergroup/channel — вернуть массив `{ id, date, userId, userName, action, details }` где `action` — человекочитаемое имя (например "ban", "edit_title", "pin_message")
- [x] Зарегистрировать `telegram-get-admin-log` (READ_ONLY) — параметры `chatId`, `limit` (default 20), `q?` (текстовый фильтр)
- [x] Проверить: `pnpm typecheck` + `pnpm lint`

### Task 11: Reactions — default, top, recent

**Files:**
- Modify: `src/telegram-client.ts` (методы `setDefaultReaction`, `getTopReactions`, `getRecentReactions`)
- Modify: `src/tools/reactions.ts` (тулы `telegram-set-default-reaction`, `telegram-get-top-reactions`, `telegram-get-recent-reactions`)

- [x] Добавить `setDefaultReaction(emoji: string)` через `Api.messages.SetDefaultReaction`
- [x] Добавить `getTopReactions(limit: number)` через `Api.messages.GetTopReactions` → массив `{ emoji, count? }`
- [x] Добавить `getRecentReactions(limit: number)` через `Api.messages.GetRecentReactions` → аналогично
- [x] Зарегистрировать все три тулы с соответствующими аннотациями (`setDefault` — WRITE, две READ_ONLY)
- [x] Проверить: `pnpm typecheck` + `pnpm lint`

### Task 12: Chat permissions — default banned rights

**Files:**
- Modify: `src/telegram-client.ts` (метод `setChatPermissions`)
- Modify: `src/tools/chats.ts` (тула `telegram-set-chat-permissions`)

- [x] Добавить `setChatPermissions(chatId, permissions: { sendMessages?, sendMedia?, sendStickers?, sendGifs?, sendPolls?, sendInline?, embedLinks?, changeInfo?, inviteUsers?, pinMessages? })` через `Api.messages.EditChatDefaultBannedRights` с правильным `ChatBannedRights`
- [x] Зарегистрировать `telegram-set-chat-permissions` (DESTRUCTIVE) — `chatId` + все пермишены опционально (boolean, true = разрешено, false = запрещено)
- [x] Проверить: `pnpm typecheck` + `pnpm lint`

### Task 13: Slow mode

**Files:**
- Modify: `src/telegram-client.ts` (метод `setSlowMode`)
- Modify: `src/tools/chats.ts` (тула `telegram-set-slow-mode`)

- [x] Добавить `setSlowMode(chatId: string, seconds: number)` через `Api.channels.ToggleSlowMode` — 0 = отключить, допустимые значения (0, 10, 30, 60, 300, 900, 3600)
- [x] Зарегистрировать `telegram-set-slow-mode` (WRITE) — `chatId`, `seconds`
- [x] Проверить: `pnpm typecheck` + `pnpm lint`

### Task 14: Forum topics CRUD

**Files:**
- Modify: `src/telegram-client.ts` (методы `createForumTopic`, `editForumTopic`, `deleteForumTopic`)
- Modify: `src/tools/chats.ts` (тулы `telegram-create-topic`, `telegram-edit-topic`, `telegram-delete-topic`)

- [x] Добавить `createForumTopic(chatId, title, iconColor?, iconEmojiId?)` через `Api.channels.CreateForumTopic` → вернуть `{ id, title }`
- [x] Добавить `editForumTopic(chatId, topicId, title?, iconEmojiId?, closed?, hidden?)` через `Api.channels.EditForumTopic`
- [x] Добавить `deleteForumTopic(chatId, topicId)` через `Api.channels.DeleteTopicHistory`
- [x] Зарегистрировать `telegram-create-topic` (WRITE), `telegram-edit-topic` (WRITE), `telegram-delete-topic` (DESTRUCTIVE)
- [x] Проверить: `pnpm typecheck` + `pnpm lint`

### Task 15: Web-page preview перед отправкой

**Files:**
- Modify: `src/telegram-client.ts` (метод `getWebPreview`)
- Modify: `src/tools/media.ts` (тула `telegram-get-web-preview`)

- [x] Добавить `getWebPreview(url: string)` через `Api.messages.GetWebPagePreview` → вернуть `{ type, url, title?, description?, siteName? }` (обработать случай `WebPageEmpty`)
- [x] Зарегистрировать `telegram-get-web-preview` (READ_ONLY) — параметр `url`
- [x] Проверить: `pnpm typecheck` + `pnpm lint`

### Task 16: Verify acceptance criteria

- [x] `pnpm typecheck` — без ошибок на всём проекте
- [x] `pnpm lint` — без ошибок на всём проекте
- [x] Все новые тулы видны в выводе `registerTools` (запустить `pnpm build` и проверить `dist/tools/*.js`)
- [x] Нет регрессий в существующих тулах — они всё ещё экспортируются и работают через те же сигнатуры
- [x] Commit-сообщения следуют паттерну `feat(tools): <краткое описание>` или `feat(messages): ...` per task

### Task 17: Update documentation

- [x] Обновить README.md — добавить новые тулы в раздел списка инструментов (НЕ указывая число — просто добавить строки в соответствующие категории)
- [x] Обновить CHANGELOG.md — новая секция с версией (TBD — финальный bump делает человек, не писать конкретный номер), описать новые тулы по категориям без счётчика
- [x] Синхронизировать `docs/tools/reference.md`, `docs/ru/tools/reference.md`, `docs/zh/tools/reference.md` — добавить описание каждого нового инструмента во все три языка. Китайский/русский перевод может быть идентичен английскому, если переводчик недоступен — оставить TODO-маркер `<!-- TODO: translate -->` рядом с каждой новой секцией
- [x] Синхронизировать `docs/changelog.md` + `docs/ru/changelog.md` + `docs/zh/changelog.md` с CHANGELOG.md
- [x] Переместить этот план в `.ralphex/plans/completed/`
