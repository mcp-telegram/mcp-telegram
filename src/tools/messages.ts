import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import { DESTRUCTIVE, fail, formatReactions, ok, READ_ONLY, requireConnection, sanitize, WRITE } from "./shared.js";

export function registerMessageTools(server: McpServer, telegram: TelegramService) {
  server.registerTool(
    "telegram-send-message",
    {
      description: "Send a message to a Telegram chat",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username (e.g. @username or numeric ID)"),
        text: z.string().describe("Message text"),
        replyTo: z.number().optional().describe("Message ID to reply to"),
        parseMode: z.enum(["md", "html"]).optional().describe("Message format: md (Markdown) or html"),
        topicId: z.number().optional().describe("Forum topic ID to send message into (for groups with Topics enabled)"),
      },
      annotations: WRITE,
    },
    async ({ chatId, text, replyTo, parseMode, topicId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.sendMessage(chatId, text, replyTo, parseMode, topicId);
        const dest = topicId ? `topic ${topicId} in ${chatId}` : chatId;
        return ok(`Message sent to ${dest}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-read-messages",
    {
      description: "Read recent messages from a Telegram chat with sender names, dates, media info, and reactions",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        limit: z.number().default(10).describe("Number of messages to return"),
        offsetId: z.number().optional().describe("Message ID to start from (for pagination)"),
        minDate: z.number().optional().describe("Unix timestamp: only messages after this date"),
        maxDate: z.number().optional().describe("Unix timestamp: only messages before this date"),
      },
      annotations: READ_ONLY,
    },
    async ({ chatId, limit, offsetId, minDate, maxDate }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const messages = await telegram.getMessages(chatId, limit, offsetId, minDate, maxDate);
        const text = messages
          .map(
            (m) =>
              `[#${m.id}] [${m.date}] ${m.sender}: ${m.text}${m.media ? ` [${m.media.type}${m.media.fileName ? `: ${m.media.fileName}` : ""}]` : ""}${formatReactions(m.reactions)}`,
          )
          .join("\n\n");
        return ok(sanitize(text) || "No messages");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-search-messages",
    {
      description: "Search messages in a specific Telegram chat by text",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        query: z.string().describe("Search text"),
        limit: z.number().default(20).describe("Max results"),
        minDate: z.number().optional().describe("Unix timestamp: only messages after this date"),
        maxDate: z.number().optional().describe("Unix timestamp: only messages before this date"),
      },
      annotations: READ_ONLY,
    },
    async ({ chatId, query, limit, minDate, maxDate }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const messages = await telegram.searchMessages(chatId, query, limit, minDate, maxDate);
        const text = messages
          .map(
            (m) =>
              `[#${m.id}] [${m.date}] ${m.sender}: ${m.text}${m.media ? ` [${m.media.type}${m.media.fileName ? `: ${m.media.fileName}` : ""}]` : ""}${formatReactions(m.reactions)}`,
          )
          .join("\n\n");
        return ok(sanitize(text) || "No messages found");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-search-global",
    {
      description: "Search messages globally across all public Telegram chats and channels",
      inputSchema: {
        query: z.string().describe("Search text"),
        limit: z.number().default(20).describe("Max results"),
        minDate: z.number().optional().describe("Unix timestamp: only messages after this date"),
        maxDate: z.number().optional().describe("Unix timestamp: only messages before this date"),
      },
      annotations: READ_ONLY,
    },
    async ({ query, limit, minDate, maxDate }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const messages = await telegram.searchGlobal(query, limit, minDate, maxDate);
        const text = messages
          .map(
            (m) =>
              `[#${m.id}] [${m.date}] [${m.chat.type === "channel" ? "C" : m.chat.type === "group" ? "G" : "P"} ${m.chat.name}${m.chat.username ? ` @${m.chat.username}` : ""}] ${m.sender}: ${m.text}${m.media ? ` [${m.media.type}${m.media.fileName ? `: ${m.media.fileName}` : ""}]` : ""}${formatReactions(m.reactions)}`,
          )
          .join("\n\n");
        return ok(sanitize(text) || "No messages found");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-edit-message",
    {
      description: "Edit a previously sent message in Telegram",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        messageId: z.number().describe("ID of the message to edit"),
        text: z.string().describe("New message text"),
      },
      annotations: WRITE,
    },
    async ({ chatId, messageId, text }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.editMessage(chatId, messageId, text);
        return ok(`Message ${messageId} edited in ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-delete-message",
    {
      description: "Delete messages in a Telegram chat",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        messageIds: z.array(z.number()).describe("Array of message IDs to delete"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ chatId, messageIds }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.deleteMessages(chatId, messageIds);
        return ok(`Deleted ${messageIds.length} message(s) in ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-forward-message",
    {
      description: "Forward messages between Telegram chats",
      inputSchema: {
        fromChatId: z.string().describe("Source chat ID or username"),
        toChatId: z.string().describe("Destination chat ID or username"),
        messageIds: z.array(z.number()).describe("Array of message IDs to forward"),
      },
      annotations: WRITE,
    },
    async ({ fromChatId, toChatId, messageIds }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.forwardMessage(fromChatId, toChatId, messageIds);
        return ok(`Forwarded ${messageIds.length} message(s) from ${fromChatId} to ${toChatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-unread",
    {
      description: "Get chats with unread messages. Forums show per-topic unread breakdown",
      inputSchema: {
        limit: z.number().default(20).describe("Number of unread chats to return"),
      },
      annotations: READ_ONLY,
    },
    async ({ limit }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const dialogs = await telegram.getUnreadDialogs(limit);
        const text = dialogs
          .map((d) => {
            const prefix = d.type === "group" ? "G" : d.type === "channel" ? "C" : "P";
            const botTag = d.isBot ? " [bot]" : "";
            const contactTag = d.type === "private" && d.isContact === false ? " [not in contacts]" : "";
            const forumTag = d.forum ? " [forum]" : "";
            let line = `${prefix} ${d.name} (${d.id})${botTag}${contactTag}${forumTag} [${d.unreadCount} unread]`;
            if (d.topics && d.topics.length > 0) {
              const topicLines = d.topics.map((t) => `  # ${t.title} [${t.unreadCount} unread]`);
              line += `\n${topicLines.join("\n")}`;
            }
            return line;
          })
          .join("\n");
        return ok(sanitize(text) || "No unread chats");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-mark-as-read",
    {
      description: "Mark a Telegram chat as read",
      inputSchema: { chatId: z.string().describe("Chat ID or username") },
      annotations: WRITE,
    },
    async ({ chatId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.markAsRead(chatId);
        return ok(`Marked ${chatId} as read`);
      } catch (e) {
        return fail(e);
      }
    },
  );
}
