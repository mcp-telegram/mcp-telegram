import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import {
  ABSOLUTE_PATH_ERROR,
  DESTRUCTIVE,
  fail,
  isSafeAbsolutePath,
  ok,
  READ_ONLY,
  requireConnection,
  sanitizeInputText,
  WRITE,
} from "./shared.js";

const absolutePath = z.string().refine(isSafeAbsolutePath, { message: ABSOLUTE_PATH_ERROR });
const safeText = z.string().transform(sanitizeInputText);

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

  server.registerTool(
    "telegram-send-story",
    {
      description:
        "Publish a new story (photo or video) to your profile or a channel you manage. Privacy: everyone/contacts/close_friends/selected (allowUserIds required for 'selected'). MediaAreas not supported in this version.",
      inputSchema: {
        chatId: z.string().default("me").describe("Peer to post the story to — 'me', @username, or numeric ID"),
        filePath: absolutePath.describe("Absolute path to the photo or video file to upload"),
        type: z.enum(["photo", "video"]).optional().describe("Override auto-detected media type"),
        caption: safeText.pipe(z.string().max(2048)).optional().describe("Story caption (max 2048 chars)"),
        parseMode: z.enum(["md", "html"]).optional().describe("Caption parse mode: md or html"),
        privacy: z
          .enum(["everyone", "contacts", "close_friends", "selected"])
          .default("everyone")
          .describe("Who can see the story"),
        allowUserIds: z
          .array(z.string().regex(/^\d{1,19}$/, "must be a numeric Telegram user ID"))
          .optional()
          .describe("Required when privacy='selected': numeric user IDs allowed to see the story"),
        disallowUserIds: z
          .array(z.string().regex(/^\d{1,19}$/, "must be a numeric Telegram user ID"))
          .optional()
          .describe("User IDs explicitly blocked from seeing the story (ignored for privacy='selected')"),
        period: z
          .union([z.literal(21600), z.literal(43200), z.literal(86400), z.literal(172800)])
          .optional()
          .describe("Story lifetime in seconds: 21600=6h, 43200=12h, 86400=24h (default), 172800=48h"),
        pinned: z.boolean().optional().describe("Keep the story in the profile highlights after expiry"),
        noforwards: z.boolean().optional().describe("Prevent others from forwarding or saving the story"),
      },
      annotations: WRITE,
    },
    async ({
      chatId,
      filePath,
      type,
      caption,
      parseMode,
      privacy,
      allowUserIds,
      disallowUserIds,
      period,
      pinned,
      noforwards,
    }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      if (privacy === "selected" && !allowUserIds?.length) {
        return fail(new Error("privacy='selected' requires at least one user ID in allowUserIds"));
      }
      try {
        const result = await telegram.sendStory(chatId, filePath, {
          type,
          caption,
          parseMode,
          privacy,
          allowUserIds,
          disallowUserIds,
          period,
          pinned,
          noforwards,
        });
        const idInfo = result.id ? ` [#${result.id}]` : "";
        return ok(`Story published to ${chatId}${idInfo} (expires in ${result.period}s)`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-edit-story",
    {
      description: "Edit an existing story: replace media, update caption ('' clears it), or change privacy rules.",
      inputSchema: {
        chatId: z.string().default("me").describe("Peer owning the story"),
        storyId: z.number().int().positive().describe("ID of the story to edit"),
        filePath: absolutePath.optional().describe("Absolute path to replacement media"),
        type: z.enum(["photo", "video"]).optional().describe("Override auto-detected media type for new file"),
        caption: safeText.pipe(z.string().max(2048)).optional().describe("New caption; pass '' to clear"),
        parseMode: z.enum(["md", "html"]).optional().describe("Caption parse mode"),
        privacy: z
          .enum(["everyone", "contacts", "close_friends", "selected"])
          .optional()
          .describe("New privacy setting"),
        allowUserIds: z
          .array(z.string().regex(/^\d{1,19}$/, "must be a numeric Telegram user ID"))
          .optional()
          .describe("Required when privacy='selected'"),
        disallowUserIds: z
          .array(z.string().regex(/^\d{1,19}$/, "must be a numeric Telegram user ID"))
          .optional()
          .describe("Blocked user IDs (ignored for 'selected')"),
      },
      annotations: WRITE,
    },
    async ({ chatId, storyId, filePath, type, caption, parseMode, privacy, allowUserIds, disallowUserIds }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      if (filePath === undefined && caption === undefined && privacy === undefined) {
        return fail(new Error("At least one field (filePath, caption, or privacy) must be provided"));
      }
      if (privacy === "selected" && !allowUserIds?.length) {
        return fail(new Error("privacy='selected' requires at least one user ID in allowUserIds"));
      }
      try {
        const result = await telegram.editStory(chatId, storyId, {
          filePath,
          type,
          caption,
          parseMode,
          privacy,
          allowUserIds,
          disallowUserIds,
        });
        return ok(`Story #${storyId} edited (${result.changed.join(", ")})`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-delete-stories",
    {
      description: "Delete one or more of your own stories. This action is irreversible and requires confirm:true.",
      inputSchema: {
        chatId: z.string().default("me").describe("Peer owning the stories"),
        ids: z.array(z.number().int().positive()).min(1).max(100).describe("Story IDs to delete (1–100 per request)"),
        confirm: z.literal(true).describe("Pass true to confirm irreversible deletion"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ chatId, ids, confirm: _confirm }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.deleteStories(chatId, ids);
        const { deleted } = result;
        return ok(`Deleted ${deleted.length} stor${deleted.length === 1 ? "y" : "ies"}: [${deleted.join(", ")}]`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-react-to-story",
    {
      description: "React to a story with an emoji, or remove the current reaction by passing ''.",
      inputSchema: {
        chatId: z.string().describe("Peer who posted the story"),
        storyId: z.number().int().positive().describe("Story ID to react to"),
        emoji: z.string().max(8).describe("Reaction emoji. Empty string '' removes the reaction."),
        addToRecent: z.boolean().optional().describe("Add emoji to your recently used reactions"),
      },
      annotations: WRITE,
    },
    async ({ chatId, storyId, emoji, addToRecent }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        await telegram.sendStoryReaction(chatId, storyId, emoji, addToRecent);
        return ok(emoji === "" ? `Removed reaction from story #${storyId}` : `Reacted ${emoji} to story #${storyId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-export-story-link",
    {
      description: "Get a shareable t.me/… URL for a public story.",
      inputSchema: {
        chatId: z.string().describe("Peer who posted the story"),
        storyId: z.number().int().positive().describe("Story ID to get the link for"),
      },
      annotations: READ_ONLY,
    },
    async ({ chatId, storyId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.exportStoryLink(chatId, storyId);
        return ok(result.link);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-read-stories",
    {
      description: "Mark stories as seen up to a given story ID (maxId, inclusive).",
      inputSchema: {
        chatId: z.string().describe("Peer whose stories to mark as seen"),
        maxId: z.number().int().positive().describe("Stories up to and including this ID will be marked seen"),
      },
      annotations: WRITE,
    },
    async ({ chatId, maxId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.readStories(chatId, maxId);
        return ok(`Marked stories as read up to #${maxId} (${result.ids.length} newly seen)`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-toggle-story-pinned",
    {
      description: "Pin or unpin stories in your profile highlights (Telegram allows up to 3 pinned stories).",
      inputSchema: {
        chatId: z.string().default("me").describe("Peer owning the stories"),
        ids: z.array(z.number().int().positive()).min(1).max(100).describe("Story IDs to pin or unpin"),
        pinned: z.boolean().describe("true to pin, false to unpin"),
      },
      annotations: WRITE,
    },
    async ({ chatId, ids, pinned }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.toggleStoryPinned(chatId, ids, pinned);
        const { affected } = result;
        return ok(
          `${pinned ? "Pinned" : "Unpinned"} ${affected.length} stor${affected.length === 1 ? "y" : "ies"}: [${affected.join(", ")}]`,
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-toggle-story-pinned-to-top",
    {
      description:
        "Pin stories to the very top of your pinned row. Pass an empty array [] to clear all top-pinned stories.",
      inputSchema: {
        chatId: z.string().default("me").describe("Peer owning the stories"),
        ids: z
          .array(z.number().int().positive())
          .max(100)
          .describe("Story IDs to pin to the top row; pass [] to clear"),
      },
      annotations: WRITE,
    },
    async ({ chatId, ids }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        await telegram.toggleStoryPinnedToTop(chatId, ids);
        return ok(
          ids.length === 0
            ? "Cleared top-pinned stories"
            : `Pinned ${ids.length} stor${ids.length === 1 ? "y" : "ies"} to top: [${ids.join(", ")}]`,
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-activate-stealth-mode",
    {
      description:
        "Hide your story views retroactively (past=true) and/or for the next 25 minutes (future=true). Requires Telegram Premium — non-Premium accounts receive PREMIUM_ACCOUNT_REQUIRED.",
      inputSchema: {
        past: z.boolean().optional().describe("Remove your views from stories you already watched"),
        future: z.boolean().optional().describe("Hide your views for the next 25 minutes"),
      },
      annotations: WRITE,
    },
    async ({ past, future }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      if (!past && !future) {
        return fail(new Error("At least one of past or future must be true"));
      }
      try {
        await telegram.activateStealthMode(past, future);
        return ok(`Stealth mode activated (past: ${past ?? false}, future: ${future ?? false})`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-stories-archive",
    {
      description:
        "Fetch auto-archived (expired) stories from a peer's archive. Paginate via offsetId (pass last story id from previous page).",
      inputSchema: {
        chatId: z.string().default("me").describe("Peer whose archive to fetch"),
        offsetId: z
          .number()
          .int()
          .nonnegative()
          .default(0)
          .describe("Pagination offset: pass last story ID from previous page (0 to start)"),
        limit: z.number().int().min(1).max(100).default(50).describe("Max stories to return (1–100, default 50)"),
      },
      annotations: READ_ONLY,
    },
    async ({ chatId, offsetId, limit }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.getStoriesArchive(chatId, offsetId, limit);
        return ok(JSON.stringify(result));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-report-story",
    {
      description:
        "Report a story via the multi-step option flow. First call with option:'' starts the flow; subsequent calls pass the base64 option bytes from the previous response.",
      inputSchema: {
        chatId: z.string().describe("Peer who posted the story"),
        ids: z.array(z.number().int().positive()).min(1).max(100).describe("Story IDs to report"),
        option: z
          .string()
          .max(128)
          .default("")
          .describe("Base64-encoded option bytes from a prior report step, or empty string to start the flow"),
        message: safeText.pipe(z.string().max(1024)).default("").describe("Optional message to accompany the report"),
      },
      annotations: WRITE,
    },
    async ({ chatId, ids, option, message }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.reportStory(chatId, ids, option, message);
        return ok(JSON.stringify(result));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
