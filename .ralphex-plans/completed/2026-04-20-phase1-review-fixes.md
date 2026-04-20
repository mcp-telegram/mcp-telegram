# Phase 1 — Review Fixes

## Overview

Починить замечания из двух code review по ветке `gramjs-phase1-core-gaps`. Все изменения идут в тот же бранч. 4 HIGH-бага блокируют мёрж, 8 MEDIUM — улучшения качества. Всё — в существующих файлах, новых модулей/категорий не добавлять.

## Context

- Files involved:
  - `src/telegram-client.ts` — большая часть фиксов (правки в новых методах phase-1)
  - `src/tools/messages.ts` — аннотации тулов, zod-валидации
  - `src/tools/account.ts` — скоуп `clear-drafts`, валидация черновиков
  - `src/tools/chats.ts` — ничего не должно измениться в публичных именах
  - `src/tools/media.ts` — URL валидация
  - `src/tools/reactions.ts` — emoji валидация
  - `src/__tests__/chat-permissions.test.ts` — новый тест регрессии на merge-flags
  - `src/__tests__/set-chat-permissions-merge.test.ts` — новый файл интеграционного теста

- Related patterns:
  - Существующие методы `TelegramService.setChatPermissions`, `clearAllDrafts`, `getUnreadMentions`, `getUnreadReactions`, `createForumTopic` уже написаны в phase-1 коммитах — найти их и починить на месте
  - Z-валидация: смотреть существующие схемы `telegram-send-message`, `telegram-read-messages` как эталон

- Dependencies: ничего нового ставить не нужно.

## Development Approach

- **Testing approach**: Regular — реализация + тесты.
- **CRITICAL**: `pnpm typecheck` + `pnpm lint` + `pnpm test` должны проходить перед следующей Task.
- **CRITICAL**: не ломать имена существующих тулов и публичные сигнатуры `TelegramService`.
- **CRITICAL**: UTF-16 sanitize на новых text-output путях.
- **CRITICAL**: не добавлять комментарии кроме тех, что объясняют НЕОЧЕВИДНОЕ (например почему `GetUnreadMentions` имеет side effect — это не видно из названия метода GramJS).
- Работаем прямо на ветке `gramjs-phase1-core-gaps` (use_worktree = false на время этого плана).

## Implementation Steps

### Task 1: setChatPermissions — merge-with-existing вместо replace

**Files:**
- Modify: `src/telegram-client.ts` — метод `setChatPermissions`, helper `permissionsToBannedRights`
- Create: `src/__tests__/set-chat-permissions-merge.test.ts`

**Проблема:** текущая реализация строит `new Api.ChatBannedRights({...undefinedKeys})` — omitted flags становятся `false` (= "not banned" = "allowed"), тихо снимая существующие ограничения.

- [x] В `setChatPermissions` ПЕРЕД вызовом `EditChatDefaultBannedRights`: resolve chat → получить текущий `Api.ChatFull` / `Api.ChannelFull` (через `GetFullChat` или `GetFullChannel`) → извлечь текущий `defaultBannedRights`. Если это basic chat где этого поля нет — взять пустой объект. (Реализовано через `entity.defaultBannedRights` — поле живёт на `Api.Channel` / `Api.Chat`, не на ChannelFull.)
- [x] Создать новый `ChatBannedRights`, где для КАЖДОГО флага: если агент указал значение в `permissions` — использовать его (с инверсией allowed→!banned); если НЕ указал — сохранить текущее значение из `defaultBannedRights`.
- [x] Обновить description тулы `telegram-set-chat-permissions` в `src/tools/chats.ts`: "Omitted flags keep their current state". (Описание уже содержало нужный текст.)
- [x] Добавить regression-тест `src/__tests__/set-chat-permissions-merge.test.ts`: замокать `client.invoke` так, чтобы `GetFullChannel` вернул `defaultBannedRights` с `pinMessages: true, inviteUsers: true`. Вызвать `setChatPermissions(chatId, {sendMessages: false})`. Проверить, что вызов `EditChatDefaultBannedRights` содержит `pinMessages: true` и `inviteUsers: true` (не сброшено).
- [x] `pnpm typecheck` + `pnpm lint` + `pnpm test` — без ошибок.

