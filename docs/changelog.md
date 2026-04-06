# Changelog

<VersionBadge version="1.24.0" /> Current version

All notable changes to MCP Telegram. For full diff between versions, see [GitHub Releases](https://github.com/overpod/mcp-telegram/releases).

## v1.24.0 <Badge type="tip" text="latest" /> {#v1.24.0}
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
