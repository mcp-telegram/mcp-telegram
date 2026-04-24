import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import { fail, ok, READ_ONLY, requireConnection, WRITE } from "./shared.js";

const AUDIENCE = z.enum(["all_new", "contacts_only", "non_contacts", "existing_only"]).default("all_new");

export function registerBusinessTools(server: McpServer, telegram: TelegramService) {
  server.registerTool(
    "telegram-get-business-chat-links",
    {
      description:
        "List Telegram Business chat links configured for the account. Each entry includes the t.me/... link, the prefilled message, optional title (admin-facing label), views count, and entityCount. Requires Telegram Business — returns empty list when none configured.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.getBusinessChatLinks();
        return ok(JSON.stringify(result));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-create-business-chat-link",
    {
      description:
        "Create a Telegram Business chat link (t.me/m/... deep-link that opens a chat with you pre-filled with a message). Returns JSON with link, slug, message, title, and views. Requires Telegram Business subscription.",
      inputSchema: {
        message: z.string().min(1).max(4096).describe("Pre-filled message text shown to users who click the link"),
        title: z.string().max(32).optional().describe("Admin-facing label (not visible to visitors, max 32 chars)"),
        parseMode: z.enum(["md", "html"]).optional().describe("Format message as Markdown or HTML"),
      },
      annotations: WRITE,
    },
    async ({ message, title, parseMode }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.createBusinessChatLink({ message, title, parseMode });
        return ok(JSON.stringify(result));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-edit-business-chat-link",
    {
      description:
        "Edit an existing Telegram Business chat link by its slug (the trailing segment after t.me/m/). Returns JSON with updated fields. Requires Telegram Business subscription.",
      inputSchema: {
        slug: z.string().min(1).describe("Link slug — the last path segment of t.me/m/<slug>"),
        message: z.string().min(1).max(4096).describe("New pre-filled message text"),
        title: z.string().max(32).optional().describe("New admin-facing label (max 32 chars)"),
        parseMode: z.enum(["md", "html"]).optional().describe("Format message as Markdown or HTML"),
      },
      annotations: WRITE,
    },
    async ({ slug, message, title, parseMode }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.editBusinessChatLink({ slug, message, title, parseMode });
        return ok(JSON.stringify(result));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-delete-business-chat-link",
    {
      description: "Delete a Telegram Business chat link by its slug. Requires Telegram Business subscription.",
      inputSchema: {
        slug: z.string().min(1).describe("Link slug to delete (from t.me/m/<slug>)"),
      },
      annotations: WRITE,
    },
    async ({ slug }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        await telegram.deleteBusinessChatLink(slug);
        return ok(`Business chat link '${slug}' deleted`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-resolve-business-chat-link",
    {
      description:
        "Resolve a Telegram Business chat link by slug to see whose chat it opens and the pre-filled message. Returns JSON with peerId, peerType, message, and entityCount.",
      inputSchema: {
        slug: z.string().min(1).describe("Link slug to resolve (from t.me/m/<slug>)"),
      },
      annotations: READ_ONLY,
    },
    async ({ slug }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.resolveBusinessChatLink(slug);
        return ok(JSON.stringify(result));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-set-business-hours",
    {
      description:
        "Set Telegram Business work hours — days and time ranges when your business is open. Requires Telegram Business subscription. Pass clear=true to disable the work hours display entirely.",
      inputSchema: {
        timezone: z
          .string()
          .optional()
          .describe("IANA timezone ID (e.g. 'Europe/Moscow', 'America/New_York'). Required when setting schedule."),
        openNow: z
          .boolean()
          .optional()
          .describe("Manually override current open/closed status. Omit to derive from schedule."),
        schedule: z
          .array(
            z.object({
              day: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]).describe("Day of week"),
              openFrom: z
                .string()
                .regex(/^\d{2}:\d{2}$/)
                .describe("Opening time in 24h HH:MM format"),
              openTo: z
                .string()
                .regex(/^\d{2}:\d{2}$/)
                .describe("Closing time in 24h HH:MM. Use '24:00' for end of day."),
            }),
          )
          .optional()
          .describe("Weekly schedule. Multiple ranges per day are allowed."),
        clear: z.boolean().optional().describe("Pass true to remove business hours entirely"),
      },
      annotations: WRITE,
    },
    async ({ timezone, openNow, schedule, clear }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      if (!clear && (!timezone || !schedule?.length)) {
        return fail(new Error("timezone and schedule are required when not clearing"));
      }
      try {
        await telegram.setBusinessWorkHours({ timezone, openNow, schedule, clear });
        if (clear) return ok("Business hours cleared");
        return ok(`Business hours set: ${schedule?.length} range(s) in ${timezone}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-set-business-location",
    {
      description:
        "Set Telegram Business physical location (address + optional geo coordinates). Requires Telegram Business subscription. Pass clear=true to remove.",
      inputSchema: {
        address: z.string().min(1).max(512).optional().describe("Street address text"),
        latitude: z.number().min(-90).max(90).optional().describe("Geo latitude (-90 to 90)"),
        longitude: z.number().min(-180).max(180).optional().describe("Geo longitude (-180 to 180)"),
        clear: z.boolean().optional().describe("Pass true to remove business location"),
      },
      annotations: WRITE,
    },
    async ({ address, latitude, longitude, clear }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      if (!clear && !address) {
        return fail(new Error("address is required when not clearing"));
      }
      if ((latitude === undefined) !== (longitude === undefined)) {
        return fail(new Error("latitude and longitude must both be set or both omitted"));
      }
      try {
        await telegram.setBusinessLocation({ address, latitude, longitude, clear });
        if (clear) return ok("Business location cleared");
        const geo = latitude !== undefined ? ` @ ${latitude},${longitude}` : "";
        return ok(`Business location set: ${address}${geo}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-set-business-greeting",
    {
      description:
        "Set Telegram Business greeting message — auto-reply sent to new conversations using a quick reply shortcut as template. Requires Telegram Business subscription. Pass clear=true to disable.",
      inputSchema: {
        shortcutId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Quick reply shortcut ID (from telegram-get-quick-replies) used as the greeting template"),
        audience: AUDIENCE.describe(
          "Who receives the greeting: all_new (new contacts+non-contacts), contacts_only, non_contacts, existing_only",
        ),
        includeUsers: z.array(z.string()).optional().describe("Additional usernames/IDs to always include"),
        excludeUsers: z
          .array(z.string())
          .optional()
          .describe("Usernames/IDs to exclude — overrides audience. Cannot be combined with includeUsers."),
        noActivityDays: z
          .number()
          .int()
          .min(1)
          .max(365)
          .default(7)
          .describe("Send greeting if user has been inactive for N days"),
        clear: z.boolean().optional().describe("Pass true to disable greeting message"),
      },
      annotations: WRITE,
    },
    async ({ shortcutId, audience, includeUsers, excludeUsers, noActivityDays, clear }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      if (!clear && shortcutId === undefined) {
        return fail(new Error("shortcutId is required when not clearing"));
      }
      if (includeUsers?.length && excludeUsers?.length) {
        return fail(new Error("includeUsers and excludeUsers cannot both be set"));
      }
      try {
        await telegram.setBusinessGreeting({
          shortcutId,
          audience,
          includeUsers,
          excludeUsers,
          noActivityDays,
          clear,
        });
        if (clear) return ok("Business greeting cleared");
        return ok(
          `Business greeting set: shortcut=${shortcutId} audience=${audience} noActivityDays=${noActivityDays}`,
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-set-business-away",
    {
      description:
        "Set Telegram Business away message — auto-reply when you are offline or outside work hours. Uses a quick reply shortcut as template. Requires Telegram Business subscription. Pass clear=true to disable.",
      inputSchema: {
        shortcutId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Quick reply shortcut ID used as the away message template"),
        schedule: z
          .enum(["always", "outside_hours", "custom"])
          .default("outside_hours")
          .describe(
            "When to send: always (any time offline), outside_hours (based on business hours), custom (time range)",
          ),
        customFrom: z.number().int().positive().optional().describe("For schedule=custom: Unix timestamp range start"),
        customTo: z.number().int().positive().optional().describe("For schedule=custom: Unix timestamp range end"),
        offlineOnly: z
          .boolean()
          .default(true)
          .describe("Send only when you appear offline (true) or regardless of online status (false)"),
        audience: AUDIENCE.describe("Who receives the away message"),
        includeUsers: z.array(z.string()).optional(),
        excludeUsers: z.array(z.string()).optional(),
        clear: z.boolean().optional().describe("Pass true to disable away message"),
      },
      annotations: WRITE,
    },
    async ({
      shortcutId,
      schedule,
      customFrom,
      customTo,
      offlineOnly,
      audience,
      includeUsers,
      excludeUsers,
      clear,
    }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      if (!clear && shortcutId === undefined) {
        return fail(new Error("shortcutId is required when not clearing"));
      }
      if (schedule === "custom" && (customFrom === undefined || customTo === undefined)) {
        return fail(new Error("customFrom and customTo are required when schedule=custom"));
      }
      if (includeUsers?.length && excludeUsers?.length) {
        return fail(new Error("includeUsers and excludeUsers cannot both be set"));
      }
      try {
        await telegram.setBusinessAway({
          shortcutId,
          schedule,
          customFrom,
          customTo,
          offlineOnly,
          audience,
          includeUsers,
          excludeUsers,
          clear,
        });
        if (clear) return ok("Business away message cleared");
        return ok(`Business away message set: shortcut=${shortcutId} schedule=${schedule}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-set-business-intro",
    {
      description:
        "Set Telegram Business intro card — title and description shown to new users opening your chat, with an optional sticker. Requires Telegram Business subscription. Pass clear=true to remove.",
      inputSchema: {
        title: z.string().min(1).max(32).optional().describe("Intro title (max 32 chars)"),
        description: z.string().min(1).max(70).optional().describe("Intro description (max 70 chars)"),
        stickerId: z
          .string()
          .optional()
          .describe(
            "Sticker document ID (stringified long) — optional illustrative sticker. Requires stickerAccessHash and stickerFileReference.",
          ),
        stickerAccessHash: z
          .string()
          .optional()
          .describe("Access hash of the sticker document (required with stickerId)"),
        stickerFileReference: z
          .string()
          .regex(/^[\da-fA-F]{2,}$/)
          .refine((v) => v.length % 2 === 0, "must be even-length hex")
          .optional()
          .describe("Hex-encoded file_reference bytes (required with stickerId)"),
        clear: z.boolean().optional().describe("Pass true to remove the intro card"),
      },
      annotations: WRITE,
    },
    async ({ title, description, stickerId, stickerAccessHash, stickerFileReference, clear }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      if (!clear && (!title || !description)) {
        return fail(new Error("title and description are required when not clearing"));
      }
      const stickerFields = [stickerId, stickerAccessHash, stickerFileReference].filter(Boolean);
      if (stickerFields.length > 0 && stickerFields.length < 3) {
        return fail(new Error("stickerId, stickerAccessHash, and stickerFileReference must all be set together"));
      }
      try {
        await telegram.setBusinessIntro({
          title,
          description,
          stickerId,
          stickerAccessHash,
          stickerFileReference,
          clear,
        });
        if (clear) return ok("Business intro cleared");
        return ok(`Business intro set: "${title}"`);
      } catch (e) {
        return fail(e);
      }
    },
  );
}
