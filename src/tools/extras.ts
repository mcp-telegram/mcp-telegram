import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import { fail, formatReactions, ok, READ_ONLY, requireConnection, WRITE } from "./shared.js";

export function registerExtraTools(server: McpServer, telegram: TelegramService) {
  server.registerTool(
    "telegram-pin-message",
    {
      description: "Pin a message in a Telegram chat",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        messageId: z.number().describe("Message ID to pin"),
        silent: z.boolean().default(false).describe("Pin without notification"),
      },
      annotations: WRITE,
    },
    async ({ chatId, messageId, silent }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.pinMessage(chatId, messageId, silent);
        return ok(`Message ${messageId} pinned in ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-unpin-message",
    {
      description: "Unpin a message in a Telegram chat",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        messageId: z.number().describe("Message ID to unpin"),
      },
      annotations: WRITE,
    },
    async ({ chatId, messageId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.unpinMessage(chatId, messageId);
        return ok(`Message ${messageId} unpinned in ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-send-scheduled",
    {
      description:
        "Send a scheduled message to a Telegram chat. The message will be delivered at the specified time by Telegram servers",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username (use 'me' or 'self' for Saved Messages)"),
        text: z.string().describe("Message text"),
        scheduleDate: z.number().describe("Unix timestamp when to send the message (must be in the future)"),
        replyTo: z.number().optional().describe("Message ID to reply to"),
        parseMode: z.enum(["md", "html"]).optional().describe("Message format: md (Markdown) or html"),
      },
      annotations: WRITE,
    },
    async ({ chatId, text, scheduleDate, replyTo, parseMode }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      // Resolve 'me'/'self' to Saved Messages
      let target = chatId;
      if (target === "me" || target === "self") {
        try {
          const me = await telegram.getMe();
          target = me.id;
        } catch {
          return fail(new Error("Failed to resolve Saved Messages"));
        }
      }

      try {
        await telegram.sendScheduledMessage(target, text, scheduleDate, replyTo, parseMode);
        const date = new Date(scheduleDate * 1000).toISOString();
        return ok(`Message scheduled for ${date} in ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-create-poll",
    {
      description: "Create a poll in a Telegram chat (multiple choice or quiz mode)",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        question: z.string().describe("Poll question"),
        answers: z.array(z.string()).min(2).max(10).describe("Answer options (2-10)"),
        multipleChoice: z.boolean().default(false).describe("Allow multiple answers"),
        quiz: z.boolean().default(false).describe("Quiz mode (one correct answer)"),
        correctAnswer: z.number().optional().describe("Index of correct answer (0-based, required for quiz mode)"),
      },
      annotations: WRITE,
    },
    async ({ chatId, question, answers, multipleChoice, quiz, correctAnswer }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const msgId = await telegram.createPoll(chatId, question, answers, {
          multipleChoice,
          quiz,
          correctAnswer,
        });
        return ok(`Poll created in ${chatId}${msgId ? ` (message #${msgId})` : ""}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-list-topics",
    {
      description:
        "List forum topics in a Telegram group with Topics enabled. Shows topic names, unread counts, and status",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username of a group with Topics enabled"),
        limit: z.number().default(100).describe("Max topics to return"),
      },
      annotations: READ_ONLY,
    },
    async ({ chatId, limit }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const topics = await telegram.getForumTopics(chatId, limit);
        const text = topics
          .map((t) => {
            const flags = [t.pinned ? "pinned" : "", t.closed ? "closed" : ""].filter(Boolean).join(", ");
            const flagStr = flags ? ` [${flags}]` : "";
            const unread = t.unreadCount > 0 ? ` [${t.unreadCount} unread]` : "";
            return `# ${t.title} (id: ${t.id})${flagStr}${unread}`;
          })
          .join("\n");
        return ok(text || "No topics found");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-read-topic-messages",
    {
      description: "Read messages from a specific forum topic in a Telegram group",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        topicId: z.number().describe("Topic ID (get from telegram-list-topics)"),
        limit: z.number().default(20).describe("Number of messages to return"),
        offsetId: z.number().optional().describe("Message ID to start from (for pagination)"),
      },
      annotations: READ_ONLY,
    },
    async ({ chatId, topicId, limit, offsetId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const messages = await telegram.getTopicMessages(chatId, topicId, limit, offsetId);
        const text = messages
          .map(
            (m) =>
              `[#${m.id}] [${m.date}] ${m.sender}: ${m.text}${m.media ? ` [${m.media.type}${m.media.fileName ? `: ${m.media.fileName}` : ""}]` : ""}${formatReactions(m.reactions)}`,
          )
          .join("\n\n");
        return ok(text || "No messages in this topic");
      } catch (e) {
        return fail(e);
      }
    },
  );
}
