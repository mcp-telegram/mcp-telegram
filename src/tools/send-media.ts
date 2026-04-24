import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import {
  ABSOLUTE_PATH_ERROR,
  fail,
  isSafeAbsolutePath,
  ok,
  requireConnection,
  sanitizeInputText,
  WRITE,
} from "./shared.js";

const absolutePath = z.string().min(1).refine(isSafeAbsolutePath, ABSOLUTE_PATH_ERROR);
const safeText = z.string().transform(sanitizeInputText);

const DICE_EMOJIS = ["🎲", "🎯", "🎰", "🏀", "⚽", "🎳"] as const;

export function registerSendMediaTools(server: McpServer, telegram: TelegramService) {
  server.registerTool(
    "telegram-send-voice",
    {
      description: "Send a voice note (audio recording) to a Telegram chat. Shows as a voice message with waveform UI.",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username (e.g. @username or numeric ID)"),
        filePath: absolutePath.describe(
          "Absolute local filesystem path to audio file (OGG/Opus preferred; M4A/MP3 also accepted). URLs are rejected.",
        ),
        caption: safeText.optional().describe("Optional caption shown below the voice note"),
        replyTo: z.number().int().positive().optional().describe("Message ID to reply to"),
        topicId: z.number().int().positive().optional().describe("Forum topic ID (for groups with Topics enabled)"),
        parseMode: z.enum(["md", "html"]).optional().describe("Caption format: md (Markdown) or html"),
      },
      annotations: WRITE,
    },
    async ({ chatId, filePath, caption, replyTo, topicId, parseMode }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const { id } = await telegram.sendVoice(chatId, filePath, {
          caption,
          replyTo,
          topicId,
          parseMode,
        });
        return ok(`Voice note sent to ${chatId} [#${id}]`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-send-video-note",
    {
      description:
        "Send a video note (round-shaped short video) to a Telegram chat. Shows as a circular video in the UI.",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        filePath: absolutePath.describe(
          "Absolute local filesystem path to video file (MP4 preferred, square source recommended for best look). URLs are rejected.",
        ),
        duration: z.number().int().positive().max(60).optional().describe("Duration in seconds (Telegram caps at 60)"),
        length: z
          .number()
          .int()
          .positive()
          .max(640)
          .optional()
          .describe("Frame edge length in pixels (the circle is square-cropped)"),
        replyTo: z.number().int().positive().optional().describe("Message ID to reply to"),
        topicId: z.number().int().positive().optional().describe("Forum topic ID"),
      },
      annotations: WRITE,
    },
    async ({ chatId, filePath, duration, length, replyTo, topicId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const { id } = await telegram.sendVideoNote(chatId, filePath, {
          duration,
          length,
          replyTo,
          topicId,
        });
        return ok(`Video note sent to ${chatId} [#${id}]`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-send-contact",
    {
      description: "Send a contact card (phone number + name) to a Telegram chat.",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        phone: z
          .string()
          .regex(/^\+?\d{6,15}$/)
          .describe(
            "Phone number in E.164-like format — 6-15 digits, optional leading +. " +
              "Note: sent as-is; Telegram shows the number to the recipient.",
          ),
        firstName: safeText.pipe(z.string().min(1).max(64)).describe("Contact first name"),
        lastName: safeText.pipe(z.string().max(64)).optional().describe("Contact last name"),
        vcard: safeText.pipe(z.string().max(2048)).optional().describe("Optional vCard v3.0 text content"),
        replyTo: z.number().int().positive().optional(),
        topicId: z.number().int().positive().optional(),
      },
      annotations: WRITE,
    },
    async ({ chatId, phone, firstName, lastName, vcard, replyTo, topicId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const { id } = await telegram.sendContact(chatId, phone, firstName, {
          lastName,
          vcard,
          replyTo,
          topicId,
        });
        return ok(`Contact sent to ${chatId} [#${id}]`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-send-dice",
    {
      description:
        "Send an animated dice/game emoji to a Telegram chat. Returns the server-rolled value — useful for games, " +
        "coin-flips, random picks. Values: 🎲🎯🎳 = 1-6, 🏀⚽ = 1-5, 🎰 = slot combo 1-64.",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        emoji: z
          .enum(DICE_EMOJIS)
          .default("🎲")
          .describe(
            "Dice emoji: 🎲 dice (1-6), 🎯 dart (1-6), 🎰 slot machine (1-64), 🏀 basketball (1-5), ⚽ football (1-5), 🎳 bowling (1-6)",
          ),
        replyTo: z.number().int().positive().optional(),
        topicId: z.number().int().positive().optional(),
      },
      annotations: WRITE,
    },
    async ({ chatId, emoji, replyTo, topicId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const { id, value } = await telegram.sendDice(chatId, emoji, { replyTo, topicId });
        const rolled = value !== undefined ? `: rolled ${value}` : " (value pending)";
        return ok(`Dice ${emoji} sent to ${chatId}${rolled} [#${id}]`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-send-location",
    {
      description:
        "Send a geographic location to a Telegram chat. Static pin by default; set livePeriod to share a live-updating location for N seconds.",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        latitude: z.number().min(-90).max(90).describe("Latitude in decimal degrees (-90 to 90)"),
        longitude: z.number().min(-180).max(180).describe("Longitude in decimal degrees (-180 to 180)"),
        accuracyRadius: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe("Horizontal accuracy radius in meters (0 = unknown)"),
        livePeriod: z
          .number()
          .int()
          .min(60)
          .max(86400)
          .optional()
          .describe("If set, sends a live location updated for N seconds (60-86400). Omit for static pin."),
        heading: z
          .number()
          .int()
          .min(1)
          .max(360)
          .optional()
          .describe("Direction the user is heading, 1-360 degrees (meaningful only for live locations)"),
        proximityRadius: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Alert radius for proximity notification in meters (live only)"),
        replyTo: z.number().int().positive().optional().describe("Message ID to reply to"),
        topicId: z.number().int().positive().optional().describe("Forum topic ID"),
      },
      annotations: WRITE,
    },
    async ({ chatId, latitude, longitude, accuracyRadius, livePeriod, heading, proximityRadius, replyTo, topicId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const { id } = await telegram.sendLocation(chatId, latitude, longitude, {
          accuracyRadius,
          livePeriod,
          heading,
          proximityRadius,
          replyTo,
          topicId,
        });
        const label = livePeriod ? `Live location sent to ${chatId} for ${livePeriod}s` : `Location sent to ${chatId}`;
        return ok(`${label} [#${id}]`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-send-venue",
    {
      description: "Send a venue card (point-of-interest with title and address) to a Telegram chat.",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        latitude: z.number().min(-90).max(90).describe("Venue latitude"),
        longitude: z.number().min(-180).max(180).describe("Venue longitude"),
        title: safeText.pipe(z.string().min(1).max(256)).describe("Venue name (e.g. 'Red Square')"),
        address: safeText.pipe(z.string().min(1).max(512)).describe("Street address"),
        provider: safeText
          .pipe(z.string().max(32))
          .optional()
          .describe("Data provider — typically 'foursquare' or 'gplaces'. Defaults to 'foursquare'."),
        venueId: safeText.pipe(z.string().max(256)).optional().describe("Provider-specific venue ID"),
        venueType: safeText.pipe(z.string().max(256)).optional().describe("Provider-specific venue type category"),
        replyTo: z.number().int().positive().optional(),
        topicId: z.number().int().positive().optional(),
      },
      annotations: WRITE,
    },
    async ({ chatId, latitude, longitude, title, address, provider, venueId, venueType, replyTo, topicId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const { id } = await telegram.sendVenue(chatId, latitude, longitude, title, address, {
          provider,
          venueId,
          venueType,
          replyTo,
          topicId,
        });
        return ok(`Venue "${title}" sent to ${chatId} [#${id}]`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-send-album",
    {
      description:
        "Send an album (group) of 2-10 photos as a single grouped message. Media type is auto-detected " +
        "by file extension — videos are supported by the underlying TL call but are not covered by v1.29.0 " +
        "mock tests, so uniform-photo albums are the safer choice until a live checkpoint. Uploads are " +
        "serial per item: expect ≈4-10s for 10 mid-size photos, 15-40s for 10 large videos. Prefer ≤5 " +
        "items or photos when low latency matters.",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        items: z
          .array(
            z.object({
              filePath: absolutePath.describe(
                "Absolute local filesystem path to a photo or video file. URLs are rejected.",
              ),
              caption: safeText
                .optional()
                .describe("Per-item caption (shown under this item when the album is expanded)"),
            }),
          )
          .min(2)
          .max(10)
          .describe("Array of media items (2-10)"),
        caption: safeText
          .optional()
          .describe("Album-level caption (attached to the first item — shown in the collapsed view)"),
        parseMode: z.enum(["md", "html"]).optional().describe("Caption format (applies to all captions)"),
        replyTo: z.number().int().positive().optional().describe("Message ID to reply to"),
        topicId: z.number().int().positive().optional().describe("Forum topic ID"),
      },
      annotations: WRITE,
    },
    async ({ chatId, items, caption, parseMode, replyTo, topicId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const { ids } = await telegram.sendAlbum(chatId, items, { caption, parseMode, replyTo, topicId });
        const idList = ids.map((id) => `#${id}`).join(", ");
        return ok(`Album sent to ${chatId} (${ids.length} items) [${idList}]`);
      } catch (e) {
        return fail(e);
      }
    },
  );
}
