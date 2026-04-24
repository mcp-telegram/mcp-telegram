import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import {
  DESTRUCTIVE,
  fail,
  formatReactions,
  ok,
  READ_ONLY,
  requireConnection,
  sanitizeInputText,
  WRITE,
} from "./shared.js";

export function registerMessageTools(server: McpServer, telegram: TelegramService) {
  server.registerTool(
    "telegram-send-message",
    {
      description: "Send a message to a Telegram chat",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username (e.g. @username or numeric ID)"),
        text: z.string().transform(sanitizeInputText).describe("Message text"),
        replyTo: z.number().optional().describe("Message ID to reply to"),
        parseMode: z.enum(["md", "html"]).optional().describe("Message format: md (Markdown) or html"),
        topicId: z.number().optional().describe("Forum topic ID to send message into (for groups with Topics enabled)"),
        quoteText: z
          .string()
          .transform(sanitizeInputText)
          .optional()
          .describe(
            "Optional excerpt from the replied-to message to show as a quote above your reply. " +
              "Requires `replyTo` to be set. Must be a verbatim substring of the original message text.",
          ),
        effect: z
          .string()
          .regex(/^\d{1,19}$/)
          .optional()
          .describe(
            "Optional message effect ID (numeric string, up to 19 digits). Premium animated effect attached to the message.",
          ),
      },
      annotations: WRITE,
    },
    async ({ chatId, text, replyTo, parseMode, topicId, quoteText, effect }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const extra = quoteText || effect ? { quoteText, effect } : undefined;
        const result = await telegram.sendMessage(chatId, text, replyTo, parseMode, topicId, extra);
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
        return ok(text || "No messages");
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
        return ok(text || "No messages found");
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
        return ok(text || "No messages found");
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
        return ok(text || "No unread chats");
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
        return ok(text || "No scheduled messages");
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
        return ok(text || "No replies");
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
        return ok(link);
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
        return ok(text || "No unread mentions");
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
        return ok(text || "No unread reactions");
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
        return ok(text || "No translations");
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

  server.registerTool(
    "telegram-inline-query",
    {
      description:
        "Query an inline bot (like @gif, @bing) in a chat context and return the compact result list. Returns queryId, cacheTime, and results[{id,type,title?,description?,url?}]. The queryId is typically valid for ~60s and can be passed to telegram-inline-query-send to deliver a chosen result. Bot must be a real bot account",
      inputSchema: {
        bot: z.string().describe("Inline bot username (e.g. @gif) or numeric user ID"),
        chatId: z.string().describe("Chat ID or username providing context for the inline query"),
        query: z.string().describe("Query text the bot should resolve (may be empty string)"),
        offset: z
          .string()
          .optional()
          .describe("Pagination offset returned by a previous call as nextOffset (empty string on first call)"),
      },
      annotations: READ_ONLY,
    },
    async ({ bot, chatId, query, offset }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const res = await telegram.getInlineBotResults(bot, chatId, query, offset);
        return ok(JSON.stringify(res));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-inline-query-send",
    {
      description:
        "Send an inline bot result to a chat by queryId + resultId (as returned by telegram-inline-query). The queryId is valid for ~60s after the original query, so call this soon after telegram-inline-query. Returns the sent messageId (0 if not extractable from the update).",
      inputSchema: {
        chatId: z.string().describe("Target chat ID or username to send the result into"),
        queryId: z
          .string()
          .regex(/^\d+$/, "queryId must be a numeric string")
          .describe("queryId from a prior telegram-inline-query call (valid ~60s)"),
        resultId: z.string().describe("id of the chosen result from telegram-inline-query results[]"),
        replyTo: z.number().optional().describe("Message ID to reply to"),
        silent: z.boolean().optional().describe("Send without notification"),
        hideVia: z.boolean().optional().describe("Hide the 'via @bot' label on the sent message"),
        clearDraft: z.boolean().optional().describe("Clear the chat draft after sending"),
      },
      annotations: WRITE,
    },
    async ({ chatId, queryId, resultId, replyTo, silent, hideVia, clearDraft }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const { messageId } = await telegram.sendInlineBotResult(chatId, queryId, resultId, {
          replyTo,
          silent,
          hideVia,
          clearDraft,
        });
        const idInfo = messageId ? ` [#${messageId}]` : "";
        return ok(`Inline result ${resultId} sent to ${chatId}${idInfo}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-message-buttons",
    {
      description:
        "List the inline/reply keyboard buttons on a Telegram message with their (row, col) indices, type (e.g. KeyboardButtonCallback, KeyboardButtonUrl), label and type-specific fields (callback data as base64, url, switchQuery, userId, copyText, etc). Helper for telegram-press-button — call this first to discover indices and filter by type before pressing. Returns markupType='none' and empty buttons when the message has no keyboard",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username where the message lives"),
        messageId: z.number().describe("Message ID whose keyboard to inspect"),
      },
      annotations: READ_ONLY,
    },
    async ({ chatId, messageId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const result = await telegram.getMessageButtons(chatId, messageId);
        return ok(JSON.stringify(result));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-press-button",
    {
      description:
        "Press an inline keyboard callback button on a message. Identify the button by (row, column) from its replyMarkup, or pass raw callback_data as base64. URL, switch-inline, game and 2FA-password buttons are rejected with a clear error. Returns the bot's callback answer: {alert?, hasUrl?, nativeUi?, message?, url?, cacheTime}",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username where the message lives"),
        messageId: z.number().describe("Message ID whose inline button to press"),
        row: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe("Button row index (0-based) — required unless data is provided"),
        column: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe("Button column index (0-based) — required unless data is provided"),
        data: z.string().optional().describe("Raw callback_data as base64 string (escape hatch — prefer row/column)"),
      },
      annotations: WRITE,
    },
    async ({ chatId, messageId, row, column, data }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      const hasIndex = row !== undefined && column !== undefined;
      if (!hasIndex && data === undefined) {
        return fail(new Error("Provide either both row+column, or data (base64 callback_data)"));
      }
      if (hasIndex && data !== undefined) {
        return fail(new Error("Provide either row+column OR data, not both"));
      }

      try {
        const answer = await telegram.pressButton(chatId, messageId, {
          buttonIndex: hasIndex ? { row: row as number, column: column as number } : undefined,
          data,
        });
        return ok(JSON.stringify(answer));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-state",
    {
      description:
        "Initialize the polling cursor by fetching the current Telegram updates state {pts, qts, date, seq, unreadCount}. Call once before telegram-get-updates; then persist {pts, qts, date} in your agent state and feed them into telegram-get-updates. The MCP server does NOT store the cursor — you do.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const state = await telegram.getUpdatesState();
        return ok(JSON.stringify(state));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-updates",
    {
      description:
        "Fetch new messages, deleted messages, and other updates since a previously-known {pts, qts, date} cursor (from telegram-get-state or a prior call). Returns compact newMessages[], deletedMessageIds[], otherUpdates[] (className only), and the new cursor state. isFinal=false means more updates are queued — call again with the returned state. If Telegram reports the gap is too long, a fallback hint is returned suggesting to resync via telegram-read-messages per chat. Cursor is stateless — the agent must persist {pts, qts, date} between calls.",
      inputSchema: {
        pts: z.number().int().describe("Last known pts (from telegram-get-state or prior telegram-get-updates)"),
        qts: z.number().int().describe("Last known qts (secret-chat / encrypted stream cursor; 0 if unknown)"),
        date: z.number().int().describe("Last known date (unix seconds from prior state)"),
        ptsLimit: z
          .number()
          .int()
          .positive()
          .max(1000)
          .optional()
          .describe("Max updates per batch (default 100, capped at 1000)"),
        ptsTotalLimit: z
          .number()
          .int()
          .positive()
          .max(1000)
          .optional()
          .describe("Max total updates across paginated slices (default 1000, capped at 1000)"),
      },
      annotations: READ_ONLY,
    },
    async ({ pts, qts, date, ptsLimit, ptsTotalLimit }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const diff = await telegram.getUpdates({ pts, qts, date, ptsLimit, ptsTotalLimit });
        return ok(JSON.stringify(diff));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-channel-updates",
    {
      description:
        "Fetch new messages and updates for a single channel/supergroup since a known per-channel pts cursor. Separate from the global cursor used by telegram-get-updates. Returns compact newMessages[], otherUpdates[], and new {pts, isFinal, timeout?}. If the channel gap is too long, Telegram returns a dialog snapshot — this tool forwards it and hints to resync via telegram-read-messages. Cursor is stateless — the agent stores pts.",
      inputSchema: {
        chatId: z.string().describe("Channel or supergroup ID or username"),
        pts: z.number().int().describe("Last known per-channel pts"),
        limit: z.number().int().positive().optional().describe("Max updates per batch (default 100)"),
        force: z
          .boolean()
          .optional()
          .describe("Force request updates even if the client hasn't processed previous ones (rarely needed)"),
      },
      annotations: READ_ONLY,
    },
    async ({ chatId, pts, limit, force }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const diff = await telegram.getChannelUpdates(chatId, { pts, limit, force });
        return ok(JSON.stringify(diff));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
