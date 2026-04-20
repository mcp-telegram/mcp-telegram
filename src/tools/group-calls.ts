import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import { fail, ok, READ_ONLY, requireConnection, sanitize } from "./shared.js";

export function isGroupCallsEnabled(): boolean {
  return process.env.MCP_TELEGRAM_ENABLE_GROUP_CALLS === "1";
}

export function registerGroupCallTools(server: McpServer, telegram: TelegramService) {
  if (!isGroupCallsEnabled()) return;

  server.registerTool(
    "telegram-get-group-call",
    {
      description:
        "Fetch metadata + an optional initial slice of participants for the active group call (voice/video chat) attached to a chat (phone.GetGroupCall). Returns call info (id, accessHash, participantsCount, title, scheduleDate, recordStartDate, streamDcId, flags) plus a participant slice (peer, date, muted/left/self flags, source, volume, video/presentation indicators) and participantsNextOffset. Pass limit:0 (default) for metadata only. Opt-in: register only when MCP_TELEGRAM_ENABLE_GROUP_CALLS=1. Read-only.",
      inputSchema: {
        chat: z
          .string()
          .describe(
            "Group/supergroup/channel that currently has an active group call — id, @username, or display name fragment",
          ),
        limit: z
          .number()
          .int()
          .min(0)
          .max(500)
          .optional()
          .describe(
            "Max participants to include (default 0 — metadata only; use telegram-get-group-call-participants for pagination)",
          ),
      },
      annotations: READ_ONLY,
    },
    async ({ chat, limit }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.getGroupCall(chat, { limit });
        return ok(sanitize(JSON.stringify(result)));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-group-call-participants",
    {
      description:
        "List participants of the active group call (voice/video chat) attached to a chat with pagination (phone.GetGroupParticipants). Looks up the chat's current InputGroupCall automatically, then returns {count, participants[], nextOffset?, version}. Each participant includes peer, date, source, volume, muted/self/left/videoJoined flags, raise-hand rating, about text, and hasVideo/hasPresentation indicators. Pass offset from a prior call's nextOffset to paginate; pass ids (user/channel peers) or sources to filter to specific participants. Opt-in: register only when MCP_TELEGRAM_ENABLE_GROUP_CALLS=1. Read-only.",
      inputSchema: {
        chat: z
          .string()
          .describe(
            "Group/supergroup/channel that currently has an active group call — id, @username, or display name fragment",
          ),
        ids: z
          .array(z.string())
          .max(100)
          .optional()
          .describe("Optional list of participant peer ids/@usernames to filter (max 100)"),
        sources: z
          .array(z.number().int())
          .max(100)
          .optional()
          .describe("Optional list of numeric source ids (audio SSRC) to filter participants"),
        offset: z
          .string()
          .optional()
          .describe("Pagination cursor from a previous response's nextOffset; omit for the first page"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe("Max participants to return in this page (default 100)"),
      },
      annotations: READ_ONLY,
    },
    async ({ chat, ids, sources, offset, limit }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.getGroupCallParticipants(chat, { ids, sources, offset, limit });
        return ok(sanitize(JSON.stringify(result)));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
