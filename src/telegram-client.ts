import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { chmod, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import bigInt from "big-integer";
import QRCode from "qrcode";
import { TelegramClient } from "telegram";
import { CustomFile } from "telegram/client/uploads.js";
import type { ProxyInterface } from "telegram/network/connection/TCPMTProxy.js";
import { StringSession } from "telegram/sessions/index.js";
import { Api } from "telegram/tl/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEGACY_SESSION_FILE = join(__dirname, "..", ".telegram-session");
const DEFAULT_SESSION_DIR = join(homedir(), ".mcp-telegram");
const DEFAULT_SESSION_FILE = join(DEFAULT_SESSION_DIR, "session");

const SESSION_STRING_RE = /^[A-Za-z0-9+/=]+$/;
const MIN_SESSION_LENGTH = 100;
const NOT_CONNECTED_ERROR = "Not connected. Run telegram-status to check or telegram-login to authenticate.";

function resolveSessionPath(sessionPath?: string): string {
  return sessionPath ?? process.env.TELEGRAM_SESSION_PATH ?? DEFAULT_SESSION_FILE;
}

function resolveProxy(): ProxyInterface | undefined {
  const ip = process.env.TELEGRAM_PROXY_IP;
  const port = process.env.TELEGRAM_PROXY_PORT;
  if (!ip || !port) return undefined;

  const secret = process.env.TELEGRAM_PROXY_SECRET;
  if (secret) {
    return { ip, port: Number(port), secret, MTProxy: true as const };
  }

  const socksType = Number(process.env.TELEGRAM_PROXY_SOCKS_TYPE || "5");
  return {
    ip,
    port: Number(port),
    socksType: socksType as 4 | 5,
    ...(process.env.TELEGRAM_PROXY_USERNAME && { username: process.env.TELEGRAM_PROXY_USERNAME }),
    ...(process.env.TELEGRAM_PROXY_PASSWORD && { password: process.env.TELEGRAM_PROXY_PASSWORD }),
  };
}

function ensureSessionDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

export class TelegramService {
  private client: TelegramClient | null = null;
  private apiId: number;
  private apiHash: string;
  private sessionString = "";
  private connected = false;
  private sessionPath: string;
  lastError = "";

  get sessionDir(): string {
    return dirname(this.sessionPath);
  }

  constructor(apiId: number, apiHash: string, options?: { sessionPath?: string }) {
    this.apiId = apiId;
    this.apiHash = apiHash;
    this.sessionPath = resolveSessionPath(options?.sessionPath);
  }

  async loadSession(): Promise<boolean> {
    // Try current session path
    if (existsSync(this.sessionPath)) {
      const raw = (await readFile(this.sessionPath, "utf-8")).trim();
      if (this.isValidSessionString(raw)) {
        this.sessionString = raw;
        // Fix permissions on existing files
        try {
          await chmod(this.sessionPath, 0o600);
        } catch {}
        return true;
      }
    }
    // Migrate from legacy path (inside node_modules / package root)
    if (this.sessionPath === DEFAULT_SESSION_FILE && existsSync(LEGACY_SESSION_FILE)) {
      const raw = (await readFile(LEGACY_SESSION_FILE, "utf-8")).trim();
      if (this.isValidSessionString(raw)) {
        this.sessionString = raw;
        ensureSessionDir(this.sessionPath);
        await writeFile(this.sessionPath, raw, { encoding: "utf-8", mode: 0o600 });
        try {
          await unlink(LEGACY_SESSION_FILE);
        } catch {}
        return true;
      }
    }
    return false;
  }

  private isValidSessionString(value: string): boolean {
    return value.length >= MIN_SESSION_LENGTH && SESSION_STRING_RE.test(value);
  }

  /** Set session string in memory (for programmatic / hosted use) */
  setSessionString(session: string): void {
    this.sessionString = session;
  }

  /** Get the current session string (for external persistence) */
  getSessionString(): string {
    return this.sessionString;
  }

  private async saveSession(session: string): Promise<void> {
    this.sessionString = session;
    try {
      ensureSessionDir(this.sessionPath);
      await writeFile(this.sessionPath, session, { encoding: "utf-8", mode: 0o600 });
    } catch {
      // File write may fail in containerized environments — session string is still in memory
    }
  }

  async connect(): Promise<boolean> {
    if (this.connected && this.client) return true;

    if (!this.sessionString) {
      const loaded = await this.loadSession();
      if (!loaded) return false;
    }

    const session = new StringSession(this.sessionString);
    const proxy = resolveProxy();
    this.client = new TelegramClient(session, this.apiId, this.apiHash, {
      connectionRetries: 5,
      ...(proxy && { proxy }),
    });

    try {
      await this.client.connect();
      // Verify session is still valid
      await this.client.getMe();
      this.connected = true;
      return true;
    } catch (err: unknown) {
      const error = err as { errorMessage?: string; message?: string };
      const msg = error.errorMessage || error.message || "";

      // Auth revoked — delete invalid session
      if (msg === "AUTH_KEY_UNREGISTERED" || msg === "SESSION_REVOKED" || msg === "USER_DEACTIVATED") {
        await this.clearSession();
        this.lastError = "Session revoked. Run telegram-login to re-authenticate.";
      }
      // Network error — keep session, just report
      else if (
        msg.includes("TIMEOUT") ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("ENETUNREACH") ||
        msg.includes("ENOTFOUND") ||
        msg.includes("network")
      ) {
        this.lastError = `Network error: ${msg}. Run telegram-status to retry connection.`;
      }
      // Unknown error
      else {
        this.lastError = `Connection error: ${msg}`;
      }

      try {
        await this.client.disconnect();
      } catch {}
      this.client = null;
      return false;
    }
  }

  async clearSession(): Promise<void> {
    this.connected = false;
    this.sessionString = "";
    this.client = null;
    if (existsSync(this.sessionPath)) {
      await unlink(this.sessionPath);
    }
  }

  /** Ensure connection is active, auto-reconnect if session exists */
  async ensureConnected(): Promise<boolean> {
    if (this.connected && this.client) {
      return true;
    }
    // Try to reconnect with saved session
    return this.connect();
  }

  async disconnect(): Promise<void> {
    if (this.client && this.connected) {
      await this.client.destroy();
      this.connected = false;
      this.client = null;
    }
  }

  /**
   * Log out from Telegram completely — terminates the session on Telegram servers.
   * After this, the session string becomes invalid and won't appear in "Active Sessions".
   */
  async logOut(): Promise<boolean> {
    if (!this.client || !this.connected) return false;
    try {
      await this.client.invoke(new Api.auth.LogOut());
      await this.client.destroy();
      this.connected = false;
      this.sessionString = "";
      this.client = null;
      return true;
    } catch (error) {
      console.error("[telegram] logOut error:", error);
      await this.disconnect();
      return false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async startQrLogin(
    onQrDataUrl: (dataUrl: string) => void,
    onQrUrl?: (url: string) => void,
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    const session = new StringSession("");
    const proxy = resolveProxy();
    const client = new TelegramClient(session, this.apiId, this.apiHash, {
      connectionRetries: 5,
      ...(proxy && { proxy }),
    });

    try {
      await client.connect();

      let loginAccepted = false;
      let resolved = false;
      let lastQrUrl = "";

      client.addEventHandler((update: Api.TypeUpdate) => {
        if (update instanceof Api.UpdateLoginToken) {
          loginAccepted = true;
        }
      });

      const maxAttempts = 30; // 5 minutes
      for (let i = 0; i < maxAttempts && !resolved; i++) {
        try {
          const result = await client.invoke(
            new Api.auth.ExportLoginToken({
              apiId: this.apiId,
              apiHash: this.apiHash,
              exceptIds: [],
            }),
          );

          if (result instanceof Api.auth.LoginToken) {
            const base64url = Buffer.from(result.token).toString("base64url");
            const url = `tg://login?token=${base64url}`;
            if (url !== lastQrUrl) {
              lastQrUrl = url;
              const dataUrl = await QRCode.toDataURL(url, {
                width: 256,
                margin: 2,
              });
              onQrDataUrl(dataUrl);
              onQrUrl?.(url);
            }
          } else if (result instanceof Api.auth.LoginTokenMigrateTo) {
            await client._switchDC(result.dcId);
            const imported = await client.invoke(new Api.auth.ImportLoginToken({ token: result.token }));
            if (imported instanceof Api.auth.LoginTokenSuccess) {
              resolved = true;
              break;
            }
          } else if (result instanceof Api.auth.LoginTokenSuccess) {
            resolved = true;
            break;
          }
        } catch (err: unknown) {
          const error = err as { errorMessage?: string; message?: string };
          if (error.errorMessage === "SESSION_PASSWORD_NEEDED") {
            await client.disconnect();
            return { success: false, message: "2FA enabled — QR login not supported with 2FA" };
          }
        }

        if (!resolved) {
          await new Promise((r) => setTimeout(r, loginAccepted ? 1500 : 10000));
        }
      }

      if (resolved) {
        const newSession = client.session.save() as unknown as string;
        // Adopt the QR login client directly instead of destroy+reconnect
        // This avoids creating a second Telegram session from DC migration auth keys
        this.client = client;
        this.sessionString = newSession;
        this.connected = true;
        await this.saveSession(newSession);
        return { success: true, message: "Telegram login successful" };
      }

      await client.destroy();
      return { success: false, message: "QR login timeout" };
    } catch (err: unknown) {
      try {
        await client.destroy();
      } catch {}
      return { success: false, message: `Login failed: ${(err as Error).message}` };
    }
  }

  async getMe(): Promise<{ id: string; username?: string; firstName?: string }> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const me = await this.client.getMe();
    const user = me as Api.User;
    return {
      id: user.id.toString(),
      username: user.username ?? undefined,
      firstName: user.firstName ?? undefined,
    };
  }

  async sendMessage(
    chatId: string,
    text: string,
    replyTo?: number,
    parseMode?: "md" | "html",
    topicId?: number,
  ): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const resolved = await this.resolvePeer(chatId);
    if (topicId) {
      // Forum topics require raw API call with InputReplyToMessage
      const peer = await this.client.getInputEntity(resolved);
      await this.client.invoke(
        new Api.messages.SendMessage({
          peer,
          message: text,
          randomId: bigInt(Math.floor(Math.random() * 1e15)),
          replyTo: new Api.InputReplyToMessage({
            replyToMsgId: replyTo ?? topicId,
            topMsgId: topicId,
          }),
        }),
      );
    } else {
      await this.client.sendMessage(resolved, {
        message: text,
        ...(replyTo ? { replyTo } : {}),
        ...(parseMode ? { parseMode: parseMode === "html" ? "html" : "md" } : {}),
      });
    }
  }

  async sendFile(chatId: string, filePath: string, caption?: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const resolved = await this.resolvePeer(chatId);
    await this.client.sendFile(resolved, { file: filePath, caption });
  }

  async downloadMedia(chatId: string, messageId: number, downloadPath: string): Promise<string> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const resolved = await this.resolvePeer(chatId);
    const messages = await this.client.getMessages(resolved, { ids: [messageId] });
    const message = messages[0];
    if (!message) throw new Error(`Message ${messageId} not found`);
    if (!message.media) throw new Error(`Message ${messageId} has no media`);
    const buffer = await this.client.downloadMedia(message);
    if (!buffer) throw new Error("Failed to download media");
    await writeFile(downloadPath, buffer as Buffer);
    return downloadPath;
  }

  async downloadMediaAsBuffer(chatId: string, messageId: number): Promise<{ buffer: Buffer; mimeType: string }> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const resolved = await this.resolvePeer(chatId);
    const messages = await this.client.getMessages(resolved, { ids: [messageId] });
    const message = messages[0];
    if (!message) throw new Error(`Message ${messageId} not found`);
    if (!message.media) throw new Error(`Message ${messageId} has no media`);
    const buffer = (await this.client.downloadMedia(message)) as Buffer;
    if (!buffer) throw new Error("Failed to download media");
    const mimeType = this.detectMimeType(buffer, message.media);
    return { buffer, mimeType };
  }

  /** Detect MIME type from buffer magic bytes, falling back to media metadata */
  private detectMimeType(buffer: Buffer, media: unknown): string {
    // Check magic bytes first
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return "image/gif";
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return "image/webp";
    // Fall back to document mimeType
    const m = media as unknown as Record<string, unknown>;
    const doc = m.document as unknown as Record<string, unknown> | undefined;
    if (doc?.mimeType) return doc.mimeType as string;
    if (m.photo) return "image/jpeg";
    return "application/octet-stream";
  }

  async pinMessage(chatId: string, messageId: number, silent = false): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const resolved = await this.resolvePeer(chatId);
    await this.client.pinMessage(resolved, messageId, { notify: !silent });
  }

  async unpinMessage(chatId: string, messageId: number): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const resolved = await this.resolvePeer(chatId);
    await this.client.unpinMessage(resolved, messageId);
  }

  async getDialogs(
    limit = 20,
    offsetDate?: number,
    filterType?: "private" | "group" | "channel" | "contact_requests",
  ): Promise<
    Array<{
      id: string;
      name: string;
      type: string;
      unreadCount: number;
      isBot?: boolean;
      isContact?: boolean;
    }>
  > {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const fetchLimit = filterType ? limit * 3 : limit;
    const dialogs = await this.client.getDialogs({ limit: fetchLimit, ...(offsetDate ? { offsetDate } : {}) });
    const mapped = dialogs.map((d) => {
      const type = d.isGroup ? "group" : d.isChannel ? "channel" : "private";
      const isUser = d.entity instanceof Api.User;
      return {
        id: d.id?.toString() ?? "",
        name: d.title ?? d.name ?? "Unknown",
        type,
        unreadCount: d.unreadCount,
        ...(isUser
          ? { isBot: Boolean((d.entity as Api.User).bot), isContact: Boolean((d.entity as Api.User).contact) }
          : {}),
      };
    });
    if (filterType === "contact_requests") {
      return mapped.filter((d) => d.type === "private" && d.isContact === false).slice(0, limit);
    }
    return filterType ? mapped.filter((d) => d.type === filterType).slice(0, limit) : mapped;
  }

  async getUnreadDialogs(limit = 20): Promise<
    Array<{
      id: string;
      name: string;
      type: string;
      unreadCount: number;
      isBot?: boolean;
      isContact?: boolean;
      forum?: boolean;
      topics?: Array<{ id: number; title: string; unreadCount: number }>;
    }>
  > {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const dialogs = await this.client.getDialogs({ limit: limit * 3 });
    const unread = dialogs.filter((d) => d.unreadCount > 0).slice(0, limit);
    const results = await Promise.all(
      unread.map(async (d) => {
        const isUser = d.entity instanceof Api.User;
        const isForum = d.entity instanceof Api.Channel && Boolean(d.entity.forum);
        const base = {
          id: d.id?.toString() ?? "",
          name: d.title ?? d.name ?? "Unknown",
          type: d.isGroup ? "group" : d.isChannel ? "channel" : "private",
          unreadCount: d.unreadCount,
          ...(isUser
            ? { isBot: Boolean((d.entity as Api.User).bot), isContact: Boolean((d.entity as Api.User).contact) }
            : {}),
        };
        if (isForum) {
          try {
            const forumTopics = await this.getForumTopics(d.id?.toString() ?? "");
            const unreadTopics = forumTopics
              .filter((t) => t.unreadCount > 0)
              .map((t) => ({ id: t.id, title: t.title, unreadCount: t.unreadCount }));
            const realUnread = unreadTopics.reduce((sum, t) => sum + t.unreadCount, 0);
            if (realUnread === 0) return null;
            return {
              ...base,
              unreadCount: realUnread,
              forum: true,
              topics: unreadTopics.length > 0 ? unreadTopics : undefined,
            };
          } catch {
            return { ...base, forum: true };
          }
        }
        return base;
      }),
    );
    return results.filter((r) => r !== null);
  }

  async getContactRequests(limit = 20): Promise<
    Array<{
      id: string;
      name: string;
      username?: string;
      isBot: boolean;
      unreadCount: number;
      lastMessage?: string;
      lastMessageDate?: number;
    }>
  > {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const dialogs = await this.client.getDialogs({ limit: limit * 5 });
    return dialogs
      .filter((d) => {
        if (d.isGroup || d.isChannel) return false;
        return d.entity instanceof Api.User && !d.entity.contact;
      })
      .slice(0, limit)
      .map((d) => {
        const user = d.entity as Api.User;
        const msg = d.message;
        return {
          id: d.id?.toString() ?? "",
          name: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Unknown",
          username: user.username ?? undefined,
          isBot: Boolean(user.bot),
          unreadCount: d.unreadCount,
          lastMessage: msg?.message ?? undefined,
          lastMessageDate: msg?.date ?? undefined,
        };
      });
  }

  async addContact(userId: string, firstName: string, lastName?: string, phone?: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const entity = await this.client.getInputEntity(userId);
    await this.client.invoke(
      new Api.contacts.AddContact({
        id: entity,
        firstName,
        lastName: lastName ?? "",
        phone: phone ?? "",
      }),
    );
  }

  async blockUser(userId: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const entity = await this.client.getInputEntity(userId);
    await this.client.invoke(new Api.contacts.Block({ id: entity }));
  }

  async reportSpam(chatId: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const peer = await this.client.getInputEntity(chatId);
    await this.client.invoke(new Api.messages.ReportSpam({ peer }));
  }

  async markAsRead(chatId: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    await this.client.markAsRead(chatId);
  }

  async forwardMessage(fromChatId: string, toChatId: string, messageIds: number[]): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const resolvedFrom = await this.resolvePeer(fromChatId);
    const resolvedTo = await this.resolvePeer(toChatId);
    await this.client.forwardMessages(resolvedTo, { messages: messageIds, fromPeer: resolvedFrom });
  }

  async editMessage(chatId: string, messageId: number, newText: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const resolved = await this.resolvePeer(chatId);
    await this.client.editMessage(resolved, { message: messageId, text: newText });
  }

  async deleteMessages(chatId: string, messageIds: number[]): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const resolved = await this.resolvePeer(chatId);
    await this.client.deleteMessages(resolved, messageIds, { revoke: true });
  }

  /**
   * Resolve a chat by ID, username, or display name.
   * Falls back to searching user's dialogs if getEntity() fails.
   */
  // biome-ignore lint: GramJS has no proper entity union type
  async resolveChat(chatId: string): Promise<any> {
    if (!this.client) throw new Error(NOT_CONNECTED_ERROR);

    // First try direct resolve (numeric ID, username, phone)
    try {
      return await this.client.getEntity(chatId);
    } catch {
      // Fall through to dialog search
    }

    // Search dialogs by display name
    const dialogs = await this.client.getDialogs({ limit: 100 });
    const query = chatId.toLowerCase();

    // Exact match first
    const exact = dialogs.find((d) => d.title?.toLowerCase() === query);
    if (exact?.entity) return exact.entity;

    // Partial match
    const partial = dialogs.filter((d) => d.title?.toLowerCase().includes(query));
    if (partial.length === 1 && partial[0].entity) return partial[0].entity;
    if (partial.length > 1) {
      const matches = partial.map((d) => `  ${d.title} (${d.entity?.id?.toString() ?? "?"})`).join("\n");
      throw new Error(`Multiple chats match "${chatId}". Use the numeric ID instead:\n${matches}`);
    }

    throw new Error(
      `Cannot find chat "${chatId}". Use a numeric ID, @username, or run telegram-search-chats to find it.`,
    );
  }

  /**
   * Resolve chatId to a peer string that GramJS methods accept.
   * Handles display names by searching dialogs.
   */
  // biome-ignore lint: GramJS has no proper entity union type
  private async resolvePeer(chatId: string): Promise<any> {
    // Numeric IDs and @usernames work directly
    if (/^-?\d+$/.test(chatId) || chatId.startsWith("@")) return chatId;
    // Everything else — resolve via dialogs
    return this.resolveChat(chatId);
  }

  async getChatInfo(chatId: string): Promise<{
    id: string;
    name: string;
    type: string;
    username?: string;
    description?: string;
    membersCount?: number;
    isBot?: boolean;
    isContact?: boolean;
    forum?: boolean;
  }> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const entity = await this.resolveChat(chatId);
    if (entity instanceof Api.User) {
      const parts = [entity.firstName, entity.lastName].filter(Boolean);
      return {
        id: entity.id.toString(),
        name: parts.join(" ") || "Unknown",
        type: "private",
        username: entity.username ?? undefined,
        isBot: Boolean(entity.bot),
        isContact: Boolean(entity.contact),
      };
    }
    if (entity instanceof Api.Channel) {
      let membersCount = entity.participantsCount ?? undefined;
      let description: string | undefined;
      try {
        const full = await this.client.invoke(new Api.channels.GetFullChannel({ channel: entity }));
        if (full.fullChat instanceof Api.ChannelFull) {
          membersCount = membersCount ?? full.fullChat.participantsCount ?? undefined;
          description = full.fullChat.about || undefined;
        }
      } catch {
        // May fail for some channels — fall back to basic info
      }
      return {
        id: entity.id.toString(),
        name: entity.title,
        type: entity.megagroup ? "group" : "channel",
        username: entity.username ?? undefined,
        description,
        membersCount,
        forum: Boolean(entity.forum) || undefined,
      };
    }
    if (entity instanceof Api.Chat) {
      let membersCount = entity.participantsCount ?? undefined;
      let description: string | undefined;
      try {
        const full = await this.client.invoke(new Api.messages.GetFullChat({ chatId: entity.id }));
        if (full.fullChat instanceof Api.ChatFull) {
          if (!membersCount && full.fullChat.participants instanceof Api.ChatParticipants) {
            membersCount = full.fullChat.participants.participants.length;
          }
          description = full.fullChat.about || undefined;
        }
      } catch {
        // Fall back to basic info
      }
      return {
        id: entity.id.toString(),
        name: entity.title,
        type: "group",
        description,
        membersCount,
      };
    }
    return { id: chatId, name: "Unknown", type: "unknown" };
  }

  /** Extract media info from a message */
  private extractMediaInfo(
    media: Api.TypeMessageMedia | undefined,
  ): { type: string; fileName?: string; size?: number } | undefined {
    if (!media) return undefined;
    if (media instanceof Api.MessageMediaPhoto) {
      return { type: "photo" };
    }
    if (media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document) {
      const doc = media.document;
      let type = "document";
      let fileName: string | undefined;
      for (const attr of doc.attributes) {
        if (attr instanceof Api.DocumentAttributeVideo) type = "video";
        else if (attr instanceof Api.DocumentAttributeAudio) type = "audio";
        else if (attr instanceof Api.DocumentAttributeSticker) type = "sticker";
        else if (attr instanceof Api.DocumentAttributeFilename) fileName = attr.fileName;
      }
      return { type, fileName, size: doc.size?.toJSNumber?.() ?? Number(doc.size) };
    }
    return undefined;
  }

  /** Resolve sender ID to a display name */
  private async resolveSenderName(senderId: bigInt.BigInteger | undefined): Promise<string> {
    if (!senderId || !this.client) return "unknown";
    try {
      const entity = await this.client.getEntity(senderId);
      if (entity instanceof Api.User) {
        const parts = [entity.firstName, entity.lastName].filter(Boolean);
        const name = parts.join(" ") || "Unknown";
        return entity.username ? `${name} (@${entity.username})` : name;
      }
      if (entity instanceof Api.Channel || entity instanceof Api.Chat) {
        return entity.title ?? "Group";
      }
      return senderId.toString();
    } catch {
      return senderId.toString();
    }
  }

  async getMessages(
    chatId: string,
    limit = 10,
    offsetId?: number,
    minDate?: number,
    maxDate?: number,
  ): Promise<
    Array<{
      id: number;
      text: string;
      sender: string;
      date: string;
      media?: { type: string; fileName?: string; size?: number };
      reactions?: { emoji: string; count: number; me: boolean }[];
    }>
  > {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const resolved = await this.resolvePeer(chatId);
    const opts: Record<string, unknown> = {
      limit,
      ...(offsetId ? { offsetId } : {}),
      ...(maxDate ? { offsetDate: maxDate } : {}),
    };
    const messages = await this.client.getMessages(resolved, opts);
    let filtered = messages;
    if (minDate) {
      filtered = filtered.filter((m) => (m.date ?? 0) >= minDate);
    }
    const results = await Promise.all(
      filtered.map(async (m) => ({
        id: m.id,
        text: m.message ?? "",
        sender: await this.resolveSenderName(m.senderId),
        date: new Date((m.date ?? 0) * 1000).toISOString(),
        media: this.extractMediaInfo(m.media),
        reactions: this.extractReactions(m.reactions),
      })),
    );
    return results;
  }

  async searchChats(
    query: string,
    limit = 10,
  ): Promise<
    Array<{
      id: string;
      name: string;
      type: string;
      username?: string;
      membersCount?: number;
      description?: string;
    }>
  > {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const result = await this.client.invoke(new Api.contacts.Search({ q: query, limit }));
    const chats: Array<{
      id: string;
      name: string;
      type: string;
      username?: string;
      membersCount?: number;
      description?: string;
    }> = [];
    for (const user of result.users) {
      if (user instanceof Api.User) {
        const parts = [user.firstName, user.lastName].filter(Boolean);
        chats.push({
          id: user.id.toString(),
          name: parts.join(" ") || "Unknown",
          type: "private",
          username: user.username ?? undefined,
        });
      }
    }
    for (const chat of result.chats) {
      if (chat instanceof Api.Chat) {
        chats.push({
          id: chat.id.toString(),
          name: chat.title,
          type: "group",
          membersCount: chat.participantsCount ?? undefined,
        });
      } else if (chat instanceof Api.Channel) {
        chats.push({
          id: chat.id.toString(),
          name: chat.title,
          type: chat.megagroup ? "group" : "channel",
          username: chat.username ?? undefined,
          membersCount: chat.participantsCount ?? undefined,
        });
      }
    }

    // Enrich channels/groups with description and accurate members count
    for (const chat of chats) {
      if (chat.type === "private") continue;
      try {
        const entity = await this.client.getEntity(chat.id);
        if (entity instanceof Api.Channel) {
          const full = await this.client.invoke(new Api.channels.GetFullChannel({ channel: entity }));
          if (full.fullChat instanceof Api.ChannelFull) {
            chat.description = full.fullChat.about || undefined;
            chat.membersCount = full.fullChat.participantsCount ?? chat.membersCount;
          }
        } else if (entity instanceof Api.Chat) {
          const full = await this.client.invoke(new Api.messages.GetFullChat({ chatId: entity.id }));
          if (full.fullChat instanceof Api.ChatFull) {
            chat.description = full.fullChat.about || undefined;
          }
        }
      } catch {
        // Skip enrichment on error (private channels, etc.)
      }
    }

    return chats;
  }

  async searchGlobal(
    query: string,
    limit = 20,
    minDate?: number,
    maxDate?: number,
  ): Promise<
    Array<{
      id: number;
      text: string;
      sender: string;
      date: string;
      chat: { id: string; name: string; type: string; username?: string };
      media?: { type: string; fileName?: string; size?: number };
      reactions?: { emoji: string; count: number; me: boolean }[];
    }>
  > {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const result = await this.client.invoke(
      new Api.messages.SearchGlobal({
        q: query,
        filter: new Api.InputMessagesFilterEmpty(),
        minDate: minDate || 0,
        maxDate: maxDate || 0,
        offsetRate: 0,
        offsetPeer: new Api.InputPeerEmpty(),
        offsetId: 0,
        limit,
      }),
    );

    const chatsMap = new Map<string, { id: string; name: string; type: string; username?: string }>();
    if ("chats" in result) {
      for (const chat of result.chats) {
        if (chat instanceof Api.Channel) {
          chatsMap.set(chat.id.toString(), {
            id: chat.id.toString(),
            name: chat.title,
            type: chat.megagroup ? "group" : "channel",
            username: chat.username ?? undefined,
          });
        } else if (chat instanceof Api.Chat) {
          chatsMap.set(chat.id.toString(), {
            id: chat.id.toString(),
            name: chat.title,
            type: "group",
          });
        }
      }
    }
    if ("users" in result) {
      for (const user of result.users) {
        if (user instanceof Api.User) {
          const parts = [user.firstName, user.lastName].filter(Boolean);
          chatsMap.set(user.id.toString(), {
            id: user.id.toString(),
            name: parts.join(" ") || "Unknown",
            type: "private",
            username: user.username ?? undefined,
          });
        }
      }
    }

    const rawMessages = "messages" in result ? result.messages : [];
    const messages = rawMessages.filter((m): m is Api.Message => m instanceof Api.Message);
    const results = await Promise.all(
      messages.map(async (m) => {
        const peerId = m.peerId;
        let chatId = "";
        if (peerId instanceof Api.PeerChannel) chatId = peerId.channelId.toString();
        else if (peerId instanceof Api.PeerChat) chatId = peerId.chatId.toString();
        else if (peerId instanceof Api.PeerUser) chatId = peerId.userId.toString();

        return {
          id: m.id,
          text: m.message ?? "",
          sender: await this.resolveSenderName(m.senderId),
          date: new Date((m.date ?? 0) * 1000).toISOString(),
          chat: chatsMap.get(chatId) || { id: chatId, name: "Unknown", type: "unknown" },
          media: this.extractMediaInfo(m.media),
          reactions: this.extractReactions(m.reactions),
        };
      }),
    );
    return results;
  }

  async searchMessages(
    chatId: string,
    query: string,
    limit = 20,
    minDate?: number,
    maxDate?: number,
  ): Promise<
    Array<{
      id: number;
      text: string;
      sender: string;
      date: string;
      media?: { type: string; fileName?: string; size?: number };
      reactions?: { emoji: string; count: number; me: boolean }[];
    }>
  > {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const resolved = await this.resolvePeer(chatId);
    const messages = await this.client.getMessages(resolved, {
      search: query,
      limit,
      ...(maxDate ? { offsetDate: maxDate } : {}),
    });
    let filtered = messages;
    if (minDate) {
      filtered = filtered.filter((m) => (m.date ?? 0) >= minDate);
    }
    const results = await Promise.all(
      filtered.map(async (m) => ({
        id: m.id,
        text: m.message ?? "",
        sender: await this.resolveSenderName(m.senderId),
        date: new Date((m.date ?? 0) * 1000).toISOString(),
        media: this.extractMediaInfo(m.media),
        reactions: this.extractReactions(m.reactions),
      })),
    );
    return results;
  }

  async getContacts(limit = 50): Promise<Array<{ id: string; name: string; username?: string; phone?: string }>> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const result = await this.client.invoke(new Api.contacts.GetContacts({ hash: bigInt(0) }));
    if (!(result instanceof Api.contacts.Contacts)) return [];
    const contacts: Array<{ id: string; name: string; username?: string; phone?: string }> = [];
    for (const user of result.users) {
      if (user instanceof Api.User) {
        const parts = [user.firstName, user.lastName].filter(Boolean);
        contacts.push({
          id: user.id.toString(),
          name: parts.join(" ") || "Unknown",
          username: user.username ?? undefined,
          phone: user.phone ?? undefined,
        });
      }
    }
    return contacts.slice(0, limit);
  }

  async getChatMembers(
    chatId: string,
    limit = 50,
  ): Promise<Array<{ id: string; name: string; username?: string; role: string }>> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const entity = await this.resolveChat(chatId);

    if (entity instanceof Api.Channel) {
      const result = await this.client.invoke(
        new Api.channels.GetParticipants({
          channel: entity,
          filter: new Api.ChannelParticipantsRecent(),
          offset: 0,
          limit,
          hash: bigInt.zero,
        }),
      );
      if (!(result instanceof Api.channels.ChannelParticipants)) return [];

      const userMap = new Map<string, Api.User>();
      for (const u of result.users) {
        if (u instanceof Api.User) userMap.set(u.id.toString(), u);
      }

      return result.participants.map((p) => {
        const userId = this.getParticipantUserId(p);
        const user = userMap.get(userId);
        const parts = user ? [user.firstName, user.lastName].filter(Boolean) : [];
        return {
          id: userId,
          name: parts.join(" ") || "Unknown",
          username: user?.username ?? undefined,
          role: this.getParticipantRole(p),
        };
      });
    }

    // Basic group — use getParticipants (no role info available)
    const participants = await this.client.getParticipants(entity, { limit });
    return participants
      .filter((p): p is Api.User => p instanceof Api.User)
      .map((p) => {
        const parts = [p.firstName, p.lastName].filter(Boolean);
        return {
          id: p.id.toString(),
          name: parts.join(" ") || "Unknown",
          username: p.username ?? undefined,
          role: "member",
        };
      });
  }

  async getMyRole(chatId: string): Promise<{ role: string; chatId: string; chatName: string }> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const entity = await this.resolveChat(chatId);
    const me = await this.getMe();

    if (entity instanceof Api.Channel) {
      const result = await this.client.invoke(
        new Api.channels.GetParticipant({ channel: entity, participant: new Api.InputUserSelf() }),
      );
      return {
        role: this.getParticipantRole(result.participant),
        chatId: entity.id.toString(),
        chatName: entity.title ?? "Unknown",
      };
    }

    if (entity instanceof Api.Chat) {
      // Basic group — check if creator
      if (entity.creator) {
        return { role: "creator", chatId: entity.id.toString(), chatName: entity.title ?? "Unknown" };
      }
      if (entity.adminRights) {
        return { role: "admin", chatId: entity.id.toString(), chatName: entity.title ?? "Unknown" };
      }
      return { role: "member", chatId: entity.id.toString(), chatName: entity.title ?? "Unknown" };
    }

    if (entity instanceof Api.User) {
      return { role: "user", chatId: entity.id.toString(), chatName: me.username ?? "self" };
    }

    return { role: "unknown", chatId: chatId, chatName: "Unknown" };
  }

  private getParticipantUserId(p: Api.TypeChannelParticipant): string {
    if (p instanceof Api.ChannelParticipantCreator) return p.userId.toString();
    if (p instanceof Api.ChannelParticipantAdmin) return p.userId.toString();
    if (p instanceof Api.ChannelParticipantSelf) return p.userId.toString();
    if (p instanceof Api.ChannelParticipantBanned) return (p.peer as Api.PeerUser)?.userId?.toString() ?? "0";
    if (p instanceof Api.ChannelParticipant) return p.userId.toString();
    return "0";
  }

  private getParticipantRole(p: Api.TypeChannelParticipant): string {
    if (p instanceof Api.ChannelParticipantCreator) return "creator";
    if (p instanceof Api.ChannelParticipantAdmin) return "admin";
    if (p instanceof Api.ChannelParticipantBanned) return "banned";
    if (p instanceof Api.ChannelParticipantLeft) return "left";
    return "member";
  }

  async getProfile(userId: string): Promise<{
    id: string;
    name: string;
    username?: string;
    phone?: string;
    bio?: string;
    photo: boolean;
    lastSeen?: string;
    premium?: boolean;
    birthday?: string;
    commonChatsCount?: number;
    personalChannelId?: string;
    businessWorkHours?: string;
    businessLocation?: string;
  }> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const entity = await this.client.getEntity(userId);
    if (!(entity instanceof Api.User)) throw new Error("Entity is not a user");

    const inputEntity = await this.client.getInputEntity(userId);
    const fullResult = await this.client.invoke(
      new Api.users.GetFullUser({ id: inputEntity as unknown as Api.TypeInputUser }),
    );
    const full = fullResult.fullUser;
    const bio = full.about ?? undefined;

    const parts = [entity.firstName, entity.lastName].filter(Boolean);
    let lastSeen: string | undefined;
    if (entity.status instanceof Api.UserStatusOnline) {
      lastSeen = "online";
    } else if (entity.status instanceof Api.UserStatusOffline) {
      lastSeen = new Date(entity.status.wasOnline * 1000).toISOString();
    } else if (entity.status instanceof Api.UserStatusRecently) {
      lastSeen = "recently";
    } else if (entity.status instanceof Api.UserStatusLastWeek) {
      lastSeen = "last week";
    } else if (entity.status instanceof Api.UserStatusLastMonth) {
      lastSeen = "last month";
    }

    let birthday: string | undefined;
    if (full.birthday) {
      const b = full.birthday as { day: number; month: number; year?: number };
      birthday = b.year
        ? `${b.year}-${String(b.month).padStart(2, "0")}-${String(b.day).padStart(2, "0")}`
        : `${String(b.month).padStart(2, "0")}-${String(b.day).padStart(2, "0")}`;
    }

    let businessWorkHours: string | undefined;
    if (full.businessWorkHours) {
      const wh = full.businessWorkHours as { timezoneId?: string };
      businessWorkHours = wh.timezoneId ?? "configured";
    }

    let businessLocation: string | undefined;
    if (full.businessLocation) {
      const loc = full.businessLocation as { address?: string };
      businessLocation = loc.address ?? "configured";
    }

    return {
      id: entity.id.toString(),
      name: parts.join(" ") || "Unknown",
      username: entity.username ?? undefined,
      phone: entity.phone ?? undefined,
      bio,
      photo: !!entity.photo,
      lastSeen,
      premium: entity.premium || undefined,
      birthday,
      commonChatsCount: full.commonChatsCount || undefined,
      personalChannelId: full.personalChannelId ? full.personalChannelId.toString() : undefined,
      businessWorkHours,
      businessLocation,
    };
  }

  async downloadProfilePhoto(
    entityId: string,
    options?: { isBig?: boolean; savePath?: string },
  ): Promise<{ buffer: Buffer; mimeType: string } | { filePath: string } | null> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const entity = await this.client.getEntity(entityId);

    const buffer = (await this.client.downloadProfilePhoto(entity, {
      isBig: options?.isBig !== false,
    })) as Buffer | undefined;

    if (!buffer || buffer.length === 0) return null;

    const mimeType = this.detectMimeFromBuffer(buffer);

    if (options?.savePath) {
      await writeFile(options.savePath, buffer);
      return { filePath: options.savePath };
    }

    return { buffer, mimeType };
  }

  /** Detect MIME type from buffer magic bytes */
  private detectMimeFromBuffer(buffer: Buffer): string {
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return "image/gif";
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return "image/webp";
    return "image/jpeg"; // Telegram profile photos are almost always JPEG
  }

  /** Extract reactions from a message into a simple format */
  private extractReactions(
    reactions?: Api.MessageReactions,
  ): { emoji: string; count: number; me: boolean }[] | undefined {
    if (!reactions?.results?.length) return undefined;
    const items: { emoji: string; count: number; me: boolean }[] = [];
    for (const r of reactions.results) {
      let emoji: string;
      if (r.reaction instanceof Api.ReactionEmoji) {
        emoji = r.reaction.emoticon;
      } else if (r.reaction instanceof Api.ReactionCustomEmoji) {
        emoji = `custom:${r.reaction.documentId}`;
      } else if (r.reaction instanceof Api.ReactionPaid) {
        emoji = "⭐";
      } else {
        continue;
      }
      items.push({ emoji, count: r.count, me: r.chosenOrder != null });
    }
    return items.length > 0 ? items : undefined;
  }

  async sendReaction(
    chatId: string,
    messageId: number,
    emoji?: string | string[],
    addToExisting = false,
  ): Promise<{ emoji: string; count: number; me: boolean }[] | undefined> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const resolved = await this.resolvePeer(chatId);
    const peer = await this.client.getInputEntity(resolved);

    const reactionList: Api.TypeReaction[] = [];
    if (emoji) {
      const emojis = Array.isArray(emoji) ? emoji : [emoji];

      if (addToExisting) {
        // Fetch current reactions to preserve them
        const msgs = await this.client.getMessages(resolved, { ids: [messageId] });
        const msg = msgs[0];
        if (msg?.reactions?.results) {
          for (const r of msg.reactions.results) {
            if (r.chosenOrder != null) {
              reactionList.push(r.reaction);
            }
          }
        }
      }

      for (const e of emojis) {
        reactionList.push(new Api.ReactionEmoji({ emoticon: e }));
      }
    }
    // empty array = remove all reactions

    const result = await this.client.invoke(
      new Api.messages.SendReaction({
        peer,
        msgId: messageId,
        reaction: reactionList,
      }),
    );

    // Extract updated reactions from the response
    if ("updates" in result) {
      for (const upd of result.updates) {
        if (upd instanceof Api.UpdateMessageReactions) {
          return this.extractReactions(upd.reactions);
        }
      }
    }

    return undefined;
  }

  async getMessageReactions(
    chatId: string,
    messageId: number,
  ): Promise<{
    reactions: {
      emoji: string;
      count: number;
      users: { id: string; name: string }[];
    }[];
    total: number;
  }> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const resolved = await this.resolvePeer(chatId);
    const peer = await this.client.getInputEntity(resolved);

    // First get the message to know which reactions exist
    const msgs = await this.client.getMessages(resolved, { ids: [messageId] });
    const msg = msgs[0];
    if (!msg?.reactions?.results?.length) {
      return { reactions: [], total: 0 };
    }

    const reactionsOut: {
      emoji: string;
      count: number;
      users: { id: string; name: string }[];
    }[] = [];

    for (const rc of msg.reactions.results) {
      let emoji: string;
      if (rc.reaction instanceof Api.ReactionEmoji) {
        emoji = rc.reaction.emoticon;
      } else if (rc.reaction instanceof Api.ReactionCustomEmoji) {
        emoji = `custom:${rc.reaction.documentId}`;
      } else if (rc.reaction instanceof Api.ReactionPaid) {
        emoji = "⭐";
      } else {
        continue;
      }

      const users: { id: string; name: string }[] = [];

      // Try to get the list of users who reacted (may fail if canSeeList is false)
      if (msg.reactions.canSeeList) {
        try {
          const list = await this.client.invoke(
            new Api.messages.GetMessageReactionsList({
              peer,
              id: messageId,
              reaction: rc.reaction,
              limit: 50,
            }),
          );
          if (list instanceof Api.messages.MessageReactionsList) {
            for (const r of list.reactions) {
              const userId = r.peerId instanceof Api.PeerUser ? r.peerId.userId.toString() : "";
              if (userId) {
                const name = await this.resolveSenderName(bigInt(Number.parseInt(userId, 10)));
                users.push({ id: userId, name });
              }
            }
          }
        } catch {
          // canSeeList may be false or request may fail for channels
        }
      }

      reactionsOut.push({ emoji, count: rc.count, users });
    }

    const total = reactionsOut.reduce((sum, r) => sum + r.count, 0);
    return { reactions: reactionsOut, total };
  }

  async sendScheduledMessage(
    chatId: string,
    text: string,
    scheduleDate: number,
    replyTo?: number,
    parseMode?: "md" | "html",
  ): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const resolved = await this.resolvePeer(chatId);
    await this.client.sendMessage(resolved, {
      message: text,
      schedule: scheduleDate,
      ...(replyTo ? { replyTo } : {}),
      ...(parseMode ? { parseMode: parseMode === "html" ? "html" : "md" } : {}),
    });
  }

  async createPoll(
    chatId: string,
    question: string,
    answers: string[],
    options?: { multipleChoice?: boolean; quiz?: boolean; correctAnswer?: number },
  ): Promise<number> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const peer = await this.client.getInputEntity(chatId);
    const pollAnswers = answers.map(
      (text, i) =>
        new Api.PollAnswer({
          text: new Api.TextWithEntities({ text, entities: [] }),
          option: Buffer.from([i]),
        }),
    );
    const poll = new Api.Poll({
      id: bigInt(Date.now()),
      question: new Api.TextWithEntities({ text: question, entities: [] }),
      answers: pollAnswers,
      multipleChoice: options?.multipleChoice ?? false,
      quiz: options?.quiz ?? false,
    });
    const result = await this.client.invoke(
      new Api.messages.SendMedia({
        peer,
        media: new Api.InputMediaPoll({
          poll,
          ...(options?.quiz && options.correctAnswer != null
            ? { correctAnswers: [Buffer.from([options.correctAnswer])] }
            : {}),
        }),
        message: "",
        randomId: bigInt(Math.floor(Math.random() * 1e15)),
      }),
    );
    // Extract message ID from result
    if (result instanceof Api.Updates || result instanceof Api.UpdatesCombined) {
      for (const update of result.updates) {
        if (update instanceof Api.UpdateMessageID) {
          return update.id;
        }
      }
    }
    return 0;
  }

  async getForumTopics(
    chatId: string,
    limit = 100,
  ): Promise<
    Array<{
      id: number;
      title: string;
      unreadCount: number;
      unreadMentions: number;
      iconColor: number;
      closed: boolean;
      pinned: boolean;
    }>
  > {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const entity = await this.resolveChat(chatId);
    if (!(entity instanceof Api.Channel)) throw new Error("Forum topics are only available in supergroups");
    const result = await this.client.invoke(
      new Api.channels.GetForumTopics({
        channel: entity,
        limit,
        offsetTopic: 0,
        offsetDate: 0,
        offsetId: 0,
      }),
    );
    const topics: Array<{
      id: number;
      title: string;
      unreadCount: number;
      unreadMentions: number;
      iconColor: number;
      closed: boolean;
      pinned: boolean;
    }> = [];
    for (const topic of result.topics) {
      if (topic instanceof Api.ForumTopic) {
        topics.push({
          id: topic.id,
          title: topic.title,
          unreadCount: topic.unreadCount,
          unreadMentions: topic.unreadMentionsCount,
          iconColor: topic.iconColor,
          closed: Boolean(topic.closed),
          pinned: Boolean(topic.pinned),
        });
      }
    }
    return topics;
  }

  async getTopicMessages(
    chatId: string,
    topicId: number,
    limit = 20,
    offsetId?: number,
  ): Promise<
    Array<{
      id: number;
      text: string;
      sender: string;
      date: string;
      media?: { type: string; fileName?: string; size?: number };
      reactions?: { emoji: string; count: number; me: boolean }[];
    }>
  > {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const peer = await this.client.getInputEntity(chatId);
    const result = await this.client.invoke(
      new Api.messages.GetReplies({
        peer,
        msgId: topicId,
        limit,
        ...(offsetId ? { offsetId } : {}),
        offsetDate: 0,
        addOffset: 0,
        maxId: 0,
        minId: 0,
        hash: bigInt(0),
      }),
    );
    const messages = "messages" in result ? result.messages : [];
    const results = await Promise.all(
      messages
        .filter((m): m is Api.Message => m instanceof Api.Message)
        .map(async (m) => ({
          id: m.id,
          text: m.message ?? "",
          sender: await this.resolveSenderName(m.senderId),
          date: new Date((m.date ?? 0) * 1000).toISOString(),
          media: this.extractMediaInfo(m.media),
          reactions: this.extractReactions(m.reactions),
        })),
    );
    return results;
  }

  /** Check if a chat entity is a forum (has topics enabled) */
  async isForum(chatId: string): Promise<boolean> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    try {
      const entity = await this.resolveChat(chatId);
      if (entity instanceof Api.Channel) {
        return Boolean(entity.forum);
      }
    } catch {}
    return false;
  }

  async joinChat(target: string): Promise<{ id: string; title: string; type: string }> {
    if (!this.client) throw new Error(NOT_CONNECTED_ERROR);

    // Extract invite hash from various link formats
    const inviteMatch = target.match(/(?:t\.me\/\+|t\.me\/joinchat\/|tg:\/\/join\?invite=)([a-zA-Z0-9_-]+)/);

    if (inviteMatch) {
      const result = await this.client.invoke(new Api.messages.ImportChatInvite({ hash: inviteMatch[1] }));
      const chat = (result as Api.Updates).chats?.[0];
      if (!chat) throw new Error("Failed to join via invite link");
      return {
        id: chat.id.toString(),
        title: (chat as Api.Channel | Api.Chat).title ?? "Unknown",
        type: chat.className === "Channel" ? "channel" : "group",
      };
    }

    // Public channel/group by username
    const username = target.replace(/^@/, "").replace(/^https?:\/\/t\.me\//, "");
    const entity = await this.client.getEntity(username);

    if (entity instanceof Api.Channel || entity instanceof Api.Chat) {
      await this.client.invoke(
        new Api.channels.JoinChannel({
          channel: entity as Api.Channel,
        }),
      );
      return {
        id: entity.id.toString(),
        title: entity.title ?? "Unknown",
        type: entity.className === "Channel" ? "channel" : "group",
      };
    }

    throw new Error("Target is not a group or channel. Use username, @username, or invite link.");
  }

  async createGroup(options: {
    title: string;
    users: string[];
    supergroup?: boolean;
    forum?: boolean;
    description?: string;
  }): Promise<{ id: string; title: string; type: string; inviteLink?: string }> {
    if (!this.client) throw new Error(NOT_CONNECTED_ERROR);

    const { title, users, supergroup = false, forum = false, description } = options;

    if (supergroup || forum) {
      // Create supergroup/channel via channels.CreateChannel
      const result = await this.client.invoke(
        new Api.channels.CreateChannel({
          title,
          about: description ?? "",
          megagroup: true,
          forum: forum || undefined,
        }),
      );

      const chat = (result as Api.Updates).chats?.[0];
      if (!chat) throw new Error("Failed to create supergroup");

      const channelId = chat.id.toString();

      // Invite users
      if (users.length > 0) {
        const inputUsers: Api.TypeInputUser[] = [];
        for (const u of users) {
          try {
            const entity = await this.client.getEntity(u);
            if (entity instanceof Api.User) {
              inputUsers.push(new Api.InputUser({ userId: entity.id, accessHash: entity.accessHash ?? bigInt.zero }));
            }
          } catch {
            // Skip unresolvable users
          }
        }
        if (inputUsers.length > 0) {
          await this.client.invoke(
            new Api.channels.InviteToChannel({
              channel: chat as Api.Channel,
              users: inputUsers,
            }),
          );
        }
      }

      // Get invite link
      let inviteLink: string | undefined;
      try {
        const exported = await this.client.invoke(new Api.messages.ExportChatInvite({ peer: chat as Api.Channel }));
        if (exported instanceof Api.ChatInviteExported) {
          inviteLink = exported.link;
        }
      } catch {}

      return { id: channelId, title, type: forum ? "forum" : "supergroup", inviteLink };
    }

    // Create basic group via messages.CreateChat
    const inputUsers: Api.TypeInputUser[] = [];
    for (const u of users) {
      try {
        const entity = await this.client.getEntity(u);
        if (entity instanceof Api.User) {
          inputUsers.push(new Api.InputUser({ userId: entity.id, accessHash: entity.accessHash ?? bigInt.zero }));
        }
      } catch {
        // Skip unresolvable users
      }
    }

    if (inputUsers.length === 0) {
      throw new Error("At least one valid user is required to create a basic group");
    }

    const result = await this.client.invoke(
      new Api.messages.CreateChat({
        title,
        users: inputUsers,
      }),
    );

    const updates = result as unknown as Api.Updates;
    const chat = updates.chats?.[0];
    if (!chat) throw new Error("Failed to create group");

    return { id: chat.id.toString(), title, type: "group" };
  }

  async inviteToGroup(chatId: string, users: string[]): Promise<{ invited: string[]; failed: string[] }> {
    if (!this.client) throw new Error(NOT_CONNECTED_ERROR);

    const entity = await this.resolveChat(chatId);
    const invited: string[] = [];
    const failed: string[] = [];

    for (const u of users) {
      try {
        const user = await this.client.getEntity(u);
        if (!(user instanceof Api.User)) {
          failed.push(u);
          continue;
        }
        const inputUser = new Api.InputUser({ userId: user.id, accessHash: user.accessHash ?? bigInt.zero });

        if (entity instanceof Api.Channel) {
          await this.client.invoke(new Api.channels.InviteToChannel({ channel: entity, users: [inputUser] }));
        } else if (entity instanceof Api.Chat) {
          await this.client.invoke(
            new Api.messages.AddChatUser({ chatId: entity.id, userId: inputUser, fwdLimit: 50 }),
          );
        }
        invited.push(u);
      } catch {
        failed.push(u);
      }
    }

    return { invited, failed };
  }

  async kickUser(chatId: string, userId: string): Promise<void> {
    if (!this.client) throw new Error(NOT_CONNECTED_ERROR);

    const entity = await this.resolveChat(chatId);
    const user = await this.client.getEntity(userId);
    if (!(user instanceof Api.User)) throw new Error("Target is not a user");
    const inputUser = new Api.InputUser({ userId: user.id, accessHash: user.accessHash ?? bigInt.zero });

    if (entity instanceof Api.Channel) {
      // Kick = ban + unban (removes without permanent ban)
      await this.client.invoke(
        new Api.channels.EditBanned({
          channel: entity,
          participant: inputUser,
          bannedRights: new Api.ChatBannedRights({ untilDate: 0, viewMessages: true }),
        }),
      );
      await this.client.invoke(
        new Api.channels.EditBanned({
          channel: entity,
          participant: inputUser,
          bannedRights: new Api.ChatBannedRights({ untilDate: 0 }),
        }),
      );
    } else if (entity instanceof Api.Chat) {
      await this.client.invoke(new Api.messages.DeleteChatUser({ chatId: entity.id, userId: inputUser }));
    }
  }

  async banUser(chatId: string, userId: string): Promise<void> {
    if (!this.client) throw new Error(NOT_CONNECTED_ERROR);

    const entity = await this.resolveChat(chatId);
    const user = await this.client.getEntity(userId);
    if (!(user instanceof Api.User)) throw new Error("Target is not a user");
    if (!(entity instanceof Api.Channel)) throw new Error("Ban is only supported for supergroups and channels");

    const inputUser = new Api.InputUser({ userId: user.id, accessHash: user.accessHash ?? bigInt.zero });
    await this.client.invoke(
      new Api.channels.EditBanned({
        channel: entity,
        participant: inputUser,
        bannedRights: new Api.ChatBannedRights({ untilDate: 0, viewMessages: true }),
      }),
    );
  }

  async unbanUser(chatId: string, userId: string): Promise<void> {
    if (!this.client) throw new Error(NOT_CONNECTED_ERROR);

    const entity = await this.resolveChat(chatId);
    const user = await this.client.getEntity(userId);
    if (!(user instanceof Api.User)) throw new Error("Target is not a user");
    if (!(entity instanceof Api.Channel)) throw new Error("Unban is only supported for supergroups and channels");

    const inputUser = new Api.InputUser({ userId: user.id, accessHash: user.accessHash ?? bigInt.zero });
    await this.client.invoke(
      new Api.channels.EditBanned({
        channel: entity,
        participant: inputUser,
        bannedRights: new Api.ChatBannedRights({ untilDate: 0 }),
      }),
    );
  }

  async editGroup(
    chatId: string,
    options: { title?: string; description?: string; photoPath?: string },
  ): Promise<void> {
    if (!this.client) throw new Error(NOT_CONNECTED_ERROR);

    const entity = await this.resolveChat(chatId);

    if (options.title) {
      if (entity instanceof Api.Channel) {
        await this.client.invoke(new Api.channels.EditTitle({ channel: entity, title: options.title }));
      } else if (entity instanceof Api.Chat) {
        await this.client.invoke(new Api.messages.EditChatTitle({ chatId: entity.id, title: options.title }));
      }
    }

    if (options.description != null) {
      await this.client.invoke(new Api.messages.EditChatAbout({ peer: entity, about: options.description }));
    }

    if (options.photoPath) {
      const fileData = readFileSync(options.photoPath);
      const uploaded = await this.client.uploadFile({
        file: new CustomFile(options.photoPath, fileData.length, options.photoPath, fileData),
        workers: 1,
      });
      const inputPhoto = new Api.InputChatUploadedPhoto({ file: uploaded });

      if (entity instanceof Api.Channel) {
        await this.client.invoke(new Api.channels.EditPhoto({ channel: entity, photo: inputPhoto }));
      } else if (entity instanceof Api.Chat) {
        await this.client.invoke(new Api.messages.EditChatPhoto({ chatId: entity.id, photo: inputPhoto }));
      }
    }
  }

  async leaveGroup(chatId: string): Promise<void> {
    if (!this.client) throw new Error(NOT_CONNECTED_ERROR);

    const entity = await this.resolveChat(chatId);

    if (entity instanceof Api.Channel) {
      await this.client.invoke(new Api.channels.LeaveChannel({ channel: entity }));
    } else if (entity instanceof Api.Chat) {
      await this.client.invoke(
        new Api.messages.DeleteChatUser({
          chatId: entity.id,
          userId: new Api.InputUserSelf(),
        }),
      );
    } else {
      throw new Error("Target is not a group or channel");
    }
  }

  async setAdmin(chatId: string, userId: string, options?: { title?: string }): Promise<void> {
    if (!this.client) throw new Error(NOT_CONNECTED_ERROR);

    const entity = await this.resolveChat(chatId);
    if (!(entity instanceof Api.Channel)) throw new Error("Set admin is only supported for supergroups and channels");

    const user = await this.client.getEntity(userId);
    if (!(user instanceof Api.User)) throw new Error("Target is not a user");

    const inputUser = new Api.InputUser({ userId: user.id, accessHash: user.accessHash ?? bigInt.zero });
    await this.client.invoke(
      new Api.channels.EditAdmin({
        channel: entity,
        userId: inputUser,
        adminRights: new Api.ChatAdminRights({
          changeInfo: true,
          postMessages: true,
          editMessages: true,
          deleteMessages: true,
          banUsers: true,
          inviteUsers: true,
          pinMessages: true,
          manageCall: true,
        }),
        rank: options?.title ?? "",
      }),
    );
  }

  async removeAdmin(chatId: string, userId: string): Promise<void> {
    if (!this.client) throw new Error(NOT_CONNECTED_ERROR);

    const entity = await this.resolveChat(chatId);
    if (!(entity instanceof Api.Channel))
      throw new Error("Remove admin is only supported for supergroups and channels");

    const user = await this.client.getEntity(userId);
    if (!(user instanceof Api.User)) throw new Error("Target is not a user");

    const inputUser = new Api.InputUser({ userId: user.id, accessHash: user.accessHash ?? bigInt.zero });
    await this.client.invoke(
      new Api.channels.EditAdmin({
        channel: entity,
        userId: inputUser,
        adminRights: new Api.ChatAdminRights({}),
        rank: "",
      }),
    );
  }
}
