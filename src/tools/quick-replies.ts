import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import { fail, ok, READ_ONLY, requireConnection, sanitize } from "./shared.js";

export function isQuickRepliesEnabled(): boolean {
  return process.env.MCP_TELEGRAM_ENABLE_QUICK_REPLIES === "1";
}

export function registerQuickRepliesTools(server: McpServer, telegram: TelegramService) {
  if (!isQuickRepliesEnabled()) return;

  server.registerTool(
    "telegram-get-quick-replies",
    {
      description:
        "Fetch the list of quick-reply shortcuts configured for the user account (messages.GetQuickReplies). Each entry has {shortcutId, shortcut, topMessage, count} — use the shortcutId with telegram-get-quick-reply-messages to inspect the stored messages. Optional `hash` implements Telegram's hash-based diff: pass the last-known aggregate hash as a decimal string and the server may respond with {notModified:true} if nothing changed. Opt-in: register only when MCP_TELEGRAM_ENABLE_QUICK_REPLIES=1. Read-only.",
      inputSchema: {
        hash: z
          .string()
          .regex(/^\d+$/)
          .optional()
          .describe("Aggregate hash from a previous response (decimal string); omit for a fresh fetch"),
      },
      annotations: READ_ONLY,
    },
    async ({ hash }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.getQuickReplies(hash);
        return ok(sanitize(JSON.stringify(result)));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-quick-reply-messages",
    {
      description:
        "Fetch messages stored under a quick-reply shortcut (messages.GetQuickReplyMessages). Use `shortcutId` from telegram-get-quick-replies. Optional `ids` narrows to specific message ids within the shortcut. Optional `hash` implements Telegram's hash-based diff: pass the last-known aggregate hash as a decimal string — the server may respond with {notModified:true, count} if nothing changed. Returns compact {count, messages[{id, date, text, isService, fromId?, replyToMsgId?}]}. Opt-in: register only when MCP_TELEGRAM_ENABLE_QUICK_REPLIES=1. Read-only.",
      inputSchema: {
        shortcutId: z.number().int().nonnegative().describe("Shortcut id from telegram-get-quick-replies"),
        ids: z
          .array(z.number().int().nonnegative())
          .optional()
          .describe("Optional list of message ids to fetch within the shortcut"),
        hash: z
          .string()
          .regex(/^\d+$/)
          .optional()
          .describe("Aggregate hash from a previous response (decimal string); omit for a fresh fetch"),
      },
      annotations: READ_ONLY,
    },
    async ({ shortcutId, ids, hash }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.getQuickReplyMessages(shortcutId, { ids, hash });
        return ok(sanitize(JSON.stringify(result)));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
