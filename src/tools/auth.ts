import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TelegramService } from "../telegram-client.js";
import { DESTRUCTIVE, fail, ok, READ_ONLY, WRITE } from "./shared.js";

export function registerAuthTools(server: McpServer, telegram: TelegramService) {
  server.registerTool(
    "telegram-status",
    { description: "Check Telegram connection status", annotations: READ_ONLY },
    async () => {
      if (await telegram.ensureConnected()) {
        try {
          const me = await telegram.getMe();
          return ok(`Connected as ${me.firstName ?? ""} (@${me.username ?? "unknown"}, id: ${me.id})`);
        } catch {
          return ok("Connected, but failed to get user info");
        }
      }

      const reason = telegram.lastError ? ` Reason: ${telegram.lastError}` : "";
      return ok(`Not connected.${reason} Use telegram-login to authenticate via QR code.`);
    },
  );

  server.registerTool(
    "telegram-login",
    {
      description:
        "Login to Telegram via QR code. Returns QR image. IMPORTANT: pass the entire result to user without modifications.",
      annotations: WRITE,
    },
    async () => {
      let qrDataUrl = "";

      const loginPromise = telegram.startQrLogin((dataUrl) => {
        qrDataUrl = dataUrl;
      });

      // Wait for first QR to be generated
      const startTime = Date.now();
      while (!qrDataUrl && Date.now() - startTime < 15000) {
        await new Promise((r) => setTimeout(r, 500));
      }

      if (!qrDataUrl) {
        return fail(new Error("Failed to generate QR code"));
      }

      // Login continues in background
      loginPromise.then((result) => {
        if (result.success) {
          console.error("[mcp-telegram] Login successful");
        } else {
          console.error(`[mcp-telegram] Login failed: ${result.message}`);
        }
      });

      // Save QR to file as fallback (no data sent to third-party services)
      const base64 = qrDataUrl.replace(/^data:image\/png;base64,/, "");
      const qrFilePath = join(telegram.sessionDir, "qr-login.png");
      await writeFile(qrFilePath, Buffer.from(base64, "base64")).catch(() => {});

      const instructions = [
        "Scan this QR code in Telegram: **Settings → Devices → Link Desktop Device**.",
        "",
        `If the QR image is not visible, it's also saved to: ${qrFilePath}`,
        "",
        "After scanning, run **telegram-status** to verify the connection.",
      ].join("\n");

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

  server.registerTool(
    "telegram-logout",
    {
      description:
        "Log out from Telegram completely. Revokes the session on Telegram servers (removes it from Settings → Devices), deletes the local session file, and disconnects. After this you must run telegram-login to re-authenticate.",
      annotations: DESTRUCTIVE,
    },
    async () => {
      const wasConnected = await telegram.ensureConnected();

      if (!wasConnected && !telegram.hasLocalSession()) {
        return fail(new Error("Not logged in. Nothing to log out from."));
      }

      try {
        const revoked = await telegram.logOut();
        if (!wasConnected) {
          return ok("Local session removed (was already disconnected). Server-side revoke was not performed.");
        }
        if (revoked) {
          return ok("Logged out. Session revoked on Telegram servers and removed locally.");
        }
        return fail(
          new Error(
            "Local session removed, but server-side revoke could not be confirmed. Open 'Settings → Devices' in Telegram and terminate the session manually if it is still listed.",
          ),
        );
      } catch (err) {
        // Local file removal failed (read-only FS, permission denied, etc.).
        // Never claim local cleanup succeeded when the file may still be on disk.
        return fail(
          new Error(
            `Failed to remove local session file: ${err instanceof Error ? err.message : String(err)}. ` +
              `Delete it manually (check telegram-status for the path).`,
          ),
        );
      }
    },
  );
}
