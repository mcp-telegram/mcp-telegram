import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import { fail, ok, READ_ONLY, requireConnection, WRITE } from "./shared.js";

export function registerStickerTools(server: McpServer, telegram: TelegramService) {
  server.registerTool(
    "telegram-get-sticker-set",
    {
      description:
        "Get all stickers from a sticker set by its short name. Returns each sticker with index and emoji. Use the index with telegram-send-sticker to send a specific sticker",
      inputSchema: {
        shortName: z
          .string()
          .describe(
            "Short name of the sticker set (e.g. 'AnimatedEmojis', 'HotCherry'). Find names via telegram-search-sticker-sets or from t.me/addstickers/<shortName> links",
          ),
      },
      annotations: READ_ONLY,
    },
    async ({ shortName }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const set = await telegram.getStickerSet(shortName);
        const lines: string[] = [];
        lines.push(`📦 ${set.title} (${set.shortName})`);
        lines.push(`${set.count} stickers`);
        lines.push("");

        for (let i = 0; i < set.stickers.length; i++) {
          const s = set.stickers[i];
          lines.push(`[${i}] ${s.emoji}`);
        }

        lines.push("");
        lines.push(`Send a sticker: telegram-send-sticker(chatId, stickerSet="${set.shortName}", index=N)`);
        return ok(lines.join("\n"));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-search-sticker-sets",
    {
      description:
        "Search for sticker sets by name or keyword. Returns matching sticker pack names that can be used with telegram-get-sticker-set",
      inputSchema: {
        query: z.string().describe("Search query (e.g. 'cat', 'love', 'pepe', 'anime')"),
      },
      annotations: READ_ONLY,
    },
    async ({ query }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const sets = await telegram.searchStickerSets(query);
        if (sets.length === 0) {
          return ok(`No sticker sets found for "${query}". Try different keywords.`);
        }
        const lines: string[] = [];
        lines.push(`Found ${sets.length} sticker set(s) for "${query}":\n`);
        for (const set of sets) {
          lines.push(`• ${set.title} — ${set.count} stickers`);
          lines.push(`  Short name: ${set.shortName}`);
        }
        lines.push("");
        lines.push("Use telegram-get-sticker-set(shortName) to see individual stickers.");
        return ok(lines.join("\n"));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-installed-stickers",
    {
      description:
        "List all sticker sets installed by the user. Returns pack names and short names for use with other sticker tools",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const sets = await telegram.getInstalledStickerSets();
        if (sets.length === 0) {
          return ok("No sticker sets installed.");
        }
        const lines: string[] = [];
        lines.push(`${sets.length} installed sticker set(s):\n`);
        for (const set of sets) {
          lines.push(`• ${set.title} — ${set.count} stickers`);
          lines.push(`  Short name: ${set.shortName}`);
        }
        return ok(lines.join("\n"));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-send-sticker",
    {
      description:
        "Send a sticker from a sticker set to a chat. First use telegram-get-sticker-set to browse available stickers and find the index",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        stickerSet: z.string().describe("Short name of the sticker set (e.g. 'HotCherry')"),
        index: z
          .number()
          .int()
          .nonnegative()
          .describe("Index of the sticker in the set (0-based, get from telegram-get-sticker-set)"),
        replyTo: z.number().int().optional().describe("Message ID to reply to"),
      },
      annotations: WRITE,
    },
    async ({ chatId, stickerSet, index, replyTo }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.sendSticker(chatId, stickerSet, index, replyTo);
        return ok(`Sticker sent from "${stickerSet}" [${index}] to ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-recent-stickers",
    {
      description: "Get recently used stickers. Returns each sticker with its list index and associated emoji",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const stickers = await telegram.getRecentStickers();
        if (stickers.length === 0) {
          return ok("No recent stickers.");
        }
        const lines: string[] = [];
        lines.push(`${stickers.length} recent sticker(s):\n`);
        for (let i = 0; i < stickers.length; i++) {
          lines.push(`[${i}] ${stickers[i].emoji}`);
        }
        return ok(lines.join("\n"));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
