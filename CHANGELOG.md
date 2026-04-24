# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.32.0] — 2026-04-24

### Added

**Profile write (8 new tools):**
- **telegram-set-emoji-status** — Set custom animated emoji status next to your name (Telegram Premium). Pass `documentId` or `collectibleId`; omit both to clear. Supports optional expiry via `untilUnix`
- **telegram-list-emoji-statuses** — List available emoji statuses: `default`, `recent`, `channel_default`, or `collectible` (Premium). Returns `documentId`, `until`, collectible `title`/`slug`
- **telegram-clear-recent-emoji-statuses** — Remove all entries from the "recent" emoji status picker section
- **telegram-set-profile-color** — Set your name or profile background color. `forProfile=false` = chat list name color; `forProfile=true` = profile page background (Premium). Accepts color index 0-6 (free) or 7-20 (Premium) plus optional background pattern emoji
- **telegram-set-birthday** — Add/update birthday on profile (`day` + `month` required, `year` optional to hide age). Pass `clear=true` to remove
- **telegram-set-personal-channel** — Feature a channel on your profile as "Personal Channel". Pass `channelId` or `clear=true` to remove
- **telegram-set-profile-photo** — Upload static (JPEG/PNG) or animated (MP4, square, ≤10s) avatar. Optional `fallback=true` sets it as the privacy fallback shown when your main photo is hidden
- **telegram-delete-profile-photo** — Delete one or more profile photos by photo ID (stringified long). Fetches your photo history internally to build the required `InputPhoto`; reports which IDs were not found

**Business write (9 tools, including migrated read-only tool):**
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

## [1.31.0] — 2026-04-24

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

## [1.30.0] — 2026-04-24

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

## [1.29.0] - 2026-04-23

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

## [1.26.0] - 2026-04-20

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

## [1.25.0] - 2026-04-20

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

## [1.24.1] - 2026-04-20

### Changed
- Dependencies bumped to latest: `@modelcontextprotocol/sdk` 1.28.0 → 1.29.0, `dotenv` 17.3.1 → 17.4.2, `@biomejs/biome` 2.4.9 → 2.4.12, `typescript` 6.0.2 → 6.0.3, `@types/node` 25.5.0 → 25.6.0
- `biome.json` migrated to schema 2.4.12

## [1.24.0] - 2026-04-06

### Added
- **Sticker tools** — 5 new tools (59 total): `telegram-get-sticker-set`, `telegram-search-sticker-sets`, `telegram-get-installed-stickers`, `telegram-send-sticker`, `telegram-get-recent-stickers`
- **Pre-built binaries** — zero-dependency standalone executables for Linux (x64/ARM64), macOS (x64/ARM64), Windows (x64)
- **Documentation site** — VitePress-based docs at overpod.github.io/mcp-telegram with i18n (English, Russian, Chinese)

## [1.23.0] - 2026-04-05

### Added
- 11 new tools (22 total): `telegram-send-reaction`, `telegram-edit-message`, `telegram-delete-message`, `telegram-forward-message`, `telegram-mark-as-read`, `telegram-get-dialogs`, `telegram-get-chat-info`, `telegram-send-file`, `telegram-add-contact`, `telegram-create-poll`, `telegram-manage-topics`
- Account management tools: `telegram-get-sessions`, `telegram-terminate-session`, `telegram-set-privacy`, `telegram-set-auto-delete`, `telegram-update-profile`
- Better entity resolution for channels and supergroups

## [1.22.0] - 2026-04-01

