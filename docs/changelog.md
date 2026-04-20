# Changelog

<VersionBadge version="1.26.0" /> Current version

All notable changes to MCP Telegram. For full diff between versions, see [GitHub Releases](https://github.com/mcp-telegram/mcp-telegram/releases).

## 1.26.0 — 2026-04-20 {#v1-26-0}

### Added (29 new tools)

**Phase 2 — Admin Toggles, Customization, Stats (8)**
- `telegram-toggle-channel-signatures`, `telegram-toggle-anti-spam`, `telegram-toggle-forum-mode` (destructive on disable; requires `confirm: true`)
- `telegram-toggle-prehistory-hidden`, `telegram-set-chat-reactions`
- `telegram-approve-join-request`
- `telegram-get-broadcast-stats`, `telegram-get-megagroup-stats`

**Phase 3 — Inline Bots, Buttons, Real-Time Updates (7)**
- `telegram-inline-query`, `telegram-inline-query-send`
- `telegram-press-button`, `telegram-get-message-buttons`
- `telegram-get-state`, `telegram-get-updates`, `telegram-get-channel-updates` (cursors are client-owned)

**Phase 4 — Stories, Boosts, Business (8)**
- `telegram-get-all-stories`, `telegram-get-peer-stories`, `telegram-get-stories-by-id`, `telegram-get-story-views`
- `telegram-get-my-boosts`, `telegram-get-boosts-status`, `telegram-get-boosts-list`
- `telegram-get-business-chat-links`

**Phase 4 opt-in (6, env-gated)**
- `MCP_TELEGRAM_ENABLE_GROUP_CALLS=1` → `telegram-get-group-call`, `telegram-get-group-call-participants`
- `MCP_TELEGRAM_ENABLE_STARS=1` → `telegram-get-stars-status`, `telegram-get-stars-transactions`
- `MCP_TELEGRAM_ENABLE_QUICK_REPLIES=1` → `telegram-get-quick-replies`, `telegram-get-quick-reply-messages`

## 1.25.0 — 2026-04-20 {#v1-25-0}

### Added
- **Scheduled messages** — `telegram-get-scheduled`, `telegram-delete-scheduled`
- **Threads & replies** — `telegram-get-replies` for channel post comments
- **Message links** — `telegram-get-message-link` for public t.me URLs
- **Mentions & unread reactions** — `telegram-get-unread-mentions`, `telegram-get-unread-reactions`
- **Translate** — `telegram-translate-message` (Telegram Premium)
- **Typing indicator** — `telegram-send-typing`
- **Dialog management** — `telegram-archive-chat`, `telegram-pin-chat`, `telegram-mark-dialog-unread`
- **Drafts** — `telegram-save-draft`, `telegram-get-drafts`, `telegram-clear-drafts`
- **Saved Messages dialogs** — `telegram-get-saved-dialogs`
- **Admin log** — `telegram-get-admin-log`
- **Reactions catalog** — `telegram-set-default-reaction`, `telegram-get-top-reactions`, `telegram-get-recent-reactions`
- **Chat permissions & slow mode** — `telegram-set-chat-permissions`, `telegram-set-slow-mode`
- **Forum topics CRUD** — `telegram-create-topic`, `telegram-edit-topic`, `telegram-delete-topic`
- **Web page preview** — `telegram-get-web-preview`

### Fixed
- `telegram-set-chat-permissions` now merges with current `defaultBannedRights` — omitted flags keep their current state
- `telegram-clear-drafts` requires `chatId` or `confirmAllChats: true` to wipe drafts account-wide
- `telegram-get-unread-mentions` / `-reactions` annotated as `WRITE` — they mark listed items as read on the server
- `telegram-translate-message` annotated as `WRITE`; `toLang` validated, `messageIds` capped at 1–100
- `telegram-delete-scheduled` caps `messageIds` at 1–100 positive integers
- `telegram-set-default-reaction` validates emoji length (1–8 characters)
- `telegram-get-web-preview` rejects non-`http(s)` URLs (SSRF hardening)
- `telegram-send-typing` throttles non-`cancel` actions to once per 10 s per chat
- `telegram-get-saved-dialogs` drops the always-zero `unreadCount` field
- `telegram-create-topic` now reads the new topic ID from `UpdateNewChannelMessage` and fails loudly if unavailable
- `telegram-save-draft` drops `replyTo` when text is empty, avoiding `MESSAGE_EMPTY`

## v1.24.1 <Badge type="tip" text="latest" /> {#v1.24.1}
**2026-04-20**

### Changed
- Dependencies bumped to latest: `@modelcontextprotocol/sdk` 1.29.0, `dotenv` 17.4.2, `@biomejs/biome` 2.4.12, `typescript` 6.0.3, `@types/node` 25.6.0

## v1.24.0 {#v1.24.0}
**2026-04-06**

### Added
- **Sticker tools** — 5 new tools (59 total): `telegram-get-sticker-set`, `telegram-search-sticker-sets`, `telegram-get-installed-stickers`, `telegram-send-sticker`, `telegram-get-recent-stickers`
- **Pre-built binaries** — zero-dependency standalone executables for Linux (x64/ARM64), macOS (x64/ARM64), Windows (x64)
- **Documentation site** — VitePress-based docs with i18n (English, Russian, Chinese)

## v1.23.0 {#v1.23.0}
**2026-04-05**

### Added
- 11 new tools (22 total): reactions, edit/delete/forward messages, mark as read, dialogs, chat info, send file, add contact, create poll, manage topics
- Account management: sessions, privacy, auto-delete, profile
- Better entity resolution for channels and supergroups

## v1.22.0 {#v1.22.0}
**2026-04-01**

### Added
- `TelegramService.setTyping()` — send typing indicators with 10 action types
- `TelegramService.getMessageById()` — fetch a single message by ID

## v1.21.0 {#v1.21.0}
**2026-04-01**

### Added
- `TelegramService.getClient()` — public accessor for the underlying GramJS client

## v1.20.0 {#v1.20.0}
**2026-03-31**

### Added
- **Rate limiting & retry** — automatic FLOOD_WAIT handling, network error recovery with exponential backoff
- `send-message` now returns `messageId` in the response

## v1.19.0 {#v1.19.0}
**2026-03-30**

### Added
- Docker support for containerized deployment
- Non-blocking startup behavior
- Local QR code fallback for authentication
- CI workflow for Docker images on GHCR

## v1.18.0 {#v1.18.0}
**2026-03-28**

### Added
- `telegram-get-my-role` tool
- Role information in `telegram-get-chat-members` results

## v1.17.0 {#v1.17.0}
**2026-03-28**

### Added
- Chat resolution by display name

## v1.16.0 {#v1.16.0}
**2026-03-28**

### Added
- Group management tools: invite, kick, ban, edit, leave
- Admin management capabilities

## v1.15.0 {#v1.15.0}
**2026-03-28**

### Added
- `telegram-create-group` tool

## v1.14.0 {#v1.14.0}
**2026-03-28**

### Added
- SOCKS5 and MTProxy support

## v1.13.0 {#v1.13.0}
**2026-03-26**

### Changed
- Refactored tools into modular files organized by category

## v1.12.0 {#v1.12.0}
**2026-03-26**

### Changed
- Migrated to `registerTool()` API with tool annotations

## v1.11.0 {#v1.11.0}
**2026-03-23**

### Added
- Full reactions support: read, send multiple reactions

## v1.10.0 {#v1.10.0}
**2026-03-20**

### Added
- Enhanced `telegram-get-profile` with birthday, business, and premium data
- `telegram-get-profile-photo` tool
- Global message search

## v1.9.0 {#v1.9.0}
**2026-03-18**

### Added
- Forum Topics support
- Multiple accounts support
- Secure session storage with configurable path

## v1.8.0 {#v1.8.0}
**2026-03-18**

### Added
- Secure session storage via `SESSION_PATH` environment variable

## v1.7.0 {#v1.7.0}
**2026-03-16**

### Added
- CI workflow for GitHub Packages publishing

## v1.6.0 {#v1.6.0}
**2026-03-16**

### Added
- Contact requests, block/unblock, report spam, add contact

## v1.5.0 {#v1.5.0}
**2026-03-16**

### Added
- Reactions, scheduled messages, polls, join chat

## v1.4.0 {#v1.4.0}
**2026-03-15**

### Added
- Glama.ai and Smithery catalog listings
- Demo GIF and badges

## v1.3.0 — v1.3.1 {#v1.3.0}
**2026-03-12**

### Added
- `logOut()` method
### Fixed
- GramJS update loop cleanup

## v1.2.0 {#v1.2.0}
**2026-03-11**

### Added
- Media download as buffer for serverless
- Library exports and declaration types
- Date filters for messages

## v1.1.0 {#v1.1.0}
**2026-03-11**

### Added
- Contacts, chat members, profiles, media, pin/unpin, markdown, unread, mark as read, forward, edit, delete, chat info, pagination

## v1.0.0 {#v1.0.0}
**2026-03-10**

### 🎉 Initial release
- MCP server for Telegram userbot
- Basic message reading and sending
- Chat listing
- QR code and phone number authentication
- Session persistence
- GramJS/MTProto integration
