import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import { fail, ok, READ_ONLY, requireConnection, sanitize, WRITE } from "./shared.js";

export function registerReactionTools(server: McpServer, telegram: TelegramService) {
  server.registerTool(
    "telegram-send-reaction",
    {
      description:
        "Send emoji reaction(s) to a message. Supports multiple reactions and adding to existing ones. Omit emoji to remove all reactions",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        messageId: z.number().describe("Message ID to react to"),
        emoji: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe("Reaction emoji(s): single '👍' or array ['👍','🔥']. Omit to remove all reactions"),
        addToExisting: z
          .boolean()
          .default(false)
          .describe("If true, add reaction(s) to existing ones instead of replacing"),
      },
      annotations: WRITE,
    },
    async ({ chatId, messageId, emoji, addToExisting }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const updated = await telegram.sendReaction(chatId, messageId, emoji, addToExisting);
        const emojiStr = Array.isArray(emoji) ? emoji.join("") : emoji;
        const action = emoji ? `Reacted ${emojiStr} to` : "Removed reactions from";
        const reactionsInfo = updated
          ? ` | Reactions: ${updated.map((r) => `${r.emoji}×${r.count}${r.me ? "(me)" : ""}`).join(" ")}`
          : "";
        return ok(`${action} message ${messageId} in ${chatId}${reactionsInfo}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-reactions",
    {
      description: "Get detailed reaction info for a message: which reactions, counts, and who reacted (when visible)",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        messageId: z.number().describe("Message ID to get reactions for"),
      },
      annotations: READ_ONLY,
    },
    async ({ chatId, messageId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const result = await telegram.getMessageReactions(chatId, messageId);
        if (result.reactions.length === 0) {
          return ok(`No reactions on message ${messageId}`);
        }
        const lines = result.reactions.map((r) => {
          const usersStr = r.users.length > 0 ? `: ${r.users.map((u) => u.name).join(", ")}` : "";
          return `${r.emoji} × ${r.count}${usersStr}`;
        });
        lines.push(`\nTotal: ${result.total} reactions`);
        return ok(lines.join("\n"));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-set-default-reaction",
    {
      description: "Set the default emoji reaction used in quick-reaction menus across Telegram",
      inputSchema: {
        emoji: z.string().min(1).max(8).describe("Emoji character (e.g. 👍 ❤️ 🔥)"),
      },
      annotations: WRITE,
    },
    async ({ emoji }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.setDefaultReaction(emoji);
        return ok(`Default reaction set to ${sanitize(emoji)}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-top-reactions",
    {
      description: "Get the list of most popular emoji reactions available on Telegram",
      inputSchema: {
        limit: z.number().int().min(1).max(100).default(20).describe("Max number of reactions to return"),
      },
      annotations: READ_ONLY,
    },
    async ({ limit }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const reactions = await telegram.getTopReactions(limit);
        if (reactions.length === 0) return ok("No top reactions available");
        return ok(sanitize(reactions.map((r) => r.emoji).join(" ")));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-recent-reactions",
    {
      description: "Get the list of emoji reactions the current account used recently",
      inputSchema: {
        limit: z.number().int().min(1).max(100).default(20).describe("Max number of reactions to return"),
      },
      annotations: READ_ONLY,
    },
    async ({ limit }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const reactions = await telegram.getRecentReactions(limit);
        if (reactions.length === 0) return ok("No recent reactions");
        return ok(sanitize(reactions.map((r) => r.emoji).join(" ")));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
