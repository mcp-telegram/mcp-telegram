import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import { fail, ok, READ_ONLY, requireConnection } from "./shared.js";

export function registerMusicTools(server: McpServer, telegram: TelegramService) {
  server.registerTool(
    "telegram-get-saved-music",
    {
      description:
        "List the songs pinned to a user's profile (users.GetSavedMusic) — the tracks behind the music row on a Telegram profile. Returns count plus tracks with title, performer, duration, fileName, mimeType and size; element 0 is the track shown on the profile. Defaults to your own profile. Supports pagination via offset/limit and returns nextOffset when more remain. Read-only.",
      inputSchema: {
        user: z
          .string()
          .optional()
          .describe("User to query — id, @username, or display name fragment. Defaults to yourself"),
        offset: z.number().int().min(0).optional().describe("Pagination offset (default 0)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Max tracks to return per page (default 50, max 100)"),
      },
      annotations: READ_ONLY,
    },
    async ({ user, offset, limit }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.getSavedMusic(user, { offset, limit });
        return ok(JSON.stringify(result));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