### Task 2: clear-drafts — защита от случайного account-wide wipe

**Files:**
- Modify: `src/telegram-client.ts` — метод `clearAllDrafts` (возможно не трогать — логика может уйти в тулу) / добавить `clearDraftForChat` если удобнее
- Modify: `src/tools/account.ts` — тула `telegram-clear-drafts`

**Проблема:** одной командой агент стирает черновики во ВСЕХ чатах.

- [x] Варианты на выбор (выбрать простейший и применить):
  - **A.** Добавить опциональный `chatId`. Если указан — очистить только этот чат через `SaveDraft({peer, message:""})`. Если не указан — требовать `confirmAllChats: true` (иначе ошибка).
  - **B.** Разбить на две тулы: `telegram-clear-draft` (требует `chatId`) и `telegram-clear-all-drafts` (с `confirmAllChats: true`, без `chatId`).
- [x] Выбрать A (минимум новых имён). В описании явно предупредить: "Without chatId, clears drafts in ALL chats — requires confirmAllChats: true".
- [x] `telegram-clear-drafts` остаётся с annotation `DESTRUCTIVE`.
- [x] `pnpm typecheck` + `pnpm lint` + `pnpm test`.

### Task 3: get-unread-mentions / get-unread-reactions — честные аннотации

**Files:**
- Modify: `src/tools/messages.ts` — тулы `telegram-get-unread-mentions`, `telegram-get-unread-reactions`

**Проблема:** `messages.GetUnreadMentions/Reactions` помечает их прочитанными на сервере → это не READ_ONLY.

- [x] Сменить annotation обеих тул с `READ_ONLY` на `WRITE`.
- [x] В description добавить предложение: "Calling this marks listed mentions/reactions as read on the server."
- [x] `pnpm typecheck` + `pnpm lint` + `pnpm test`.

### Task 4: createForumTopic — правильный источник topicId

**Files:**
- Modify: `src/telegram-client.ts` — метод `createForumTopic`

**Проблема:** код берёт `UpdateMessageID` первым, но authoritative — `UpdateNewChannelMessage.message.id`. При определённых update-порядках возвращает 0.

- [x] Изменить порядок: искать сначала `UpdateNewChannelMessage` в `result.updates[]`, взять `.message.id`.
- [x] Если нет — fallback на `UpdateMessageID` ТОЛЬКО при совпадении `randomId` с тем что отправляли.
- [x] Если и этого нет — выбросить `Error('Failed to determine created topic ID')` (не возвращать 0 тихо).
- [x] `pnpm typecheck` + `pnpm lint` + `pnpm test`.

### Task 5: translate-message — корректная аннотация и валидация toLang

**Files:**
- Modify: `src/tools/messages.ts` — тула `telegram-translate-message`

**Проблема:** аннотация `READ_ONLY` (но жжёт Premium-квоту, это side effect) + `toLang: z.string()` принимает что угодно.

- [x] Сменить annotation на `WRITE`.
- [x] Валидация: `toLang: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/).describe("ISO 639-1 (e.g. 'en', 'ru') or locale (e.g. 'en-US')")`.
- [x] `messageIds: z.array(z.number().int().positive()).min(1).max(100)`.
- [x] `pnpm typecheck` + `pnpm lint` + `pnpm test`.

### Task 6: messageIds каппинг в delete-scheduled

**Files:**
- Modify: `src/tools/messages.ts` — тула `telegram-delete-scheduled`

- [x] `messageIds: z.array(z.number().int().positive()).min(1).max(100)`.
- [x] `pnpm typecheck` + `pnpm lint` + `pnpm test`.

### Task 7: setDefaultReaction — валидация emoji

**Files:**
- Modify: `src/tools/reactions.ts` — тула `telegram-set-default-reaction`

