import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import { fail, ok, READ_ONLY, requireConnection, WRITE } from "./shared.js";

export function registerTranscribeTools(server: McpServer, telegram: TelegramService) {
  server.registerTool(
    "telegram-transcribe-audio",
    {
      description:
        "Request server-side transcription of a voice note or video note (Telegram Premium feature). Returns immediately with transcriptionId — if pending:true, call telegram-get-transcription to poll for completion.",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        messageId: z.number().int().positive().describe("Message ID of the voice or video note"),
      },
      annotations: WRITE,
    },
    async ({ chatId, messageId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.transcribeAudio(chatId, messageId);
        const trialInfo =
          result.trialRemainsNum !== undefined
            ? `\nTrial remaining: ${result.trialRemainsNum} free transcription(s)`
            : "";
        if (result.pending) {
          return ok(
            `Transcription started for message #${messageId}\nTranscriptionId: ${result.transcriptionId}\nStatus: pending${trialInfo}`,
          );
        }
        return ok(
          `Transcription for message #${messageId}:\nTranscriptionId: ${result.transcriptionId}\nStatus: complete\n\n${result.text}`,
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-transcription",
    {
      description:
        "Poll for updated transcription result. Calls the same endpoint as telegram-transcribe-audio — Telegram guarantees idempotency (returns same transcriptionId with updated text once processing completes).",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        messageId: z.number().int().positive().describe("Message ID of the voice or video note"),
      },
      annotations: READ_ONLY,
    },
    async ({ chatId, messageId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.transcribeAudio(chatId, messageId);
        const trialInfo =
          result.trialRemainsNum !== undefined
            ? `\nTrial remaining: ${result.trialRemainsNum} free transcription(s)`
            : "";
        if (result.pending) {
          return ok(
            `Transcription started for message #${messageId}\nTranscriptionId: ${result.transcriptionId}\nStatus: pending${trialInfo}`,
          );
        }
        return ok(
          `Transcription for message #${messageId}:\nTranscriptionId: ${result.transcriptionId}\nStatus: complete\n\n${result.text}`,
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-rate-transcription",
    {
      description: "Rate transcription quality (good/poor) to improve Telegram speech-to-text.",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        messageId: z.number().int().positive().describe("Message ID of the voice or video note"),
        transcriptionId: z.string().describe("Transcription ID returned by telegram-transcribe-audio"),
        good: z.boolean().describe("true = good quality, false = poor quality"),
      },
      annotations: WRITE,
    },
    async ({ chatId, messageId, transcriptionId, good }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        await telegram.rateTranscription(chatId, messageId, transcriptionId, good);
        return ok(`Rated transcription ${transcriptionId} for message #${messageId} as ${good ? "good" : "poor"}`);
      } catch (e) {
        return fail(e);
      }
    },
  );
}
