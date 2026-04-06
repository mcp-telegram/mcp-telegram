# Summarize Unread Messages

One of the most popular use cases — let your AI assistant catch you up on what you missed.

## Simple Approach

Just ask naturally:

> **You:** What are my unread Telegram messages?

Your AI will use `telegram-get-unread` to fetch chats with unread messages, then `telegram-read-messages` to get the actual content.

## Advanced: Prioritized Summary

> **You:** Check my unread Telegram messages. Prioritize work chats, summarize personal chats briefly.

## Mark as Read

After catching up:

> **You:** Mark the Engineering group as read

The AI uses `telegram-mark-as-read` to clear the unread counter.

## How It Works

Behind the scenes, the AI uses these tools:

1. **`telegram-get-unread`** — lists all chats with unread messages, showing counts and last message preview
2. **`telegram-read-messages`** — reads the actual messages from each chat
3. **`telegram-mark-as-read`** — optionally marks chats as read

## Tips

- You can ask for specific chats: *"Unread messages from the Design team"*
- Works with groups, channels, and direct messages
- Forum topics are supported: *"What's new in the #general topic?"*
