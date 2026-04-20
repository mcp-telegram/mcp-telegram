# GramJS Coverage Phases 2+3+4 — v1.26.0 bundle

**Target release**: `@overpod/mcp-telegram@1.26.0` (open-source) + cloud bump to `mcp-telegram-cloud@1.10.0` as follow-up.

**Philosophy**: agent=human. Каждый tool должен отвечать «зачем юзеру (не боту) это руками кликать в Telegram» → если нет — не делаем.

**Out of scope**: secret chats, voice/video calls streaming, payment SendForm, bot-side handlers (GetBotInfo/SetBotInfo для ботов), raw invoke, takeout (deferred to Phase 5 для GDPR review).

**Cloud whitelist metadata**: каждая задача имеет строчку `<!-- cloud-safety: safe | review | unsafe -->`:
- `safe` → добавить в cloud whitelist автоматически (read-only OR idempotent state-change без destructive risk)
- `review` → ручной audit после имплементации (state-change с побочными эффектами, но вероятно OK)
- `unsafe` → НЕ включать в cloud (admin destructive, takeout-class, high abuse)

---

## Phase 2 — Admin Toggles, Customization, Stats (8 tools)

### Task 2.1: telegram-toggle-channel-signatures
<!-- cloud-safety: review -->

- API: `channels.ToggleSignatures(channel: InputChannel, enabled: boolean)`
- Params: `chat` (string|number), `enabled` (boolean)
- Requires: channel admin (проверить через `getMyRole` util)
- Errors: `CHAT_ADMIN_REQUIRED`, `CHANNEL_PRIVATE`
- Tests: happy path toggle on/off, non-admin error surface
- Acceptance: возвращает `{ok:true, signaturesEnabled}`. Ошибки → MCP isError with code

### Task 2.2: telegram-toggle-anti-spam
<!-- cloud-safety: review -->

- API: `channels.ToggleAntiSpam(channel, enabled)`
- Supergroup only (megagroup). Reject channels с понятной ошибкой.
- Requires: admin с `ban_users` permission

### Task 2.3: telegram-toggle-forum-mode
<!-- cloud-safety: unsafe -->

- API: `channels.ToggleForum(channel, enabled)`
- Destructive side-effect: enable→конвертит group в forum, disable→удаляет все topics. **unsafe для cloud**.
- Requires: creator/admin
- Acceptance: требуется подтверждение через `confirm: true` параметр на disable (клаудный паттерн).

### Task 2.4: telegram-approve-join-request
<!-- cloud-safety: safe -->

- API: `messages.HideChatJoinRequest(peer, userId, approved)`
- Params: `chat`, `userId`, `approved` (boolean)
- Requires: admin с `invite_users`
- Bulk companion: НЕ делаем в Phase 2 (HideAllChatJoinRequests — отдельный tool в будущем)

### Task 2.5: telegram-toggle-prehistory-hidden
<!-- cloud-safety: review -->

- API: `channels.TogglePreHistoryHidden(channel, hidden)`
- Supergroup-only. Hidden=true → новые участники не видят старую историю.

### Task 2.6: telegram-set-chat-reactions
<!-- cloud-safety: review -->

- API: `messages.SetChatAvailableReactions(peer, availableReactions)`
- Params: `chat`, `reactions` (union): `{type: "all"} | {type: "some", emoji: string[]} | {type: "none"}`
- Требует TS типы из GramJS `ChatReactionsUnion`. Validate emoji array — zod schema.

### Task 2.7: telegram-get-broadcast-stats
<!-- cloud-safety: safe -->

- API: `stats.GetBroadcastStats(channel, dark?)`
- Channel-only. Premium-only — если null → информативная ошибка "channel has no stats (may require Premium admin)".
- Return: обрезать graphs для compact output (оставить только итоговые числа + metadata), полные рядов можно опционально через `includeGraphs: true`.

### Task 2.8: telegram-get-megagroup-stats
<!-- cloud-safety: safe -->

- API: `stats.GetMegagroupStats(channel, dark?)`
- Rate-limit: 1 req / 30 min (per-channel). Документировать в tool description и ловить FLOOD_WAIT.

---

## Phase 3 — Inline Bots, Buttons, Real-Time Polling (7 tools + polling infra)

### Task 3.1: telegram-inline-query
<!-- cloud-safety: safe -->

- API: `messages.GetInlineBotResults(bot, peer, query, offset?, geoPoint?)`
- Params: `bot` (string|number username/id), `chat` (context peer), `query` (string), `offset?` (string)
- Return: queryId, results[{id, type, title?, url?}] — compact form, не дёргаем full `sendMessage` объекты
- TTL warning: queryId валиден ~1 мин. Документировать в description.