### Added
- `TelegramService.setTyping(chatId, action?)` — send typing indicators with 10 action types: `typing`, `cancel`, `record_video`, `upload_video`, `record_audio`, `upload_audio`, `upload_photo`, `upload_document`, `choose_sticker`, `game_play` (#17)
- `TelegramService.getMessageById(chatId, messageId)` — fetch a single message by ID, returns formatted message object or `null`. Uses GramJS `ids` filter for exact lookup (#17)

## [1.21.0] - 2026-04-01

### Added
- `TelegramService.getClient()` — public accessor for the underlying GramJS `TelegramClient` instance, enabling event handlers like `NewMessage` for real-time listeners (#17)

## [1.20.0] - 2026-03-31

### Added
- **Rate limiting & retry** — automatic FLOOD_WAIT handling, network error recovery with exponential backoff (`src/rate-limiter.ts`)
- `send-message` now returns `messageId` in the response (`Message sent to @user [#12345]`), enabling send → edit workflows (closes #16)
- Rate limiter unit tests (7 tests in `src/__tests__/rate-limiter.test.ts`)

### Changed
- `sendMessage()` return type changed from `void` to `Api.Message | Api.UpdateShortSentMessage | undefined`
- Write methods (`sendMessage`, `sendFile`, `editMessage`, `deleteMessages`) are now rate-limited with automatic retry on transient errors

## [1.19.0] - 2026-03-30

### Added
- Docker support for containerized deployment
- Non-blocking startup behavior
- Local QR code fallback for authentication
- Automated test infrastructure with Node.js test runner
- CI workflow to publish Docker images to GitHub Container Registry

### Changed
- Added pnpm-lock.yaml for better dependency management

## [1.18.0] - 2026-03-28

### Added
- New `telegram-get-my-role` tool to check user's role in a chat
- Role information in `telegram-get-chat-members` results

## [1.17.0] - 2026-03-28

### Added
- Chat resolution by display name (not just ID or username)

### Changed
- Updated documentation to replace static tool list with auto-discovery note
- Improved project structure documentation

## [1.16.0] - 2026-03-28

### Added
- Group management tools: invite, kick, ban, edit, leave
- Admin management capabilities

## [1.15.0] - 2026-03-28

### Added
- `telegram-create-group` tool for creating new groups

### Fixed
- Documented `AUTH_KEY_DUPLICATED` error handling

## [1.14.0] - 2026-03-28

### Added
- SOCKS5 proxy support for Telegram connections
- MTProxy support for Telegram connections

### Changed
- Updated Biome to 2.4.9 with new config schema
- Sorted imports for Biome compliance
- Added proxy documentation to README

## [1.13.0] - 2026-03-26

### Changed
- Refactored tools into modular files organized by category

## [1.12.0] - 2026-03-26

### Changed
- Migrated to `registerTool()` API with tool annotations

## [1.11.1] - 2026-03-25

### Fixed
- Sanitized unpaired UTF-16 surrogates in tool responses

### Changed
- Upgraded TypeScript to 6.0
- Updated README with missing tools

## [1.11.0] - 2026-03-23

### Added
- Full reactions support: read, send multiple reactions, get detailed info

### Changed
- Included message ID in all message-reading tool outputs

## [1.10.1] - 2026-03-22

### Fixed
- Message ID now included in all message-reading tool outputs

## [1.10.0] - 2026-03-20

### Added
- Enhanced `telegram-get-profile` with birthday, business, and premium data
- New `telegram-get-profile-photo` tool
- Global message search capability
- Enriched chat search results

## [1.9.0] - 2026-03-18

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

## [1.8.1] - 2026-03-19

### Fixed
- Redirected console.log to stderr to prevent MCP JSON-RPC corruption

### Changed
- Updated dependencies (Biome 2.4.8)

## [1.8.0] - 2026-03-18

### Added
- Secure session storage with configurable path via SESSION_PATH environment variable

### Changed
- Updated session path and security information in README

## [1.7.0] - 2026-03-16

### Added
- CI workflow to publish to GitHub Packages alongside npm
- Manual workflow dispatch trigger for publishing

## [1.6.0] - 2026-03-16

### Added
- Contact request management
- Block/unblock users
- Report spam functionality
- Add contact tool
- ChatGPT to list of supported clients

### Changed
- Removed hardcoded tool counts from README and package.json
- Updated Biome to 2.4.7 and @types/node to 25.5.0

## [1.5.0] - 2026-03-16

### Added
- Reactions support
- Scheduled messages
- Polls creation and management
- `telegram-join-chat` tool for joining groups and channels

### Changed
- Updated README with new tool documentation
- Increased tool count to 24

## [1.4.0] - 2026-03-15

### Added
- Glama.ai MCP catalog verification (glama.json)
- Smithery MCP catalog listing (smithery.yaml)
- Demo GIF and badges to README
- Hosted version link

### Fixed
- Removed PNG file save from CLI QR login

### Changed
- Updated README with Glama MCP server badge

## [1.3.1] - 2026-03-12

### Fixed
- Use `destroy()` instead of `disconnect()` to stop GramJS update loop
- Adopt QR login client directly instead of destroy+reconnect flow
- Destroy GramJS client in `logOut()` and `startQrLogin()` to stop update loop

## [1.3.0] - 2026-03-12

### Added
- `logOut()` method for complete Telegram session termination

## [1.2.0] - 2026-03-11

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

## [1.1.0] - 2026-03-11

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

## [1.0.0] - 2026-03-10

### Added
- Initial release: MCP server for Telegram userbot
- Basic message reading and sending
- Chat listing
- Authentication via phone number and QR code
- Session persistence
- GramJS/MTProto integration

[Unreleased]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.24.0...HEAD
[1.24.0]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.23.0...v1.24.0
[1.23.0]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.22.0...v1.23.0
[1.22.0]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.21.0...v1.22.0
[1.21.0]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.20.0...v1.21.0
[1.20.0]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.19.0...v1.20.0
[1.19.0]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.18.0...v1.19.0
[1.18.0]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.17.0...v1.18.0
[1.17.0]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.16.0...v1.17.0
[1.16.0]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.15.0...v1.16.0
[1.15.0]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.14.0...v1.15.0
[1.14.0]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.13.0...v1.14.0
[1.13.0]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.12.0...v1.13.0
[1.12.0]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.11.1...v1.12.0
[1.11.1]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.11.0...v1.11.1
[1.11.0]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.10.1...v1.11.0
[1.10.1]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.10.0...v1.10.1
[1.10.0]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.9.0...v1.10.0
[1.9.0]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.8.1...v1.9.0
[1.8.1]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.8.0...v1.8.1
[1.8.0]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.3.1...v1.4.0
[1.3.1]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/mcp-telegram/mcp-telegram/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/mcp-telegram/mcp-telegram/releases/tag/v1.0.0
