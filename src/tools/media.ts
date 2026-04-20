import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import { fail, ok, READ_ONLY, requireConnection, sanitize, WRITE } from "./shared.js";

export function registerMediaTools(server: McpServer, telegram: TelegramService) {
  server.registerTool(
    "telegram-send-file",
    {
      description: "Send a file (photo, document, video, etc.) to a Telegram chat",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        filePath: z.string().describe("Absolute path to file"),
        caption: z.string().optional().describe("File caption"),
      },
      annotations: WRITE,
    },
    async ({ chatId, filePath, caption }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.sendFile(chatId, filePath, caption);
        return ok(`File sent to ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-download-media",
    {
      description: "Download media from a Telegram message to a local file",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        messageId: z.number().describe("Message ID containing media"),
        downloadPath: z.string().describe("Absolute path to save file"),
      },
      annotations: READ_ONLY,
    },
    async ({ chatId, messageId, downloadPath }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const path = await telegram.downloadMedia(chatId, messageId, downloadPath);
        return ok(`Media downloaded to ${path}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-profile-photo",
    {
      description:
        "Download profile photo of a Telegram user, group, or channel. Returns inline image or saves to file",
      inputSchema: {
        entityId: z.string().describe("User/Chat/Channel ID or username"),
        savePath: z.string().optional().describe("Absolute path to save file. If omitted, returns inline base64 image"),
        size: z
          .enum(["small", "big"])
          .optional()
          .describe("Photo size: 'small' (160x160) or 'big' (640x640). Default: big"),
      },
      annotations: READ_ONLY,
    },
    async ({ entityId, savePath, size }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const result = await telegram.downloadProfilePhoto(entityId, {
          isBig: size !== "small",
          savePath,
        });

        if (!result) {
          return ok("No profile photo found");
        }

        if ("filePath" in result) {
          return ok(`Downloaded to: ${result.filePath}`);
        }

        return {
          content: [
            { type: "image" as const, data: result.buffer.toString("base64"), mimeType: result.mimeType },
            {
              type: "text" as const,
              text: `Profile photo (${(result.buffer.length / 1024).toFixed(0)} KB, ${result.mimeType})`,
            },
          ],
        };
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-web-preview",
    {
      description: "Fetch Telegram's web-page preview metadata (type, title, description, site name) for a URL",
      inputSchema: {
        url: z
          .string()
          .url()
          .refine((u) => {
            try {
              const p = new URL(u);
              if (p.protocol !== "http:" && p.protocol !== "https:") return false;
              const host = p.hostname
                .toLowerCase()
                .replace(/^\[|\]$/g, "")
                .replace(/\.$/, "");
              if (
                host === "localhost" ||
                // Trailing-dot and subdomain forms of localhost (e.g. "localhost.", "foo.localhost")
                host.endsWith(".localhost") ||
                // Unspecified: 0.0.0.0/8
                /^0\./.test(host) ||
                // IPv4 loopback
                /^127\./.test(host) ||
                // IPv6 loopback and unspecified address
                host === "::1" ||
                host === "::" ||
                // Link-local (AWS metadata, etc.)
                /^169\.254\./.test(host) ||
                // RFC1918 private ranges
                /^10\./.test(host) ||
                /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
                /^192\.168\./.test(host) ||
                // IETF Protocol Assignments: 192.0.0.0/24
                /^192\.0\.0\./.test(host) ||
                // Documentation ranges (TEST-NET-1/2/3, RFC 5737): 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24
                /^192\.0\.2\./.test(host) ||
                /^198\.51\.100\./.test(host) ||
                /^203\.0\.113\./.test(host) ||
                // CGNAT (RFC 6598): 100.64.0.0/10
                /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) ||
                // Benchmark testing (RFC 2544): 198.18.0.0/15
                /^198\.1[89]\./.test(host) ||
                // IPv4 multicast: 224.0.0.0/4
                /^2(2[4-9]|3\d)\./.test(host) ||
                // Reserved (future use): 240.0.0.0/4 and broadcast
                /^(24[0-9]|25[0-5])\./.test(host)
              ) {
                return false;
              }
              // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or Node-normalized ::ffff:7f00:1)
              if (/^::ffff:/i.test(host)) {
                let v4 = host.replace(/^::ffff:/i, "");
                // Node.js normalizes ::ffff:a.b.c.d to ::ffff:XXYY:ZZWW (hex pairs).
                // Convert hex-pair form back to dotted decimal before range checks.
                const hexPair = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(v4);
                if (hexPair) {
                  const hi = hexPair[1].padStart(4, "0");
                  const lo = hexPair[2].padStart(4, "0");
                  v4 = [
                    parseInt(hi.slice(0, 2), 16),
                    parseInt(hi.slice(2, 4), 16),
                    parseInt(lo.slice(0, 2), 16),
                    parseInt(lo.slice(2, 4), 16),
                  ].join(".");
                }
                if (
                  /^0\./.test(v4) ||
                  /^127\./.test(v4) ||
                  /^10\./.test(v4) ||
                  /^172\.(1[6-9]|2\d|3[01])\./.test(v4) ||
                  /^192\.168\./.test(v4) ||
                  /^192\.0\.0\./.test(v4) ||
                  /^192\.0\.2\./.test(v4) ||
                  /^198\.51\.100\./.test(v4) ||
                  /^203\.0\.113\./.test(v4) ||
                  /^169\.254\./.test(v4) ||
                  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(v4) ||
                  /^198\.1[89]\./.test(v4) ||
                  /^2(2[4-9]|3\d)\./.test(v4) ||
                  /^(24[0-9]|25[0-5])\./.test(v4)
                ) {
                  return false;
                }
              }
              // Private IPv6: ULA fc00::/7, link-local fe80::/10, multicast ff00::/8, documentation 2001:db8::/32
              if (
                /^f[cd][0-9a-f]/i.test(host) ||
                /^fe[89ab][0-9a-f]/i.test(host) ||
                /^ff[0-9a-f]{2}/i.test(host) ||
                /^2001:0?db8:/i.test(host)
              ) {
                return false;
              }
              return true;
            } catch {
              return false;
            }
          }, "Only http:// and https:// URLs are allowed; literal loopback, private, link-local, and reserved IP addresses are blocked (DNS-backed hostnames that resolve to private ranges are not checked)")
          .describe("URL to preview (http:// or https://; literal private/loopback/reserved IPs rejected)"),
      },
      annotations: READ_ONLY,
    },
    async ({ url }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const preview = await telegram.getWebPreview(url);
        if (!preview) return ok("No preview available");
        const lines = [`type: ${preview.type}`];
        if (preview.url) lines.push(`url: ${preview.url}`);
        if (preview.siteName) lines.push(`site: ${sanitize(preview.siteName)}`);
        if (preview.title) lines.push(`title: ${sanitize(preview.title)}`);
        if (preview.description) lines.push(`description: ${sanitize(preview.description)}`);
        return ok(lines.join("\n"));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
