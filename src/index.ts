#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TelegramService } from "./telegram-client.js";

// Telegram API credentials from env
const API_ID = Number(process.env.TELEGRAM_API_ID);
const API_HASH = process.env.TELEGRAM_API_HASH;

if (!API_ID || !API_HASH) {
  console.error("[mcp-telegram] TELEGRAM_API_ID and TELEGRAM_API_HASH must be set");
  process.exit(1);
}

const telegram = new TelegramService(API_ID, API_HASH);

const server = new McpServer({
  name: "mcp-telegram",
  version: "1.0.0",
});

/** Try to connect, return error text if failed */
async function requireConnection(): Promise<string | null> {
  if (await telegram.ensureConnected()) return null;
  const reason = telegram.lastError ? ` ${telegram.lastError}` : "";
  return `Not connected to Telegram.${reason} Run telegram-login first.`;
}

// --- Tools ---

server.tool("telegram-status", "Check Telegram connection status", {}, async () => {
  if (await telegram.ensureConnected()) {
    try {
      const me = await telegram.getMe();
      return {
        content: [
          {
            type: "text",
            text: `Connected as ${me.firstName ?? ""} (@${me.username ?? "unknown"}, id: ${me.id})`,
          },
        ],
      };
    } catch {
      return { content: [{ type: "text", text: "Connected, but failed to get user info" }] };
    }
  }

  const reason = telegram.lastError ? ` Reason: ${telegram.lastError}` : "";
  return {
    content: [{ type: "text", text: `Not connected.${reason} Use telegram-login to authenticate via QR code.` }],
  };
});

server.tool(
  "telegram-login",
  "Login to Telegram via QR code. Returns QR image. IMPORTANT: pass the entire result to user without modifications.",
  {},
  async () => {
    let qrDataUrl = "";
    let qrRawUrl = "";

    const loginPromise = telegram.startQrLogin(
      (dataUrl) => {
        qrDataUrl = dataUrl;
      },
      (url) => {
        qrRawUrl = url;
      },
    );

    // Wait for first QR to be generated
    const startTime = Date.now();
    while (!qrDataUrl && Date.now() - startTime < 15000) {
      await new Promise((r) => setTimeout(r, 500));
    }

    if (!qrDataUrl) {
      return { content: [{ type: "text", text: "Failed to generate QR code" }] };
    }

    // Login continues in background
    loginPromise.then((result) => {
      if (result.success) {
        console.error("[mcp-telegram] Login successful");
      } else {
        console.error(`[mcp-telegram] Login failed: ${result.message}`);
      }
    });

    // Return as MCP image content + text with fallback options
    const base64 = qrDataUrl.replace(/^data:image\/png;base64,/, "");
    const qrApiUrl = qrRawUrl
      ? `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(qrRawUrl)}`
      : "";

    const instructions = [
      "Scan this QR code in Telegram: **Settings → Devices → Link Desktop Device**.",
      "",
      qrApiUrl ? `If the QR image is not visible, open this link in your browser:\n${qrApiUrl}` : "",
      "",
      "After scanning, run **telegram-status** to verify the connection.",
    ]
      .filter(Boolean)
      .join("\n");

    return {
      content: [
        {
          type: "image" as const,
          data: base64,
          mimeType: "image/png" as const,
        },
        {
          type: "text",
          text: instructions,
        },
      ],
    };
  },
);

