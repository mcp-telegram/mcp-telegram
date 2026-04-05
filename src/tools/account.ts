import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import { DESTRUCTIVE, fail, ok, READ_ONLY, requireConnection, sanitize, WRITE } from "./shared.js";

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
        return ok(sanitize(text));
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
        return ok(sanitize(text));
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
        return ok(sanitize(text));
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
}
