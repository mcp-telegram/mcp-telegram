import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import { fail, ok, READ_ONLY, requireConnection, WRITE } from "./shared.js";

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
}