server.tool(
  "telegram-send-message",
  "Send a message to a Telegram chat",
  {
    chatId: z.string().describe("Chat ID or username (e.g. @username or numeric ID)"),
    text: z.string().describe("Message text"),
    replyTo: z.number().optional().describe("Message ID to reply to"),
    parseMode: z.enum(["md", "html"]).optional().describe("Message format: md (Markdown) or html"),
  },
  async ({ chatId, text, replyTo, parseMode }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      await telegram.sendMessage(chatId, text, replyTo, parseMode);
      return { content: [{ type: "text", text: `Message sent to ${chatId}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Send error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-list-chats",
  "List Telegram chats",
  {
    limit: z.number().default(20).describe("Number of chats to return"),
    offsetDate: z.number().optional().describe("Unix timestamp offset for pagination"),
    filterType: z.enum(["private", "group", "channel"]).optional().describe("Filter by chat type"),
  },
  async ({ limit, offsetDate, filterType }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      const dialogs = await telegram.getDialogs(limit, offsetDate, filterType);
      const text = dialogs
        .map(
          (d) =>
            `${d.type === "group" ? "G" : d.type === "channel" ? "C" : "P"} ${d.name} (${d.id}) ${d.unreadCount > 0 ? `[${d.unreadCount} unread]` : ""}`,
        )
        .join("\n");
      return { content: [{ type: "text", text: text || "No chats" }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-read-messages",
  "Read recent messages from a Telegram chat",
  {
    chatId: z.string().describe("Chat ID or username"),
    limit: z.number().default(10).describe("Number of messages to return"),
    offsetId: z.number().optional().describe("Message ID to start from (for pagination)"),
    minDate: z.number().optional().describe("Unix timestamp: only messages after this date"),
    maxDate: z.number().optional().describe("Unix timestamp: only messages before this date"),
  },
  async ({ chatId, limit, offsetId, minDate, maxDate }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      const messages = await telegram.getMessages(chatId, limit, offsetId, minDate, maxDate);
      const text = messages
        .map(
          (m) =>
            `[${m.date}] ${m.sender}: ${m.text}${m.media ? ` [${m.media.type}${m.media.fileName ? `: ${m.media.fileName}` : ""}]` : ""}`,
        )
        .join("\n\n");
      return { content: [{ type: "text", text: text || "No messages" }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-search-chats",
  "Search for Telegram chats/users/channels by name or username",
  {
    query: z.string().describe("Search query (name or username)"),
    limit: z.number().default(10).describe("Max results"),
  },
  async ({ query, limit }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      const results = await telegram.searchChats(query, limit);
      const text = results
        .map(
          (c) =>
            `${c.type === "group" ? "G" : c.type === "channel" ? "C" : "P"} ${c.name}${c.username ? ` (@${c.username})` : ""} (${c.id})`,
        )
        .join("\n");
      return { content: [{ type: "text", text: text || "No results" }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-search-messages",
  "Search messages in a Telegram chat by text",
  {
    chatId: z.string().describe("Chat ID or username"),
    query: z.string().describe("Search text"),
    limit: z.number().default(20).describe("Max results"),
    minDate: z.number().optional().describe("Unix timestamp: only messages after this date"),
    maxDate: z.number().optional().describe("Unix timestamp: only messages before this date"),
  },
  async ({ chatId, query, limit, minDate, maxDate }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      const messages = await telegram.searchMessages(chatId, query, limit, minDate, maxDate);
      const text = messages
        .map(
          (m) =>
            `[${m.date}] ${m.sender}: ${m.text}${m.media ? ` [${m.media.type}${m.media.fileName ? `: ${m.media.fileName}` : ""}]` : ""}`,
        )
        .join("\n\n");
      return { content: [{ type: "text", text: text || "No messages found" }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-get-unread",
  "Get unread Telegram chats",
  {
    limit: z.number().default(20).describe("Number of unread chats to return"),
  },
  async ({ limit }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      const dialogs = await telegram.getUnreadDialogs(limit);
      const text = dialogs
        .map(
          (d) =>
            `${d.type === "group" ? "G" : d.type === "channel" ? "C" : "P"} ${d.name} (${d.id}) [${d.unreadCount} unread]`,
        )
        .join("\n");
      return { content: [{ type: "text", text: text || "No unread chats" }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-mark-as-read",
  "Mark a Telegram chat as read",
  {
    chatId: z.string().describe("Chat ID or username"),
  },
  async ({ chatId }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      await telegram.markAsRead(chatId);
      return { content: [{ type: "text", text: `Marked ${chatId} as read` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-forward-message",
  "Forward messages between Telegram chats",
  {
    fromChatId: z.string().describe("Source chat ID or username"),
    toChatId: z.string().describe("Destination chat ID or username"),
    messageIds: z.array(z.number()).describe("Array of message IDs to forward"),
  },
  async ({ fromChatId, toChatId, messageIds }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      await telegram.forwardMessage(fromChatId, toChatId, messageIds);
      return {
        content: [
          { type: "text", text: `Forwarded ${messageIds.length} message(s) from ${fromChatId} to ${toChatId}` },
        ],
      };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-edit-message",
  "Edit a sent message in Telegram",
  {
    chatId: z.string().describe("Chat ID or username"),
    messageId: z.number().describe("ID of the message to edit"),
    text: z.string().describe("New message text"),
  },
  async ({ chatId, messageId, text }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      await telegram.editMessage(chatId, messageId, text);
      return { content: [{ type: "text", text: `Message ${messageId} edited in ${chatId}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-delete-message",
  "Delete messages in a Telegram chat",
  {
    chatId: z.string().describe("Chat ID or username"),
    messageIds: z.array(z.number()).describe("Array of message IDs to delete"),
  },
  async ({ chatId, messageIds }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      await telegram.deleteMessages(chatId, messageIds);
      return { content: [{ type: "text", text: `Deleted ${messageIds.length} message(s) in ${chatId}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-get-chat-info",
  "Get detailed info about a Telegram chat",
  {
    chatId: z.string().describe("Chat ID or username"),
  },
  async ({ chatId }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      const info = await telegram.getChatInfo(chatId);
      const lines = [
        `Name: ${info.name}`,
        `ID: ${info.id}`,
        `Type: ${info.type}`,
        ...(info.username ? [`Username: @${info.username}`] : []),
        ...(info.description ? [`Description: ${info.description}`] : []),
        ...(info.membersCount != null ? [`Members: ${info.membersCount}`] : []),
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-send-file",
  "Send a file to a Telegram chat",
  {
    chatId: z.string().describe("Chat ID or username"),
    filePath: z.string().describe("Absolute path to file"),
    caption: z.string().optional().describe("File caption"),
  },
  async ({ chatId, filePath, caption }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      await telegram.sendFile(chatId, filePath, caption);
      return { content: [{ type: "text", text: `File sent to ${chatId}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Send file error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-download-media",
  "Download media from a Telegram message",
  {
    chatId: z.string().describe("Chat ID or username"),
    messageId: z.number().describe("Message ID containing media"),
    downloadPath: z.string().describe("Absolute path to save file"),
  },
  async ({ chatId, messageId, downloadPath }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      const path = await telegram.downloadMedia(chatId, messageId, downloadPath);
      return { content: [{ type: "text", text: `Media downloaded to ${path}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Download error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-pin-message",
  "Pin a message in a Telegram chat",
  {
    chatId: z.string().describe("Chat ID or username"),
    messageId: z.number().describe("Message ID to pin"),
    silent: z.boolean().default(false).describe("Pin without notification"),
  },
  async ({ chatId, messageId, silent }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      await telegram.pinMessage(chatId, messageId, silent);
      return { content: [{ type: "text", text: `Message ${messageId} pinned in ${chatId}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Pin error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-unpin-message",
  "Unpin a message in a Telegram chat",
  {
    chatId: z.string().describe("Chat ID or username"),
    messageId: z.number().describe("Message ID to unpin"),
  },
  async ({ chatId, messageId }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      await telegram.unpinMessage(chatId, messageId);
      return { content: [{ type: "text", text: `Message ${messageId} unpinned in ${chatId}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Unpin error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-get-contacts",
  "Get Telegram contacts list",
  {
    limit: z.number().default(50).describe("Number of contacts to return"),
  },
  async ({ limit }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      const contacts = await telegram.getContacts(limit);
      const text = contacts
        .map((c) => `P ${c.name}${c.username ? ` (@${c.username})` : ""} (${c.id})${c.phone ? ` +${c.phone}` : ""}`)
        .join("\n");
      return { content: [{ type: "text", text: text || "No contacts" }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-get-chat-members",
  "Get members of a Telegram group or channel",
  {
    chatId: z.string().describe("Chat ID or username"),
    limit: z.number().default(50).describe("Number of members to return"),
  },
  async ({ chatId, limit }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      const members = await telegram.getChatMembers(chatId, limit);
      const text = members.map((m) => `${m.name}${m.username ? ` (@${m.username})` : ""} (${m.id})`).join("\n");
      return { content: [{ type: "text", text: text || "No members found" }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-get-profile",
  "Get detailed profile info of a Telegram user",
  {
    userId: z.string().describe("User ID or username"),
  },
  async ({ userId }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      const profile = await telegram.getProfile(userId);
      const lines = [
        `Name: ${profile.name}`,
        `ID: ${profile.id}`,
        ...(profile.username ? [`Username: @${profile.username}`] : []),
        ...(profile.phone ? [`Phone: +${profile.phone}`] : []),
        ...(profile.bio ? [`Bio: ${profile.bio}`] : []),
        `Photo: ${profile.photo ? "yes" : "no"}`,
        ...(profile.lastSeen ? [`Last seen: ${profile.lastSeen}`] : []),
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }] };
    }
  },
);

// --- Start ---

async function main() {
  // Try to auto-connect with saved session
  await telegram.loadSession();
  if (await telegram.connect()) {
    const me = await telegram.getMe();
    console.error(`[mcp-telegram] Auto-connected as @${me.username}`);
  } else if (telegram.lastError) {
    console.error(`[mcp-telegram] ${telegram.lastError}`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp-telegram] MCP server running on stdio");
}

main().catch((err) => {
  console.error("[mcp-telegram] Fatal:", err);
  process.exit(1);
});
