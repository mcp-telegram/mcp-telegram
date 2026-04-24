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
        return ok(reactions.map((r) => r.emoji).join(" "));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-set-chat-reactions",
    {
      description:
        "Set which reactions are available in a chat. type='all' allows all standard emoji (set allowCustom=true to also permit custom emoji for Premium users), type='some' restricts to a specific emoji list, type='none' disables reactions entirely. Requires admin",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username (group, supergroup, or channel)"),
        reactions: z
          .discriminatedUnion("type", [
            z.object({
              type: z.literal("all"),
              allowCustom: z
                .boolean()
                .optional()
                .describe("If true, also allow custom emoji reactions (requires Premium users)"),
            }),
            z.object({
              type: z.literal("some"),
              emoji: z
                .array(z.string().min(1).max(8))
                .min(1)
                .max(100)
                .describe("List of allowed reaction emoji (e.g. ['👍','❤️','🔥'])"),
            }),
            z.object({ type: z.literal("none") }),
          ])
          .describe("Reaction policy for the chat"),
      },
      annotations: WRITE,
    },
    async ({ chatId, reactions }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.setChatAvailableReactions(chatId, reactions);
        const summary =
          reactions.type === "all"
            ? `all reactions${reactions.allowCustom ? " (incl. custom)" : ""}`
            : reactions.type === "none"
              ? "no reactions"
              : `${reactions.emoji.length} reaction(s): ${sanitize(reactions.emoji.join(" "))}`;
        return ok(`Set ${summary} for ${chatId}`);
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
        return ok(reactions.map((r) => r.emoji).join(" "));
      } catch (e) {
        return fail(e);
      }
    },
  );

  // ─── Paid reactions ────────────────────────────────────────────────────────

  server.registerTool(
    "telegram-send-paid-reaction",
    {
      description:
        "Send a paid reaction (★ Stars) on a channel post. Stars are spent from your balance. Optional private flag controls leaderboard visibility.",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username (channel)"),
        messageId: z.number().int().positive().describe("Message ID of the channel post"),
        count: z.number().int().min(1).max(2500).default(1).describe("Number of Stars to send (1-2500)"),
        private: z
          .boolean()
          .optional()
          .describe("true = anonymous on leaderboard, false = show name, omit = use account default"),
      },
      annotations: WRITE,
    },
    async ({ chatId, messageId, count, private: privateFlag }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        await telegram.sendPaidReaction(chatId, messageId, count, { private: privateFlag });
        const privacy = privateFlag === true ? " (anonymous)" : privateFlag === false ? " (public)" : "";
        return ok(`Sent ★×${count} paid reaction to message #${messageId} in ${chatId}${privacy}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-toggle-paid-reaction-privacy",
    {
      description: "Change leaderboard visibility of your paid reaction on a specific channel post (Layer 198 API).",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username (channel)"),
        messageId: z.number().int().positive().describe("Message ID of the channel post"),
        private: z.boolean().describe("true = anonymous on leaderboard, false = show name"),
      },
      annotations: WRITE,
    },
    async ({ chatId, messageId, private: privateFlag }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        await telegram.togglePaidReactionPrivacy(chatId, messageId, privateFlag);
        return ok(
          `Updated paid reaction privacy on message #${messageId} in ${chatId}: ${privateFlag ? "anonymous" : "show name"}`,
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-paid-reaction-privacy",
    {
      description: "Get your current default paid reaction privacy setting.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.getPaidReactionPrivacy();
        return ok(`Default paid reaction privacy: ${result.private ? "anonymous" : "show name"}`);
      } catch (e) {
        return fail(e);
      }
    },
  );
}
