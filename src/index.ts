#!/usr/bin/env node

// Redirect console.log to stderr BEFORE any imports.
// GramJS Logger uses console.log (stdout) which corrupts MCP JSON-RPC stream.
const _origLog = console.log;
console.log = (...args: unknown[]) => {
  console.error(...args);
};

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

/** Format reactions array into compact text like: [👍×5 ❤️×3(me) 🔥×1] */
function formatReactions(reactions?: { emoji: string; count: number; me: boolean }[]): string {
  if (!reactions?.length) return "";
  const parts = reactions.map((r) => `${r.emoji}×${r.count}${r.me ? "(me)" : ""}`);
  return ` [${parts.join(" ")}]`;
}

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
    topicId: z.number().optional().describe("Forum topic ID to send message into (for groups with Topics enabled)"),
  },
  async ({ chatId, text, replyTo, parseMode, topicId }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      await telegram.sendMessage(chatId, text, replyTo, parseMode, topicId);
      const dest = topicId ? `topic ${topicId} in ${chatId}` : chatId;
      return { content: [{ type: "text", text: `Message sent to ${dest}` }] };
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
    filterType: z
      .enum(["private", "group", "channel", "contact_requests"])
      .optional()
      .describe("Filter by chat type. 'contact_requests' shows only private chats from non-contacts"),
  },
  async ({ limit, offsetDate, filterType }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

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
            `[#${m.id}] [${m.date}] ${m.sender}: ${m.text}${m.media ? ` [${m.media.type}${m.media.fileName ? `: ${m.media.fileName}` : ""}]` : ""}${formatReactions(m.reactions)}`,
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
            `${c.type === "group" ? "G" : c.type === "channel" ? "C" : "P"} ${c.name}${c.username ? ` (@${c.username})` : ""} (${c.id})${c.membersCount ? ` [${c.membersCount} members]` : ""}${c.description ? ` — ${c.description.split("\n")[0].slice(0, 100)}` : ""}`,
        )
        .join("\n");
      return { content: [{ type: "text", text: text || "No results" }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-search-global",
  "Search messages globally across all public Telegram chats and channels",
  {
    query: z.string().describe("Search text"),
    limit: z.number().default(20).describe("Max results"),
    minDate: z.number().optional().describe("Unix timestamp: only messages after this date"),
    maxDate: z.number().optional().describe("Unix timestamp: only messages before this date"),
  },
  async ({ query, limit, minDate, maxDate }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      const messages = await telegram.searchGlobal(query, limit, minDate, maxDate);
      const text = messages
        .map(
          (m) =>
            `[#${m.id}] [${m.date}] [${m.chat.type === "channel" ? "C" : m.chat.type === "group" ? "G" : "P"} ${m.chat.name}${m.chat.username ? ` @${m.chat.username}` : ""}] ${m.sender}: ${m.text}${m.media ? ` [${m.media.type}${m.media.fileName ? `: ${m.media.fileName}` : ""}]` : ""}${formatReactions(m.reactions)}`,
        )
        .join("\n\n");
      return { content: [{ type: "text", text: text || "No messages found" }] };
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
            `[#${m.id}] [${m.date}] ${m.sender}: ${m.text}${m.media ? ` [${m.media.type}${m.media.fileName ? `: ${m.media.fileName}` : ""}]` : ""}${formatReactions(m.reactions)}`,
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
        .map((d) => {
          const prefix = d.type === "group" ? "G" : d.type === "channel" ? "C" : "P";
          const botTag = d.isBot ? " [bot]" : "";
          const contactTag = d.type === "private" && d.isContact === false ? " [not in contacts]" : "";
          const forumTag = d.forum ? " [forum]" : "";
          let line = `${prefix} ${d.name} (${d.id})${botTag}${contactTag}${forumTag} [${d.unreadCount} unread]`;
          if (d.topics && d.topics.length > 0) {
            const topicLines = d.topics.map((t) => `  # ${t.title} [${t.unreadCount} unread]`);
            line += `\n${topicLines.join("\n")}`;
          }
          return line;
        })
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
        ...(info.forum ? ["Forum: yes"] : []),
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
  "Get detailed profile info of a Telegram user including bio, birthday, business info and more",
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
        ...(profile.premium ? ["Premium: yes"] : []),
        ...(profile.lastSeen ? [`Last seen: ${profile.lastSeen}`] : []),
        ...(profile.birthday ? [`Birthday: ${profile.birthday}`] : []),
        ...(profile.commonChatsCount ? [`Common chats: ${profile.commonChatsCount}`] : []),
        ...(profile.personalChannelId ? [`Personal channel ID: ${profile.personalChannelId}`] : []),
        ...(profile.businessLocation ? [`Business location: ${profile.businessLocation}`] : []),
        ...(profile.businessWorkHours ? [`Business hours timezone: ${profile.businessWorkHours}`] : []),
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-get-profile-photo",
  "Download profile photo of a Telegram user, group, or channel. Returns inline image or saves to file",
  {
    entityId: z.string().describe("User/Chat/Channel ID or username"),
    savePath: z.string().optional().describe("Absolute path to save file. If omitted, returns inline base64 image"),
    size: z
      .enum(["small", "big"])
      .optional()
      .describe("Photo size: 'small' (160x160) or 'big' (640x640). Default: big"),
  },
  async ({ entityId, savePath, size }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      const result = await telegram.downloadProfilePhoto(entityId, {
        isBig: size !== "small",
        savePath,
      });

      if (!result) {
        return { content: [{ type: "text", text: "No profile photo found" }] };
      }

      if ("filePath" in result) {
        return { content: [{ type: "text", text: `Downloaded to: ${result.filePath}` }] };
      }

      return {
        content: [
          { type: "image", data: result.buffer.toString("base64"), mimeType: result.mimeType },
          { type: "text", text: `Profile photo (${(result.buffer.length / 1024).toFixed(0)} KB, ${result.mimeType})` },
        ],
      };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-join-chat",
  "Join a Telegram group or channel by username or invite link",
  {
    target: z.string().describe("Username (@group), link (t.me/group), or invite link (t.me/+xxx)"),
  },
  async ({ target }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      const result = await telegram.joinChat(target);
      return {
        content: [
          {
            type: "text",
            text: `Joined ${result.type}: ${result.title} (ID: ${result.id})`,
          },
        ],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
      };
    }
  },
);

server.tool(
  "telegram-send-reaction",
  "Send emoji reaction(s) to a message. Supports multiple reactions and adding to existing ones. Omit emoji to remove all reactions",
  {
    chatId: z.string().describe("Chat ID or username"),
    messageId: z.number().describe("Message ID to react to"),
    emoji: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe("Reaction emoji(s): single '👍' or array ['👍','🔥']. Omit to remove all reactions"),
    addToExisting: z
      .boolean()
      .default(false)
      .describe("If true, add reaction(s) to existing ones instead of replacing"),
  },
  async ({ chatId, messageId, emoji, addToExisting }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      const updated = await telegram.sendReaction(chatId, messageId, emoji, addToExisting);
      const emojiStr = Array.isArray(emoji) ? emoji.join("") : emoji;
      const action = emoji ? `Reacted ${emojiStr} to` : "Removed reactions from";
      const reactionsInfo = updated
        ? ` | Reactions: ${updated.map((r) => `${r.emoji}×${r.count}${r.me ? "(me)" : ""}`).join(" ")}`
        : "";
      return { content: [{ type: "text", text: `${action} message ${messageId} in ${chatId}${reactionsInfo}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Reaction error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-get-reactions",
  "Get detailed reaction info for a message: which reactions, counts, and who reacted (when visible)",
  {
    chatId: z.string().describe("Chat ID or username"),
    messageId: z.number().describe("Message ID to get reactions for"),
  },
  async ({ chatId, messageId }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      const result = await telegram.getMessageReactions(chatId, messageId);
      if (result.reactions.length === 0) {
        return { content: [{ type: "text", text: `No reactions on message ${messageId}` }] };
      }
      const lines = result.reactions.map((r) => {
        const usersStr = r.users.length > 0 ? `: ${r.users.map((u) => u.name).join(", ")}` : "";
        return `${r.emoji} × ${r.count}${usersStr}`;
      });
      lines.push(`\nTotal: ${result.total} reactions`);
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-send-scheduled",
  "Send a scheduled message to a Telegram chat. The message will be delivered at the specified time by Telegram servers",
  {
    chatId: z.string().describe("Chat ID or username (use 'me' or 'self' for Saved Messages)"),
    text: z.string().describe("Message text"),
    scheduleDate: z.number().describe("Unix timestamp when to send the message (must be in the future)"),
    replyTo: z.number().optional().describe("Message ID to reply to"),
    parseMode: z.enum(["md", "html"]).optional().describe("Message format: md (Markdown) or html"),
  },
  async ({ chatId, text, scheduleDate, replyTo, parseMode }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    // Resolve 'me'/'self' to Saved Messages
    let target = chatId;
    if (target === "me" || target === "self") {
      try {
        const me = await telegram.getMe();
        target = me.id;
      } catch {
        return { content: [{ type: "text", text: "Failed to resolve Saved Messages" }] };
      }
    }

    try {
      await telegram.sendScheduledMessage(target, text, scheduleDate, replyTo, parseMode);
      const date = new Date(scheduleDate * 1000).toISOString();
      return { content: [{ type: "text", text: `Message scheduled for ${date} in ${chatId}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Schedule error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-create-poll",
  "Create a poll in a Telegram chat",
  {
    chatId: z.string().describe("Chat ID or username"),
    question: z.string().describe("Poll question"),
    answers: z.array(z.string()).min(2).max(10).describe("Answer options (2-10)"),
    multipleChoice: z.boolean().default(false).describe("Allow multiple answers"),
    quiz: z.boolean().default(false).describe("Quiz mode (one correct answer)"),
    correctAnswer: z.number().optional().describe("Index of correct answer (0-based, required for quiz mode)"),
  },
  async ({ chatId, question, answers, multipleChoice, quiz, correctAnswer }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      const msgId = await telegram.createPoll(chatId, question, answers, { multipleChoice, quiz, correctAnswer });
      return { content: [{ type: "text", text: `Poll created in ${chatId}${msgId ? ` (message #${msgId})` : ""}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Poll error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-get-contact-requests",
  "Get incoming messages from non-contacts (contact requests). Shows who messaged you without being in your contacts, with message preview",
  {
    limit: z.number().default(20).describe("Number of contact requests to return"),
  },
  async ({ limit }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      const requests = await telegram.getContactRequests(limit);
      if (requests.length === 0) {
        return { content: [{ type: "text", text: "No contact requests" }] };
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
      return { content: [{ type: "text", text: text }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-add-contact",
  "Add a user to your Telegram contacts. Use this to accept contact requests from non-contacts",
  {
    userId: z.string().describe("User ID or username to add"),
    firstName: z.string().describe("First name for the contact"),
    lastName: z.string().optional().describe("Last name for the contact"),
    phone: z.string().optional().describe("Phone number for the contact"),
  },
  async ({ userId, firstName, lastName, phone }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      await telegram.addContact(userId, firstName, lastName, phone);
      return {
        content: [{ type: "text", text: `Contact added: ${firstName}${lastName ? ` ${lastName}` : ""} (${userId})` }],
      };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-block-user",
  "Block a Telegram user. Blocked users cannot send you messages",
  {
    userId: z.string().describe("User ID or username to block"),
  },
  async ({ userId }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      await telegram.blockUser(userId);
      return { content: [{ type: "text", text: `User blocked: ${userId}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-report-spam",
  "Report a chat as spam to Telegram",
  {
    chatId: z.string().describe("Chat ID or username to report"),
  },
  async ({ chatId }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      await telegram.reportSpam(chatId);
      return { content: [{ type: "text", text: `Reported as spam: ${chatId}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-list-topics",
  "List forum topics in a Telegram group with Topics enabled. Shows topic names, unread counts, and status",
  {
    chatId: z.string().describe("Chat ID or username of a group with Topics enabled"),
    limit: z.number().default(100).describe("Max topics to return"),
  },
  async ({ chatId, limit }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      const topics = await telegram.getForumTopics(chatId, limit);
      const text = topics
        .map((t) => {
          const flags = [t.pinned ? "pinned" : "", t.closed ? "closed" : ""].filter(Boolean).join(", ");
          const flagStr = flags ? ` [${flags}]` : "";
          const unread = t.unreadCount > 0 ? ` [${t.unreadCount} unread]` : "";
          return `# ${t.title} (id: ${t.id})${flagStr}${unread}`;
        })
        .join("\n");
      return { content: [{ type: "text", text: text || "No topics found" }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  "telegram-read-topic-messages",
  "Read messages from a specific forum topic in a Telegram group",
  {
    chatId: z.string().describe("Chat ID or username"),
    topicId: z.number().describe("Topic ID (get from telegram-list-topics)"),
    limit: z.number().default(20).describe("Number of messages to return"),
    offsetId: z.number().optional().describe("Message ID to start from (for pagination)"),
  },
  async ({ chatId, topicId, limit, offsetId }) => {
    const err = await requireConnection();
    if (err) return { content: [{ type: "text", text: err }] };

    try {
      const messages = await telegram.getTopicMessages(chatId, topicId, limit, offsetId);
      const text = messages
        .map(
          (m) =>
            `[#${m.id}] [${m.date}] ${m.sender}: ${m.text}${m.media ? ` [${m.media.type}${m.media.fileName ? `: ${m.media.fileName}` : ""}]` : ""}${formatReactions(m.reactions)}`,
        )
        .join("\n\n");
      return { content: [{ type: "text", text: text || "No messages in this topic" }] };
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
