import { existsSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type bigInt from "big-integer";
import QRCode from "qrcode";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { Api } from "telegram/tl/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = join(__dirname, "..", ".telegram-session");

export class TelegramService {
  private client: TelegramClient | null = null;
  private apiId: number;
  private apiHash: string;
  private sessionString = "";
  private connected = false;
  lastError = "";

  constructor(apiId: number, apiHash: string) {
    this.apiId = apiId;
    this.apiHash = apiHash;
  }

  async loadSession(): Promise<boolean> {
    if (existsSync(SESSION_FILE)) {
      this.sessionString = (await readFile(SESSION_FILE, "utf-8")).trim();
      return true;
    }
    return false;
  }

  private async saveSession(session: string): Promise<void> {
    this.sessionString = session;
    await writeFile(SESSION_FILE, session, "utf-8");
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
    if (existsSync(SESSION_FILE)) {
      await unlink(SESSION_FILE);
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
      await this.client.disconnect();
      this.connected = false;
      this.client = null;
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
        await client.disconnect();
        await this.saveSession(newSession);
        // Reconnect with new session
        this.sessionString = newSession;
        await this.connect();
        return { success: true, message: "Telegram login successful" };
      }

      await client.disconnect();
      return { success: false, message: "QR login timeout" };
    } catch (err: unknown) {
      try {
        await client.disconnect();
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

  async sendMessage(chatId: string, text: string, replyTo?: number): Promise<void> {
    if (!this.client || !this.connected) throw new Error("Not connected");
    await this.client.sendMessage(chatId, {
      message: text,
      ...(replyTo ? { replyTo } : {}),
    });
  }

  async getDialogs(limit = 20): Promise<
    Array<{
      id: string;
      name: string;
      type: string;
      unreadCount: number;
    }>
  > {
    if (!this.client || !this.connected) throw new Error("Not connected");
    const dialogs = await this.client.getDialogs({ limit });
    return dialogs.map((d) => ({
      id: d.id?.toString() ?? "",
      name: d.title ?? d.name ?? "Unknown",
      type: d.isGroup ? "group" : d.isChannel ? "channel" : "private",
      unreadCount: d.unreadCount,
    }));
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
  ): Promise<
    Array<{
      id: number;
      text: string;
      sender: string;
      date: string;
    }>
  > {
    if (!this.client || !this.connected) throw new Error("Not connected");
    const messages = await this.client.getMessages(chatId, { limit });
    const results = await Promise.all(
      messages.map(async (m) => ({
        id: m.id,
        text: m.message ?? "",
        sender: await this.resolveSenderName(m.senderId),
        date: new Date((m.date ?? 0) * 1000).toISOString(),
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
  ): Promise<
    Array<{
      id: number;
      text: string;
      sender: string;
      date: string;
    }>
  > {
    if (!this.client || !this.connected) throw new Error("Not connected");
    const messages = await this.client.getMessages(chatId, {
      search: query,
      limit,
    });
    const results = await Promise.all(
      messages.map(async (m) => ({
        id: m.id,
        text: m.message ?? "",
        sender: await this.resolveSenderName(m.senderId),
        date: new Date((m.date ?? 0) * 1000).toISOString(),
      })),
    );
    return results;
  }
}
