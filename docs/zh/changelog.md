# 更新日志

<VersionBadge version="1.38.1" /> 当前版本

MCP Telegram 的所有重要更改。完整版本对比见 [GitHub Releases](https://github.com/mcp-telegram/mcp-telegram/releases)。条目以英文显示（与源 CHANGELOG 一致）。

<!-- Generated from CHANGELOG.md by scripts/gen-changelog-docs.ts. Do not edit by hand. -->

## 1.38.1 — 2026-06-10 <Badge type="tip" text="latest" /> {#v1-38-1}

### Changed

- Internal maintenance: dependency, build, or documentation updates only (no user-facing changes).

## 1.38.0 — 2026-06-10 {#v1-38-0}

### Added

- shared daemon (serve mode) for concurrent MCP clients (#49)

## 1.37.1 — 2026-06-06 {#v1-37-1}

### Changed

- Internal maintenance: dependency, build, or documentation updates only (no user-facing changes).

## 1.37.0 — 2026-06-04 {#v1-37-0}

### Added

- `TELEGRAM_USE_WSS` env-var. When set to `true`, gramJS uses port `443` instead of the default `80` for the MTProto TCPFull transport. This unblocks deployments on VPS/hosting IP ranges where outbound port `80` to Telegram DC IP blocks is dropped (anti-abuse policy on some shared-VPS providers), which otherwise hangs the client forever in `Connecting to ...:80/TCPFull...`. Default is `false`, so existing setups are unaffected. Contributed by Ivan Ponomarev (@Baho73).
- When `TELEGRAM_USE_WSS=true` is combined with `TELEGRAM_PROXY_*` (which gramJS cannot do — SSL transport over a proxy is unsupported), the conflict is now detected early: a clear warning is logged and `useWSS` is ignored, letting the proxy take precedence, instead of crashing deep inside `connect()`.

## 1.36.5 — 2026-06-01 {#v1-36-5}

### Changed

- Internal maintenance: dependency, build, or documentation updates only (no user-facing changes).

## 1.36.4 — 2026-05-28 {#v1-36-4}

### Changed

- Internal maintenance: dependency, build, or documentation updates only (no user-facing changes).

## 1.36.3 — 2026-05-10 {#v1-36-3}

### Changed

- Internal maintenance: dependency, build, or documentation updates only (no user-facing changes).

## 1.36.2 — 2026-05-10 {#v1-36-2}

### Changed

  - `biome.json` schema bumped to 2.4.15 via `biome migrate --write`
  - `hono` 4.12.9 → 4.12.18 (CSS injection in JSX SSR, JWT NumericDate, Cache `Vary`, etc.)
  - `fast-uri` 3.1.0 → 3.1.2 (host confusion + path traversal)
  - `ip-address` 10.1.0 → 10.2.0 (Address6 HTML XSS)
  - `@hono/node-server` 1.19.11 → 1.19.14 (middleware bypass via repeated slashes)
  - `express-rate-limit` 8.3.1 → 8.5.1
- 3 remaining moderate advisories in `vitepress → vite → esbuild` are dev-only (docs site) with no upstream fix available.

## 1.36.1 — 2026-05-04 {#v1-36-1}

### Changed

- Internal maintenance: dependency, build, or documentation updates only (no user-facing changes).

## 1.36.0 — 2026-04-28 {#v1-36-0}

### Added

- `destructiveHint: true` → `destructive`
- `readOnlyHint: true` → `read-only`
- otherwise → `write`

### Notes

- New public API surface; no breaking changes to existing exports.
- `src/manifest.ts` and 13 new tests added; total test count: 505.
- Build now sets executable bits on all `dist/*-cli.js` outputs (was npm-install-time only for `bin` entries).

## 1.35.0 — 2026-04-25 {#v1-35-0}

### Changed

- `event` — event class (string literal)
- `context` — caller-supplied operation name (never user input / PII)
- `attempt` / `maxRetries` — retry counters
- `seconds` (flood_wait only) or `delayMs` (network/temporary)
- `error` (network/temporary only) — the upstream Telegram error message

## 1.34.0 — 2026-04-24 {#v1-34-0}

### Added

- **telegram-get-available-star-gifts** — List all available Star Gift catalog items: gift ID, cost in Stars, conversion value, limited-edition availability, and upgrade cost
- **telegram-get-saved-star-gifts** — List Star Gifts received by a user/chat. Supports pagination (`offset`/`nextOffset`), filter flags (`excludeUnsaved`, `excludeSaved`, `excludeUnlimited`, `excludeLimited`, `excludeUnique`), and `sortByValue`. Returns kind (regular/unique), from-peer, date, and upgrade eligibility
- **telegram-save-star-gift** — Show or hide a received gift on your profile. For personal gifts pass `msgId`; for chat/channel gifts pass `chatId` + `savedId`. Set `unsave=true` to hide, omit to show
- **telegram-convert-star-gift** — Convert a received gift into Stars (non-reversible, removes gift from profile). Same addressing as save: `msgId` for personal, `chatId`+`savedId` for chat gifts
- **telegram-get-stars-topup-options** — List available Stars top-up tiers with star count, currency, price amount (smallest currency units), and extended/standard tier flag
- **telegram-get-stars-subscriptions** — List active Stars subscriptions for a peer (`me` for self). Returns subscription ID, peer, until date, billing period (seconds), price in Stars, canceled status, and title. Pagination via `offset`
- **telegram-change-stars-subscription** — Cancel or restore a Stars subscription by ID. `canceled=true` to cancel before next renewal, `canceled=false` to restore

## 1.33.0 — 2026-04-24 {#v1-33-0}

### Added

- **telegram-create-folder** — Create a new chat folder. Accepts `title` (max 12 chars), optional `emoticon`, type flags (`contacts`, `nonContacts`, `groups`, `broadcasts`, `bots`), filter flags (`excludeMuted`, `excludeRead`, `excludeArchived`), and peer lists (`includePeers`, `excludePeers`, `pinnedPeers` max 5). Auto-assigns the next available folder ID ≥ 2. Returns the new ID
- **telegram-edit-folder** — Edit an existing folder by `id`. Only pass fields to change — omitted fields preserve current values (fetches current state first via `messages.GetDialogFilters`)
- **telegram-delete-folder** — Delete a chat folder by ID. Chats remain in All Chats. System folders (0 = All Chats, 1 = Archive) cannot be deleted. Uses `messages.UpdateDialogFilter` without a filter argument
- **telegram-reorder-folders** — Set the display order of folders by passing an ordered array of folder IDs. Uses `messages.UpdateDialogFiltersOrder`
- **telegram-get-suggested-folders** — Fetch Telegram's server-side folder suggestions based on your chat list (e.g. "Unread", "Work", "Personal"). Skips `DialogFilterDefault` entries that lack a title
- **telegram-toggle-folder-tags** — Enable or disable folder tag labels on messages in chat lists. Requires Telegram Premium. Uses `messages.ToggleDialogFilterTags`
- **telegram-get-global-privacy-settings** — Read all five global privacy flags: `archiveAndMuteNewNoncontactPeers`, `keepArchivedUnmuted`, `keepArchivedFolders`, `hideReadMarks`, `newNoncontactPeersRequirePremium`. Returns JSON
- **telegram-set-global-privacy-settings** — Update any subset of global privacy flags. Fetches current settings first and merges only the fields you pass. `hideReadMarks` and `newNoncontactPeersRequirePremium` require Telegram Premium

## 1.32.0 — 2026-04-24 {#v1-32-0}

### Added

- **telegram-set-emoji-status** — Set custom animated emoji status next to your name (Telegram Premium). Pass `documentId` or `collectibleId`; omit both to clear. Supports optional expiry via `untilUnix`
- **telegram-list-emoji-statuses** — List available emoji statuses: `default`, `recent`, `channel_default`, or `collectible` (Premium). Returns `documentId`, `until`, collectible `title`/`slug`
- **telegram-clear-recent-emoji-statuses** — Remove all entries from the "recent" emoji status picker section
- **telegram-set-profile-color** — Set your name or profile background color. `forProfile=false` = chat list name color; `forProfile=true` = profile page background (Premium). Accepts color index 0-6 (free) or 7-20 (Premium) plus optional background pattern emoji
- **telegram-set-birthday** — Add/update birthday on profile (`day` + `month` required, `year` optional to hide age). Pass `clear=true` to remove
- **telegram-set-personal-channel** — Feature a channel on your profile as "Personal Channel". Pass `channelId` or `clear=true` to remove
- **telegram-set-profile-photo** — Upload static (JPEG/PNG) or animated (MP4, square, ≤10s) avatar. Optional `fallback=true` sets it as the privacy fallback shown when your main photo is hidden
- **telegram-delete-profile-photo** — Delete one or more profile photos by photo ID (stringified long). Fetches your photo history internally to build the required `InputPhoto`; reports which IDs were not found
- **telegram-get-business-chat-links** — Moved from `account.ts` to new `business.ts` module. Behavior unchanged (read-only list of Business chat links)
- **telegram-create-business-chat-link** — Create a `t.me/m/...` deep-link pre-filled with a message. Supports `parseMode` (md/html), optional admin `title`. Returns JSON with `link`, `slug`, `message`, `views`
- **telegram-edit-business-chat-link** — Update an existing Business chat link by slug. Same options as create
- **telegram-delete-business-chat-link** — Delete a Business chat link by slug
- **telegram-resolve-business-chat-link** — Resolve a slug to see who it opens a chat with and the pre-filled message. Returns `peerId`, `peerType`, `message`, `entityCount`
- **telegram-set-business-hours** — Configure weekly work hours (Telegram Business required). Input: `timezone` (IANA string) + `schedule` array of `{day, openFrom, openTo}` in HH:MM. Internally converts to minute-of-week (0–10079). `clear=true` disables
- **telegram-set-business-location** — Set street address ± geo coordinates for Business profile. `clear=true` removes
- **telegram-set-business-greeting** — Auto-reply for new conversations using a Quick Reply shortcut as template. `audience` enum (all_new / contacts_only / non_contacts / existing_only), `noActivityDays`, optional include/excludeUsers. `clear=true` disables
- **telegram-set-business-away** — Auto-reply when offline or outside hours. `schedule` enum (always / outside_hours / custom). `custom` requires `customFrom`/`customTo` Unix timestamps. `offlineOnly` flag. Same audience model as greeting. `clear=true` disables
- **telegram-set-business-intro** — Intro card shown to new users: `title` (≤32) + `description` (≤70) + optional sticker (requires `stickerId` + `stickerAccessHash` + `stickerFileReference` all together). `clear=true` removes

### Notes

- All Premium-gated tools (`telegram-set-emoji-status`, `telegram-set-profile-color` with index ≥ 7 or `backgroundEmojiId`) throw `PREMIUM_ACCOUNT_REQUIRED` from Telegram on non-Premium accounts — the error is propagated as-is
- All Business-gated tools throw `BUSINESS_PEER_INVALID` or similar when the account lacks Telegram Business subscription
- `telegram-get-business-chat-links` moved to `src/tools/business.ts` — tool name and behavior unchanged
- `telegram-set-profile-photo`: uploads via GramJS `uploadFile` (4 workers). Video must be square MP4, ≤10s; server enforces its own size limits
- `telegram-delete-profile-photo`: calls `photos.GetUserPhotos` first (up to 100) to resolve `accessHash` + `fileReference` from the photo ID; IDs not in your history are returned in `missing` array

## 1.31.0 — 2026-04-24 {#v1-31-0}

### Added

- **telegram-vote-poll** — Vote in a poll by option index (single/multi-choice). Empty array retracts vote.
- **telegram-get-poll-results** — Get aggregated poll results: vote counts, percentages, quiz answer status
- **telegram-get-poll-voters** — List users who voted for specific poll options (public polls only, paginated)
- **telegram-close-poll** — Permanently close a poll (irreversible; prevents further voting)
- **telegram-transcribe-audio** — Start server-side transcription of a voice/video note (Telegram Premium)
- **telegram-get-transcription** — Poll for updated transcription status (idempotent re-call)
- **telegram-rate-transcription** — Rate transcription quality (good/poor) to improve speech-to-text
- **telegram-get-fact-check** — Get fact-check annotations on channel messages (batch up to 100)
- **telegram-edit-fact-check** — Add/update fact-check annotation (requires fact-checker privileges)
- **telegram-delete-fact-check** — Remove fact-check annotation (requires fact-checker privileges)
- **telegram-send-paid-reaction** — Send paid reaction (★ Stars) on a channel post with optional privacy
- **telegram-toggle-paid-reaction-privacy** — Change leaderboard visibility of your paid reaction
- **telegram-get-paid-reaction-privacy** — Get your current default paid reaction privacy setting

### Notes

- `telegram-close-poll`: One-way operation — closed polls cannot be reopened
- `telegram-transcribe-audio`: Premium feature. Non-Premium accounts have limited free trials; `trialRemainsNum` shows count
- `telegram-get-transcription`: Idempotent — returns same transcriptionId with updated text once processing completes
- `telegram-edit-fact-check` / `telegram-delete-fact-check`: Require fact-checker privileges; regular users get permission errors
- `telegram-send-paid-reaction`: Stars are debited from your Telegram balance; `count` range 1-2500
- `telegram-toggle-paid-reaction-privacy`: Per-message toggle (Layer 198 API)

### New helpers (exported from `telegram-client`)

- `summarizePoll(poll, results?)` — summarize a GramJS Poll+PollResults into a compact typed object
- `extractPollMediaFromUpdates(updates)` — extract poll + results from any Updates envelope
- `extractPeerId(peer)` — convert TypePeer to string ID

### Testing

- 29 new mock-only tests (cumulative: 447 total)

## 1.30.0 — 2026-04-24 {#v1-30-0}

### Added

- **telegram-send-story** — Publish a photo or video story to your profile or a channel with privacy controls (everyone/contacts/close_friends/selected), period (6-48h), pinning, and no-forward flag. Accepts absolute file path, auto-detects photo/video from extension (jpg/jpeg/png/webp/heic/heif → photo; everything else → video). Caption supports md/html parse mode.
- **telegram-edit-story** — Edit an existing story: replace media, update caption (empty string clears it), or change privacy rules. At least one field (filePath, caption, or privacy) must be provided.
- **telegram-delete-stories** — Delete one or more stories (irreversible; requires `confirm: true`; up to 100 IDs per call). Returns the actually-deleted IDs from Telegram (partial success possible).
- **telegram-react-to-story** — React to a story with an emoji, or remove the reaction by passing empty string `""`.
- **telegram-export-story-link** — Get a shareable `t.me/…` URL for a public story.
- **telegram-read-stories** — Mark stories as seen up to a given story ID (maxId, inclusive). Returns count of newly-seen stories.
- **telegram-toggle-story-pinned** — Pin/unpin stories in profile highlights (Telegram allows up to 3 pinned stories). Returns affected story IDs.
- **telegram-toggle-story-pinned-to-top** — Pin stories to the very top of the pinned row; pass `[]` to clear all top-pinned stories.
- **telegram-activate-stealth-mode** — Hide your story views retroactively (`past: true`) and/or for the next 25 minutes (`future: true`). At least one of past/future must be true. Requires Telegram Premium — non-Premium accounts receive PREMIUM_ACCOUNT_REQUIRED.
- **telegram-get-stories-archive** — Fetch auto-archived (expired) stories from a peer's archive, paginated via `offsetId` + `limit` (1–100, default 50).
- **telegram-report-story** — Report a story via Telegram's multi-step option flow. First call with `option: ""` starts the flow; subsequent calls pass the base64 option bytes from the previous response's `options[n].option` field.
- **telegram-get-discussion-message** — For a channel post with comments enabled, returns the linked discussion-group info: `discussionGroupId`, `discussionMsgId`, `unreadCount`, `readInboxMaxId`, `readOutboxMaxId`, `topMessage`. Use `discussionGroupId` + `discussionMsgId` with `telegram-send-message` (replyTo=discussionMsgId) to post a comment.
- **telegram-get-groups-for-discussion** — List groups eligible to link as discussion group to a channel you admin (channels.GetGroupsForDiscussion). No parameters required.
- **telegram-get-message-read-participants** — List who has read a message in a small group (≤100 members, ≤7 days old). Returns `readers` array with `userId` and `readAt` (ISO timestamp). Returns CHAT_TOO_BIG error for large groups or channels.
- **telegram-get-outbox-read-date** — Get when your recipient read your outgoing private message. Returns `"Read at <ISO date>"` or `"Not read yet"` (maps NOT_READ_YET error to null). Propagates YOUR_PRIVACY_RESTRICTED / USER_PRIVACY_RESTRICTED as errors.

### New helpers in `telegram-helpers.ts`

- `StoryPrivacy` type and `buildStoryPrivacyRules()` — builds GramJS `TypeInputPrivacyRule[]` from privacy enum + allow/disallow user ID lists
- `detectMediaType()` — infers photo/video from file extension (safe default: video)
- `extractStoryIdFromUpdates()` — extracts story ID from SendStory Updates envelope (prefers UpdateStoryID, falls back to UpdateStory)
- `summarizeDiscussionMessage()`, `DiscussionMessageSummary` type
- `summarizeGroupsForDiscussion()`, `GroupsForDiscussionSummary` type
- `summarizeReadParticipants()`, `ReadParticipantsSummary` type
- `summarizeReportResult()`, `ReportResultSummary` type (discriminated union: reported / chooseOption / addComment)

### Notes

- `telegram-activate-stealth-mode` requires Telegram Premium — non-Premium accounts receive PREMIUM_ACCOUNT_REQUIRED
- `telegram-get-message-read-participants` only works for groups ≤100 members and messages ≤7 days old
- `telegram-delete-stories` requires `confirm: true` (irreversible)
- `telegram-send-story`: MediaAreas (venue/reaction/URL tags on the story frame) are not supported in this version
- `telegram-report-story`: Multi-step flow — first call with `option: ""` starts the flow; subsequent calls pass the base64 option bytes from the previous response

### Testing

- 45 new mock-only tests in `src/__tests__/stories-v2.test.ts` (cumulative: 418 total)

## 1.29.0 — 2026-04-23 {#v1-29-0}

### Added

- **Phase 5 Block A — Rich media sending (7 new tools)** — functional parity with Telegram UI for content types that could not be sent before.
  - `telegram-send-voice` — send a voice note (OGG/Opus preferred) with optional caption, parseMode, reply/topic. Shows as a waveform UI in the chat.
  - `telegram-send-video-note` — send a round-shaped video message (MP4, square recommended; duration ≤60s enforced client-side, length ≤640px).
  - `telegram-send-location` — send a geographic location; single tool handles both static pins and live-updating locations (`livePeriod` 60–86400 seconds; optional `heading` 1–360°, `proximityRadius` meters).
  - `telegram-send-venue` — send a venue card (title, address, lat/long + optional provider-specific metadata).
  - `telegram-send-contact` — send a contact card (phone number in E.164-like format `^\+?\d{6,15}$`, first name, optional last name and vCard).
  - `telegram-send-dice` — send an animated dice/game emoji (🎲 🎯 🎰 🏀 ⚽ 🎳) and receive the server-rolled value in the response.
  - `telegram-send-album` — send 2–10 grouped photos/videos as a single album message with per-item or album-level caption.
- **Block B — enhancements to existing `telegram-send-message`:**
  - `quoteText` — attach a verbatim quote from the replied-to message (requires `replyTo`). Uses raw `messages.SendMessage` + `InputReplyToMessage.quoteText` under the hood.
  - `effect` — Premium message effect ID (numeric string) attached to the outgoing message.
- **Defence-in-depth for file-path inputs (`isSafeAbsolutePath`)** — all new `filePath` parameters reject:
  - URL schemes (`http:`, `https:`, `file:`, `ftp:`, `data:`, `javascript:`, `ws:`, `wss:`) — no SSRF via GramJS URL-fetching.
  - UNC / SMB shares (`\\server\share`, `//server/share`) — no NTLM-relay from Windows hosts.
  - Path traversal (`..` segments inside an absolute path) — no escape out of the intended directory.
  - POSIX pseudo-filesystems (`/proc`, `/sys`, `/dev`, `/run`) — prevents AI prompt-injection from reading `/proc/self/environ` and leaking env vars / session paths to Telegram.
  - Embedded NUL byte and bare `/` — rejected explicitly.
- **UTF-16 surrogate sanitation on input** — all free-text parameters (message `text`, captions, venue title/address/provider/venueId/venueType, contact name/vCard, quoteText) now strip unpaired surrogates before reaching GramJS's TL encoder. Complements the existing v1.11.1 output-side fix.
- **Shared helpers in `telegram-helpers.ts`:**
  - `buildReplyTo(replyTo?, topicId?)` — construct `InputReplyToMessage` (supports topic root where `replyToMsgId === topicId`).
  - `generateRandomBigInt()` — cryptographically-random 64-bit `long` for TL `randomId`.
  - `extractMessageId(result)` — unified parser across `Api.Updates`, `UpdatesCombined`, `Api.Message`, `UpdateShortSentMessage`, `UpdateNewMessage`, `UpdateNewChannelMessage`.
  - `extractDiceResult(result)` — dice-specific extractor returning `{id, value?}` from `MessageMediaDice`.

### Changed

- `telegram-send-contact`: `phone` field now validated against `^\+?\d{6,15}$` (E.164-like) to reject malformed/hallucinated numbers.
- `telegram-send-venue`: `provider` relaxed from a 2-value enum to a free string (≤32 chars) to match TL `venueProvider: string`.
- `TelegramService.sendMessage()`: gained an optional 6th `extra: { quoteText?, effect? }` parameter. When set, falls back to raw `messages.SendMessage` (high-level `client.sendMessage` does not support these fields). Backward-compatible — existing callers see no change.

### Security

- `quoteText` without `replyTo` now raises a clear error instead of silently dropping the quote.
- GramJS private `_parseMessageText` usage in the quoteText/effect raw path is feature-detected; future GramJS bumps surface a clear "version incompatible" error instead of crashing.
- `effect` ID regex tightened to `^\d{1,19}$` (Int64-safe range).

### Testing

- 371 unit tests (was 322 in v1.28.1, +49). All tests mock-only (no live Telegram connection).
- New coverage: all 8 new/changed service methods, helper edge cases (channel path, combined updates, direct Api.Message, UpdateShortSentMessage), SSRF guard (POSIX/Windows accept + URL/UNC/traversal/pseudo-fs reject), raw-path `sendMessage` with `quoteText` / `effect`.

### Notes & known limitations

- **`telegram-send-video-note` caption omitted** — Telegram UI does not render captions under round video notes; including it here would silently drop.
- **`telegram-send-contact.userId` field dropped** — GramJS 2.26.22 `InputMediaContact` TL schema (Layer 198) has no `userId` slot. The card is standalone; recipients see the number and name, not a link to a Telegram user. Will return once GramJS advances.
- **TTL / self-destruct media** — deferred. Requires raw `InputMediaUploadedPhoto({ttlSeconds})` path which bypasses the high-level `sendFile`; will ship in a follow-up.
- **`telegram-send-voice.duration` removed vs. initial design** — GramJS auto-detects duration from the audio file; letting the AI override it caused the Telegram UI to display wrong playback times.
- **Album mixed photo+video** — GramJS accepts mixed arrays via extension-based detection, but this is not covered by tests; recommend uniform media type per album until a live-test checkpoint confirms.
- **Album flood control** — a 10-item album fans out 10 `messages.UploadMedia` calls inside one rate-limit slot; under heavy contention the later items may still hit `FLOOD_WAIT`. Rate limiter retries apply.

## 1.28.1 — 2026-04-22 {#v1-28-1}

### Added

- **`telegram-logout`** — new tool (Auth category, annotated `DESTRUCTIVE`). Fully logs out: calls `auth.LogOut` on Telegram servers (session disappears from Settings → Devices), destroys the GramJS client, deletes the local session file, and clears in-memory state. Takes no parameters. Handles every state cleanly — connected (server revoke + local wipe), disconnected with a session file (local wipe only, with a notice), no session (`fail` "Not logged in"), and `auth.LogOut` throwing (local wipe still happens, with a "check Settings → Devices manually" hint).

### Changed

- **`TelegramService.logOut()` hardened** — server-revoke and client-destroy are now split: a successful `auth.LogOut` returns `true` even if `client.destroy()` throws (previously misreported "not confirmed"). The local wipe is verified post-unlink and throws if the session file survives (e.g. read-only Docker mount), instead of falsely reporting success. File removal now always runs even when server-revoke fails (network error, `AUTH_KEY_UNREGISTERED`).
- **Master cancels active QR login on logout** — a `telegram-logout` request now aborts an in-progress QR login flow before acquiring `globalLock`, instead of queuing behind it for up to 5 minutes.

### Testing

- 322 unit tests (+10 vs v1.28.0) — `hasLocalSession()`, `logOut()` edge cases (connected / disconnected±file / network error / idempotency / FS-throws / destroy-throws-but-revoke-succeeds), and a Master integration test that logout aborts an active login over a real unix socket.

### Notes & known limitations

- In a 3-client FIFO scenario (A holds the lock via login, B queues a tool call, C requests logout), logout correctly aborts A, but B still runs before logout because FIFO order is preserved. A priority-aware queue is deferred.

## 1.28.0 — 2026-04-22 {#v1-28-0}

### Added

- **QR login through the IPC daemon** — `mcp-telegram login` now flows through the Master daemon over IPC instead of running as a separate process. The new session reaches the Master's memory immediately, with no editor restart. This fixes the "relogin via `mcp-telegram login`" flavor of `AUTH_KEY_DUPLICATED`/`AUTH_KEY_UNREGISTERED`, where the standalone login wrote a fresh session to disk but the running Master kept the old, now-invalidated auth key in memory and then wiped the just-created session on the next tool call.
  - `IpcClient.loginFlow(onQr)` — streams QR frames as they refresh (~every 10s).
  - `handleLoginStart` on Master — runs `startQrLogin` on the shared `TelegramService`.
  - `GlobalLock` (FIFO mutex) — serializes tool calls with the login flow so other clients queue instead of hitting a stale client mid-relogin.
  - `AbortController` — `socket.on("close")` aborts the QR loop if the CLI is interrupted (Ctrl+C / terminal closed); `globalLock` releases immediately instead of blocking tool calls for up to 5 minutes.
  - Session swap now saves to disk first, then adopts in memory and destroys the previous client — prevents orphan Telegram connections accumulating per relogin.
  - Standalone fallback kept — if no Master is running, `mcp-telegram login` works exactly as before.

### Changed

- **BREAKING (internal IPC only): IPC protocol is now a discriminated union** with a required `type` tag (`tool` / `tool_response` / `login_start` / `login_qr` / `login_done`). A new 1.28.0 client and an older 1.27.x Master cannot talk — restart your editor / Claude Code after upgrading so the Master daemon is replaced. No public API or invocation change. (Parent-crash detection already kills stale Masters in most cases, so this is transparent for VS Code / Claude Desktop users.)

### Fixed

- Socket errors on Master now log to stderr instead of being silently dropped.
- `client.destroy()` in abort branches wrapped in try/catch — guarantees the "QR login aborted" message even if Telegram destroy throws.
- QR render errors (`QRCode.toString` failure) logged to stderr instead of silently dropped.

### Testing

- 312 unit tests (was 288) — new suites for `GlobalLock` (FIFO ordering, double-release safety), Master login (QR URL forwarding, abort on socket close), child-process integration via tsx, `IpcClient.loginFlow`, and IPC discriminated-union / legacy-protocol rejection.

## 1.27.1 — 2026-04-22 {#v1-27-1}

### Changed

- Patch release — no new tools, no API changes; pure code-quality and test-coverage work. Refactored `telegram-client.ts` re-exports (eliminates 2 Biome `noUnusedImports` false-positives), replaced unsafe `(e as Error).message` casts with `e instanceof Error` guards in the stats methods, and added `McpRegisteredTool` / `McpServerInternal` types to `ipc-protocol.ts` as a single source of truth (previously duplicated across master.ts and client.ts).

### Testing

- 286 unit tests (+25 vs v1.27.0) — new branch coverage for `wireIpcProxies` (incl. a safety test that the original `TelegramService` handler is never called after wiring), the rate limiter (`throwOnFloodWait`, retry exhaustion, 5xx, GramJS `errorMessage`), and the IPC protocol parser (malformed JSON, blank lines, partial-line buffering, multiple messages per chunk). `rate-limiter.ts` reached 100% statements.

## 1.27.0 — 2026-04-21 {#v1-27-0}

### Added

- **Master/Client IPC daemon — fixes `AUTH_KEY_DUPLICATED` across concurrent Claude sessions.** Opening multiple Claude sessions used to spawn separate `mcp-telegram` processes that each connected to Telegram with the same session, which Telegram rejected as a duplicate. Now the first process to start becomes the **Master** (holds the single GramJS connection, listens on a Unix socket at `~/.mcp-telegram/daemon.sock`) and every subsequent process becomes a thin **Client** that proxies tool calls to the Master over the socket — one connection, one auth key, no duplicates. Zero config change; same invocation.
  - Security: socket file is `chmod 0o600` (owner-only); the session string never leaves the Master process.

### Fixed

- Atomic lock via `O_EXCL` prevents a race when multiple sessions start simultaneously; stale socket from a previous crash is removed before `listen` (no `EADDRINUSE`).
- One-shot connect timeout (not idle) so live connections survive inactivity; 30s IPC call timeout so a stuck Master surfaces a clean error instead of hanging.
- Sequential `drainQueue()` loop for correct concurrent-request handling; `.catch()` on auto-connect to avoid `unhandledRejection`; idempotent cleanup (`cleanedUp` flag) so SIGINT/SIGTERM don't double-release.

## 1.26.0 — 2026-04-20 {#v1-26-0}

### Added

- **Phase 2 — Admin Toggles, Customization, Stats (8 tools)**
  - `telegram-toggle-channel-signatures` — toggle post signatures on a channel
  - `telegram-toggle-anti-spam` — toggle native anti-spam in a supergroup (`ban_users` admin)
  - `telegram-toggle-forum-mode` — enable/disable forum mode on a supergroup (disable requires `confirm: true` — destructive, removes all topics)
  - `telegram-approve-join-request` — approve or reject a single chat join request
  - `telegram-toggle-prehistory-hidden` — show/hide pre-history for new supergroup members
  - `telegram-set-chat-reactions` — set allowed reactions on a chat (`all` / `some` / `none`)
  - `telegram-get-broadcast-stats` — channel stats overview (Premium admin may be required; pass `includeGraphs: true` for raw series)
  - `telegram-get-megagroup-stats` — supergroup stats overview (rate-limited by Telegram to ~1 req/30 min per channel)
- **Phase 3 — Inline Bots, Buttons, Real-Time Updates (7 tools)**
  - `telegram-inline-query` — query an inline bot in a chat context (queryId TTL ≈ 1 min)
  - `telegram-inline-query-send` — send an inline bot result by queryId + result id
  - `telegram-press-button` — press a callback button on a message by row/col or raw data
  - `telegram-get-message-buttons` — list a message's reply-markup buttons with indices and types
  - `telegram-get-state` — initialize a polling cursor (`pts`, `qts`, `date`, `seq`)
  - `telegram-get-updates` — fetch global updates since a known cursor via `updates.GetDifference`; returns `{newMessages, deletedMessageIds, otherUpdates, state, isFinal}` and surfaces `DifferenceTooLong` as a history-fallback hint
  - `telegram-get-channel-updates` — per-channel polling via `updates.GetChannelDifference`
  - Cursors are client-owned (stateless server) — the agent stores `{pts, qts, date}` between calls
- **Phase 4 ship — Stories, Boosts, Business (8 tools)**
  - `telegram-get-all-stories` — list stories across peers with pagination state
  - `telegram-get-peer-stories` — list stories posted by one peer (compact, media refs only)
  - `telegram-get-stories-by-id` — fetch specific story items by id
  - `telegram-get-story-views` — list views on your own stories (Premium for full stats)
  - `telegram-get-my-boosts` — list boost slots assigned by your account
  - `telegram-get-boosts-status` — boost status for a channel/supergroup
  - `telegram-get-boosts-list` — list boosters for a channel (admin)
  - `telegram-get-business-chat-links` — list your Telegram Business chat links
- **Phase 4 opt-in (env-gated, 6 tools)** — registered only when the corresponding flag is set:
  - `MCP_TELEGRAM_ENABLE_GROUP_CALLS=1` → `telegram-get-group-call`, `telegram-get-group-call-participants`
  - `MCP_TELEGRAM_ENABLE_STARS=1` → `telegram-get-stars-status`, `telegram-get-stars-transactions`
  - `MCP_TELEGRAM_ENABLE_QUICK_REPLIES=1` → `telegram-get-quick-replies`, `telegram-get-quick-reply-messages`

## 1.25.0 — 2026-04-20 {#v1-25-0}

### Added

- **Scheduled messages** — `telegram-get-scheduled`, `telegram-delete-scheduled`
- **Threads & replies** — `telegram-get-replies` for channel post comments
- **Message links** — `telegram-get-message-link` returns public t.me URL for a message
- **Mentions & unread reactions** — `telegram-get-unread-mentions`, `telegram-get-unread-reactions`
- **Translate** — `telegram-translate-message` (requires Telegram Premium)
- **Typing indicator** — `telegram-send-typing` with configurable action
- **Dialog management** — `telegram-archive-chat`, `telegram-pin-chat`, `telegram-mark-dialog-unread`
- **Drafts** — `telegram-save-draft`, `telegram-get-drafts`, `telegram-clear-drafts`
- **Saved Messages dialogs** — `telegram-get-saved-dialogs` for the new per-peer Saved Messages folders
- **Admin log** — `telegram-get-admin-log` for channel/supergroup moderation history
- **Reactions catalog** — `telegram-set-default-reaction`, `telegram-get-top-reactions`, `telegram-get-recent-reactions`
- **Chat permissions** — `telegram-set-chat-permissions` for default banned rights
- **Slow mode** — `telegram-set-slow-mode` for supergroups
- **Forum topics CRUD** — `telegram-create-topic`, `telegram-edit-topic`, `telegram-delete-topic`
- **Web page preview** — `telegram-get-web-preview` to inspect link previews before sending

### Fixed

- `telegram-set-chat-permissions` now merges with the chat's current `defaultBannedRights` — omitted flags keep their current state instead of being silently cleared
- `telegram-clear-drafts` requires `chatId` (single-chat) or `confirmAllChats: true` to wipe drafts account-wide, preventing accidental loss of all drafts in one call
- `telegram-get-unread-mentions` and `telegram-get-unread-reactions` are now annotated as `WRITE` — they mark the listed items as read on the server
- `telegram-translate-message` is now annotated as `WRITE` (consumes Premium translate quota); `toLang` is validated against an ISO-639 / locale pattern and `messageIds` is capped at 1–100 positive integers
- `telegram-delete-scheduled` caps `messageIds` at 1–100 positive integers
- `telegram-set-default-reaction` validates `emoji` length (1–8 characters)
- `telegram-get-web-preview` rejects non-`http(s)` URLs, preventing use as an SSRF proxy
- `telegram-send-typing` throttles non-`cancel` actions to once per 10 seconds per chat
- `telegram-get-saved-dialogs` no longer returns a hard-coded `unreadCount: 0`
- `telegram-create-topic` now reads the new topic ID from `UpdateNewChannelMessage` (authoritative) and fails loudly if neither source is available
- `telegram-save-draft` drops `replyTo` when the draft text is empty, avoiding `MESSAGE_EMPTY` errors when clearing drafts
- Removed unused `chatMap` build in `getAdminLog`

## 1.24.1 — 2026-04-20 {#v1-24-1}

### Changed

- `biome.json` migrated to schema 2.4.12

## 1.24.0 — 2026-04-06 {#v1-24-0}

### Added

- **Sticker tools** — 5 new tools (59 total): `telegram-get-sticker-set`, `telegram-search-sticker-sets`, `telegram-get-installed-stickers`, `telegram-send-sticker`, `telegram-get-recent-stickers`
- **Documentation site** — VitePress-based docs at overpod.github.io/mcp-telegram with i18n (English, Russian, Chinese)

## 1.23.0 — 2026-04-05 {#v1-23-0}

### Added

- 11 new tools (22 total): `telegram-send-reaction`, `telegram-edit-message`, `telegram-delete-message`, `telegram-forward-message`, `telegram-mark-as-read`, `telegram-get-dialogs`, `telegram-get-chat-info`, `telegram-send-file`, `telegram-add-contact`, `telegram-create-poll`, `telegram-manage-topics`
- Account management tools: `telegram-get-sessions`, `telegram-terminate-session`, `telegram-set-privacy`, `telegram-set-auto-delete`, `telegram-update-profile`
- Better entity resolution for channels and supergroups

## 1.22.0 — 2026-04-01 {#v1-22-0}

### Added

- `TelegramService.setTyping(chatId, action?)` — send typing indicators with 10 action types: `typing`, `cancel`, `record_video`, `upload_video`, `record_audio`, `upload_audio`, `upload_photo`, `upload_document`, `choose_sticker`, `game_play` (#17)
- `TelegramService.getMessageById(chatId, messageId)` — fetch a single message by ID, returns formatted message object or `null`. Uses GramJS `ids` filter for exact lookup (#17)

## 1.21.0 — 2026-04-01 {#v1-21-0}

### Added

- `TelegramService.getClient()` — public accessor for the underlying GramJS `TelegramClient` instance, enabling event handlers like `NewMessage` for real-time listeners (#17)

## 1.20.0 — 2026-03-31 {#v1-20-0}

### Added

- **Rate limiting & retry** — automatic FLOOD_WAIT handling, network error recovery with exponential backoff (`src/rate-limiter.ts`)
- `send-message` now returns `messageId` in the response (`Message sent to @user [#12345]`), enabling send → edit workflows (closes #16)
- Rate limiter unit tests (7 tests in `src/__tests__/rate-limiter.test.ts`)

### Changed

- `sendMessage()` return type changed from `void` to `Api.Message | Api.UpdateShortSentMessage | undefined`
- Write methods (`sendMessage`, `sendFile`, `editMessage`, `deleteMessages`) are now rate-limited with automatic retry on transient errors

## 1.19.0 — 2026-03-30 {#v1-19-0}

### Added

- Docker support for containerized deployment
- Non-blocking startup behavior
- Local QR code fallback for authentication
- Automated test infrastructure with Node.js test runner
- CI workflow to publish Docker images to GitHub Container Registry

## 1.18.0 — 2026-03-28 {#v1-18-0}

### Added

- New `telegram-get-my-role` tool to check user's role in a chat
- Role information in `telegram-get-chat-members` results

## 1.17.0 — 2026-03-28 {#v1-17-0}

### Added

- Chat resolution by display name (not just ID or username)

### Changed

- Updated documentation to replace static tool list with auto-discovery note
- Improved project structure documentation

## 1.16.0 — 2026-03-28 {#v1-16-0}

### Added

- Group management tools: invite, kick, ban, edit, leave
- Admin management capabilities

## 1.15.0 — 2026-03-28 {#v1-15-0}

### Added

- `telegram-create-group` tool for creating new groups

### Fixed

- Documented `AUTH_KEY_DUPLICATED` error handling

## 1.14.0 — 2026-03-28 {#v1-14-0}

### Added

- SOCKS5 proxy support for Telegram connections
- MTProxy support for Telegram connections

### Changed

- Updated Biome to 2.4.9 with new config schema
- Sorted imports for Biome compliance
- Added proxy documentation to README

## 1.13.0 — 2026-03-26 {#v1-13-0}

### Changed

- Refactored tools into modular files organized by category

## 1.12.0 — 2026-03-26 {#v1-12-0}

### Changed

- Migrated to `registerTool()` API with tool annotations

## 1.11.1 — 2026-03-25 {#v1-11-1}

### Fixed

- Sanitized unpaired UTF-16 surrogates in tool responses

### Changed

- Upgraded TypeScript to 6.0
- Updated README with missing tools

## 1.11.0 — 2026-03-23 {#v1-11-0}

### Added

- Full reactions support: read, send multiple reactions, get detailed info

### Changed

- Included message ID in all message-reading tool outputs

## 1.10.1 — 2026-03-22 {#v1-10-1}

### Fixed

- Message ID now included in all message-reading tool outputs

## 1.10.0 — 2026-03-20 {#v1-10-0}

### Added

- Enhanced `telegram-get-profile` with birthday, business, and premium data
- New `telegram-get-profile-photo` tool
- Global message search capability
- Enriched chat search results

## 1.9.0 — 2026-03-18 {#v1-9-0}

### Added

- Forum Topics support
- Per-topic unread count for forum groups
- Secure session storage with configurable path
- Multiple accounts support

### Fixed

- Per-topic unread sum calculation for forum groups

### Changed

- Updated session path and security documentation
- Upgraded GitHub Actions to v6
- Replaced Node 20 with Node 24 in CI
- Updated Biome to 2.4.7 and @types/node to 25.5.0

## 1.8.1 — 2026-03-19 {#v1-8-1}

### Fixed

- Redirected console.log to stderr to prevent MCP JSON-RPC corruption

## 1.8.0 — 2026-03-18 {#v1-8-0}

### Added

- Secure session storage with configurable path via SESSION_PATH environment variable

### Changed

- Updated session path and security information in README

## 1.7.0 — 2026-03-16 {#v1-7-0}

### Added

- CI workflow to publish to GitHub Packages alongside npm
- Manual workflow dispatch trigger for publishing

## 1.6.0 — 2026-03-16 {#v1-6-0}

### Added

- Contact request management
- Block/unblock users
- Report spam functionality
- Add contact tool
- ChatGPT to list of supported clients

### Changed

- Removed hardcoded tool counts from README and package.json
- Updated Biome to 2.4.7 and @types/node to 25.5.0

## 1.5.0 — 2026-03-16 {#v1-5-0}

### Added

- Reactions support
- Scheduled messages
- Polls creation and management
- `telegram-join-chat` tool for joining groups and channels

### Changed

- Updated README with new tool documentation
- Increased tool count to 24

## 1.4.0 — 2026-03-15 {#v1-4-0}

### Added

- Glama.ai MCP catalog verification (glama.json)
- Smithery MCP catalog listing (smithery.yaml)
- Demo GIF and badges to README
- Hosted version link

### Fixed

- Removed PNG file save from CLI QR login

### Changed

- Updated README with Glama MCP server badge

## 1.3.1 — 2026-03-12 {#v1-3-1}

### Fixed

- Use `destroy()` instead of `disconnect()` to stop GramJS update loop
- Adopt QR login client directly instead of destroy+reconnect flow
- Destroy GramJS client in `logOut()` and `startQrLogin()` to stop update loop

## 1.3.0 — 2026-03-12 {#v1-3-0}

### Added

- `logOut()` method for complete Telegram session termination

## 1.2.0 — 2026-03-11 {#v1-2-0}

### Added

- `downloadMediaAsBuffer` for serverless media download
- Library exports and declaration types
- Date filters for messages
- Comprehensive README for v1.0

### Fixed

- MIME type detection from magic bytes in `downloadMediaAsBuffer`
- Made `saveSession` resilient to file write errors in Docker

### Changed

- Use `GetFullChannel`/`GetFullChat` for complete chat information
- Improved `telegram-login` for Claude Desktop users
- Added npm publishing support and GitHub Actions CI/CD

## 1.1.0 — 2026-03-11 {#v1-1-0}

### Added

- Contact management tools
- Chat members listing
- User profile retrieval
- Chat type filter
- Media tools (send, download, get info)
- Pin/unpin messages
- Markdown support
- Media information in messages
- Unread counts
- Mark messages as read
- Forward messages
- Edit messages
- Delete messages
- Detailed chat information
- Pagination support

## 1.0.0 — 2026-03-10 {#v1-0-0}

### Added

- Initial release: MCP server for Telegram userbot
- Basic message reading and sending
- Chat listing
- Authentication via phone number and QR code
- Session persistence
- GramJS/MTProto integration
