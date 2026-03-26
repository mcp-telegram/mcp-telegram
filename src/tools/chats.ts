import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import { fail, ok, READ_ONLY, requireConnection, sanitize, WRITE } from "./shared.js";

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
        return ok(sanitize(text) || "No chats");
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
        return ok(sanitize(text) || "No results");
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
        const text = members.map((m) => `${m.name}${m.username ? ` (@${m.username})` : ""} (${m.id})`).join("\n");
        return ok(sanitize(text) || "No members found");
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
}
