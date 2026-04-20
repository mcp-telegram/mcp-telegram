import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import { fail, ok, READ_ONLY, requireConnection, sanitize } from "./shared.js";

export function registerBoostTools(server: McpServer, telegram: TelegramService) {
  server.registerTool(
    "telegram-get-my-boosts",
    {
      description:
        "List the user's premium boost slots (premium.GetMyBoosts). Each entry includes slot index, the peer it currently boosts (if any), the date the boost was applied, expiration timestamp, and cooldownUntilDate (when a slot can be reassigned). Premium users have multiple slots; non-Premium users typically have a single slot. Read-only.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.getMyBoosts();
        return ok(sanitize(JSON.stringify(result)));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-boosts-status",
    {
      description:
        "Fetch the boost status of a channel/supergroup (premium.GetBoostsStatus). Returns current boost level, total boosts, progress to next level (currentLevelBoosts/nextLevelBoosts), giftBoosts, premiumAudience ratio, public boostUrl, and whether the current user is boosting (myBoost + myBoostSlots). Also includes any prepaidGiveaways attached to the chat. Read-only.",
      inputSchema: {
        chat: z.string().describe("Channel or supergroup to query — id, @username, or display name fragment"),
      },
      annotations: READ_ONLY,
    },
    async ({ chat }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.getBoostsStatus(chat);
        return ok(sanitize(JSON.stringify(result)));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-boosts-list",
    {
      description:
        "List the boosts applied to a channel/supergroup (premium.GetBoostsList). Returns paginated boost entries with id, userId (or undefined for anonymous gift boosts), date, expires, flags (gift, giveaway, unclaimed), optional giveawayMsgId, usedGiftSlug, multiplier, and stars. Requires channel admin permissions. Supports pagination via nextOffset and an optional gifts filter to show only gift boosts. Read-only.",
      inputSchema: {
        chat: z.string().describe("Channel or supergroup to query — id, @username, or display name fragment"),
        gifts: z.boolean().optional().describe("If true, return only gift boosts"),
        offset: z.string().optional().describe("Pagination cursor returned as nextOffset from the previous call"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Max boosts to return per page (default 50, max 100)"),
      },
      annotations: READ_ONLY,
    },
    async ({ chat, gifts, offset, limit }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.getBoostsList(chat, { gifts, offset, limit });
        return ok(sanitize(JSON.stringify(result)));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
