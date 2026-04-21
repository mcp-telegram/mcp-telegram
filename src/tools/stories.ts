import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import { fail, ok, READ_ONLY, requireConnection } from "./shared.js";

export function registerStoryTools(server: McpServer, telegram: TelegramService) {
  server.registerTool(
    "telegram-get-all-stories",
    {
      description:
        "Fetch active stories from contacts/channels the user follows. Pagination via 'next' + 'state' — pass the returned state back on the next call with next:true to load more. Use hidden:true to read stories from muted/archived peers. Returns compact story metadata (id, date, expireDate, caption, mediaType, counters) without raw media blobs.",
      inputSchema: {
        next: z.boolean().optional().describe("Load the next page (use with state from a prior response)"),
        hidden: z.boolean().optional().describe("Fetch stories from hidden/archived peers instead of the main feed"),
        state: z.string().optional().describe("Pagination state token returned by a previous call"),
      },
      annotations: READ_ONLY,
    },
    async ({ next, hidden, state }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      if (next === true && !state) {
        return fail(
          new Error(
            "'state' is required when 'next' is true — use the state token from a prior telegram-get-all-stories response",
          ),
        );
      }
      try {
        const result = await telegram.getAllStories({ next, hidden, state });
        return ok(JSON.stringify(result));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-peer-stories",
    {
      description:
        "Fetch currently active stories posted by a specific peer (user/channel). Returns compact story metadata (id, date, expireDate, caption, mediaType, counters) with media type className only — no raw media blobs. Use telegram-download-media with the story id if you need media bytes.",
      inputSchema: {
        chat: z
          .string()
          .describe("Peer to fetch stories from — user/channel id, @username, phone, or display name fragment"),
      },
      annotations: READ_ONLY,
    },
    async ({ chat }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.getPeerStories(chat);
        if (result === null) return ok("No active stories found for the specified peer");
        return ok(JSON.stringify(result));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-stories-by-id",
    {
      description:
        "Fetch specific stories from a peer by their numeric IDs. Useful for retrieving archived/pinned stories outside the active feed. Returns compact story metadata and optional pinnedToTop list. Pass up to ~100 ids per request.",
      inputSchema: {
        chat: z
          .string()
          .describe("Peer to fetch stories from — user/channel id, @username, phone, or display name fragment"),
        ids: z.array(z.number().int().positive()).min(1).max(100).describe("Story IDs to fetch (1–100 per request)"),
      },
      annotations: READ_ONLY,
    },
    async ({ chat, ids }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.getStoriesById(chat, ids);
        return ok(JSON.stringify(result));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-story-views",
    {
      description:
        "List viewers of one of YOUR stories (stories.GetStoryViewsList). Returns per-viewer entries (user id, view date, their reaction emoji if any), plus totals (viewsCount, forwardsCount, reactionsCount) and nextOffset for pagination. Pass your own user id (numeric) or @username as the peer — this only works for stories you posted. Some accounts (non-Premium, old stories) may not get a full viewer list — a Premium hint is surfaced on typical errors.",
      inputSchema: {
        chat: z.string().describe("Peer owning the story — usually 'me' or your own user id/@username"),
        storyId: z.number().int().positive().describe("Story ID to fetch viewers for"),
        q: z.string().optional().describe("Filter viewers by name substring"),
        justContacts: z.boolean().optional().describe("Return only contacts"),
        reactionsFirst: z.boolean().optional().describe("Sort viewers who reacted first"),
        forwardsFirst: z.boolean().optional().describe("Sort forwards/reposts first"),
        offset: z.string().optional().describe("Pagination offset from a previous response's nextOffset"),
        limit: z.number().int().min(1).max(100).optional().describe("Max viewers to return (default 50, max 100)"),
      },
      annotations: READ_ONLY,
    },
    async ({ chat, storyId, q, justContacts, reactionsFirst, forwardsFirst, offset, limit }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.getStoryViewsList(chat, {
          id: storyId,
          q,
          justContacts,
          reactionsFirst,
          forwardsFirst,
          offset,
          limit,
        });
        return ok(JSON.stringify(result));
      } catch (e) {
        const msg = (e as Error).message ?? "";
        if (/PREMIUM|PAYMENT_REQUIRED/i.test(msg)) {
          return fail(new Error("story view stats may require Telegram Premium"));
        }
        return fail(e);
      }
    },
  );
}
