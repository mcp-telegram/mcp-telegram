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
        const result = await telegram.sendMessage(chatId, text, replyTo, parseMode, topicId);
        const dest = topicId ? `topic ${topicId} in ${chatId}` : chatId;
        const messageId = result?.id;
        const idInfo = messageId ? ` [#${messageId}]` : "";
        return ok(`Message sent to ${dest}${idInfo}`);
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
    "telegram-get-scheduled",
    {
      description: "List scheduled messages in a Telegram chat",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
      },
      annotations: READ_ONLY,
    },
    async ({ chatId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const messages = await telegram.getScheduledMessages(chatId);
        const text = messages
          .map(
            (m) =>
              `[#${m.id}] [${m.date}] ${m.text}${m.media ? ` [${m.media.type}${m.media.fileName ? `: ${m.media.fileName}` : ""}]` : ""}`,
          )
          .join("\n\n");
        return ok(sanitize(text) || "No scheduled messages");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-delete-scheduled",
    {
      description: "Delete scheduled messages in a Telegram chat",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        messageIds: z
          .array(z.number().int().positive())
          .min(1)
          .max(100)
          .describe("Array of scheduled message IDs to delete (1-100)"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ chatId, messageIds }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.deleteScheduledMessages(chatId, messageIds);
        return ok(`Deleted ${messageIds.length} scheduled message(s) in ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-replies",
    {
      description: "Get replies/comments under a Telegram channel post or discussion message",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username (channel or linked discussion group)"),
        messageId: z.number().describe("ID of the message whose replies to fetch"),
        limit: z.number().default(20).describe("Number of replies to return"),
      },
      annotations: READ_ONLY,
    },
    async ({ chatId, messageId, limit }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const messages = await telegram.getReplies(chatId, messageId, limit);
        const text = messages
          .map(
            (m) =>
              `[#${m.id}] [${m.date}] ${m.sender}: ${m.text}${m.media ? ` [${m.media.type}${m.media.fileName ? `: ${m.media.fileName}` : ""}]` : ""}${formatReactions(m.reactions)}`,
          )
          .join("\n\n");
        return ok(sanitize(text) || "No replies");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-message-link",
    {
      description: "Get a t.me link to a specific message in a Telegram channel or supergroup",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username (channel or supergroup)"),
        messageId: z.number().describe("ID of the message to link to"),
        thread: z.boolean().default(false).describe("Link to the message thread instead of the message itself"),
      },
      annotations: READ_ONLY,
    },
    async ({ chatId, messageId, thread }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const link = await telegram.getMessageLink(chatId, messageId, thread);
        return ok(sanitize(link));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-unread-mentions",
    {
      description:
        "Get unread @mentions addressed to you in a Telegram chat. Marks all mentions as read on the server when all unread mentions fit within the requested limit.",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        limit: z.number().default(20).describe("Max number of mentions to return"),
      },
      annotations: WRITE,
    },
    async ({ chatId, limit }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const messages = await telegram.getUnreadMentions(chatId, limit);
        const text = messages
          .map(
            (m) =>
              `[#${m.id}] [${m.date}] ${m.sender}: ${m.text}${m.media ? ` [${m.media.type}${m.media.fileName ? `: ${m.media.fileName}` : ""}]` : ""}${formatReactions(m.reactions)}`,
          )
          .join("\n\n");
        return ok(sanitize(text) || "No unread mentions");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-unread-reactions",
    {
      description:
        "Get messages with unread reactions on your posts in a Telegram chat. Marks all reactions as read on the server when all unread reactions fit within the requested limit.",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        limit: z.number().default(20).describe("Max number of messages to return"),
      },
      annotations: WRITE,
    },
    async ({ chatId, limit }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const messages = await telegram.getUnreadReactions(chatId, limit);
        const text = messages
          .map(
            (m) =>
              `[#${m.id}] [${m.date}] ${m.sender}: ${m.text}${m.media ? ` [${m.media.type}${m.media.fileName ? `: ${m.media.fileName}` : ""}]` : ""}${formatReactions(m.reactions)}`,
          )
          .join("\n\n");
        return ok(sanitize(text) || "No unread reactions");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-translate-message",
    {
      description:
        "Translate one or more Telegram messages to a target language (requires Telegram Premium). Consumes account translation quota.",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        messageIds: z
          .array(z.number().int().positive())
          .min(1)
          .max(100)
          .describe("Array of message IDs to translate (1-100)"),
        toLang: z
          .string()
          .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/)
          .describe("ISO 639-1 (e.g. 'en', 'ru') or locale (e.g. 'en-US')"),
      },
      annotations: WRITE,
    },
    async ({ chatId, messageIds, toLang }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const translations = await telegram.translateText(chatId, messageIds, toLang);
        const text =
          translations.length === messageIds.length
            ? translations.map((t, i) => `[#${messageIds[i]}] ${t}`).join("\n\n")
            : translations.join("\n\n");
        return ok(sanitize(text) || "No translations");
      } catch (e) {
        const msg = (e as Error).message ?? "";
        if (/PREMIUM|PAYMENT_REQUIRED|TRANSLATE_REQ/i.test(msg)) {
          return fail(new Error("Message translation requires Telegram Premium on this account"));
        }
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-send-typing",
    {
      description: "Send a typing/upload indicator to a Telegram chat (or cancel it)",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        action: z
          .enum(["typing", "upload_photo", "upload_document", "cancel"])
          .default("typing")
          .describe("Typing action to broadcast"),
      },
      annotations: WRITE,
    },
    async ({ chatId, action }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.sendTyping(chatId, action);
        return ok(`Typing indicator (${action}) sent to ${chatId}`);
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
