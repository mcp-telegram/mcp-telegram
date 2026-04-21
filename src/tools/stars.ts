import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import { fail, ok, READ_ONLY, requireConnection } from "./shared.js";

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
}
