# Manage Groups

MCP Telegram provides full group management — create, configure, invite members, set admins, and more.

## Create a Group

> **You:** Create a Telegram group called "Project Alpha" and invite @alice and @bob

Uses `telegram-create-group` and `telegram-invite-to-group`.

## Invite Members

> **You:** Invite @charlie to the Project Alpha group

## Set Admins

> **You:** Make @alice an admin in Project Alpha

Uses `telegram-set-admin` with customizable permissions.

## Moderate

> **You:** Kick @spammer from the group

> **You:** Ban @troll from the Engineering group

## Group Settings

> **You:** Set auto-delete to 1 week in the Project Alpha group

> **You:** Mute the Random group

## Available Group Tools

| Tool | What It Does |
|------|-------------|
| `telegram-create-group` | Create a new group |
| `telegram-edit-group` | Edit group title, description, photo |
| `telegram-invite-to-group` | Invite users to a group |
| `telegram-join-chat` | Join a group/channel via invite link |
| `telegram-leave-group` | Leave a group |
| `telegram-kick-user` | Remove a user from a group |
| `telegram-ban-user` / `telegram-unban-user` | Ban/unban users |
| `telegram-set-admin` / `telegram-remove-admin` | Manage admins |
| `telegram-get-my-role` | Check your role in a group |
| `telegram-get-chat-members` | List group members |
| `telegram-create-invite-link` | Create invite links |
| `telegram-mute-chat` | Mute/unmute notifications |
| `telegram-set-auto-delete` | Set auto-delete timer |
