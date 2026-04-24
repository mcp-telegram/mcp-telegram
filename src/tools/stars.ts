import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import { fail, ok, READ_ONLY, requireConnection, WRITE } from "./shared.js";

export function isStarsEnabled(): boolean {
  return process.env.MCP_TELEGRAM_ENABLE_STARS === "1";
}

export function registerStarsTools(server: McpServer, telegram: TelegramService) {
  if (!isStarsEnabled()) return;

  server.registerTool(
    "telegram-get-stars-status",
    {
      description:
        "Fetch the current Telegram Stars balance and recent activity for a peer (payments.GetStarsStatus). Pass 'me' / '@me' (or the user's own id) to inspect your own wallet, or a bot/channel peer you own/administrate. Returns {balance:{amount,nanos}, subscriptions?[], subscriptionsNextOffset?, subscriptionsMissingBalance?, history?[], nextOffset?}. Each transaction has id, stars, date, peer (kind: appStore|playMarket|premiumBot|fragment|ads|api|peer|unsupported), and flags (refund/pending/failed/gift/reaction). Use telegram-get-stars-transactions for full paginated history. Opt-in: register only when MCP_TELEGRAM_ENABLE_STARS=1. Read-only.",
      inputSchema: {
        peer: z
          .string()
          .describe(
            "Peer whose Stars wallet to inspect — 'me'/'@me' or user id for self, or @username/id for a bot/channel you control",
          ),
      },
      annotations: READ_ONLY,
    },
    async ({ peer }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.getStarsStatus(peer);
        return ok(JSON.stringify(result));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-stars-transactions",
    {
      description:
        "Fetch a paginated Telegram Stars transaction history for a peer (payments.GetStarsTransactions). Pass 'me'/'@me' (or your own user id) for your wallet, or a bot/channel peer you own/administrate. Filters: inbound (credits only), outbound (debits only), ascending (chronological; default descending), subscriptionId (scope to a single subscription). Paginate with offset (cursor string from a prior response's nextOffset) and limit (default 50). Returns {balance, history[], nextOffset?, subscriptions?[], ...} — same shape as telegram-get-stars-status but focused on transactions. Opt-in: register only when MCP_TELEGRAM_ENABLE_STARS=1. Read-only.",
      inputSchema: {
        peer: z
          .string()
          .describe(
            "Peer whose Stars transactions to fetch — 'me'/'@me' or user id for self, or @username/id for a bot/channel you control",
          ),
        inbound: z.boolean().optional().describe("If true, return only inbound (credit) transactions"),
        outbound: z.boolean().optional().describe("If true, return only outbound (debit) transactions"),
        ascending: z
          .boolean()
          .optional()
          .describe("If true, return transactions in chronological (oldest first) order; default: newest first"),
        subscriptionId: z.string().optional().describe("If set, filter transactions to a single subscription id"),
        offset: z
          .string()
          .optional()
          .describe("Pagination cursor — pass the nextOffset from a previous response; empty/undefined for first page"),
        limit: z.number().int().min(1).max(100).optional().describe("Max transactions per page (default 50, max 100)"),
      },
      annotations: READ_ONLY,
    },
    async ({ peer, inbound, outbound, ascending, subscriptionId, offset, limit }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      if (inbound && outbound) {
        return fail(new Error("inbound and outbound are mutually exclusive — provide at most one"));
      }
      try {
        const result = await telegram.getStarsTransactions(peer, {
          inbound,
          outbound,
          ascending,
          subscriptionId,
          offset,
          limit,
        });
        return ok(JSON.stringify(result));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-available-star-gifts",
    {
      description:
        "List all available Telegram Star Gifts that can be sent to other users. Returns gift ID, cost in Stars, conversion value, availability (for limited gifts), and upgrade cost. Opt-in: register only when MCP_TELEGRAM_ENABLE_STARS=1. Read-only.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const gifts = await telegram.getAvailableStarGifts();
        return ok(JSON.stringify(gifts));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-saved-star-gifts",
    {
      description:
        "List Star Gifts received by a user or chat. Pass 'me' for your own gifts. Supports pagination via offset/nextOffset and filtering flags. Returns gift ID, kind (regular/unique), stars cost, from-peer, date, and upgrade eligibility. Opt-in: register only when MCP_TELEGRAM_ENABLE_STARS=1. Read-only.",
      inputSchema: {
        chatId: z.string().describe("User or chat to fetch received gifts for — 'me' for self"),
        limit: z.number().int().min(1).max(100).default(20).describe("Max gifts per page"),
        offset: z.string().optional().describe("Pagination cursor from a prior response's nextOffset"),
        excludeUnsaved: z.boolean().optional().describe("Skip gifts the recipient chose to hide"),
        excludeSaved: z.boolean().optional().describe("Skip gifts the recipient chose to show"),
        excludeUnlimited: z.boolean().optional().describe("Skip unlimited-edition gifts"),
        excludeLimited: z.boolean().optional().describe("Skip limited-edition gifts"),
        excludeUnique: z.boolean().optional().describe("Skip unique gifts"),
        sortByValue: z.boolean().optional().describe("Sort by Star value descending instead of date"),
      },
      annotations: READ_ONLY,
    },
    async ({
      chatId,
      limit,
      offset,
      excludeUnsaved,
      excludeSaved,
      excludeUnlimited,
      excludeLimited,
      excludeUnique,
      sortByValue,
    }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.getSavedStarGifts(chatId, {
          limit,
          offset,
          excludeUnsaved,
          excludeSaved,
          excludeUnlimited,
          excludeLimited,
          excludeUnique,
          sortByValue,
        });
        return ok(JSON.stringify(result));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-save-star-gift",
    {
      description:
        "Show or hide a received Star Gift on your profile. Pass msgId for a gift received as a personal message (DM), or chatId + savedId for a gift in a chat/channel. Set unsave=true to hide the gift (remove from profile display). Opt-in: register only when MCP_TELEGRAM_ENABLE_STARS=1.",
      inputSchema: {
        msgId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Message ID of the gift (from your DMs) — use this for personal gifts"),
        chatId: z
          .string()
          .optional()
          .describe("Chat/channel ID where the gift was received (required with savedId for chat gifts)"),
        savedId: z
          .string()
          .regex(/^\d+$/, "must be a numeric saved gift ID")
          .optional()
          .describe("Saved gift ID (from get-saved-star-gifts) — required with chatId for chat gifts"),
        unsave: z.boolean().optional().describe("true = hide the gift from profile; false/omit = show it"),
      },
      annotations: WRITE,
    },
    async ({ msgId, chatId, savedId, unsave }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      if (msgId === undefined && !(chatId && savedId)) {
        return fail(new Error("Provide msgId, or both chatId and savedId"));
      }
      try {
        await telegram.saveStarGift({ msgId, chatId, savedId, unsave });
        return ok(unsave ? "Gift hidden from profile" : "Gift shown on profile");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-convert-star-gift",
    {
      description:
        "Convert a received Star Gift into Stars (non-reversible). The gift is removed from your profile and its conversion value is added to your Stars balance. Pass msgId for personal gifts or chatId + savedId for chat gifts. Opt-in: register only when MCP_TELEGRAM_ENABLE_STARS=1.",
      inputSchema: {
        msgId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Message ID of the gift (from your DMs) — for personal gifts"),
        chatId: z.string().optional().describe("Chat/channel ID (for chat gifts, required with savedId)"),
        savedId: z
          .string()
          .regex(/^\d+$/, "must be a numeric saved gift ID")
          .optional()
          .describe("Saved gift ID — for chat gifts, required with chatId"),
      },
      annotations: WRITE,
    },
    async ({ msgId, chatId, savedId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      if (msgId === undefined && !(chatId && savedId)) {
        return fail(new Error("Provide msgId, or both chatId and savedId"));
      }
      try {
        await telegram.convertStarGift({ msgId, chatId, savedId });
        return ok("Gift converted to Stars");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-stars-topup-options",
    {
      description:
        "List available Telegram Stars top-up tiers (from payments.GetStarsTopupOptions). Returns each option with star count, currency, price amount (in smallest currency units), and whether it is an extended/premium tier. Opt-in: register only when MCP_TELEGRAM_ENABLE_STARS=1. Read-only.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const options = await telegram.getStarsTopupOptions();
        return ok(JSON.stringify(options));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-stars-subscriptions",
    {
      description:
        "List active Telegram Stars subscriptions for a peer (payments.GetStarsSubscriptions). Pass 'me' for your own account or a bot/channel you own. Returns subscription ID, peer, renewal date, period, price in Stars, and canceled status. Paginate with offset. Opt-in: register only when MCP_TELEGRAM_ENABLE_STARS=1. Read-only.",
      inputSchema: {
        chatId: z.string().describe("Peer to query — 'me' for your own subscriptions, or a bot/channel you own"),
        offset: z.string().optional().describe("Pagination cursor from a prior nextOffset"),
        missingBalance: z.boolean().optional().describe("If true, return only subscriptions with missing balance"),
      },
      annotations: READ_ONLY,
    },
    async ({ chatId, offset, missingBalance }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const result = await telegram.getStarsSubscriptions(chatId, { offset, missingBalance });
        return ok(JSON.stringify(result));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-change-stars-subscription",
    {
      description:
        "Cancel or restore a Telegram Stars subscription (payments.ChangeStarsSubscription). Pass canceled=true to cancel an active subscription before its next renewal, or false to restore a previously canceled one. Opt-in: register only when MCP_TELEGRAM_ENABLE_STARS=1.",
      inputSchema: {
        chatId: z
          .string()
          .describe("The peer the subscription belongs to — 'me' for your own subscriptions or a bot/channel you own"),
        subscriptionId: z.string().min(1).describe("Subscription ID (from telegram-get-stars-subscriptions)"),
        canceled: z.boolean().describe("true = cancel the subscription; false = restore a canceled subscription"),
      },
      annotations: WRITE,
    },
    async ({ chatId, subscriptionId, canceled }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        await telegram.changeStarsSubscription(chatId, subscriptionId, canceled);
        return ok(canceled ? `Subscription ${subscriptionId} canceled` : `Subscription ${subscriptionId} restored`);
      } catch (e) {
        return fail(e);
      }
    },
  );
}