### Task 3.2: telegram-inline-query-send
<!-- cloud-safety: review -->

- API: `messages.SendInlineBotResult(peer, queryId, id, replyTo?, silent?)`
- State-change (отправляет сообщение), но через inline bot flow — это legit user action.
- Acceptance: возвращает `messageId` (как v1.20+ send-message).

### Task 3.3: telegram-press-button
<!-- cloud-safety: review -->

- API: `messages.GetBotCallbackAnswer(peer, msgId, data?, password?)`
- Params: `chat`, `messageId`, `buttonIndex` (row, column) OR `data` (raw callback_data bytes)
- Поиск кнопки: сначала `messages.GetMessages`, извлечь `replyMarkup.rows[r].buttons[c]`, валидировать `KeyboardButtonCallback` → pass `data`
- Reject: URL/Switch-Inline/Game кнопки с понятной ошибкой "button type X is not callable, use appropriate tool"
- Return: `{alert?: string, message?: string, url?: string, cacheTime: number}`

### Task 3.4: telegram-get-message-buttons
<!-- cloud-safety: safe -->

- Читает `message.replyMarkup` и возвращает structured список кнопок с их типами и индексами — helper для 3.3
- API: `messages.GetMessages([messageId])`
- Return: `{buttons: [{row, col, type, label, data?, url?, switchQuery?}]}`

### Task 3.5–3.7: polling архитектура
<!-- cloud-safety: safe -->

**Три related tools:**

#### 3.5: telegram-get-state
- API: `updates.GetState()`
- Return: `{pts, qts, date, seq}` — cursor initialization
- Юзер вызывает один раз для inicial sync

#### 3.6: telegram-get-updates
- API: `updates.GetDifference(pts, date, qts, ptsLimit?, ptsTotalLimit?)`
- Params: `pts`, `date`, `qts` — юзер передаёт известный cursor
- Return: `{newMessages[], deletedMessageIds[], otherUpdates[], state: {pts, qts, date, seq}, isFinal: boolean}`
- Limit: ptsLimit=100 default, ptsTotalLimit=1000 max
- **Fallback**: если `DifferenceTooLong` → вернуть `{fallback: "history", suggestedAction: "call telegram-read-messages per chat"}` с информативным описанием

#### 3.7: telegram-get-channel-updates
- API: `updates.GetChannelDifference(channel, filter, pts, limit, force?)`
- Per-channel cursor, отдельно от глобального

**ВАЖНО**: cursor НЕ храним в MCP сервере — юзер (агент) хранит {pts, qts, date} между вызовами в своём контексте. Это stateless polling, проще, нет БД. Документировать в tool description.

**Session storage architecture**: НЕ вводим. Отклоняю усложнение — агент хранит cursor сам. SQLite в cloud уже есть, но расширять схему не нужно.

---

## Phase 4 — Stories, Boosts, Business, Stars (8 ship + 7 opt-in)

### SHIP (3 tools — low risk)

### Task 4.1: telegram-get-all-stories
<!-- cloud-safety: safe -->
- API: `stories.GetAllStories(next?, hidden?, state?)`

### Task 4.2: telegram-get-peer-stories
<!-- cloud-safety: safe -->
- API: `stories.GetPeerStories(peer)`
- Return: compact story items (skip raw media blobs — URL refs only)

### Task 4.3: telegram-get-stories-by-id
<!-- cloud-safety: safe -->
- API: `stories.GetStoriesByID(peer, ids[])`

### Task 4.4: telegram-get-story-views
<!-- cloud-safety: safe -->
- API: `stories.GetStoryViewsList(peer, id, ...)` — views on OWN stories
- Premium-detectable error → сообщение "story view stats may require Telegram Premium"

### Task 4.5: telegram-get-my-boosts
<!-- cloud-safety: safe -->
- API: `premium.GetMyBoosts()`

### Task 4.6: telegram-get-boosts-status
<!-- cloud-safety: safe -->
- API: `premium.GetBoostsStatus(peer)`

### Task 4.7: telegram-get-boosts-list
<!-- cloud-safety: safe -->
- API: `premium.GetBoostsList(peer, gifts?, offset?, limit?)`

### Task 4.8: telegram-get-business-chat-links
<!-- cloud-safety: safe -->
- API: `account.GetBusinessChatLinks()`

### OPT-IN (через env flags — low priority, делаем в отдельных задачах)

#### Task 4.9: telegram-get-group-call
<!-- cloud-safety: safe -->
- API: `phone.GetGroupCall(call, limit)`
- Gated: `MCP_TELEGRAM_ENABLE_GROUP_CALLS=1`
- Если flag не стоит → tool не регистрируется вообще (в `index.ts`). Document в README.

