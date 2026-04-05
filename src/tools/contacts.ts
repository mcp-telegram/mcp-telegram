import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import { fail, ok, READ_ONLY, requireConnection, sanitize, WRITE } from "./shared.js";

export function registerContactTools(server: McpServer, telegram: TelegramService) {
  server.registerTool(
    "telegram-get-contacts",
    {
      description: "Get your Telegram contacts list with phone numbers",
      inputSchema: { limit: z.number().default(50).describe("Number of contacts to return") },
      annotations: READ_ONLY,
    },
    async ({ limit }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const contacts = await telegram.getContacts(limit);
        const text = contacts
          .map((c) => `P ${c.name}${c.username ? ` (@${c.username})` : ""} (${c.id})${c.phone ? ` +${c.phone}` : ""}`)
          .join("\n");
        return ok(sanitize(text) || "No contacts");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-profile",
    {
      description:
        "Get detailed profile info of a Telegram user including bio, birthday, premium status, business info and more",
      inputSchema: { userId: z.string().describe("User ID or username") },
      annotations: READ_ONLY,
    },
    async ({ userId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const profile = await telegram.getProfile(userId);
        const lines = [
          `Name: ${profile.name}`,
          `ID: ${profile.id}`,
          ...(profile.username ? [`Username: @${profile.username}`] : []),
          ...(profile.phone ? [`Phone: +${profile.phone}`] : []),
          ...(profile.bio ? [`Bio: ${profile.bio}`] : []),
          `Photo: ${profile.photo ? "yes" : "no"}`,
          ...(profile.premium ? ["Premium: yes"] : []),
          ...(profile.lastSeen ? [`Last seen: ${profile.lastSeen}`] : []),
          ...(profile.birthday ? [`Birthday: ${profile.birthday}`] : []),
          ...(profile.commonChatsCount ? [`Common chats: ${profile.commonChatsCount}`] : []),
          ...(profile.personalChannelId ? [`Personal channel ID: ${profile.personalChannelId}`] : []),
          ...(profile.businessLocation ? [`Business location: ${profile.businessLocation}`] : []),
          ...(profile.businessWorkHours ? [`Business hours timezone: ${profile.businessWorkHours}`] : []),
        ];
        return ok(lines.join("\n"));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-contact-requests",
    {
      description:
        "Get incoming messages from non-contacts (contact requests). Shows who messaged you without being in your contacts, with message preview",
      inputSchema: { limit: z.number().default(20).describe("Number of contact requests to return") },
      annotations: READ_ONLY,
    },
    async ({ limit }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const requests = await telegram.getContactRequests(limit);
        if (requests.length === 0) {
          return ok("No contact requests");
        }
        const text = requests
          .map((r) => {
            const tag = r.isBot ? "[bot]" : "[user]";
            const username = r.username ? ` @${r.username}` : "";
            const unread = r.unreadCount > 0 ? ` [${r.unreadCount} unread]` : "";
            const preview = r.lastMessage ? `\n  > ${r.lastMessage.slice(0, 100)}` : "";
            return `${tag} ${r.name}${username} (${r.id})${unread}${preview}`;
          })
          .join("\n");
        return ok(sanitize(text));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-add-contact",
    {
      description: "Add a user to your Telegram contacts. Use this to accept contact requests from non-contacts",
      inputSchema: {
        userId: z.string().describe("User ID or username to add"),
        firstName: z.string().describe("First name for the contact"),
        lastName: z.string().optional().describe("Last name for the contact"),
        phone: z.string().optional().describe("Phone number for the contact"),
      },
      annotations: WRITE,
    },
    async ({ userId, firstName, lastName, phone }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.addContact(userId, firstName, lastName, phone);
        return ok(`Contact added: ${firstName}${lastName ? ` ${lastName}` : ""} (${userId})`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-block-user",
    {
      description: "Block a Telegram user. Blocked users cannot send you messages",
      inputSchema: { userId: z.string().describe("User ID or username to block") },
      annotations: WRITE,
    },
    async ({ userId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.blockUser(userId);
        return ok(`User blocked: ${userId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-unblock-user",
    {
      description: "Unblock a previously blocked Telegram user",
      inputSchema: { userId: z.string().describe("User ID or username to unblock") },
      annotations: WRITE,
    },
    async ({ userId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.unblockUser(userId);
        return ok(`User unblocked: ${userId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-report-spam",
    {
      description: "Report a chat as spam to Telegram",
      inputSchema: { chatId: z.string().describe("Chat ID or username to report") },
      annotations: WRITE,
    },
    async ({ chatId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.reportSpam(chatId);
        return ok(`Reported as spam: ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );
}
