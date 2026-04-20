# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
