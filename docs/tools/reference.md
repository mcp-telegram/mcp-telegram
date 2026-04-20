# Tools Reference

MCP Telegram provides a comprehensive tool set organized by category. All tools are auto-discoverable — your AI client will see them with full parameter descriptions when connected.

## Auth

| Tool | Description |
|------|-------------|
| `telegram-status` | Check connection status and get account info |
| `telegram-login` | Generate QR code for authentication |

## Messaging

| Tool | Description |
|------|-------------|
| `telegram-send-message` | Send a message to any chat (user, group, channel) |
| `telegram-edit-message` | Edit a previously sent message |
| `telegram-delete-message` | Delete one or more messages |
| `telegram-forward-message` | Forward messages between chats |
| `telegram-send-scheduled` | Schedule a message for later delivery |
| `telegram-send-typing` | Send a typing / upload action indicator |
| `telegram-translate-message` | Translate one or more messages to a target language (Premium; consumes translate quota) |
| `telegram-get-message-link` | Get a public t.me link to a message |

## Scheduled

| Tool | Description |
|------|-------------|
| `telegram-get-scheduled` | List scheduled messages in a chat |
| `telegram-delete-scheduled` | Delete one or more scheduled messages |

## Reading

| Tool | Description |
|------|-------------|
| `telegram-list-chats` | List your chats with filters (users, groups, channels) |
| `telegram-read-messages` | Read recent messages from a chat with pagination |
| `telegram-search-messages` | Search messages in a specific chat by keyword |
| `telegram-search-global` | Search messages across all chats at once |
| `telegram-search-chats` | Find chats by name or description |
| `telegram-get-unread` | Get all chats with unread messages and counts |
| `telegram-mark-as-read` | Mark a chat as read |
| `telegram-get-replies` | Read comments/replies under a channel post |
| `telegram-get-unread-mentions` | List unread messages that mention you in a chat (marks them as read on the server) |
| `telegram-get-unread-reactions` | List unread reactions on your messages in a chat (marks them as read on the server) |
| `telegram-get-saved-dialogs` | List per-peer folders inside Saved Messages |

## Drafts

| Tool | Description |
|------|-------------|
| `telegram-save-draft` | Save a text draft in a chat (empty clears the draft) |
| `telegram-get-drafts` | List all chats with saved drafts |
| `telegram-clear-drafts` | Clear a chat's draft, or wipe drafts in all chats (requires `confirmAllChats: true`) |

## Forum Topics

| Tool | Description |
|------|-------------|
| `telegram-list-topics` | List topics in a forum group |
| `telegram-read-topic-messages` | Read messages from a specific topic |
| `telegram-create-topic` | Create a new topic in a forum group |
| `telegram-edit-topic` | Rename, close, hide, or update an existing topic |
| `telegram-delete-topic` | Delete a topic and its history |

## Polls

| Tool | Description |
|------|-------------|
| `telegram-create-poll` | Create a poll or quiz in a chat |

## Reactions

| Tool | Description |
|------|-------------|
| `telegram-send-reaction` | React to a message with an emoji |
| `telegram-get-reactions` | Get reactions on a message |
| `telegram-set-default-reaction` | Set your account's default quick-reaction emoji |
| `telegram-get-top-reactions` | List Telegram's top (popular) reaction emojis |
| `telegram-get-recent-reactions` | List emojis you recently used as reactions |

## Stickers

| Tool | Description |
|------|-------------|
| `telegram-send-sticker` | Send a sticker to a chat |
| `telegram-get-installed-stickers` | List your installed sticker packs |
| `telegram-get-recent-stickers` | Show recently used stickers |
| `telegram-get-sticker-set` | Browse stickers in a specific pack |
| `telegram-search-sticker-sets` | Search Telegram's sticker catalog |

## Media

| Tool | Description |
|------|-------------|
| `telegram-send-file` | Send a file, photo, or document |
| `telegram-download-media` | Download media from a message |
| `telegram-get-profile-photo` | Get a user's or chat's profile photo |
| `telegram-get-web-preview` | Preview a URL's title/description/site before sending |

## Groups

| Tool | Description |
|------|-------------|
| `telegram-create-group` | Create a new group |
| `telegram-edit-group` | Edit group title, description, or photo |
| `telegram-invite-to-group` | Invite users to a group |
| `telegram-join-chat` | Join a group or channel via invite link |
| `telegram-leave-group` | Leave a group or channel |
| `telegram-kick-user` | Remove a user from a group |
| `telegram-ban-user` | Ban a user from a group |
| `telegram-unban-user` | Unban a user |
| `telegram-set-admin` | Promote a user to admin with custom permissions |
| `telegram-remove-admin` | Remove admin rights from a user |
| `telegram-get-my-role` | Check your role and permissions in a group |
| `telegram-set-chat-permissions` | Set default banned rights for all members (omitted flags keep their current state) |
| `telegram-set-slow-mode` | Set slow-mode interval in a supergroup |
| `telegram-get-admin-log` | Read the moderation/admin event log |

## Chat Info

| Tool | Description |
|------|-------------|
| `telegram-get-chat-info` | Get detailed chat info (title, members, photo, etc.) |
| `telegram-get-chat-members` | List members of a group or channel |
| `telegram-get-chat-folders` | List your chat folders |

