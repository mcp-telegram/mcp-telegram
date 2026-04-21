import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import { DESTRUCTIVE, fail, ok, READ_ONLY, requireConnection, sanitize, WRITE } from "./shared.js";

export function registerChatTools(server: McpServer, telegram: TelegramService) {
  server.registerTool(
    "telegram-list-chats",
    {
      description: "List Telegram chats with unread counts, type indicators, and contact status",
      inputSchema: {
        limit: z.number().default(20).describe("Number of chats to return"),
        offsetDate: z.number().optional().describe("Unix timestamp offset for pagination"),
        filterType: z
          .enum(["private", "group", "channel", "contact_requests"])
          .optional()
          .describe("Filter by chat type. 'contact_requests' shows only private chats from non-contacts"),
      },
      annotations: READ_ONLY,
    },
    async ({ limit, offsetDate, filterType }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const dialogs = await telegram.getDialogs(limit, offsetDate, filterType);
        const text = dialogs
          .map((d) => {
            const prefix = d.type === "group" ? "G" : d.type === "channel" ? "C" : "P";
            const botTag = d.isBot ? " [bot]" : "";
            const contactTag = d.type === "private" && d.isContact === false ? " [not in contacts]" : "";
            const unread = d.unreadCount > 0 ? ` [${d.unreadCount} unread]` : "";
            return `${prefix} ${d.name} (${d.id})${botTag}${contactTag}${unread}`;
          })
          .join("\n");
        return ok(text || "No chats");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-search-chats",
    {
      description:
        "Search for Telegram chats, users, or channels by name or username. Returns description and member count",
      inputSchema: {
        query: z.string().describe("Search query (name or username)"),
        limit: z.number().default(10).describe("Max results"),
      },
      annotations: READ_ONLY,
    },
    async ({ query, limit }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const results = await telegram.searchChats(query, limit);
        const text = results
          .map(
            (c) =>
              `${c.type === "group" ? "G" : c.type === "channel" ? "C" : "P"} ${c.name}${c.username ? ` (@${c.username})` : ""} (${c.id})${c.membersCount ? ` [${c.membersCount} members]` : ""}${c.description ? ` — ${c.description.split("\n")[0].slice(0, 100)}` : ""}`,
          )
          .join("\n");
        return ok(text || "No results");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-chat-info",
    {
      description:
        "Get detailed info about a Telegram chat including name, type, members, description, and forum status",
      inputSchema: { chatId: z.string().describe("Chat ID or username") },
      annotations: READ_ONLY,
    },
    async ({ chatId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const info = await telegram.getChatInfo(chatId);
        const lines = [
          `Name: ${info.name}`,
          `ID: ${info.id}`,
          `Type: ${info.type}`,
          ...(info.forum ? ["Forum: yes"] : []),
          ...(info.username ? [`Username: @${info.username}`] : []),
          ...(info.description ? [`Description: ${info.description}`] : []),
          ...(info.membersCount != null ? [`Members: ${info.membersCount}`] : []),
        ];
        return ok(lines.join("\n"));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-chat-members",
    {
      description: "Get members of a Telegram group or channel",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        limit: z.number().default(50).describe("Number of members to return"),
      },
      annotations: READ_ONLY,
    },
    async ({ chatId, limit }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const members = await telegram.getChatMembers(chatId, limit);
        const text = members
          .map((m) => {
            const role = m.role !== "member" ? ` [${m.role}]` : "";
            return `${m.name}${m.username ? ` (@${m.username})` : ""} (${m.id})${role}`;
          })
          .join("\n");
        return ok(text || "No members found");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-my-role",
    {
      description: "Get the current user's role in a chat (creator, admin, or member)",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
      },
      annotations: READ_ONLY,
    },
    async ({ chatId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const result = await telegram.getMyRole(chatId);
        return ok(`Role: ${result.role}\nChat: ${result.chatName} (${result.chatId})`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-create-group",
    {
      description: "Create a new Telegram group or supergroup",
      inputSchema: {
        title: z.string().describe("Group name"),
        users: z.array(z.string()).describe("Usernames or IDs to invite"),
        supergroup: z.boolean().default(false).describe("Create as supergroup (supports >200 members, admin features)"),
        forum: z.boolean().default(false).describe("Enable topics (requires supergroup)"),
        description: z.string().optional().describe("Group description"),
      },
      annotations: WRITE,
    },
    async ({ title, users, supergroup, forum, description }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const result = await telegram.createGroup({ title, users, supergroup, forum, description });
        const lines = [
          `Created ${result.type}: ${result.title}`,
          `ID: ${result.id}`,
          ...(result.inviteLink ? [`Invite link: ${result.inviteLink}`] : []),
        ];
        return ok(lines.join("\n"));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-join-chat",
    {
      description: "Join a Telegram group or channel by username or invite link",
      inputSchema: {
        target: z.string().describe("Username (@group), link (t.me/group), or invite link (t.me/+xxx)"),
      },
      annotations: WRITE,
    },
    async ({ target }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const result = await telegram.joinChat(target);
        return ok(`Joined ${result.type}: ${result.title} (ID: ${result.id})`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-leave-group",
    {
      description: "Leave a Telegram group or channel",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
      },
      annotations: WRITE,
    },
    async ({ chatId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.leaveGroup(chatId);
        return ok(`Left chat ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-invite-to-group",
    {
      description: "Invite users to a Telegram group or channel",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        users: z.array(z.string()).describe("Usernames or IDs to invite"),
      },
      annotations: WRITE,
    },
    async ({ chatId, users }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const result = await telegram.inviteToGroup(chatId, users);
        const lines = [];
        if (result.invited.length > 0) lines.push(`Invited: ${result.invited.join(", ")}`);
        if (result.failed.length > 0) lines.push(`Failed: ${result.failed.join(", ")}`);
        return ok(lines.join("\n") || "No users processed");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-kick-user",
    {
      description: "Kick a user from a Telegram group (removes without permanent ban)",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        userId: z.string().describe("User ID or username to kick"),
      },
      annotations: WRITE,
    },
    async ({ chatId, userId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.kickUser(chatId, userId);
        return ok(`Kicked ${userId} from ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-ban-user",
    {
      description: "Ban a user from a supergroup or channel (permanent until unbanned)",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        userId: z.string().describe("User ID or username to ban"),
      },
      annotations: WRITE,
    },
    async ({ chatId, userId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.banUser(chatId, userId);
        return ok(`Banned ${userId} from ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-unban-user",
    {
      description: "Unban a previously banned user from a supergroup or channel",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        userId: z.string().describe("User ID or username to unban"),
      },
      annotations: WRITE,
    },
    async ({ chatId, userId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.unbanUser(chatId, userId);
        return ok(`Unbanned ${userId} in ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-edit-group",
    {
      description: "Edit a group's title, description, or photo",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        title: z.string().optional().describe("New group title"),
        description: z.string().optional().describe("New group description (supergroups only)"),
        photoPath: z.string().optional().describe("Absolute path to new group photo image file"),
      },
      annotations: WRITE,
    },
    async ({ chatId, title, description, photoPath }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.editGroup(chatId, { title, description, photoPath });
        const changed = [title && "title", description != null && "description", photoPath && "photo"].filter(Boolean);
        return ok(`Updated ${changed.join(", ")} for ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-set-admin",
    {
      description: "Promote a user to admin in a supergroup or channel with full permissions",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        userId: z.string().describe("User ID or username to promote"),
        title: z.string().optional().describe("Custom admin title"),
      },
      annotations: WRITE,
    },
    async ({ chatId, userId, title }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.setAdmin(chatId, userId, { title });
        return ok(`Promoted ${userId} to admin in ${chatId}${title ? ` (${title})` : ""}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-archive-chat",
    {
      description: "Archive or unarchive a Telegram dialog (moves to/from the Archive folder)",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        archive: z.boolean().describe("true to archive, false to unarchive"),
      },
      annotations: WRITE,
    },
    async ({ chatId, archive }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.archiveChat(chatId, archive);
        return ok(`${archive ? "Archived" : "Unarchived"} ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-pin-chat",
    {
      description: "Pin or unpin a Telegram dialog in the dialog list",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        pin: z.boolean().describe("true to pin, false to unpin"),
      },
      annotations: WRITE,
    },
    async ({ chatId, pin }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.pinDialog(chatId, pin);
        return ok(`${pin ? "Pinned" : "Unpinned"} ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-mark-dialog-unread",
    {
      description: "Mark a Telegram dialog as unread (or clear the unread mark)",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        unread: z.boolean().describe("true to mark as unread, false to clear the mark"),
      },
      annotations: WRITE,
    },
    async ({ chatId, unread }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.markDialogUnread(chatId, unread);
        return ok(`Marked ${chatId} as ${unread ? "unread" : "read"}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-admin-log",
    {
      description:
        "Get the admin action log (recent event history) of a supergroup or channel. Includes bans, edits, pins, and role changes",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username (supergroup or channel)"),
        limit: z.number().int().min(1).max(100).default(20).describe("Number of events to return (1-100)"),
        q: z.string().optional().describe("Optional text filter for events"),
      },
      annotations: READ_ONLY,
    },
    async ({ chatId, limit, q }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const events = await telegram.getAdminLog(chatId, limit, q);
        const text = events
          .map((e) => {
            const details = e.details ? ` — ${e.details}` : "";
            return `[#${e.id}] [${e.date}] ${e.userName}: ${e.action}${details}`;
          })
          .join("\n");
        return ok(text || "No admin log events");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-remove-admin",
    {
      description: "Remove admin rights from a user in a supergroup or channel",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        userId: z.string().describe("User ID or username to demote"),
      },
      annotations: WRITE,
    },
    async ({ chatId, userId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.removeAdmin(chatId, userId);
        return ok(`Removed admin rights from ${userId} in ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-set-chat-permissions",
    {
      description:
        "Set the default permissions for all non-admin members of a group, supergroup, or channel. Omitted flags keep their current state; true = allowed, false = denied",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        sendMessages: z.boolean().optional().describe("Allow sending text messages"),
        sendMedia: z.boolean().optional().describe("Allow sending photos/videos/documents"),
        sendStickers: z.boolean().optional().describe("Allow sending stickers"),
        sendGifs: z.boolean().optional().describe("Allow sending GIFs"),
        sendPolls: z.boolean().optional().describe("Allow sending polls"),
        sendInline: z.boolean().optional().describe("Allow inline bot usage"),
        embedLinks: z.boolean().optional().describe("Allow link previews"),
        changeInfo: z.boolean().optional().describe("Allow changing chat info (title, photo, description)"),
        inviteUsers: z.boolean().optional().describe("Allow inviting new members"),
        pinMessages: z.boolean().optional().describe("Allow pinning messages"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ chatId, ...permissions }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.setChatPermissions(chatId, permissions);
        const changed = Object.entries(permissions)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => `${k}=${v ? "allow" : "deny"}`);
        return ok(
          changed.length > 0
            ? `Updated default permissions for ${chatId}: ${changed.join(", ")}`
            : `No permission changes for ${chatId}`,
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-set-slow-mode",
    {
      description:
        "Set slow mode for a supergroup (minimum interval between messages per user). Allowed values: 0, 10, 30, 60, 300, 900, 3600 seconds (0 disables slow mode)",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username (supergroup)"),
        seconds: z
          .union([
            z.literal(0),
            z.literal(10),
            z.literal(30),
            z.literal(60),
            z.literal(300),
            z.literal(900),
            z.literal(3600),
          ])
          .describe("Interval in seconds: 0 (off), 10, 30, 60, 300, 900, or 3600"),
      },
      annotations: WRITE,
    },
    async ({ chatId, seconds }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.setSlowMode(chatId, seconds);
        return ok(seconds === 0 ? `Disabled slow mode in ${chatId}` : `Set slow mode to ${seconds}s in ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-toggle-channel-signatures",
    {
      description:
        "Enable or disable author signatures on broadcast channel posts. Channel admin required; not supported for supergroups",
      inputSchema: {
        chatId: z.string().describe("Channel ID or username"),
        enabled: z.boolean().describe("true to enable author signatures, false to disable"),
      },
      annotations: WRITE,
    },
    async ({ chatId, enabled }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.toggleChannelSignatures(chatId, enabled);
        return ok(JSON.stringify({ ok: true, signaturesEnabled: enabled }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-toggle-anti-spam",
    {
      description:
        "Enable or disable aggressive anti-spam filtering in a supergroup. Supergroup only (not broadcast channels); requires admin with ban_users permission",
      inputSchema: {
        chatId: z.string().describe("Supergroup ID or username"),
        enabled: z.boolean().describe("true to enable aggressive anti-spam, false to disable"),
      },
      annotations: WRITE,
    },
    async ({ chatId, enabled }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.toggleAntiSpam(chatId, enabled);
        return ok(`${enabled ? "Enabled" : "Disabled"} aggressive anti-spam in ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-toggle-forum-mode",
    {
      description:
        "Enable or disable forum/topics mode in a supergroup. Supergroup only; requires creator or admin. " +
        "WARNING: disabling removes ALL existing topics — pass confirm=true to proceed with disable",
      inputSchema: {
        chatId: z.string().describe("Supergroup ID or username"),
        enabled: z.boolean().describe("true to enable forum mode, false to disable"),
        confirm: z
          .boolean()
          .optional()
          .describe("Must be true when disabling (enabled=false) — disabling deletes all existing topics"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ chatId, enabled, confirm }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      if (!enabled && confirm !== true) {
        return fail(
          new Error(
            "Disabling forum mode deletes all existing topics. Pass confirm=true to proceed with this destructive action.",
          ),
        );
      }

      try {
        await telegram.toggleForumMode(chatId, enabled);
        return ok(`${enabled ? "Enabled" : "Disabled"} forum mode in ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-toggle-prehistory-hidden",
    {
      description:
        "Toggle pre-history visibility for new members in a supergroup. When hidden=true, new joiners cannot see messages posted before they joined. Supergroup only; requires admin",
      inputSchema: {
        chatId: z.string().describe("Supergroup ID or username"),
        hidden: z.boolean().describe("true to hide prior history from new members, false to make it visible"),
      },
      annotations: WRITE,
    },
    async ({ chatId, hidden }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.togglePrehistoryHidden(chatId, hidden);
        return ok(`${hidden ? "Hid" : "Revealed"} prehistory for new members in ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-approve-join-request",
    {
      description:
        "Approve or deny a pending join request for a supergroup or channel (basic groups are not supported). Admin with invite_users permission required",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username where the join request is pending"),
        userId: z.string().describe("User ID or username of the requesting user"),
        approved: z.boolean().describe("true to approve the join request, false to deny"),
      },
      annotations: WRITE,
    },
    async ({ chatId, userId, approved }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.approveChatJoinRequest(chatId, userId, approved);
        return ok(`${approved ? "Approved" : "Denied"} join request from ${userId} in ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-create-topic",
    {
      description: "Create a new forum topic in a forum-enabled supergroup",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username of the forum supergroup"),
        title: z.string().describe("Topic title"),
        iconColor: z
          .union([
            z.literal(7322096),
            z.literal(16766590),
            z.literal(13338331),
            z.literal(9367192),
            z.literal(16749490),
            z.literal(16225862),
          ])
          .optional()
          .describe("Optional icon color (one of 7322096, 16766590, 13338331, 9367192, 16749490, 16225862)"),
        iconEmojiId: z
          .string()
          .regex(/^\d+$/, "iconEmojiId must be a numeric string")
          .optional()
          .describe("Optional custom emoji document ID for the icon (numeric string)"),
      },
      annotations: WRITE,
    },
    async ({ chatId, title, iconColor, iconEmojiId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const topic = await telegram.createForumTopic(chatId, title, iconColor, iconEmojiId);
        return ok(`Created topic "${topic.title}" (id=${topic.id}) in ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-edit-topic",
    {
      description: "Edit a forum topic — rename, change icon emoji, open/close, or show/hide",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username of the forum supergroup"),
        topicId: z.number().describe("Topic ID (get from telegram-list-topics)"),
        title: z.string().optional().describe("New topic title"),
        iconEmojiId: z
          .string()
          .regex(/^\d+$/, "iconEmojiId must be a numeric string")
          .optional()
          .describe("New custom emoji document ID for the icon (numeric string)"),
        closed: z.boolean().optional().describe("Close (true) or reopen (false) the topic"),
        hidden: z.boolean().optional().describe("Hide (true) or show (false) the General topic"),
      },
      annotations: WRITE,
    },
    async ({ chatId, topicId, title, iconEmojiId, closed, hidden }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.editForumTopic(chatId, topicId, { title, iconEmojiId, closed, hidden });
        const changes: string[] = [];
        if (title !== undefined) changes.push(`title="${title}"`);
        if (iconEmojiId !== undefined) changes.push(`iconEmojiId=${iconEmojiId}`);
        if (closed !== undefined) changes.push(closed ? "closed" : "reopened");
        if (hidden !== undefined) changes.push(hidden ? "hidden" : "shown");
        return ok(
          sanitize(
            changes.length > 0
              ? `Updated topic ${topicId} in ${chatId}: ${changes.join(", ")}`
              : `No changes for topic ${topicId} in ${chatId}`,
          ),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-broadcast-stats",
    {
      description:
        "Get broadcast channel statistics: followers, views/shares/reactions per post & story, notification percent, recent post interactions. Broadcast channels only (use telegram-get-megagroup-stats for supergroups). Admin rights required; some channels may require Telegram Premium to expose stats",
      inputSchema: {
        chatId: z.string().describe("Broadcast channel ID or username"),
        includeGraphs: z
          .boolean()
          .default(false)
          .describe(
            "Include raw graph data for each series (growth, followers, interactions, etc.). Default false — returns only aggregate numbers + metadata",
          ),
        dark: z.boolean().default(false).describe("Prefer dark-theme palette when Telegram renders graphs"),
      },
      annotations: READ_ONLY,
    },
    async ({ chatId, includeGraphs, dark }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const stats = await telegram.getBroadcastStats(chatId, { dark, includeGraphs });
        return ok(JSON.stringify(stats));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-megagroup-stats",
    {
      description:
        "Get supergroup statistics: members, messages, viewers, posters (current vs previous period), top posters/admins/inviters. Supergroups only (use telegram-get-broadcast-stats for broadcast channels). Admin rights required. Telegram rate-limits this endpoint to roughly 1 request per 30 minutes per channel — expect FLOOD_WAIT on rapid repeat calls",
      inputSchema: {
        chatId: z.string().describe("Supergroup ID or username"),
        includeGraphs: z
          .boolean()
          .default(false)
          .describe(
            "Include raw graph data for each series (growth, members, messages, actions, top hours, weekdays, etc.). Default false — returns only aggregate numbers + top lists",
          ),
        dark: z.boolean().default(false).describe("Prefer dark-theme palette when Telegram renders graphs"),
      },
      annotations: READ_ONLY,
    },
    async ({ chatId, includeGraphs, dark }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const stats = await telegram.getMegagroupStats(chatId, { dark, includeGraphs });
        return ok(JSON.stringify(stats));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-delete-topic",
    {
      description: "Delete a forum topic and all its message history",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username of the forum supergroup"),
        topicId: z.number().describe("Topic ID to delete"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ chatId, topicId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.deleteForumTopic(chatId, topicId);
        return ok(`Deleted topic ${topicId} in ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );
}
