# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Improved error messages with actionable hints for connection and authentication issues

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

[Unreleased]: https://github.com/overpod/mcp-telegram/compare/v1.19.0...HEAD
[1.19.0]: https://github.com/overpod/mcp-telegram/compare/v1.18.0...v1.19.0
[1.18.0]: https://github.com/overpod/mcp-telegram/compare/v1.17.0...v1.18.0
[1.17.0]: https://github.com/overpod/mcp-telegram/compare/v1.16.0...v1.17.0
[1.16.0]: https://github.com/overpod/mcp-telegram/compare/v1.15.0...v1.16.0
[1.15.0]: https://github.com/overpod/mcp-telegram/compare/v1.14.0...v1.15.0
[1.14.0]: https://github.com/overpod/mcp-telegram/compare/v1.13.0...v1.14.0
[1.13.0]: https://github.com/overpod/mcp-telegram/compare/v1.12.0...v1.13.0
[1.12.0]: https://github.com/overpod/mcp-telegram/compare/v1.11.1...v1.12.0
[1.11.1]: https://github.com/overpod/mcp-telegram/compare/v1.11.0...v1.11.1
[1.11.0]: https://github.com/overpod/mcp-telegram/compare/v1.10.1...v1.11.0
[1.10.1]: https://github.com/overpod/mcp-telegram/compare/v1.10.0...v1.10.1
[1.10.0]: https://github.com/overpod/mcp-telegram/compare/v1.9.0...v1.10.0
[1.9.0]: https://github.com/overpod/mcp-telegram/compare/v1.8.1...v1.9.0
[1.8.1]: https://github.com/overpod/mcp-telegram/compare/v1.8.0...v1.8.1
[1.8.0]: https://github.com/overpod/mcp-telegram/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/overpod/mcp-telegram/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/overpod/mcp-telegram/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/overpod/mcp-telegram/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/overpod/mcp-telegram/compare/v1.3.1...v1.4.0
[1.3.1]: https://github.com/overpod/mcp-telegram/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/overpod/mcp-telegram/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/overpod/mcp-telegram/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/overpod/mcp-telegram/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/overpod/mcp-telegram/releases/tag/v1.0.0
