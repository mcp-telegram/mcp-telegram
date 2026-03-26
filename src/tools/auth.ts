import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TelegramService } from "../telegram-client.js";
import { fail, ok, READ_ONLY, WRITE } from "./shared.js";

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

      const loginPromise = telegram.startQrLogin(
        (dataUrl) => {
          qrDataUrl = dataUrl;
        },
      );

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

      // Return as MCP image content + text with fallback options
      const base64 = qrDataUrl.replace(/^data:image\/png;base64,/, "");

      // Save QR to session dir as fallback for clients that can't display inline images
      const qrTempPath = join(telegram.sessionDir, "qr-login.png");
      writeFileSync(qrTempPath, Buffer.from(base64, "base64"));

      const instructions = [
        "Scan this QR code in Telegram: **Settings → Devices → Link Desktop Device**.",
        "",
        `If the QR image is not visible, open the file: ${qrTempPath}`,
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
}
