import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import { DESTRUCTIVE, fail, ok, READ_ONLY, requireConnection, sanitizeInputText, WRITE } from "./shared.js";

export function registerFactCheckTools(server: McpServer, telegram: TelegramService) {
  server.registerTool(
    "telegram-get-fact-check",
    {
      description:
        "Get fact-check annotations on channel messages. Fact-checks are added by independent fact-checkers in supported countries. Most messages will show no fact-check.",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username (channel)"),
        messageIds: z
          .array(z.number().int().positive())
          .min(1)
          .max(100)
          .describe("Message IDs to get fact-checks for (1-100)"),
      },
      annotations: READ_ONLY,
    },
    async ({ chatId, messageIds }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.getFactCheck(chatId, messageIds);
        return ok(JSON.stringify(result));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-edit-fact-check",
    {
      description:
        "Add or update a fact-check annotation. Requires fact-checker privileges (limited to independent verifiers in supported countries).",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username (channel)"),
        messageId: z.number().int().positive().describe("Message ID to annotate"),
        text: z
          .string()
          .transform(sanitizeInputText)
          .pipe(z.string().min(1).max(1024))
          .describe("Fact-check annotation text (1-1024 chars)"),
        parseMode: z.enum(["md", "html"]).optional().describe("Text format (currently ignored — plain text only)"),
      },
      annotations: WRITE,
    },
    async ({ chatId, messageId, text, parseMode }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        await telegram.editFactCheck(chatId, messageId, text, { parseMode });
        const preview = `${text.slice(0, 80)}${text.length > 80 ? "..." : ""}`;
        return ok(`Fact-check set on message #${messageId} in ${chatId}: "${preview}"`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-delete-fact-check",
    {
      description: "Remove a fact-check annotation. Requires fact-checker privileges.",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username (channel)"),
        messageId: z.number().int().positive().describe("Message ID whose fact-check to remove"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ chatId, messageId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        await telegram.deleteFactCheck(chatId, messageId);
        return ok(`Removed fact-check from message #${messageId} in ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );
}
