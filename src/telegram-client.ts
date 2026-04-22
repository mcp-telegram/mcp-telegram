import { existsSync, mkdirSync } from "node:fs";
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
import { RateLimiter } from "./rate-limiter.js";
import type {
  AllStoriesSummary,
  BoostsListSummary,
  BoostsStatusSummary,
  BroadcastStatsSummary,
  BusinessChatLinksSummary,
  ChannelDifferenceSummary,
  ChatPermissions,
  GroupCallParticipantsSummary,
  GroupCallSummary,
  MegagroupStatsSummary,
  MessageButtonDescriptor,
  MyBoostsSummary,
  PeerStoriesSummary,
  QuickRepliesSummary,
  QuickReplyMessagesSummary,
  StarsStatusSummary,
  StoriesByIdSummary,
  StoryViewsListSummary,
  UpdatesDifferenceSummary,
} from "./telegram-helpers.js";
import {
  describeAdminLogAction,
  describeAdminLogDetails,
  describeKeyboardButton,
  mergeBannedRights,
  reactionToEmoji,
  summarizeAllStories,
  summarizeBoostsList,
  summarizeBoostsStatus,
  summarizeBroadcastStats,
  summarizeBusinessChatLinks,
  summarizeChannelDifference,
  summarizeGroupCall,
  summarizeGroupCallParticipants,
  summarizeMegagroupStats,
  summarizeMyBoosts,
  summarizePeerStories,
  summarizeQuickReplies,
  summarizeQuickReplyMessages,
  summarizeStarsStatus,
  summarizeStoriesById,
  summarizeStoryViewsList,
  summarizeUpdatesDifference,
} from "./telegram-helpers.js";

export type {
  AllStoriesSummary,
  BoostSummary,
  BoostsListSummary,
  BoostsStatusSummary,
  BroadcastStatsSummary,
  BusinessChatLinkSummary,
  BusinessChatLinksSummary,
  ChannelDifferenceSummary,
  ChatPermissions,
  CompactPeer,
  CompactStatsGraph,
  GroupCallInfoSummary,
  GroupCallParticipantSummary,
  GroupCallParticipantsSummary,
  GroupCallSummary,
  MegagroupStatsSummary,
  MessageButtonDescriptor,
  MyBoostSummary,
  MyBoostsSummary,
  PeerStoriesSummary,
  PrepaidGiveawaySummary,
  QuickRepliesSummary,
  QuickReplyMessageSummary,
  QuickReplyMessagesSummary,
  QuickReplySummary,
  StarsAmountSummary,
  StarsStatusSummary,
  StarsSubscriptionPricingSummary,
  StarsSubscriptionSummary,
  StarsTransactionPeerSummary,
  StarsTransactionSummary,
  StatsValue,
  StoriesByIdSummary,
  StoryItemSummary,
  StoryViewSummary,
  StoryViewsListSummary,
  UpdatesDifferenceSummary,
  UpdatesMessageSummary,
} from "./telegram-helpers.js";
export {
  describeAdminLogAction,
  describeAdminLogDetails,
  describeKeyboardButton,
  mergeBannedRights,
  peerToCompact,
  reactionToEmoji,
  summarizeAllStories,
  summarizeBoost,
  summarizeBoostsList,
  summarizeBoostsStatus,
  summarizeBroadcastStats,
  summarizeBusinessChatLink,
  summarizeBusinessChatLinks,
  summarizeChannelDifference,
  summarizeGroupCall,
  summarizeGroupCallInfo,
  summarizeGroupCallParticipant,
  summarizeGroupCallParticipants,
  summarizeMegagroupStats,
  summarizeMyBoost,
  summarizeMyBoosts,
  summarizePeerStories,
  summarizePrepaidGiveaway,
  summarizeQuickReplies,
  summarizeQuickReply,
  summarizeQuickReplyMessage,
  summarizeQuickReplyMessages,
  summarizeStarsAmount,
  summarizeStarsStatus,
  summarizeStarsSubscription,
  summarizeStarsTransaction,
  summarizeStarsTransactionPeer,
  summarizeStoriesById,
  summarizeStoryItem,
  summarizeStoryView,
  summarizeStoryViewsList,
  summarizeUpdatesDifference,
} from "./telegram-helpers.js";

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

export type ChatEntity = Api.User | Api.Chat | Api.Channel | Api.TypeUser | Api.TypeChat;

export class TelegramService {
  private client: TelegramClient | null = null;
  private apiId: number;
  private apiHash: string;
  private sessionString = "";
  private connected = false;
  private sessionPath: string;
  private rateLimiter = new RateLimiter();
  private lastTypingAt = new Map<string, number>();
  private entityCache = new Map<string, ChatEntity>();
  lastError = "";

  get sessionDir(): string {
    return dirname(this.sessionPath);
  }

  hasLocalSession(): boolean {
    return existsSync(this.sessionPath);
  }

  // ─── Session & Auth ────────────────────────────────────────────────────────