#### Task 4.10: telegram-get-group-call-participants
<!-- cloud-safety: safe -->
- API: `phone.GetGroupParticipants(call, ids, sources, offset, limit)`
- Gated как 4.9

#### Task 4.11: telegram-get-stars-status
<!-- cloud-safety: safe -->
- Gated: `MCP_TELEGRAM_ENABLE_STARS=1`
- API: `payments.GetStarsStatus(peer)`

#### Task 4.12: telegram-get-stars-transactions
<!-- cloud-safety: safe -->
- Gated: `MCP_TELEGRAM_ENABLE_STARS=1`
- API: `payments.GetStarsTransactions(...)`

#### Task 4.13: telegram-get-quick-replies
<!-- cloud-safety: safe -->
- Gated: `MCP_TELEGRAM_ENABLE_QUICK_REPLIES=1`
- API: `messages.GetQuickReplies(hash)`

#### Task 4.14: telegram-get-quick-reply-messages
<!-- cloud-safety: safe -->
- Gated: `MCP_TELEGRAM_ENABLE_QUICK_REPLIES=1`
- API: `messages.GetQuickReplyMessages(shortcutId, ...)`

### SKIP / DEFER
- **Takeout API** → Phase 5 с отдельным legal/GDPR review
- **Business Away/Greeting messages** → нет read API, только Update*. Skip.
- **Game кнопки** → skip
- **Payment SendForm** → skip (write, payment, legal)

---

## Общие требования ко всем tools (Phase 2+3+4)

1. **TypeScript strict**: никаких `any`. Zod schemas для input validation.
2. **Tool annotations**: ReadOnly vs Write корректно заданы в `registerTool()` (Phase 1 подход).
3. **Errors**: MCP isError:true с {code, message, hint?} вместо throw.
4. **Rate limiting**: использовать существующий retry wrapper из v1.20 (FLOOD_WAIT, 5xx, network).
5. **Admin checks**: где требуется admin — использовать `getMyRole` util, не повторять логику inline.
6. **Peer resolution**: через существующий `resolvePeer` (v1.17 — поддерживает display name fallback).
7. **Tests**: unit test на каждый tool (mock GramJS client) + integration smoke test (`pnpm test`).
8. **Documentation**:
   - Обновить `docs/` (VitePress) с новыми tools в RU/EN/ZH
   - README toolcount update
   - CHANGELOG запись в формате v1.25.0 (категории, параметры, ограничения)
9. **Biome**: `pnpm check` должен проходить без ошибок/warnings.
10. **Build**: `pnpm build` должен проходить, `tsc --noEmit` должен проходить.

## Cloud whitelist diff (применяется после merge)

После merge PR mcp-telegram v1.26.0 применить в mcp-telegram-cloud src/tools-whitelist.ts (или аналогичном):

**ADD (safe):**
- `telegram-approve-join-request`
- `telegram-get-broadcast-stats`
- `telegram-get-megagroup-stats`
- `telegram-inline-query`
- `telegram-get-message-buttons`
- `telegram-get-state`
- `telegram-get-updates`
- `telegram-get-channel-updates`
- `telegram-get-all-stories`
- `telegram-get-peer-stories`
- `telegram-get-stories-by-id`
- `telegram-get-story-views`
- `telegram-get-my-boosts`
- `telegram-get-boosts-status`
- `telegram-get-boosts-list`
- `telegram-get-business-chat-links`

**REVIEW (ручной audit перед cloud):**
- `telegram-toggle-channel-signatures`
- `telegram-toggle-anti-spam`
- `telegram-toggle-prehistory-hidden`
- `telegram-set-chat-reactions`
- `telegram-inline-query-send`
- `telegram-press-button`

**UNSAFE (НЕ добавлять в cloud):**
- `telegram-toggle-forum-mode` (destructive on disable)

**Opt-in tools (4.9–4.14)** — не добавляем в cloud по дефолту. Cloud server не ставит env flags → tools не регистрируются → автоматически исключены.

---

## Definition of Done

- [ ] Все Phase 2 tools (8) реализованы, tests pass, biome clean
- [ ] Все Phase 3 ship tools (7) реализованы
- [ ] Phase 4 ship tools (8) реализованы
- [ ] Phase 4 opt-in tools (6) реализованы с env gating
- [ ] CHANGELOG обновлён, README обновлён, docs/ обновлены
- [ ] `pnpm test && pnpm build && pnpm check` — все зелёные
- [ ] Merge PR → tag v1.26.0 → CI публикует npm + GHCR + бинарники + docs
- [ ] Cloud whitelist diff применён в отдельном PR к mcp-telegram-cloud → v1.10.0