## Invite Links

| Tool | Description |
|------|-------------|
| `telegram-create-invite-link` | Create an invite link with optional limits |
| `telegram-get-invite-links` | List existing invite links |
| `telegram-revoke-invite-link` | Revoke an invite link |

## Contacts

| Tool | Description |
|------|-------------|
| `telegram-get-contacts` | List your contacts |
| `telegram-add-contact` | Add a new contact |
| `telegram-get-contact-requests` | View pending contact requests |

## Moderation

| Tool | Description |
|------|-------------|
| `telegram-block-user` | Block a user |
| `telegram-unblock-user` | Unblock a user |
| `telegram-report-spam` | Report spam |

## Profiles

| Tool | Description |
|------|-------------|
| `telegram-get-profile` | Get a user's profile info |
| `telegram-update-profile` | Update your own profile (name, bio, username) |

## Account

| Tool | Description |
|------|-------------|
| `telegram-get-sessions` | List active sessions (devices) |
| `telegram-terminate-session` | Terminate a session |
| `telegram-set-privacy` | Configure privacy settings (phone, last seen, etc.) |
| `telegram-set-auto-delete` | Set auto-delete timer for a chat |

## Pinning

| Tool | Description |
|------|-------------|
| `telegram-pin-message` | Pin a message in a chat |
| `telegram-unpin-message` | Unpin a message or all messages |

## Chat Settings

| Tool | Description |
|------|-------------|
| `telegram-mute-chat` | Mute or unmute chat notifications |
| `telegram-archive-chat` | Move a chat to/from the Archive folder |
| `telegram-pin-chat` | Pin or unpin a dialog in the chat list |
| `telegram-mark-dialog-unread` | Mark a dialog as unread or clear the unread flag |

## Admin Toggles & Customization

| Tool | Description |
|------|-------------|
| `telegram-toggle-channel-signatures` | Toggle post signatures on a channel |
| `telegram-toggle-anti-spam` | Toggle native anti-spam in a supergroup (admin with `ban_users`) |
| `telegram-toggle-forum-mode` | Enable/disable forum mode (disabling removes all topics; requires `confirm: true`) |
| `telegram-toggle-prehistory-hidden` | Hide or show pre-history for new supergroup members |
| `telegram-set-chat-reactions` | Configure allowed reactions on a chat (`all` / `some` / `none`) |
| `telegram-approve-join-request` | Approve or reject a chat join request |

## Stats

| Tool | Description |
|------|-------------|
| `telegram-get-broadcast-stats` | Get channel stats (pass `includeGraphs: true` for raw series; Premium admin may be required) |
| `telegram-get-megagroup-stats` | Get supergroup stats (Telegram rate-limits to ~1 req/30 min per channel) |

## Inline Bots & Buttons

| Tool | Description |
|------|-------------|
| `telegram-inline-query` | Query an inline bot in a chat context (queryId TTL ≈ 1 min) |
| `telegram-inline-query-send` | Send an inline bot result by queryId + result id |
| `telegram-press-button` | Press a callback button on a message by row/col or raw data |
| `telegram-get-message-buttons` | List a message's reply-markup buttons with indices and types |

## Real-Time Updates (Polling)

Cursors are client-owned — the agent stores `{pts, qts, date}` between calls and passes them in.

| Tool | Description |
|------|-------------|
| `telegram-get-state` | Initialize a polling cursor (`pts`, `qts`, `date`, `seq`) |
| `telegram-get-updates` | Fetch global updates since a known cursor (falls back to history hint on `DifferenceTooLong`) |
| `telegram-get-channel-updates` | Fetch per-channel updates since a known channel cursor |

## Stories

| Tool | Description |
|------|-------------|
| `telegram-get-all-stories` | List stories across peers with pagination state |
| `telegram-get-peer-stories` | List stories posted by one peer |
| `telegram-get-stories-by-id` | Fetch specific story items by id |
| `telegram-get-story-views` | List views on your own stories (Premium for full stats) |

## Boosts & Business

| Tool | Description |
|------|-------------|
| `telegram-get-my-boosts` | List boost slots assigned by your account |
| `telegram-get-boosts-status` | Boost status for a channel/supergroup |
| `telegram-get-boosts-list` | List boosters for a channel (admin) |
| `telegram-get-business-chat-links` | List your Telegram Business chat links |

## Opt-In (env-gated)

These tools are only registered when the corresponding environment flag is set.

| Tool | Env flag |
|------|----------|
| `telegram-get-group-call` | `MCP_TELEGRAM_ENABLE_GROUP_CALLS=1` |
| `telegram-get-group-call-participants` | `MCP_TELEGRAM_ENABLE_GROUP_CALLS=1` |
| `telegram-get-stars-status` | `MCP_TELEGRAM_ENABLE_STARS=1` |
| `telegram-get-stars-transactions` | `MCP_TELEGRAM_ENABLE_STARS=1` |
| `telegram-get-quick-replies` | `MCP_TELEGRAM_ENABLE_QUICK_REPLIES=1` |
| `telegram-get-quick-reply-messages` | `MCP_TELEGRAM_ENABLE_QUICK_REPLIES=1` |

---

::: tip
You don't need to memorize these tools. Just describe what you want in natural language — your AI assistant will pick the right tool automatically.
:::