  getClient(): TelegramClient | null {
    return this.client;
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
    this.entityCache.clear();
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
      this.entityCache.clear();
    }
  }

  /**
   * Terminates the session on Telegram servers, destroys the client, and clears
   * local session (in-memory + file). Returns true only when server-side revoke
   * confirmed. False means server revoke could not be confirmed — local wipe
   * was still attempted. Throws if local file removal failed so callers can
   * surface the partial state instead of silently misreporting success.
   */
  async logOut(): Promise<boolean> {
    const wipeLocalOrThrow = async () => {
      await this.clearSession();
      if (existsSync(this.sessionPath)) {
        throw new Error(`Local session file still present after clearSession: ${this.sessionPath}`);
      }
    };

    if (!this.client || !this.connected) {
      if (existsSync(this.sessionPath)) await wipeLocalOrThrow();
      return false;
    }

    const client = this.client;
    let revoked = false;
    try {
      await client.invoke(new Api.auth.LogOut());
      revoked = true;
    } catch (error) {
      console.error("[telegram] auth.LogOut failed:", error);
    }
    // destroy() failure must NOT mask a successful server revoke — log and continue.
    try {
      await client.destroy();
    } catch (err) {
      console.error("[telegram] client.destroy failed during logOut:", err);
    }
    await wipeLocalOrThrow();
    return revoked;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async startQrLogin(
    onQrDataUrl: (dataUrl: string) => void,
    onQrUrl?: (url: string) => void,
    signal?: AbortSignal,
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    // Early exit if already aborted — avoids creating a Telegram connection we'd immediately tear down.
    if (signal?.aborted) return { success: false, message: "QR login aborted" };

    const session = new StringSession("");
    const proxy = resolveProxy();
    const client = new TelegramClient(session, this.apiId, this.apiHash, {
      connectionRetries: 5,
      ...(proxy && { proxy }),
    });

    try {
      await client.connect();
      if (signal?.aborted) {
        try {
          await client.destroy();
        } catch {}
        return { success: false, message: "QR login aborted" };
      }

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
        if (signal?.aborted) break;
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
          // Abortable sleep — wakes immediately when caller cancels
          const waitMs = loginAccepted ? 1500 : 10000;
          await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
              signal?.removeEventListener("abort", onAbort);
              resolve();
            }, waitMs);
            const onAbort = () => {
              clearTimeout(timer);
              resolve();
            };
            if (signal?.aborted) onAbort();
            else signal?.addEventListener("abort", onAbort, { once: true });
          });
        }
      }

      if (signal?.aborted && !resolved) {
        try {
          await client.destroy();
        } catch {}
        return { success: false, message: "QR login aborted" };
      }

      if (resolved) {
        const newSession = client.session.save() as unknown as string;
        // Persist FIRST, adopt SECOND — so if file write fails, in-memory state still
        // matches whatever's on disk; saveSession is try/catch-safe for Docker etc.
        await this.saveSession(newSession);
        // Destroy the previous in-memory client to free its auth_key / socket.
        // Previously left dangling → accumulated orphan Telegram connections per relogin.
        const oldClient = this.client;
        this.client = client;
        this.connected = true;
        this.entityCache.clear();
        if (oldClient) {
          oldClient.destroy().catch(() => {});
        }
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

  // ─── Messages ──────────────────────────────────────────────────────────────

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
  ): Promise<Api.Message | Api.UpdateShortSentMessage | undefined> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const resolved = await this.resolvePeer(chatId);
      if (topicId) {
        return await this.client?.sendMessage(resolved, {
          message: text,
          topMsgId: topicId,
          ...(replyTo ? { replyTo } : {}),
          ...(parseMode ? { parseMode: parseMode === "html" ? "html" : "md" } : {}),
        });
      }
      return await this.client?.sendMessage(resolved, {
        message: text,
        ...(replyTo ? { replyTo } : {}),
        ...(parseMode ? { parseMode: parseMode === "html" ? "html" : "md" } : {}),
      });
    }, `sendMessage to ${chatId}`);
  }

  async sendFile(chatId: string, filePath: string, caption?: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    await this.rateLimiter.execute(async () => {
      const resolved = await this.resolvePeer(chatId);
      await this.client?.sendFile(resolved, { file: filePath, caption });
    }, `sendFile to ${chatId}`);
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
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    )
      return "image/webp";
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

  // ─── Dialogs ───────────────────────────────────────────────────────────────

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

  // ─── Contacts ──────────────────────────────────────────────────────────────

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

  // ─── Read state ────────────────────────────────────────────────────────────

  async markAsRead(chatId: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    await this.client.markAsRead(chatId);
  }

  async getMessageById(
    chatId: string,
    messageId: number,
  ): Promise<{
    id: number;
    text: string;
    sender: string;
    date: string;
    media?: { type: string; fileName?: string; size?: number };
    reactions?: { emoji: string; count: number; me: boolean }[];
  } | null> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const resolved = await this.resolvePeer(chatId);
    const messages = await this.client.getMessages(resolved, { ids: [messageId] });
    const m = messages[0];
    if (!m || m.id !== messageId) return null;
    return {
      id: m.id,
      text: m.message ?? "",
      sender: await this.resolveSenderName(m.senderId),
      date: new Date((m.date ?? 0) * 1000).toISOString(),
      media: this.extractMediaInfo(m.media),
      reactions: this.extractReactions(m.reactions),
    };
  }

  async forwardMessage(fromChatId: string, toChatId: string, messageIds: number[]): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const resolvedFrom = await this.resolvePeer(fromChatId);
    const resolvedTo = await this.resolvePeer(toChatId);
    await this.client.forwardMessages(resolvedTo, { messages: messageIds, fromPeer: resolvedFrom });
  }

  async editMessage(chatId: string, messageId: number, newText: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    await this.rateLimiter.execute(async () => {
      const resolved = await this.resolvePeer(chatId);
      await this.client?.editMessage(resolved, { message: messageId, text: newText });
    }, `editMessage ${messageId} in ${chatId}`);
  }

  async deleteMessages(chatId: string, messageIds: number[]): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    await this.rateLimiter.execute(async () => {
      const resolved = await this.resolvePeer(chatId);
      await this.client?.deleteMessages(resolved, messageIds, { revoke: true });
    }, `deleteMessages in ${chatId}`);
  }

  async getScheduledMessages(chatId: string): Promise<
    Array<{
      id: number;
      date: string;
      text: string;
      media?: { type: string; fileName?: string; size?: number };
    }>
  > {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const resolved = await this.resolvePeer(chatId);
      const peer = await this.client?.getInputEntity(resolved);
      if (!peer) throw new Error(`Cannot resolve peer for ${chatId}`);
      const result = await this.client?.invoke(new Api.messages.GetScheduledHistory({ peer, hash: bigInt(0) }));
      if (!result || result instanceof Api.messages.MessagesNotModified) return [];
      const messages = (result as Api.messages.Messages | Api.messages.MessagesSlice | Api.messages.ChannelMessages)
        .messages;
      return messages
        .filter((m): m is Api.Message => m instanceof Api.Message)
        .map((m) => ({
          id: m.id,
          date: new Date((m.date ?? 0) * 1000).toISOString(),
          text: m.message ?? "",
          media: this.extractMediaInfo(m.media),
        }));
    }, `getScheduledMessages in ${chatId}`);
  }

  async deleteScheduledMessages(chatId: string, messageIds: number[]): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    await this.rateLimiter.execute(async () => {
      const resolved = await this.resolvePeer(chatId);
      const peer = await this.client?.getInputEntity(resolved);
      if (!peer) throw new Error(`Cannot resolve peer for ${chatId}`);
      await this.client?.invoke(new Api.messages.DeleteScheduledMessages({ peer, id: messageIds }));
    }, `deleteScheduledMessages in ${chatId}`);
  }

  async getReplies(
    chatId: string,
    messageId: number,
    limit = 20,
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
    return this.rateLimiter.execute(async () => {
      const resolved = await this.resolvePeer(chatId);
      const peer = await this.client?.getInputEntity(resolved);
      if (!peer) throw new Error(`Cannot resolve peer for ${chatId}`);
      const result = await this.client?.invoke(
        new Api.messages.GetReplies({ peer, msgId: messageId, limit, hash: bigInt(0) }),
      );
      if (!result || result instanceof Api.messages.MessagesNotModified) return [];
      const messages = (result as Api.messages.Messages | Api.messages.MessagesSlice | Api.messages.ChannelMessages)
        .messages;
      return Promise.all(
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
    }, `getReplies for ${messageId} in ${chatId}`);
  }

  async getMessageLink(chatId: string, messageId: number, thread = false): Promise<string> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const entity = await this.resolveChat(chatId);
      if (!(entity instanceof Api.Channel)) {
        throw new Error("Message links are only available for channels and supergroups");
      }
      const result = await this.client?.invoke(
        new Api.channels.ExportMessageLink({ channel: entity, id: messageId, thread }),
      );
      if (!result) throw new Error("Failed to export message link");
      return result.link;
    }, `getMessageLink for ${messageId} in ${chatId}`);
  }

  async getUnreadMentions(
    chatId: string,
    limit = 20,
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
    return this.rateLimiter.execute(async () => {
      const resolved = await this.resolvePeer(chatId);
      const peer = await this.client?.getInputEntity(resolved);
      if (!peer) throw new Error(`Cannot resolve peer for ${chatId}`);
      const result = await this.client?.invoke(
        new Api.messages.GetUnreadMentions({
          peer,
          offsetId: 0,
          addOffset: 0,
          limit,
          maxId: 0,
          minId: 0,
        }),
      );
      if (!result || result instanceof Api.messages.MessagesNotModified) return [];
      const typedResult = result as Api.messages.Messages | Api.messages.MessagesSlice | Api.messages.ChannelMessages;
      const messages = typedResult.messages;
      const items = await Promise.all(
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
      // Only mark all as read when we received the complete set; if truncated, marking all
      // would silently clear mentions the caller hasn't seen yet.
      const totalCount = "count" in typedResult ? typedResult.count : items.length;
      if (items.length > 0 && items.length >= totalCount) {
        try {
          await this.client?.invoke(new Api.messages.ReadMentions({ peer }));
        } catch {
          // best-effort; don't discard fetched items on mark-read failure
        }
      }
      return items;
    }, `getUnreadMentions in ${chatId}`);
  }

  async getUnreadReactions(
    chatId: string,
    limit = 20,
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
    return this.rateLimiter.execute(async () => {
      const resolved = await this.resolvePeer(chatId);
      const peer = await this.client?.getInputEntity(resolved);
      if (!peer) throw new Error(`Cannot resolve peer for ${chatId}`);
      const result = await this.client?.invoke(
        new Api.messages.GetUnreadReactions({
          peer,
          offsetId: 0,
          addOffset: 0,
          limit,
          maxId: 0,
          minId: 0,
        }),
      );
      if (!result || result instanceof Api.messages.MessagesNotModified) return [];
      const typedResult = result as Api.messages.Messages | Api.messages.MessagesSlice | Api.messages.ChannelMessages;
      const messages = typedResult.messages;
      const items = await Promise.all(
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
      // Only mark all as read when we received the complete set; if truncated, marking all
      // would silently clear reactions the caller hasn't seen yet.
      const totalCount = "count" in typedResult ? typedResult.count : items.length;
      if (items.length > 0 && items.length >= totalCount) {
        try {
          await this.client?.invoke(new Api.messages.ReadReactions({ peer }));
        } catch {
          // best-effort; don't discard fetched items on mark-read failure
        }
      }
      return items;
    }, `getUnreadReactions in ${chatId}`);
  }

  async translateText(chatId: string, messageIds: number[], toLang: string): Promise<string[]> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const resolved = await this.resolvePeer(chatId);
      const peer = await this.client?.getInputEntity(resolved);
      if (!peer) throw new Error(`Cannot resolve peer for ${chatId}`);
      const result = await this.client?.invoke(new Api.messages.TranslateText({ peer, id: messageIds, toLang }));
      if (!result) return [];
      return result.result.map((t) => (t instanceof Api.TextWithEntities ? t.text : ""));
    }, `translateText in ${chatId}`);
  }

  async sendTyping(
    chatId: string,
    action: "typing" | "upload_photo" | "upload_document" | "cancel" = "typing",
  ): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      let stamped = false;
      if (action !== "cancel") {
        const now = Date.now();
        const last = this.lastTypingAt.get(chatId) ?? 0;
        if (now - last < 10_000) return;
        this.lastTypingAt.set(chatId, now);
        stamped = true;
      }
      try {
        const resolved = await this.resolvePeer(chatId);
        const peer = await this.client?.getInputEntity(resolved);
        if (!peer) throw new Error(`Cannot resolve peer for ${chatId}`);
        let sendAction: Api.TypeSendMessageAction;
        switch (action) {
          case "cancel":
            sendAction = new Api.SendMessageCancelAction();
            break;
          case "upload_photo":
            sendAction = new Api.SendMessageUploadPhotoAction({ progress: 0 });
            break;
          case "upload_document":
            sendAction = new Api.SendMessageUploadDocumentAction({ progress: 0 });
            break;
          default:
            sendAction = new Api.SendMessageTypingAction();
        }
        await this.client?.invoke(new Api.messages.SetTyping({ peer, action: sendAction }));
        if (action === "cancel") {
          this.lastTypingAt.delete(chatId);
        }
      } catch (err) {
        if (stamped) this.lastTypingAt.delete(chatId);
        throw err;
      }
    }, `sendTyping in ${chatId}`);
  }

  // ─── Chat lookup & info ────────────────────────────────────────────────────

  /**
   * Resolve a chat by ID, username, or display name.
   * Falls back to searching user's dialogs if getEntity() fails.
   */
  async resolveChat(chatId: string): Promise<ChatEntity> {
    if (!this.client) throw new Error(NOT_CONNECTED_ERROR);

    const cached = this.entityCache.get(chatId);
    if (cached) return cached;

    // First try direct resolve (numeric ID, username, phone)
    try {
      const entity = await this.client.getEntity(chatId);
      this.entityCache.set(chatId, entity);
      return entity;
    } catch {
      // Fall through to dialog search
    }

    // Search dialogs by display name
    const dialogs = await this.client.getDialogs({ limit: 100 });
    const query = chatId.toLowerCase();

    // Exact match first
    const exact = dialogs.find((d) => d.title?.toLowerCase() === query);
    if (exact?.entity) {
      this.entityCache.set(chatId, exact.entity);
      return exact.entity;
    }

    // Partial match
    const partial = dialogs.filter((d) => d.title?.toLowerCase().includes(query));
    if (partial.length === 1 && partial[0].entity) {
      this.entityCache.set(chatId, partial[0].entity);
      return partial[0].entity;
    }
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
  private async resolvePeer(chatId: string): Promise<string | ChatEntity> {
    // Normalize '@me' — GramJS only intercepts the plain 'me' string as InputPeerSelf
    if (chatId === "@me") return "me";
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

  // ─── Search ────────────────────────────────────────────────────────────────

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

  // ─── Profiles & Media ──────────────────────────────────────────────────────

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
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    )
      return "image/webp";
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

  // ─── Reactions ─────────────────────────────────────────────────────────────

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
                const name = await this.resolveSenderName(bigInt(userId));
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

  async setDefaultReaction(emoji: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    await this.rateLimiter.execute(async () => {
      await this.client?.invoke(
        new Api.messages.SetDefaultReaction({
          reaction: new Api.ReactionEmoji({ emoticon: emoji }),
        }),
      );
    }, `setDefaultReaction ${emoji}`);
  }

  async getTopReactions(limit: number): Promise<Array<{ emoji: string }>> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const result = await this.client?.invoke(new Api.messages.GetTopReactions({ limit, hash: bigInt(0) }));
      if (!result || result instanceof Api.messages.ReactionsNotModified) return [];
      const out: Array<{ emoji: string }> = [];
      for (const r of result.reactions) {
        const emoji = reactionToEmoji(r);
        if (emoji) out.push({ emoji });
      }
      return out;
    }, "getTopReactions");
  }

  async getRecentReactions(limit: number): Promise<Array<{ emoji: string }>> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const result = await this.client?.invoke(new Api.messages.GetRecentReactions({ limit, hash: bigInt(0) }));
      if (!result || result instanceof Api.messages.ReactionsNotModified) return [];
      const out: Array<{ emoji: string }> = [];
      for (const r of result.reactions) {
        const emoji = reactionToEmoji(r);
        if (emoji) out.push({ emoji });
      }
      return out;
    }, "getRecentReactions");
  }

  // ─── Scheduled & Polls ─────────────────────────────────────────────────────

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
    const resolved = await this.resolvePeer(chatId);
    const peer = await this.client.getInputEntity(resolved);
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

  // ─── Chat membership & management ──────────────────────────────────────────

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

    if (entity instanceof Api.Chat) {
      throw new Error("Basic groups cannot be joined by username; use an invite link instead.");
    }
    if (entity instanceof Api.Channel) {
      await this.client.invoke(new Api.channels.JoinChannel({ channel: entity }));
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
      const fileData = await readFile(options.photoPath);
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

  // ─── Chat settings & moderation ────────────────────────────────────────────

  async unblockUser(userId: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const entity = await this.client.getInputEntity(userId);
    await this.client.invoke(new Api.contacts.Unblock({ id: entity }));
  }

  async muteChat(chatId: string, muteUntil: number): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const resolved = await this.resolvePeer(chatId);
    const peer = await this.client.getInputEntity(resolved);
    await this.client.invoke(
      new Api.account.UpdateNotifySettings({
        peer: new Api.InputNotifyPeer({ peer }),
        settings: new Api.InputPeerNotifySettings({ muteUntil }),
      }),
    );
  }

  async archiveChat(chatId: string, archive: boolean): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const resolved = await this.resolvePeer(chatId);
      const peer = await this.client?.getInputEntity(resolved);
      if (!peer) throw new Error(`Cannot resolve peer for ${chatId}`);
      await this.client?.invoke(
        new Api.folders.EditPeerFolders({
          folderPeers: [new Api.InputFolderPeer({ peer, folderId: archive ? 1 : 0 })],
        }),
      );
    }, `archiveChat ${chatId}`);
  }

  async pinDialog(chatId: string, pin: boolean): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const resolved = await this.resolvePeer(chatId);
      const peer = await this.client?.getInputEntity(resolved);
      if (!peer) throw new Error(`Cannot resolve peer for ${chatId}`);
      await this.client?.invoke(
        new Api.messages.ToggleDialogPin({
          peer: new Api.InputDialogPeer({ peer }),
          pinned: pin,
        }),
      );
    }, `pinDialog ${chatId}`);
  }

  async markDialogUnread(chatId: string, unread: boolean): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const resolved = await this.resolvePeer(chatId);
      const peer = await this.client?.getInputEntity(resolved);
      if (!peer) throw new Error(`Cannot resolve peer for ${chatId}`);
      await this.client?.invoke(
        new Api.messages.MarkDialogUnread({
          peer: new Api.InputDialogPeer({ peer }),
          unread,
        }),
      );
    }, `markDialogUnread ${chatId}`);
  }

  async getAdminLog(
    chatId: string,
    limit = 20,
    q?: string,
  ): Promise<
    Array<{
      id: string;
      date: string;
      userId: string;
      userName: string;
      action: string;
      details: string;
    }>
  > {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const entity = await this.resolveChat(chatId);
      if (!(entity instanceof Api.Channel)) {
        throw new Error("Admin log is only available for supergroups and channels");
      }
      const result = await this.client?.invoke(
        new Api.channels.GetAdminLog({
          channel: entity,
          q: q ?? "",
          maxId: bigInt(0),
          minId: bigInt(0),
          limit,
        }),
      );
      if (!result) return [];

      const userMap = new Map<string, Api.User>();
      for (const u of result.users) {
        if (u instanceof Api.User) userMap.set(u.id.toString(), u);
      }

      const describeUser = (userId: bigInt.BigInteger): string => {
        const user = userMap.get(userId.toString());
        if (!user) return userId.toString();
        const parts = [user.firstName, user.lastName].filter(Boolean);
        const name = parts.join(" ") || "Unknown";
        return user.username ? `${name} (@${user.username})` : name;
      };

      return result.events.map((event) => ({
        id: event.id.toString(),
        date: new Date((event.date ?? 0) * 1000).toISOString(),
        userId: event.userId.toString(),
        userName: describeUser(event.userId),
        action: describeAdminLogAction(event.action),
        details: describeAdminLogDetails(event.action, describeUser),
      }));
    }, `getAdminLog for ${chatId}`);
  }

  async setChatPermissions(chatId: string, permissions: ChatPermissions): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    if (Object.values(permissions).every((v) => v === undefined)) return;
    return this.rateLimiter.execute(async () => {
      const entity = await this.resolveChat(chatId);
      let currentRights: Record<string, unknown> | undefined;
      if (entity instanceof Api.Channel) {
        const full = await this.client?.invoke(new Api.channels.GetFullChannel({ channel: entity }));
        const fullChannel = full?.chats?.find(
          (c): c is Api.Channel => c instanceof Api.Channel && c.id.equals(entity.id),
        );
        currentRights = (fullChannel?.defaultBannedRights as unknown as Record<string, unknown>) ?? undefined;
      } else if (entity instanceof Api.Chat) {
        const full = await this.client?.invoke(new Api.messages.GetFullChat({ chatId: entity.id }));
        const fullChat = full?.chats?.find((c): c is Api.Chat => c instanceof Api.Chat && c.id.equals(entity.id));
        currentRights = (fullChat?.defaultBannedRights as unknown as Record<string, unknown>) ?? undefined;
      }
      const peer = await this.client?.getInputEntity(entity);
      if (!peer) throw new Error(`Cannot resolve peer for ${chatId}`);
      await this.client?.invoke(
        new Api.messages.EditChatDefaultBannedRights({
          peer,
          bannedRights: new Api.ChatBannedRights({ untilDate: 0, ...mergeBannedRights(currentRights, permissions) }),
        }),
      );
    }, `setChatPermissions ${chatId}`);
  }

  async setSlowMode(chatId: string, seconds: number): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const allowed = [0, 10, 30, 60, 300, 900, 3600];
    if (!allowed.includes(seconds)) {
      throw new Error(`Invalid slow mode interval. Allowed values: ${allowed.join(", ")} (seconds)`);
    }
    return this.rateLimiter.execute(async () => {
      const entity = await this.resolveChat(chatId);
      if (!(entity instanceof Api.Channel)) {
        throw new Error("Slow mode is only available for supergroups");
      }
      await this.client?.invoke(new Api.channels.ToggleSlowMode({ channel: entity, seconds }));
    }, `setSlowMode ${chatId}`);
  }

  async toggleChannelSignatures(chatId: string, enabled: boolean): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const entity = await this.resolveChat(chatId);
      if (!(entity instanceof Api.Channel)) {
        throw new Error("Channel signatures are only available for broadcast channels (not groups or supergroups)");
      }
      if (entity.megagroup) {
        throw new Error("Channel signatures are only available for broadcast channels, not supergroups");
      }
      await this.client?.invoke(new Api.channels.ToggleSignatures({ channel: entity, signaturesEnabled: enabled }));
    }, `toggleChannelSignatures ${chatId}`);
  }

  async toggleAntiSpam(chatId: string, enabled: boolean): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const entity = await this.resolveChat(chatId);
      if (!(entity instanceof Api.Channel)) {
        throw new Error("Aggressive anti-spam is only available for supergroups");
      }
      if (!entity.megagroup) {
        throw new Error("Aggressive anti-spam is only available for supergroups, not broadcast channels");
      }
      await this.client?.invoke(new Api.channels.ToggleAntiSpam({ channel: entity, enabled }));
    }, `toggleAntiSpam ${chatId}`);
  }

  async toggleForumMode(chatId: string, enabled: boolean): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const entity = await this.resolveChat(chatId);
      if (!(entity instanceof Api.Channel)) {
        throw new Error("Forum mode is only available for supergroups");
      }
      if (!entity.megagroup) {
        throw new Error("Forum mode is only available for supergroups, not broadcast channels");
      }
      await this.client?.invoke(new Api.channels.ToggleForum({ channel: entity, enabled }));
    }, `toggleForumMode ${chatId}`);
  }

  async togglePrehistoryHidden(chatId: string, hidden: boolean): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const entity = await this.resolveChat(chatId);
      if (!(entity instanceof Api.Channel)) {
        throw new Error("Prehistory visibility is only available for supergroups");
      }
      if (!entity.megagroup) {
        throw new Error("Prehistory visibility is only available for supergroups, not broadcast channels");
      }
      await this.client?.invoke(new Api.channels.TogglePreHistoryHidden({ channel: entity, enabled: hidden }));
    }, `togglePrehistoryHidden ${chatId}`);
  }

  async setChatAvailableReactions(
    chatId: string,
    reactions: { type: "all"; allowCustom?: boolean } | { type: "some"; emoji: string[] } | { type: "none" },
  ): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const entity = await this.resolveChat(chatId);
      if (!(entity instanceof Api.Channel) && !(entity instanceof Api.Chat)) {
        throw new Error("Chat reactions can only be configured for groups, supergroups, and channels");
      }
      let availableReactions: Api.TypeChatReactions;
      if (reactions.type === "all") {
        availableReactions = new Api.ChatReactionsAll({ allowCustom: reactions.allowCustom });
      } else if (reactions.type === "none") {
        availableReactions = new Api.ChatReactionsNone();
      } else {
        if (reactions.emoji.length === 0) {
          throw new Error('reactions.emoji must be non-empty when type is "some" (use type:"none" to disable)');
        }
        availableReactions = new Api.ChatReactionsSome({
          reactions: reactions.emoji.map((emoticon) => new Api.ReactionEmoji({ emoticon })),
        });
      }
      await this.client?.invoke(new Api.messages.SetChatAvailableReactions({ peer: entity, availableReactions }));
    }, `setChatAvailableReactions ${chatId}`);
  }

  async approveChatJoinRequest(chatId: string, userId: string, approved: boolean): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const entity = await this.resolveChat(chatId);
      if (!(entity instanceof Api.Channel)) {
        throw new Error("Join request approval is only supported for supergroups and channels, not basic groups");
      }
      const user = await this.client?.getEntity(userId);
      if (!(user instanceof Api.User)) {
        throw new Error("Target is not a user");
      }
      const inputUser = new Api.InputUser({ userId: user.id, accessHash: user.accessHash ?? bigInt.zero });
      await this.client?.invoke(new Api.messages.HideChatJoinRequest({ peer: entity, userId: inputUser, approved }));
    }, `approveChatJoinRequest ${chatId}/${userId}`);
  }

  // ─── Inline bots & buttons ─────────────────────────────────────────────────

  async getInlineBotResults(
    bot: string,
    chatId: string,
    query: string,
    offset?: string,
  ): Promise<{
    queryId: string;
    nextOffset?: string;
    cacheTime: number;
    gallery: boolean;
    results: Array<{ id: string; type: string; title?: string; description?: string; url?: string }>;
  }> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const peer = await this.resolveChat(chatId);
      const botEntity = await this.client?.getEntity(bot);
      if (!(botEntity instanceof Api.User)) {
        throw new Error(`'${bot}' is not a user/bot`);
      }
      if (!botEntity.bot) {
        throw new Error(`'${bot}' is not a bot (inline queries require a bot account)`);
      }
      const inputBot = new Api.InputUser({
        userId: botEntity.id,
        accessHash: botEntity.accessHash ?? bigInt.zero,
      });
      const result = await this.client?.invoke(
        new Api.messages.GetInlineBotResults({
          bot: inputBot,
          peer,
          query,
          offset: offset ?? "",
        }),
      );
      if (!result) throw new Error("No inline bot results returned");
      return {
        queryId: result.queryId.toString(),
        nextOffset: result.nextOffset,
        cacheTime: result.cacheTime,
        gallery: result.gallery === true,
        results: result.results.map((r) => {
          if (r instanceof Api.BotInlineResult) {
            return { id: r.id, type: r.type, title: r.title, description: r.description, url: r.url };
          }
          const mr = r as Api.BotInlineMediaResult;
          return { id: mr.id, type: mr.type, title: mr.title, description: mr.description };
        }),
      };
    }, `getInlineBotResults via ${bot}`);
  }

  async sendInlineBotResult(
    chatId: string,
    queryId: string,
    resultId: string,
    options?: { replyTo?: number; silent?: boolean; hideVia?: boolean; clearDraft?: boolean },
  ): Promise<{ messageId: number }> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const peer = await this.resolveChat(chatId);
      const randomId = bigInt(Math.floor(Math.random() * 1e15));
      const replyTo = options?.replyTo ? new Api.InputReplyToMessage({ replyToMsgId: options.replyTo }) : undefined;
      const result = await this.client?.invoke(
        new Api.messages.SendInlineBotResult({
          peer,
          queryId: bigInt(queryId),
          id: resultId,
          randomId,
          ...(replyTo ? { replyTo } : {}),
          ...(options?.silent ? { silent: true } : {}),
          ...(options?.hideVia ? { hideVia: true } : {}),
          ...(options?.clearDraft ? { clearDraft: true } : {}),
        }),
      );
      if (!result) throw new Error("No response from SendInlineBotResult");
      if (result instanceof Api.Updates || result instanceof Api.UpdatesCombined) {
        for (const update of result.updates) {
          if (update instanceof Api.UpdateMessageID && update.randomId?.equals(randomId)) {
            return { messageId: update.id };
          }
        }
      }
      if (result instanceof Api.UpdateShortSentMessage) {
        return { messageId: result.id };
      }
      return { messageId: 0 };
    }, `sendInlineBotResult ${resultId} to ${chatId}`);
  }

  async pressButton(
    chatId: string,
    messageId: number,
    options: { buttonIndex?: { row: number; column: number }; data?: string },
  ): Promise<{
    alert?: boolean;
    hasUrl?: boolean;
    nativeUi?: boolean;
    message?: string;
    url?: string;
    cacheTime: number;
  }> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const entity = await this.resolveChat(chatId);

      let data: Buffer;
      if (options.buttonIndex) {
        const { row, column } = options.buttonIndex;
        const messages = await this.client?.getMessages(entity, { ids: [messageId] });
        const msg = messages?.[0];
        if (!msg) throw new Error(`Message ${messageId} not found in ${chatId}`);
        const markup = (msg as Api.Message).replyMarkup;
        if (!markup) throw new Error(`Message ${messageId} has no reply markup`);
        if (!(markup instanceof Api.ReplyInlineMarkup)) {
          throw new Error(
            `Message ${messageId} reply markup is ${markup.className} (only ReplyInlineMarkup has callable buttons)`,
          );
        }
        const rowEntry = markup.rows[row];
        if (!rowEntry) throw new Error(`Row ${row} out of bounds (message has ${markup.rows.length} rows)`);
        const button = rowEntry.buttons[column];
        if (!button) {
          throw new Error(`Column ${column} out of bounds in row ${row} (row has ${rowEntry.buttons.length} buttons)`);
        }
        if (!(button instanceof Api.KeyboardButtonCallback)) {
          throw new Error(
            `Button at (${row},${column}) is ${button.className}, not callable — use the appropriate tool for URL/switch-inline/game buttons`,
          );
        }
        if (button.requiresPassword) {
          throw new Error(
            `Button at (${row},${column}) requires 2FA password confirmation — not supported by telegram-press-button`,
          );
        }
        data = Buffer.from(button.data as Uint8Array);
      } else if (options.data !== undefined) {
        data = Buffer.from(options.data, "base64");
      } else {
        throw new Error("Either buttonIndex or data must be provided");
      }

      const answer = await this.client?.invoke(
        new Api.messages.GetBotCallbackAnswer({
          peer: entity,
          msgId: messageId,
          data,
        }),
      );
      if (!answer) throw new Error("No callback answer returned");
      return {
        alert: answer.alert,
        hasUrl: answer.hasUrl,
        nativeUi: answer.nativeUi,
        message: answer.message,
        url: answer.url,
        cacheTime: answer.cacheTime,
      };
    }, `pressButton ${chatId}/${messageId}`);
  }

  async getMessageButtons(
    chatId: string,
    messageId: number,
  ): Promise<{
    markupType: string;
    buttons: MessageButtonDescriptor[];
  }> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const entity = await this.resolveChat(chatId);
      const messages = await this.client?.getMessages(entity, { ids: [messageId] });
      const msg = messages?.[0];
      if (!msg) throw new Error(`Message ${messageId} not found in ${chatId}`);
      const markup = (msg as Api.Message).replyMarkup;
      if (!markup) {
        return { markupType: "none", buttons: [] };
      }
      if (!(markup instanceof Api.ReplyInlineMarkup) && !(markup instanceof Api.ReplyKeyboardMarkup)) {
        return { markupType: markup.className, buttons: [] };
      }
      const buttons: MessageButtonDescriptor[] = [];
      markup.rows.forEach((rowEntry, row) => {
        rowEntry.buttons.forEach((button, col) => {
          buttons.push(describeKeyboardButton(button, row, col));
        });
      });
      return { markupType: markup.className, buttons };
    }, `getMessageButtons ${chatId}/${messageId}`);
  }

  async getBroadcastStats(
    chatId: string,
    options?: { dark?: boolean; includeGraphs?: boolean },
  ): Promise<BroadcastStatsSummary> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const entity = await this.resolveChat(chatId);
      if (!(entity instanceof Api.Channel)) {
        throw new Error("Broadcast stats are only available for channels");
      }
      if (entity.megagroup) {
        throw new Error(
          "Broadcast stats are only available for broadcast channels, not supergroups (use telegram-get-megagroup-stats)",
        );
      }
      let result: Api.stats.BroadcastStats;
      try {
        const response = await this.client?.invoke(
          new Api.stats.GetBroadcastStats({ channel: entity, dark: options?.dark }),
        );
        if (!response) {
          throw new Error("channel has no stats (may require Telegram Premium admin)");
        }
        result = response as Api.stats.BroadcastStats;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/CHAT_ADMIN_REQUIRED|ADMIN_RANK_INVALID/i.test(msg)) {
          throw new Error("Access denied: channel stats require admin rights (and may require Telegram Premium)");
        }
        if (/STATS_UNAVAILABLE|BROADCAST_REQUIRED|PARTICIPANTS_TOO_FEW/i.test(msg)) {
          throw new Error("channel has no stats (may require Telegram Premium admin)");
        }
        throw e;
      }
      return summarizeBroadcastStats(result, options?.includeGraphs === true);
    }, `getBroadcastStats ${chatId}`);
  }

  async getMegagroupStats(
    chatId: string,
    options?: { dark?: boolean; includeGraphs?: boolean },
  ): Promise<MegagroupStatsSummary> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(
      async () => {
        const entity = await this.resolveChat(chatId);
        if (!(entity instanceof Api.Channel)) {
          throw new Error("Megagroup stats are only available for supergroups");
        }
        if (!entity.megagroup) {
          throw new Error(
            "Megagroup stats are only available for supergroups, not broadcast channels (use telegram-get-broadcast-stats)",
          );
        }
        let result: Api.stats.MegagroupStats;
        try {
          const response = await this.client?.invoke(
            new Api.stats.GetMegagroupStats({ channel: entity, dark: options?.dark }),
          );
          if (!response) {
            throw new Error("supergroup has no stats yet (needs more activity/members)");
          }
          result = response as Api.stats.MegagroupStats;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/CHAT_ADMIN_REQUIRED|ADMIN_RANK_INVALID/i.test(msg)) {
            throw new Error("Access denied: supergroup stats require admin rights");
          }
          if (/STATS_UNAVAILABLE|PARTICIPANTS_TOO_FEW|MEGAGROUP_REQUIRED/i.test(msg)) {
            throw new Error("supergroup has no stats yet (needs more activity/members)");
          }
          throw e;
        }
        return summarizeMegagroupStats(result, options?.includeGraphs === true);
      },
      `getMegagroupStats ${chatId}`,
      { throwOnFloodWait: true },
    );
  }

  // ─── Stats & updates ───────────────────────────────────────────────────────

  async getUpdatesState(): Promise<{
    pts: number;
    qts: number;
    date: number;
    seq: number;
    unreadCount: number;
  }> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const state = await this.client?.invoke(new Api.updates.GetState());
      if (!state) throw new Error("updates.GetState returned no state");
      return {
        pts: state.pts,
        qts: state.qts,
        date: state.date,
        seq: state.seq,
        unreadCount: state.unreadCount,
      };
    }, "getUpdatesState");
  }

  async getUpdates(cursor: {
    pts: number;
    date: number;
    qts: number;
    ptsLimit?: number;
    ptsTotalLimit?: number;
  }): Promise<UpdatesDifferenceSummary> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const ptsLimit = Math.min(cursor.ptsLimit ?? 100, 1000);
    const ptsTotalLimit = Math.min(cursor.ptsTotalLimit ?? 1000, 1000);
    return this.rateLimiter.execute(async () => {
      const diff = await this.client?.invoke(
        new Api.updates.GetDifference({
          pts: cursor.pts,
          date: cursor.date,
          qts: cursor.qts,
          ptsLimit,
          ptsTotalLimit,
        }),
      );
      if (!diff) throw new Error("updates.GetDifference returned nothing");
      return summarizeUpdatesDifference(diff, cursor);
    }, "getUpdates");
  }

  async getChannelUpdates(
    chatId: string,
    cursor: { pts: number; limit?: number; force?: boolean },
  ): Promise<ChannelDifferenceSummary> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const limit = Math.min(cursor.limit ?? 100, 1_000);
    return this.rateLimiter.execute(async () => {
      const entity = await this.resolveChat(chatId);
      if (!(entity instanceof Api.Channel)) {
        throw new Error("Channel updates are only available for channels/supergroups");
      }
      const diff = await this.client?.invoke(
        new Api.updates.GetChannelDifference({
          channel: entity,
          filter: new Api.ChannelMessagesFilterEmpty(),
          pts: cursor.pts,
          limit,
          force: cursor.force,
        }),
      );
      if (!diff) throw new Error("updates.GetChannelDifference returned nothing");
      return summarizeChannelDifference(diff, entity.id.toString(), cursor.pts);
    }, `getChannelUpdates ${chatId}`);
  }

  // ─── Forum topics ──────────────────────────────────────────────────────────

  async createForumTopic(
    chatId: string,
    title: string,
    iconColor?: number,
    iconEmojiId?: string,
  ): Promise<{ id: number; title: string }> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const entity = await this.resolveChat(chatId);
      if (!(entity instanceof Api.Channel) || !entity.forum) {
        throw new Error("Forum topics are only available in forum supergroups");
      }
      const randomId = bigInt(Math.floor(Math.random() * 1e15));
      const result = await this.client?.invoke(
        new Api.channels.CreateForumTopic({
          channel: entity,
          title,
          iconColor,
          iconEmojiId: iconEmojiId ? bigInt(iconEmojiId) : undefined,
          randomId,
        }),
      );
      let topicId = 0;
      if (result instanceof Api.Updates || result instanceof Api.UpdatesCombined) {
        for (const update of result.updates) {
          if (
            update instanceof Api.UpdateNewChannelMessage &&
            update.message instanceof Api.MessageService &&
            update.message.action instanceof Api.MessageActionTopicCreate
          ) {
            topicId = update.message.id;
            break;
          }
        }
        if (topicId === 0) {
          for (const update of result.updates) {
            if (update instanceof Api.UpdateMessageID && update.randomId?.equals(randomId)) {
              topicId = update.id;
              break;
            }
          }
        }
      }
      if (topicId === 0) {
        throw new Error("Failed to determine created topic ID");
      }
      return { id: topicId, title };
    }, `createForumTopic ${chatId}`);
  }

  async editForumTopic(
    chatId: string,
    topicId: number,
    options: { title?: string; iconEmojiId?: string; closed?: boolean; hidden?: boolean },
  ): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const entity = await this.resolveChat(chatId);
      if (!(entity instanceof Api.Channel) || !entity.forum) {
        throw new Error("Forum topics are only available in forum supergroups");
      }
      await this.client?.invoke(
        new Api.channels.EditForumTopic({
          channel: entity,
          topicId,
          title: options.title,
          iconEmojiId: options.iconEmojiId ? bigInt(options.iconEmojiId) : undefined,
          closed: options.closed,
          hidden: options.hidden,
        }),
      );
    }, `editForumTopic ${chatId}/${topicId}`);
  }

  async deleteForumTopic(chatId: string, topicId: number): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const entity = await this.resolveChat(chatId);
      if (!(entity instanceof Api.Channel) || !entity.forum) {
        throw new Error("Forum topics are only available in forum supergroups");
      }
      await this.client?.invoke(
        new Api.channels.DeleteTopicHistory({
          channel: entity,
          topMsgId: topicId,
        }),
      );
    }, `deleteForumTopic ${chatId}/${topicId}`);
  }

  // ─── Invite links & folders ────────────────────────────────────────────────

  async exportInviteLink(
    chatId: string,
    options?: { expireDate?: number; usageLimit?: number; requestNeeded?: boolean; title?: string },
  ): Promise<string> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const resolved = await this.resolvePeer(chatId);
    const peer = await this.client.getInputEntity(resolved);
    const result = await this.client.invoke(
      new Api.messages.ExportChatInvite({
        peer,
        expireDate: options?.expireDate,
        usageLimit: options?.usageLimit,
        requestNeeded: options?.requestNeeded,
        title: options?.title,
      }),
    );
    if (result instanceof Api.ChatInviteExported) {
      return result.link;
    }
    throw new Error("Failed to export invite link");
  }

  async getInviteLinks(
    chatId: string,
    limit = 20,
    adminId?: string,
  ): Promise<Array<{ link: string; title?: string; expired: boolean; revoked: boolean; usageCount: number }>> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const resolved = await this.resolvePeer(chatId);
    const peer = await this.client.getInputEntity(resolved);
    const admin = adminId ? await this.client.getInputEntity(await this.resolvePeer(adminId)) : new Api.InputUserSelf();
    const result = await this.client.invoke(
      new Api.messages.GetExportedChatInvites({
        peer,
        adminId: admin,
        limit,
      }),
    );
    return result.invites
      .filter((inv): inv is Api.ChatInviteExported => inv instanceof Api.ChatInviteExported)
      .map((inv) => {
        const expiredByDate = inv.expireDate ? inv.expireDate < Math.floor(Date.now() / 1000) : false;
        const expiredByUsage =
          inv.usageLimit != null && inv.usageLimit > 0 && inv.usage != null ? inv.usage >= inv.usageLimit : false;
        return {
          link: inv.link,
          title: inv.title,
          expired: expiredByDate || expiredByUsage,
          revoked: inv.revoked ?? false,
          usageCount: inv.usage ?? 0,
        };
      });
  }

  async revokeInviteLink(chatId: string, link: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const resolved = await this.resolvePeer(chatId);
    const peer = await this.client.getInputEntity(resolved);
    await this.client.invoke(
      new Api.messages.EditExportedChatInvite({
        peer,
        link,
        revoked: true,
      }),
    );
  }

  async getChatFolders(): Promise<
    Array<{ id: number; title: string; emoticon?: string; pinnedCount: number; includeCount: number }>
  > {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const result = await this.client.invoke(new Api.messages.GetDialogFilters());
    const filters = "filters" in result ? result.filters : [];
    return filters
      .filter(
        (f): f is Api.DialogFilter | Api.DialogFilterChatlist =>
          f instanceof Api.DialogFilter || f instanceof Api.DialogFilterChatlist,
      )
      .map((f) => ({
        id: f.id,
        title: typeof f.title === "string" ? f.title : f.title.text,
        emoticon: f.emoticon,
        pinnedCount: f.pinnedPeers?.length ?? 0,
        includeCount: f.includePeers?.length ?? 0,
      }));
  }

  async setAutoDelete(chatId: string, period: number): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const resolved = await this.resolvePeer(chatId);
    const peer = await this.client.getInputEntity(resolved);
    await this.client.invoke(new Api.messages.SetHistoryTTL({ peer, period }));
  }

  // ─── Account & privacy ─────────────────────────────────────────────────────

  async getActiveSessions(): Promise<
    Array<{
      hash: string;
      device: string;
      platform: string;
      appName: string;
      appVersion: string;
      ip: string;
      country: string;
      dateActive: string;
      current: boolean;
    }>
  > {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const result = await this.client.invoke(new Api.account.GetAuthorizations());
    return result.authorizations.map((a) => ({
      hash: a.hash.toString(),
      device: a.deviceModel,
      platform: a.platform,
      appName: a.appName,
      appVersion: a.appVersion,
      ip: a.ip,
      country: a.country,
      dateActive: new Date(a.dateActive * 1000).toISOString(),
      current: a.current ?? false,
    }));
  }

  async terminateSession(hash: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    await this.client.invoke(new Api.account.ResetAuthorization({ hash: bigInt(hash) }));
  }

  async terminateAllOtherSessions(): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    await this.client.invoke(new Api.auth.ResetAuthorizations());
  }

  private static PRIVACY_KEYS: Record<string, () => Api.TypeInputPrivacyKey> = {
    phone_number: () => new Api.InputPrivacyKeyPhoneNumber(),
    last_seen: () => new Api.InputPrivacyKeyStatusTimestamp(),
    profile_photo: () => new Api.InputPrivacyKeyProfilePhoto(),
    forwards: () => new Api.InputPrivacyKeyForwards(),
    calls: () => new Api.InputPrivacyKeyPhoneCall(),
    groups: () => new Api.InputPrivacyKeyChatInvite(),
    bio: () => new Api.InputPrivacyKeyAbout(),
  };

  async setPrivacy(
    setting: string,
    rule: "everyone" | "contacts" | "nobody",
    allowUsers?: string[],
    disallowUsers?: string[],
  ): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const keyFactory = TelegramService.PRIVACY_KEYS[setting];
    if (!keyFactory)
      throw new Error(
        `Unknown privacy setting: ${setting}. Valid: ${Object.keys(TelegramService.PRIVACY_KEYS).join(", ")}`,
      );

    const rules: Api.TypeInputPrivacyRule[] = [];

    // Exceptions must come before the general rule so they are not shadowed
    if (disallowUsers?.length) {
      const users: Api.InputUser[] = [];
      const invalid: string[] = [];
      for (const u of disallowUsers) {
        const inputEntity = await this.client.getInputEntity(u);
        if (inputEntity instanceof Api.InputPeerUser) {
          users.push(new Api.InputUser({ userId: inputEntity.userId, accessHash: inputEntity.accessHash }));
        } else {
          invalid.push(u);
        }
      }
      if (invalid.length > 0) {
        throw new Error(`disallowUsers entries are not valid users: ${invalid.join(", ")}`);
      }
      if (users.length > 0) {
        rules.push(new Api.InputPrivacyValueDisallowUsers({ users }));
      }
    }
    if (allowUsers?.length) {
      const users: Api.InputUser[] = [];
      const invalid: string[] = [];
      for (const u of allowUsers) {
        const inputEntity = await this.client.getInputEntity(u);
        if (inputEntity instanceof Api.InputPeerUser) {
          users.push(new Api.InputUser({ userId: inputEntity.userId, accessHash: inputEntity.accessHash }));
        } else {
          invalid.push(u);
        }
      }
      if (invalid.length > 0) {
        throw new Error(`allowUsers entries are not valid users: ${invalid.join(", ")}`);
      }
      if (users.length > 0) {
        rules.push(new Api.InputPrivacyValueAllowUsers({ users }));
      }
    }

    if (rule === "everyone") rules.push(new Api.InputPrivacyValueAllowAll());
    else if (rule === "contacts")
      rules.push(new Api.InputPrivacyValueAllowContacts(), new Api.InputPrivacyValueDisallowAll());
    else rules.push(new Api.InputPrivacyValueDisallowAll());

    await this.client.invoke(new Api.account.SetPrivacy({ key: keyFactory(), rules }));
  }

  async updateProfile(options: { firstName?: string; lastName?: string; bio?: string }): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    await this.client.invoke(
      new Api.account.UpdateProfile({
        firstName: options.firstName,
        lastName: options.lastName,
        about: options.bio,
      }),
    );
  }

  async updateUsername(username: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    await this.client.invoke(new Api.account.UpdateUsername({ username }));
  }

  // ─── Stickers ──────────────────────────────────────────────────────────────

  async getStickerSet(shortName: string): Promise<{
    title: string;
    shortName: string;
    count: number;
    stickers: Array<{
      id: string;
      accessHash: string;
      emoji: string;
    }>;
  }> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const result = await this.client.invoke(
      new Api.messages.GetStickerSet({
        stickerset: new Api.InputStickerSetShortName({ shortName }),
        hash: 0,
      }),
    );
    if (result instanceof Api.messages.StickerSetNotModified) {
      throw new Error("Sticker set was not modified");
    }
    const set = result.set;
    const packs = result.packs;
    // Build emoji map: document id -> emoji
    const emojiMap = new Map<string, string>();
    for (const pack of packs) {
      for (const docId of pack.documents) {
        emojiMap.set(docId.toString(), pack.emoticon);
      }
    }
    return {
      title: set.title,
      shortName: set.shortName,
      count: set.count,
      stickers: result.documents.map((doc) => ({
        id: (doc as Api.Document).id.toString(),
        accessHash: (doc as Api.Document).accessHash.toString(),
        emoji: emojiMap.get((doc as Api.Document).id.toString()) || "",
      })),
    };
  }

  async searchStickerSets(query: string): Promise<
    Array<{
      title: string;
      shortName: string;
      count: number;
    }>
  > {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const result = await this.client.invoke(
      new Api.messages.SearchStickerSets({
        q: query,
        hash: bigInt(0),
      }),
    );
    if (result instanceof Api.messages.FoundStickerSetsNotModified) {
      return [];
    }
    return result.sets.map((covered) => {
      const set = covered.set;
      return {
        title: set.title,
        shortName: set.shortName,
        count: set.count,
      };
    });
  }

  async getInstalledStickerSets(): Promise<
    Array<{
      title: string;
      shortName: string;
      count: number;
    }>
  > {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const result = await this.client.invoke(new Api.messages.GetAllStickers({ hash: bigInt(0) }));
    if (result instanceof Api.messages.AllStickersNotModified) {
      return [];
    }
    return result.sets.map((set) => ({
      title: set.title,
      shortName: set.shortName,
      count: set.count,
    }));
  }

  async sendSticker(
    chatId: string,
    stickerSetShortName: string,
    stickerIndex: number,
    replyTo?: number,
  ): Promise<Api.Message | Api.UpdateShortSentMessage | undefined> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return await this.rateLimiter.execute(async () => {
      if (!Number.isInteger(stickerIndex)) {
        throw new Error(`Sticker index must be an integer, got ${stickerIndex}`);
      }
      // Fetch raw sticker set to get the actual Api.Document with valid fileReference
      const rawResult = await this.client?.invoke(
        new Api.messages.GetStickerSet({
          stickerset: new Api.InputStickerSetShortName({ shortName: stickerSetShortName }),
          hash: 0,
        }),
      );
      if (!rawResult || rawResult instanceof Api.messages.StickerSetNotModified) {
        throw new Error("Sticker set not found");
      }
      const stickerSet = rawResult as Api.messages.StickerSet;
      if (stickerIndex < 0 || stickerIndex >= stickerSet.documents.length) {
        throw new Error(`Sticker index ${stickerIndex} out of range (0-${stickerSet.documents.length - 1})`);
      }
      const sticker = stickerSet.documents[stickerIndex];
      if (!(sticker instanceof Api.Document)) {
        throw new Error("Selected sticker is not a valid document");
      }
      const resolved = await this.resolvePeer(chatId);
      return await this.client?.sendFile(resolved, {
        file: sticker,
        ...(replyTo ? { replyTo } : {}),
      });
    }, `sendSticker to ${chatId}`);
  }

  // ─── Drafts & saved dialogs ────────────────────────────────────────────────

  async saveDraft(chatId: string, text: string, replyTo?: number): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    await this.rateLimiter.execute(async () => {
      const resolved = await this.resolvePeer(chatId);
      const peer = await this.client?.getInputEntity(resolved);
      if (!peer) throw new Error(`Cannot resolve peer for ${chatId}`);
      const effectiveReplyTo = text === "" ? undefined : replyTo;
      await this.client?.invoke(
        new Api.messages.SaveDraft({
          peer,
          message: text,
          ...(effectiveReplyTo ? { replyTo: new Api.InputReplyToMessage({ replyToMsgId: effectiveReplyTo }) } : {}),
        }),
      );
    }, `saveDraft in ${chatId}`);
  }

  async getAllDrafts(): Promise<
    Array<{
      chatId: string;
      chatTitle: string;
      text: string;
      date: string;
    }>
  > {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const result = await this.client?.invoke(new Api.messages.GetAllDrafts());
      if (!result) return [];
      const updates = result instanceof Api.Updates || result instanceof Api.UpdatesCombined ? result.updates : [];
      const users = result instanceof Api.Updates || result instanceof Api.UpdatesCombined ? result.users : [];
      const chats = result instanceof Api.Updates || result instanceof Api.UpdatesCombined ? result.chats : [];

      const userMap = new Map<string, Api.User>();
      for (const u of users) {
        if (u instanceof Api.User) userMap.set(u.id.toString(), u);
      }
      const chatMap = new Map<string, Api.Chat | Api.Channel>();
      for (const c of chats) {
        if (c instanceof Api.Chat || c instanceof Api.Channel) chatMap.set(c.id.toString(), c);
      }

      const resolvePeerTitle = (peer: Api.TypePeer): { id: string; title: string } => {
        if (peer instanceof Api.PeerUser) {
          const user = userMap.get(peer.userId.toString());
          if (user) {
            const parts = [user.firstName, user.lastName].filter(Boolean);
            const name = parts.join(" ") || "Unknown";
            return {
              id: peer.userId.toString(),
              title: user.username ? `${name} (@${user.username})` : name,
            };
          }
          return { id: peer.userId.toString(), title: peer.userId.toString() };
        }
        if (peer instanceof Api.PeerChat) {
          const chat = chatMap.get(peer.chatId.toString());
          return {
            id: peer.chatId.toString(),
            title: chat?.title ?? peer.chatId.toString(),
          };
        }
        if (peer instanceof Api.PeerChannel) {
          const channel = chatMap.get(peer.channelId.toString());
          return {
            id: peer.channelId.toString(),
            title: channel?.title ?? peer.channelId.toString(),
          };
        }
        return { id: "unknown", title: "unknown" };
      };

      const drafts: Array<{ chatId: string; chatTitle: string; text: string; date: string }> = [];
      for (const update of updates) {
        if (update instanceof Api.UpdateDraftMessage && update.draft instanceof Api.DraftMessage) {
          const { id, title } = resolvePeerTitle(update.peer);
          drafts.push({
            chatId: id,
            chatTitle: title,
            text: update.draft.message ?? "",
            date: new Date((update.draft.date ?? 0) * 1000).toISOString(),
          });
        }
      }
      return drafts;
    }, "getAllDrafts");
  }

  async clearAllDrafts(): Promise<void> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    await this.rateLimiter.execute(async () => {
      await this.client?.invoke(new Api.messages.ClearAllDrafts());
    }, "clearAllDrafts");
  }

  async getSavedDialogs(limit: number): Promise<Array<{ peerId: string; peerTitle: string; lastMsgId: number }>> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const result = await this.client?.invoke(
        new Api.messages.GetSavedDialogs({
          offsetDate: 0,
          offsetId: 0,
          offsetPeer: new Api.InputPeerEmpty(),
          limit,
          hash: bigInt(0),
        }),
      );
      if (!result || result instanceof Api.messages.SavedDialogsNotModified) return [];

      const userMap = new Map<string, Api.User>();
      for (const u of result.users) {
        if (u instanceof Api.User) userMap.set(u.id.toString(), u);
      }
      const chatMap = new Map<string, Api.Chat | Api.Channel>();
      for (const c of result.chats) {
        if (c instanceof Api.Chat || c instanceof Api.Channel) chatMap.set(c.id.toString(), c);
      }

      const resolvePeerTitle = (peer: Api.TypePeer): { id: string; title: string } => {
        if (peer instanceof Api.PeerUser) {
          const user = userMap.get(peer.userId.toString());
          if (user) {
            const parts = [user.firstName, user.lastName].filter(Boolean);
            const name = parts.join(" ") || "Unknown";
            return {
              id: peer.userId.toString(),
              title: user.username ? `${name} (@${user.username})` : name,
            };
          }
          return { id: peer.userId.toString(), title: peer.userId.toString() };
        }
        if (peer instanceof Api.PeerChat) {
          const chat = chatMap.get(peer.chatId.toString());
          return { id: peer.chatId.toString(), title: chat?.title ?? peer.chatId.toString() };
        }
        if (peer instanceof Api.PeerChannel) {
          const channel = chatMap.get(peer.channelId.toString());
          return { id: peer.channelId.toString(), title: channel?.title ?? peer.channelId.toString() };
        }
        return { id: "unknown", title: "unknown" };
      };

      const dialogs: Array<{ peerId: string; peerTitle: string; lastMsgId: number }> = [];
      for (const d of result.dialogs) {
        if (d instanceof Api.SavedDialog) {
          const { id, title } = resolvePeerTitle(d.peer);
          dialogs.push({
            peerId: id,
            peerTitle: title,
            lastMsgId: d.topMessage,
          });
        }
      }
      return dialogs;
    }, "getSavedDialogs");
  }

  async getWebPreview(url: string): Promise<{
    type: string;
    url?: string;
    title?: string;
    description?: string;
    siteName?: string;
  } | null> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const result = await this.client?.invoke(new Api.messages.GetWebPagePreview({ message: url }));
      if (!result) return null;
      const media = result.media;
      if (!(media instanceof Api.MessageMediaWebPage)) return null;
      const page = media.webpage;
      if (page instanceof Api.WebPageEmpty) {
        return { type: "empty", url: page.url };
      }
      if (page instanceof Api.WebPagePending) {
        return { type: "pending", url: page.url };
      }
      if (page instanceof Api.WebPage) {
        return {
          type: page.type ?? "article",
          url: page.url,
          title: page.title,
          description: page.description,
          siteName: page.siteName,
        };
      }
      return null;
    }, "getWebPreview");
  }

  async getRecentStickers(): Promise<Array<{ id: string; accessHash: string; emoji: string }>> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const result = await this.client.invoke(new Api.messages.GetRecentStickers({ hash: bigInt(0) }));
    if (result instanceof Api.messages.RecentStickersNotModified) {
      return [];
    }
    const emojiMap = new Map<string, string>();
    for (const pack of result.packs) {
      for (const docId of pack.documents) {
        emojiMap.set(docId.toString(), pack.emoticon);
      }
    }
    return result.stickers.map((doc) => ({
      id: (doc as Api.Document).id.toString(),
      accessHash: (doc as Api.Document).accessHash.toString(),
      emoji: emojiMap.get((doc as Api.Document).id.toString()) || "",
    }));
  }

  // ─── Stories ───────────────────────────────────────────────────────────────

  async getAllStories(options?: { next?: boolean; hidden?: boolean; state?: string }): Promise<AllStoriesSummary> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const response = await this.client?.invoke(
        new Api.stories.GetAllStories({
          next: options?.next,
          hidden: options?.hidden,
          state: options?.state,
        }),
      );
      if (!response) throw new Error("stories.GetAllStories returned nothing");
      return summarizeAllStories(response);
    }, "getAllStories");
  }

  async getPeerStories(chatId: string): Promise<PeerStoriesSummary | null> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const peer = await this.resolvePeer(chatId);
    return this.rateLimiter.execute(async () => {
      const response = await this.client?.invoke(new Api.stories.GetPeerStories({ peer }));
      if (!response) throw new Error("stories.GetPeerStories returned nothing");
      return summarizePeerStories(response.stories);
    }, `getPeerStories ${chatId}`);
  }

  async getStoriesById(chatId: string, ids: number[]): Promise<StoriesByIdSummary> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const peer = await this.resolvePeer(chatId);
    return this.rateLimiter.execute(async () => {
      const response = await this.client?.invoke(new Api.stories.GetStoriesByID({ peer, id: ids }));
      if (!response) throw new Error("stories.GetStoriesByID returned nothing");
      return summarizeStoriesById(response);
    }, `getStoriesById ${chatId}`);
  }

  async getStoryViewsList(
    chatId: string,
    options: {
      id: number;
      q?: string;
      justContacts?: boolean;
      reactionsFirst?: boolean;
      forwardsFirst?: boolean;
      offset?: string;
      limit?: number;
    },
  ): Promise<StoryViewsListSummary> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const peer = await this.resolvePeer(chatId);
    return this.rateLimiter.execute(async () => {
      const response = await this.client?.invoke(
        new Api.stories.GetStoryViewsList({
          peer,
          id: options.id,
          q: options.q,
          justContacts: options.justContacts,
          reactionsFirst: options.reactionsFirst,
          forwardsFirst: options.forwardsFirst,
          offset: options.offset ?? "",
          limit: options.limit ?? 50,
        }),
      );
      if (!response) throw new Error("stories.GetStoryViewsList returned nothing");
      return summarizeStoryViewsList(response);
    }, `getStoryViewsList ${chatId}/${options.id}`);
  }

  // ─── Boosts ────────────────────────────────────────────────────────────────

  async getMyBoosts(): Promise<MyBoostsSummary> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const response = await this.client?.invoke(new Api.premium.GetMyBoosts());
      if (!response) throw new Error("premium.GetMyBoosts returned nothing");
      return summarizeMyBoosts(response);
    }, "getMyBoosts");
  }

  async getBoostsStatus(chatId: string): Promise<BoostsStatusSummary> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const peer = await this.resolvePeer(chatId);
    return this.rateLimiter.execute(async () => {
      const response = await this.client?.invoke(new Api.premium.GetBoostsStatus({ peer }));
      if (!response) throw new Error("premium.GetBoostsStatus returned nothing");
      return summarizeBoostsStatus(response);
    }, `getBoostsStatus ${chatId}`);
  }

  async getBoostsList(
    chatId: string,
    options: { gifts?: boolean; offset?: string; limit?: number } = {},
  ): Promise<BoostsListSummary> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const peer = await this.resolvePeer(chatId);
    return this.rateLimiter.execute(async () => {
      const response = await this.client?.invoke(
        new Api.premium.GetBoostsList({
          peer,
          gifts: options.gifts,
          offset: options.offset ?? "",
          limit: options.limit ?? 50,
        }),
      );
      if (!response) throw new Error("premium.GetBoostsList returned nothing");
      return summarizeBoostsList(response);
    }, `getBoostsList ${chatId}`);
  }

  async getBusinessChatLinks(): Promise<BusinessChatLinksSummary> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const response = await this.client?.invoke(new Api.account.GetBusinessChatLinks());
      if (!response) throw new Error("account.GetBusinessChatLinks returned nothing");
      return summarizeBusinessChatLinks(response);
    }, "getBusinessChatLinks");
  }

  // ─── Group calls ───────────────────────────────────────────────────────────

  async getGroupCall(chatId: string, options: { limit?: number } = {}): Promise<GroupCallSummary> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const call = await this.resolveInputGroupCall(chatId);
      const response = await this.client?.invoke(new Api.phone.GetGroupCall({ call, limit: options.limit ?? 0 }));
      if (!response) throw new Error("phone.GetGroupCall returned nothing");
      return summarizeGroupCall(response);
    }, `getGroupCall ${chatId}`);
  }

  async getGroupCallParticipants(
    chatId: string,
    options: { ids?: string[]; sources?: number[]; offset?: string; limit?: number } = {},
  ): Promise<GroupCallParticipantsSummary> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const call = await this.resolveInputGroupCall(chatId);
      const ids: Api.TypeEntityLike[] = [];
      for (const id of options.ids ?? []) {
        ids.push(await this.resolvePeer(id));
      }
      const response = await this.client?.invoke(
        new Api.phone.GetGroupParticipants({
          call,
          ids,
          sources: options.sources ?? [],
          offset: options.offset ?? "",
          limit: options.limit ?? 100,
        }),
      );
      if (!response) throw new Error("phone.GetGroupParticipants returned nothing");
      return summarizeGroupCallParticipants(response);
    }, `getGroupCallParticipants ${chatId}`);
  }

  // ─── Stars ─────────────────────────────────────────────────────────────────

  async getStarsStatus(chatId: string): Promise<StarsStatusSummary> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const peer = await this.resolvePeer(chatId);
    return this.rateLimiter.execute(async () => {
      const response = await this.client?.invoke(new Api.payments.GetStarsStatus({ peer }));
      if (!response) throw new Error("payments.GetStarsStatus returned nothing");
      return summarizeStarsStatus(response);
    }, `getStarsStatus ${chatId}`);
  }

  async getStarsTransactions(
    chatId: string,
    options: {
      inbound?: boolean;
      outbound?: boolean;
      ascending?: boolean;
      subscriptionId?: string;
      offset?: string;
      limit?: number;
    } = {},
  ): Promise<StarsStatusSummary> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const peer = await this.resolvePeer(chatId);
    return this.rateLimiter.execute(async () => {
      const response = await this.client?.invoke(
        new Api.payments.GetStarsTransactions({
          peer,
          inbound: options.inbound,
          outbound: options.outbound,
          ascending: options.ascending,
          subscriptionId: options.subscriptionId,
          offset: options.offset ?? "",
          limit: options.limit ?? 50,
        }),
      );
      if (!response) throw new Error("payments.GetStarsTransactions returned nothing");
      return summarizeStarsStatus(response);
    }, `getStarsTransactions ${chatId}`);
  }

  // ─── Quick replies ─────────────────────────────────────────────────────────

  async getQuickReplies(hash?: string): Promise<QuickRepliesSummary> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const response = await this.client?.invoke(
        new Api.messages.GetQuickReplies({ hash: hash ? bigInt(hash) : bigInt(0) }),
      );
      if (!response) throw new Error("messages.GetQuickReplies returned nothing");
      return summarizeQuickReplies(response);
    }, "getQuickReplies");
  }

  async getQuickReplyMessages(
    shortcutId: number,
    options: { ids?: number[]; hash?: string } = {},
  ): Promise<QuickReplyMessagesSummary> {
    if (!this.client || !this.connected) throw new Error(NOT_CONNECTED_ERROR);
    return this.rateLimiter.execute(async () => {
      const response = await this.client?.invoke(
        new Api.messages.GetQuickReplyMessages({
          shortcutId,
          id: options.ids,
          hash: options.hash ? bigInt(options.hash) : bigInt(0),
        }),
      );
      if (!response) throw new Error("messages.GetQuickReplyMessages returned nothing");
      return summarizeQuickReplyMessages(response);
    }, `getQuickReplyMessages ${shortcutId}`);
  }

  private async resolveInputGroupCall(chatId: string): Promise<Api.TypeInputGroupCall> {
    const entity = await this.resolveChat(chatId);
    let call: Api.TypeInputGroupCall | undefined;
    if (entity instanceof Api.Channel) {
      const full = await this.client?.invoke(new Api.channels.GetFullChannel({ channel: entity }));
      if (full?.fullChat instanceof Api.ChannelFull) {
        call = full.fullChat.call;
      }
    } else if (entity instanceof Api.Chat) {
      const full = await this.client?.invoke(new Api.messages.GetFullChat({ chatId: entity.id }));
      if (full?.fullChat instanceof Api.ChatFull) {
        call = full.fullChat.call;
      }
    } else {
      throw new Error("Group calls are only available for groups/supergroups/channels");
    }
    if (!call) {
      throw new Error(`No active group call in chat ${chatId}`);
    }
    return call;
  }
}
