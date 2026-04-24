import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import {
  ABSOLUTE_PATH_ERROR,
  DESTRUCTIVE,
  fail,
  isSafeAbsolutePath,
  ok,
  READ_ONLY,
  requireConnection,
  WRITE,
} from "./shared.js";

const MUTE_FOREVER_UNTIL = 2147483647; // max 32-bit signed int

export function registerAccountTools(server: McpServer, telegram: TelegramService) {
  server.registerTool(
    "telegram-mute-chat",
    {
      description:
        "Mute or unmute notifications for a Telegram chat. Set muted=true to mute (optionally with duration in seconds), muted=false to unmute",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        muted: z.boolean().describe("true to mute, false to unmute"),
        duration: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Mute duration in seconds (only when muted=true, must be > 0). Omit to mute forever"),
      },
      annotations: WRITE,
    },
    async ({ chatId, muted, duration }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        let muteUntil: number;
        if (!muted) {
          muteUntil = 0;
        } else if (duration !== undefined && duration > 0) {
          const now = Math.floor(Date.now() / 1000);
          muteUntil = Math.min(now + duration, MUTE_FOREVER_UNTIL);
        } else {
          muteUntil = MUTE_FOREVER_UNTIL;
        }
        await telegram.muteChat(chatId, muteUntil);
        const status = !muted
          ? "unmuted"
          : duration !== undefined && duration > 0
            ? `muted for ${duration}s`
            : "muted forever";
        return ok(`Chat ${chatId} ${status}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-chat-folders",
    {
      description: "Get list of your Telegram chat folders (filters) with their names and chat counts",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const folders = await telegram.getChatFolders();
        if (folders.length === 0) return ok("No chat folders");
        const text = folders
          .map(
            (f) =>
              `[${f.id}] ${f.emoticon ? `${f.emoticon} ` : ""}${f.title} (${f.includeCount} chats, ${f.pinnedCount} pinned)`,
          )
          .join("\n");
        return ok(text);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-set-auto-delete",
    {
      description:
        "Set auto-delete timer for messages in a chat. Common values: 86400 (1 day), 604800 (1 week), 2592000 (1 month). Use 0 to disable",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        period: z
          .number()
          .int()
          .nonnegative()
          .describe("Auto-delete period in seconds. 0 = disable. Common: 86400 (1d), 604800 (1w), 2592000 (1mo)"),
      },
      annotations: WRITE,
    },
    async ({ chatId, period }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.setAutoDelete(chatId, period);
        const status = period === 0 ? "disabled" : `set to ${period}s`;
        return ok(`Auto-delete for ${chatId} ${status}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-sessions",
    {
      description:
        "Get list of all active Telegram sessions (logged-in devices) with device info, IP, and last active time",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const sessions = await telegram.getActiveSessions();
        if (sessions.length === 0) return ok("No active sessions");
        const text = sessions
          .map(
            (s) =>
              `${s.current ? "→ " : "  "}${s.device} (${s.platform}) — ${s.appName} ${s.appVersion}\n    IP: ${s.ip} (${s.country}) | Last active: ${s.dateActive}${s.current ? " [CURRENT]" : ""}\n    Hash: ${s.hash}`,
          )
          .join("\n\n");
        return ok(text);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-terminate-session",
    {
      description:
        "Terminate a specific Telegram session by its hash, or explicitly terminate all other sessions by setting terminateAllOther=true",
      inputSchema: {
        sessionId: z
          .string()
          .optional()
          .describe(
            "Session hash to terminate (numeric string from get-sessions). Required when terminateAllOther is not set",
          )
          .refine((v) => v === undefined || /^\d+$/.test(v), { message: "sessionId must be a numeric string" }),
        terminateAllOther: z
          .boolean()
          .optional()
          .describe(
            "Set to true to terminate all other sessions (excludes current). Cannot be combined with sessionId",
          ),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ sessionId, terminateAllOther }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        if (terminateAllOther) {
          if (sessionId) {
            return fail(new Error("Provide either sessionId or terminateAllOther=true, not both"));
          }
          await telegram.terminateAllOtherSessions();
          return ok("All other sessions terminated");
        }

        if (!sessionId) {
          return fail(new Error("Provide sessionId to terminate a specific session, or set terminateAllOther=true"));
        }

        await telegram.terminateSession(sessionId);
        return ok(`Session ${sessionId} terminated`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-set-privacy",
    {
      description:
        "Configure privacy settings for your Telegram account. Controls who can see your phone number, last seen, profile photo, etc.",
      inputSchema: {
        setting: z
          .enum(["phone_number", "last_seen", "profile_photo", "forwards", "calls", "groups", "bio"])
          .describe("Privacy setting to change"),
        rule: z.enum(["everyone", "contacts", "nobody"]).describe("Who can see/access this"),
        allowUsers: z.array(z.string()).optional().describe("User IDs/usernames to always allow (exceptions)"),
        disallowUsers: z.array(z.string()).optional().describe("User IDs/usernames to always disallow (exceptions)"),
      },
      annotations: WRITE,
    },
    async ({ setting, rule, allowUsers, disallowUsers }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.setPrivacy(setting, rule, allowUsers, disallowUsers);
        return ok(`Privacy: ${setting} set to "${rule}"`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-update-profile",
    {
      description: "Update your Telegram profile — first name, last name, bio, or username",
      inputSchema: {
        firstName: z.string().optional().describe("New first name"),
        lastName: z.string().optional().describe("New last name"),
        bio: z.string().optional().describe("New bio/about text (max 70 chars, 300 for Premium)"),
        username: z.string().optional().describe("New username (without @)"),
      },
      annotations: WRITE,
    },
    async ({ firstName, lastName, bio, username }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const updates: string[] = [];
        if (firstName !== undefined || lastName !== undefined || bio !== undefined) {
          await telegram.updateProfile({ firstName, lastName, bio });
          if (firstName !== undefined) updates.push(`firstName: ${firstName}`);
          if (lastName !== undefined) updates.push(`lastName: ${lastName}`);
          if (bio !== undefined) updates.push(`bio: ${bio}`);
        }
        if (username !== undefined) {
          const normalizedUsername = username.replace(/^@/, "");
          await telegram.updateUsername(normalizedUsername);
          updates.push(`username: @${normalizedUsername}`);
        }
        return ok(updates.length ? `Profile updated: ${updates.join(", ")}` : "No changes specified");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-create-invite-link",
    {
      description: "Create a new invite link for a group or channel",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        expireDate: z.number().optional().describe("Link expiration as Unix timestamp"),
        memberLimit: z.number().optional().describe("Max number of users who can join via this link"),
        requestApproval: z.boolean().optional().describe("Require admin approval to join"),
        title: z.string().optional().describe("Label for the invite link (only visible to admins)"),
      },
      annotations: WRITE,
    },
    async ({ chatId, expireDate, memberLimit, requestApproval, title }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const link = await telegram.exportInviteLink(chatId, {
          expireDate,
          usageLimit: memberLimit,
          requestNeeded: requestApproval,
          title,
        });
        return ok(`Invite link created: ${link}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-invite-links",
    {
      description:
        "Get list of invite links for a group or channel. By default returns links created by the current account; pass adminId to query another admin's links",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        limit: z.number().default(20).describe("Max links to return"),
        adminId: z
          .string()
          .optional()
          .describe("Admin user ID or username to list links for (default: current account)"),
      },
      annotations: READ_ONLY,
    },
    async ({ chatId, limit, adminId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const links = await telegram.getInviteLinks(chatId, limit, adminId);
        if (links.length === 0) return ok("No invite links");
        const text = links
          .map(
            (l) =>
              `${l.link}${l.title ? ` (${l.title})` : ""} — ${l.usageCount} uses${l.expired ? " [EXPIRED]" : ""}${l.revoked ? " [REVOKED]" : ""}`,
          )
          .join("\n");
        return ok(text);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-save-draft",
    {
      description:
        "Save or clear a message draft for a chat. Pass empty text to clear the draft. Optional replyTo sets the message being replied to",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        text: z.string().describe("Draft text. Empty string clears the draft"),
        replyTo: z.number().int().positive().optional().describe("Message ID this draft replies to"),
      },
      annotations: WRITE,
    },
    async ({ chatId, text, replyTo }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.saveDraft(chatId, text, replyTo);
        return ok(text === "" ? `Draft cleared for ${chatId}` : `Draft saved for ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-drafts",
    {
      description: "Get all saved message drafts across chats",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const drafts = await telegram.getAllDrafts();
        if (drafts.length === 0) return ok("No drafts");
        const text = drafts.map((d) => `[${d.chatId}] ${d.chatTitle} (${d.date})\n  ${d.text}`).join("\n\n");
        return ok(text);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-clear-drafts",
    {
      description:
        "Delete saved message drafts. Pass chatId to clear the draft for a single chat. Without chatId, clears drafts in ALL chats — requires confirmAllChats: true",
      inputSchema: {
        chatId: z.string().optional().describe("Chat ID or username. If provided, clears draft only for this chat"),
        confirmAllChats: z
          .boolean()
          .optional()
          .describe("Must be true to wipe drafts across ALL chats when chatId is omitted"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ chatId, confirmAllChats }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        if (chatId !== undefined) {
          if (confirmAllChats) {
            return fail(new Error("Pass either chatId or confirmAllChats=true, not both"));
          }
          await telegram.saveDraft(chatId, "");
          return ok(`Draft cleared for ${chatId}`);
        }
        if (!confirmAllChats) {
          return fail(
            new Error(
              "Refusing to clear drafts in ALL chats without explicit confirmation. Pass chatId for a single chat, or confirmAllChats=true to wipe all drafts",
            ),
          );
        }
        await telegram.clearAllDrafts();
        return ok("All drafts cleared");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-saved-dialogs",
    {
      description:
        "Get Saved Messages dialogs (Telegram's per-sender grouping of messages forwarded to your Saved Messages)",
      inputSchema: {
        limit: z.number().int().positive().default(20).describe("Max dialogs to return"),
      },
      annotations: READ_ONLY,
    },
    async ({ limit }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const dialogs = await telegram.getSavedDialogs(limit);
        if (dialogs.length === 0) return ok("No saved dialogs");
        const text = dialogs.map((d) => `[${d.peerId}] ${d.peerTitle} — last msg #${d.lastMsgId}`).join("\n");
        return ok(text);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-revoke-invite-link",
    {
      description: "Revoke an invite link for a group or channel",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        link: z.string().describe("The invite link to revoke"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ chatId, link }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.revokeInviteLink(chatId, link);
        return ok(`Invite link revoked: ${link}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  // ─── Profile write tools (v1.32.0) ─────────────────────────────────────────

  server.registerTool(
    "telegram-set-emoji-status",
    {
      description:
        "Set your profile emoji status (custom animated emoji shown next to your name). Requires Telegram Premium. Pass documentId or collectibleId to set — omit both to clear the status. Use telegram-list-emoji-statuses to browse available IDs.",
      inputSchema: {
        documentId: z
          .string()
          .optional()
          .describe("Custom emoji document ID (stringified long). Omit to clear the status."),
        collectibleId: z
          .string()
          .optional()
          .describe(
            "Collectible emoji ID (stringified long) — for paid unique emoji. Exactly one of documentId/collectibleId may be set.",
          ),
        untilUnix: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Unix timestamp when status expires. Omit for permanent."),
      },
      annotations: WRITE,
    },
    async ({ documentId, collectibleId, untilUnix }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      if (documentId && collectibleId) {
        return fail(new Error("Only one of documentId or collectibleId may be set"));
      }
      try {
        await telegram.setEmojiStatus({ documentId, collectibleId, untilUnix });
        if (!documentId && !collectibleId) return ok("Emoji status cleared");
        const id = collectibleId ?? documentId;
        const until = untilUnix ? ` until ${new Date(untilUnix * 1000).toISOString()}` : "";
        return ok(`Emoji status set: ${id}${until}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-list-emoji-statuses",
    {
      description:
        "List default or recently-used emoji statuses available for your account. Useful for finding a documentId to pass to telegram-set-emoji-status.",
      inputSchema: {
        kind: z
          .enum(["default", "recent", "channel_default", "collectible"])
          .default("default")
          .describe(
            "Which list: default (popular set), recent (your recent usage), channel_default (for channels), collectible (paid unique)",
          ),
        limit: z.number().int().positive().max(200).default(50).describe("Max items to return"),
      },
      annotations: READ_ONLY,
    },
    async ({ kind, limit }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const items = await telegram.listEmojiStatuses(kind, limit);
        if (!items.length) return ok(`[${kind}]\n(no statuses)`);
        const lines = items.map((s) => {
          const id = s.collectibleId ?? s.documentId ?? "empty";
          const until = s.until ? ` until=${s.until}` : " until=permanent";
          const extra = s.title ? ` title="${s.title}"` : "";
          return `${s.kind} id=${id}${until}${extra}`;
        });
        return ok(`[${kind}]\n${lines.join("\n")}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-clear-recent-emoji-statuses",
    {
      description: "Clear your recently-used emoji status list (the 'recent' section in the emoji status picker).",
      inputSchema: {},
      annotations: WRITE,
    },
    async () => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        await telegram.clearRecentEmojiStatuses();
        return ok("Recent emoji statuses cleared");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-set-profile-color",
    {
      description:
        "Set your profile name color or profile background color. Requires Telegram Premium for colors above index 6 and for profile background patterns. Omit color to reset to default.",
      inputSchema: {
        forProfile: z
          .boolean()
          .default(false)
          .describe("true = profile page color + background pattern (Premium); false = name color in chat lists"),
        color: z
          .number()
          .int()
          .min(0)
          .max(20)
          .optional()
          .describe("Color index (0-6 free palette; 7+ Premium custom). Omit to reset to default."),
        backgroundEmojiId: z
          .string()
          .optional()
          .describe(
            "Custom emoji document ID (stringified long) for profile background pattern (Premium). Omit to remove.",
          ),
      },
      annotations: WRITE,
    },
    async ({ forProfile, color, backgroundEmojiId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        await telegram.setProfileColor({ forProfile, color, backgroundEmojiId });
        if (color === undefined && !backgroundEmojiId) return ok("Profile color reset");
        return ok(
          `Profile color updated: forProfile=${forProfile} color=${color ?? "default"} bg=${backgroundEmojiId ?? "none"}`,
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-set-birthday",
    {
      description:
        "Set your birthday in your Telegram profile. Year is optional (omit to hide age). Pass clear=true to remove birthday. Requires day and month unless clearing.",
      inputSchema: {
        day: z.number().int().min(1).max(31).optional().describe("Day of month (1-31)"),
        month: z.number().int().min(1).max(12).optional().describe("Month (1-12)"),
        year: z.number().int().min(1900).max(2100).optional().describe("Year (optional — omit to hide age)"),
        clear: z.boolean().optional().describe("Pass true to remove birthday from profile"),
      },
      annotations: WRITE,
    },
    async ({ day, month, year, clear }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      if (!clear && (!day || !month)) {
        return fail(new Error("day and month are required when not clearing"));
      }
      try {
        await telegram.setBirthday({ day, month, year, clear });
        if (clear) return ok("Birthday cleared");
        const yearStr = year ? `/${year}` : "";
        return ok(`Birthday set: ${day}/${month}${yearStr}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-set-personal-channel",
    {
      description:
        "Set the channel displayed on your profile as 'Personal Channel'. Pass clear=true to remove. Pass channelId or @username of a channel you own or are subscribed to.",
      inputSchema: {
        channelId: z.string().optional().describe("Channel ID or @username to feature on profile"),
        clear: z.boolean().optional().describe("Pass true to remove personal channel from profile"),
      },
      annotations: WRITE,
    },
    async ({ channelId, clear }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      if (!clear && !channelId) {
        return fail(new Error("channelId is required when not clearing"));
      }
      if (clear && channelId) {
        return fail(new Error("Cannot set channelId and clear=true simultaneously"));
      }
      try {
        const title = await telegram.setPersonalChannel({ channelId, clear });
        if (clear) return ok("Personal channel cleared");
        return ok(`Personal channel set to ${title ?? channelId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-set-profile-photo",
    {
      description:
        "Upload and set a new profile photo from a local file. Supports JPEG/PNG for static avatar or MP4 for animated avatar (square, up to 10s). Optionally set as fallback photo shown to users who cannot see your main photo.",
      inputSchema: {
        filePath: z
          .string()
          .min(1)
          .refine(isSafeAbsolutePath, ABSOLUTE_PATH_ERROR)
          .describe(
            "Absolute local filesystem path to photo (JPEG/PNG) or video (MP4, square) to upload as avatar. URLs are rejected.",
          ),
        isVideo: z.boolean().default(false).describe("true if file is an MP4 animated avatar; false for static photo"),
        videoStartTs: z
          .number()
          .min(0)
          .optional()
          .describe("For video avatar: timestamp in seconds to use as still preview frame"),
        fallback: z
          .boolean()
          .default(false)
          .describe(
            "true = set as fallback photo (shown to users who cannot see your main photo due to privacy settings)",
          ),
      },
      annotations: WRITE,
    },
    async ({ filePath, isVideo, videoStartTs, fallback }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const { id } = await telegram.setProfilePhoto({ filePath, isVideo, videoStartTs, fallback });
        const label = fallback ? "Fallback profile photo" : "Profile photo";
        return ok(`${label} updated [id=${id}]`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-delete-profile-photo",
    {
      description:
        "Delete one or more profile photos by their photo IDs. Use telegram-get-profile-photo to obtain the current photo ID. Returns which IDs were deleted and which were not found.",
      inputSchema: {
        photoIds: z
          .array(z.string().regex(/^\d{1,20}$/, "must be a numeric photo ID"))
          .min(1)
          .max(100)
          .describe("Array of photo IDs (stringified long) to delete from your profile photo history"),
      },
      annotations: WRITE,
    },
    async ({ photoIds }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const { deleted, missing } = await telegram.deleteProfilePhotos(photoIds);
        const parts = [`Deleted ${deleted.length} profile photo(s): ${deleted.join(", ")}`];
        if (missing.length) parts.push(`Not found: ${missing.join(", ")}`);
        return ok(parts.join(". "));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
