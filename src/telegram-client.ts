import { existsSync, mkdirSync } from "node:fs";
import { chmod, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import bigInt from "big-integer";
import QRCode from "qrcode";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { Api } from "telegram/tl/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEGACY_SESSION_FILE = join(__dirname, "..", ".telegram-session");
const DEFAULT_SESSION_DIR = join(homedir(), ".mcp-telegram");
const DEFAULT_SESSION_FILE = join(DEFAULT_SESSION_DIR, "session");

const SESSION_STRING_RE = /^[A-Za-z0-9+/=]+$/;
const MIN_SESSION_LENGTH = 100;

function resolveSessionPath(sessionPath?: string): string {
  return sessionPath ?? process.env.TELEGRAM_SESSION_PATH ?? DEFAULT_SESSION_FILE;
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
        try { await chmod(this.sessionPath, 0o600); } catch {}
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
        try { await unlink(LEGACY_SESSION_FILE); } catch {}
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
    this.client = new TelegramClient(session, this.apiId, this.apiHash, {
      connectionRetries: 5,
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
        this.lastError = "Session revoked. Re-login required.";
      }
      // Network error — keep session, just report
      else if (
        msg.includes("TIMEOUT") ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("ENETUNREACH") ||
        msg.includes("ENOTFOUND") ||
        msg.includes("network")
      ) {
        this.lastError = `Network error: ${msg}. Session preserved, will retry on next call.`;
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
    const client = new TelegramClient(session, this.apiId, this.apiHash, {
      connectionRetries: 5,
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
    if (!this.client || !this.connected) throw new Error("Not connected");
    const me = await this.client.getMe();
    const user = me as Api.User;
    return {
      id: user.id.toString(),
      username: user.username ?? undefined,
      firstName: user.firstName ?? undefined,
    };
  }

  async sendMessage(chatId: string, text: string, replyTo?: number, parseMode?: "md" | "html"): Promise<void> {
    if (!this.client || !this.connected) throw new Error("Not connected");
    await this.client.sendMessage(chatId, {
      message: text,
      ...(replyTo ? { replyTo } : {}),
      ...(parseMode ? { parseMode: parseMode === "html" ? "html" : "md" } : {}),
    });
  }

  async sendFile(chatId: string, filePath: string, caption?: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error("Not connected");
    await this.client.sendFile(chatId, { file: filePath, caption });
  }

  async downloadMedia(chatId: string, messageId: number, downloadPath: string): Promise<string> {
    if (!this.client || !this.connected) throw new Error("Not connected");
    const messages = await this.client.getMessages(chatId, { ids: [messageId] });
    const message = messages[0];
    if (!message) throw new Error(`Message ${messageId} not found`);
    if (!message.media) throw new Error(`Message ${messageId} has no media`);
    const buffer = await this.client.downloadMedia(message);
    if (!buffer) throw new Error("Failed to download media");
    await writeFile(downloadPath, buffer as Buffer);
    return downloadPath;
  }

  async downloadMediaAsBuffer(chatId: string, messageId: number): Promise<{ buffer: Buffer; mimeType: string }> {
    if (!this.client || !this.connected) throw new Error("Not connected");
    const messages = await this.client.getMessages(chatId, { ids: [messageId] });
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
    if (!this.client || !this.connected) throw new Error("Not connected");
    await this.client.pinMessage(chatId, messageId, { notify: !silent });
  }

  async unpinMessage(chatId: string, messageId: number): Promise<void> {
    if (!this.client || !this.connected) throw new Error("Not connected");
    await this.client.unpinMessage(chatId, messageId);
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
    if (!this.client || !this.connected) throw new Error("Not connected");
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
    }>
  > {
    if (!this.client || !this.connected) throw new Error("Not connected");
    const dialogs = await this.client.getDialogs({ limit: limit * 3 });
    return dialogs
      .filter((d) => d.unreadCount > 0)
      .slice(0, limit)
      .map((d) => {
        const isUser = d.entity instanceof Api.User;
        return {
          id: d.id?.toString() ?? "",
          name: d.title ?? d.name ?? "Unknown",
          type: d.isGroup ? "group" : d.isChannel ? "channel" : "private",
          unreadCount: d.unreadCount,
          ...(isUser
            ? { isBot: Boolean((d.entity as Api.User).bot), isContact: Boolean((d.entity as Api.User).contact) }
            : {}),
        };
      });
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
    if (!this.client || !this.connected) throw new Error("Not connected");
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
    if (!this.client || !this.connected) throw new Error("Not connected");
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
    if (!this.client || !this.connected) throw new Error("Not connected");
    const entity = await this.client.getInputEntity(userId);
    await this.client.invoke(new Api.contacts.Block({ id: entity }));
  }

  async reportSpam(chatId: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error("Not connected");
    const peer = await this.client.getInputEntity(chatId);
    await this.client.invoke(new Api.messages.ReportSpam({ peer }));
  }

  async markAsRead(chatId: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error("Not connected");
    await this.client.markAsRead(chatId);
  }

  async forwardMessage(fromChatId: string, toChatId: string, messageIds: number[]): Promise<void> {
    if (!this.client || !this.connected) throw new Error("Not connected");
    await this.client.forwardMessages(toChatId, { messages: messageIds, fromPeer: fromChatId });
  }

  async editMessage(chatId: string, messageId: number, newText: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error("Not connected");
    await this.client.editMessage(chatId, { message: messageId, text: newText });
  }

  async deleteMessages(chatId: string, messageIds: number[]): Promise<void> {
    if (!this.client || !this.connected) throw new Error("Not connected");
    await this.client.deleteMessages(chatId, messageIds, { revoke: true });
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
  }> {
    if (!this.client || !this.connected) throw new Error("Not connected");
    const entity = await this.client.getEntity(chatId);
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
    }>
  > {
    if (!this.client || !this.connected) throw new Error("Not connected");
    const opts: Record<string, unknown> = {
      limit,
      ...(offsetId ? { offsetId } : {}),
      ...(maxDate ? { offsetDate: maxDate } : {}),
    };
    const messages = await this.client.getMessages(chatId, opts);
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
    }>
  > {
    if (!this.client || !this.connected) throw new Error("Not connected");
    const result = await this.client.invoke(new Api.contacts.Search({ q: query, limit }));
    const chats: Array<{ id: string; name: string; type: string; username?: string }> = [];
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
        chats.push({ id: chat.id.toString(), name: chat.title, type: "group" });
      } else if (chat instanceof Api.Channel) {
        chats.push({
          id: chat.id.toString(),
          name: chat.title,
          type: chat.megagroup ? "group" : "channel",
          username: chat.username ?? undefined,
        });
      }
    }
    return chats;
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
    }>
  > {
    if (!this.client || !this.connected) throw new Error("Not connected");
    const messages = await this.client.getMessages(chatId, {
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
      })),
    );
    return results;
  }

  async getContacts(limit = 50): Promise<Array<{ id: string; name: string; username?: string; phone?: string }>> {
    if (!this.client || !this.connected) throw new Error("Not connected");
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

  async getChatMembers(chatId: string, limit = 50): Promise<Array<{ id: string; name: string; username?: string }>> {
    if (!this.client || !this.connected) throw new Error("Not connected");
    const participants = await this.client.getParticipants(chatId, { limit });
    const members: Array<{ id: string; name: string; username?: string }> = [];
    for (const p of participants) {
      if (p instanceof Api.User) {
        const parts = [p.firstName, p.lastName].filter(Boolean);
        members.push({
          id: p.id.toString(),
          name: parts.join(" ") || "Unknown",
          username: p.username ?? undefined,
        });
      }
    }
    return members;
  }

  async getProfile(userId: string): Promise<{
    id: string;
    name: string;
    username?: string;
    phone?: string;
    bio?: string;
    photo: boolean;
    lastSeen?: string;
  }> {
    if (!this.client || !this.connected) throw new Error("Not connected");
    const entity = await this.client.getEntity(userId);
    if (!(entity instanceof Api.User)) throw new Error("Entity is not a user");

    const inputEntity = await this.client.getInputEntity(userId);
    const fullResult = await this.client.invoke(
      new Api.users.GetFullUser({ id: inputEntity as unknown as Api.TypeInputUser }),
    );
    const bio = fullResult.fullUser.about ?? undefined;

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

    return {
      id: entity.id.toString(),
      name: parts.join(" ") || "Unknown",
      username: entity.username ?? undefined,
      phone: entity.phone ?? undefined,
      bio,
      photo: !!entity.photo,
      lastSeen,
    };
  }

  async sendReaction(chatId: string, messageId: number, emoji?: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error("Not connected");
    const peer = await this.client.getInputEntity(chatId);
    const reaction = emoji ? [new Api.ReactionEmoji({ emoticon: emoji })] : []; // empty = remove reaction
    await this.client.invoke(
      new Api.messages.SendReaction({
        peer,
        msgId: messageId,
        reaction,
      }),
    );
  }

  async sendScheduledMessage(
    chatId: string,
    text: string,
    scheduleDate: number,
    replyTo?: number,
    parseMode?: "md" | "html",
  ): Promise<void> {
    if (!this.client || !this.connected) throw new Error("Not connected");
    await this.client.sendMessage(chatId, {
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
    if (!this.client || !this.connected) throw new Error("Not connected");
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

  async joinChat(target: string): Promise<{ id: string; title: string; type: string }> {
    if (!this.client) throw new Error("Not connected");

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
}