- [x] `emoji: z.string().min(1).max(8).describe("Emoji character (e.g. 👍 ❤️ 🔥)")`.
- [x] `pnpm typecheck` + `pnpm lint` + `pnpm test`.

### Task 8: get-web-preview — URL валидация

**Files:**
- Modify: `src/tools/media.ts` — тула `telegram-get-web-preview`

**Проблема:** `z.string()` принимает `file://`, internal URLs — Telegram становится SSRF-прокси.

- [x] `url: z.string().url().refine((u) => { try { const p = new URL(u); return p.protocol === "http:" || p.protocol === "https:"; } catch { return false; } }, "Only http:// and https:// URLs are allowed")`.
- [x] `pnpm typecheck` + `pnpm lint` + `pnpm test`.

### Task 9: send-typing — per-chat throttle

**Files:**
- Modify: `src/telegram-client.ts` — метод `sendTyping`

**Проблема:** prompt injection может спамить «typing...» по 100 чатам.

- [x] Добавить в `TelegramService` приватное поле `private lastTypingAt = new Map<string, number>()`.
- [x] В начале `sendTyping(chatId, action)`: `const now = Date.now(); const last = this.lastTypingAt.get(chatId) ?? 0; if (now - last < 10_000 && action !== "cancel") return; this.lastTypingAt.set(chatId, now);` — throttle 10 секунд per chat, "cancel" всегда проходит.
- [x] `pnpm typecheck` + `pnpm lint` + `pnpm test`.

### Task 10: getSavedDialogs — убрать хардкод unreadCount

**Files:**
- Modify: `src/telegram-client.ts` — метод `getSavedDialogs`, его return type
- Modify: `src/tools/account.ts` — тула `telegram-get-saved-dialogs` (обновить форматирование)

**Проблема:** поле `unreadCount` в response всегда `0` — вводит в заблуждение.

- [x] Удалить `unreadCount` из return-типа и из объекта.
- [x] Обновить форматирование в тулe: не печатать `unread` если его нет. (Форматирование уже не печатало — только удалить из клиента.)
- [x] `pnpm typecheck` + `pnpm lint` + `pnpm test`.

### Task 11: saveDraft с пустым text и replyTo

**Files:**
- Modify: `src/telegram-client.ts` — метод `saveDraft`

**Проблема:** Telegram отклонит `SaveDraft` с `message:"" + replyTo:X` как `MESSAGE_EMPTY`.

- [x] В `saveDraft`: если `text === ""`, передавать `replyTo: undefined` независимо от аргумента. Агент, который хочет «очистить черновик», не хочет ошибки из-за забытого `replyTo`.
- [x] `pnpm typecheck` + `pnpm lint` + `pnpm test`.

### Task 12: getAdminLog — удалить мёртвый chatMap

**Files:**
- Modify: `src/telegram-client.ts` — метод `getAdminLog`

- [x] Удалить локальную переменную `chatMap`, её построение не используется.
- [x] `pnpm typecheck` + `pnpm lint` + `pnpm test`.

### Task 13: Верификация итогов

- [x] `pnpm typecheck` — 0 ошибок.
- [x] `pnpm lint` — 0 ошибок.
- [x] `pnpm test` — все тесты проходят (включая новый set-chat-permissions-merge).
- [x] `pnpm build` — успешно.
- [x] Commits следуют паттерну `fix(<scope>): <описание>`. Scope: messages / chats / account / media / reactions / client.

### Task 14: Документация

- [x] CHANGELOG.md — добавить подсекцию "Fixes" под текущую Unreleased-секцию с перечислением исправленных проблем (без номеров ревью).
- [x] Синхронизировать `docs/changelog.md`, `docs/ru/changelog.md`, `docs/zh/changelog.md`.
- [x] Если описание тулов менялось (Task 1, 2, 3, 5) — обновить `docs/tools/reference.md`, `docs/ru/tools/reference.md`, `docs/zh/tools/reference.md`.
- [x] Переместить этот план в `.ralphex/plans/completed/`.
