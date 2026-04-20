import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import {
  summarizeStarsAmount,
  summarizeStarsStatus,
  summarizeStarsSubscription,
  summarizeStarsTransaction,
  summarizeStarsTransactionPeer,
  TelegramService,
} from "../telegram-client.js";
import { isStarsEnabled } from "../tools/stars.js";

interface Internals {
  client: unknown;
  connected: boolean;
}

function makeService(invocations: unknown[], responder: (req: unknown) => unknown): TelegramService {
  const fakeClient = {
    invoke: async (req: unknown) => {
      invocations.push(req);
      return responder(req);
    },
  };
  const service = new TelegramService(1, "hash");
  const internals = service as unknown as Internals;
  internals.client = fakeClient;
  internals.connected = true;
  return service;
}

describe("summarizeStarsAmount", () => {
  it("stringifies amount (bigInt) and passes nanos through", () => {
    const out = summarizeStarsAmount(new Api.StarsAmount({ amount: bigInt(12345), nanos: 67 }));
    assert.deepStrictEqual(out, { amount: "12345", nanos: 67 });
  });
});

describe("summarizeStarsTransactionPeer", () => {
  it("maps app/play/premiumBot/fragment/ads/api/unsupported", () => {
    assert.deepStrictEqual(summarizeStarsTransactionPeer(new Api.StarsTransactionPeerAppStore()), { kind: "appStore" });
    assert.deepStrictEqual(summarizeStarsTransactionPeer(new Api.StarsTransactionPeerPlayMarket()), {
      kind: "playMarket",
    });
    assert.deepStrictEqual(summarizeStarsTransactionPeer(new Api.StarsTransactionPeerPremiumBot()), {
      kind: "premiumBot",
    });
    assert.deepStrictEqual(summarizeStarsTransactionPeer(new Api.StarsTransactionPeerFragment()), { kind: "fragment" });
    assert.deepStrictEqual(summarizeStarsTransactionPeer(new Api.StarsTransactionPeerAds()), { kind: "ads" });
    assert.deepStrictEqual(summarizeStarsTransactionPeer(new Api.StarsTransactionPeerAPI()), { kind: "api" });
    assert.deepStrictEqual(summarizeStarsTransactionPeer(new Api.StarsTransactionPeerUnsupported()), {
      kind: "unsupported",
    });
  });

  it("maps StarsTransactionPeer with a user peer", () => {
    const out = summarizeStarsTransactionPeer(
      new Api.StarsTransactionPeer({ peer: new Api.PeerUser({ userId: bigInt(42) }) }),
    );
    assert.deepStrictEqual(out, { kind: "peer", peer: { kind: "user", id: "42" } });
  });
});

describe("summarizeStarsTransaction", () => {
  it("maps core fields and flags", () => {
    const tx = new Api.StarsTransaction({
      id: "tx-1",
      stars: new Api.StarsAmount({ amount: bigInt(500), nanos: 0 }),
      date: 1710000000,
      peer: new Api.StarsTransactionPeerAppStore(),
      refund: true,
      gift: true,
      title: "Top-up",
      msgId: 55,
      transactionDate: 1710000100,
      transactionUrl: "https://example.com/x",
    });
    const out = summarizeStarsTransaction(tx);
    assert.strictEqual(out.id, "tx-1");
    assert.deepStrictEqual(out.stars, { amount: "500", nanos: 0 });
    assert.strictEqual(out.date, 1710000000);
    assert.deepStrictEqual(out.peer, { kind: "appStore" });
    assert.strictEqual(out.refund, true);
    assert.strictEqual(out.gift, true);
    assert.strictEqual(out.title, "Top-up");
    assert.strictEqual(out.msgId, 55);
    assert.strictEqual(out.transactionDate, 1710000100);
    assert.strictEqual(out.transactionUrl, "https://example.com/x");
    assert.strictEqual(out.description, undefined);
  });
});

describe("summarizeStarsSubscription", () => {
  it("maps id, peer, pricing and flags", () => {
    const sub = new Api.StarsSubscription({
      id: "sub-1",
      peer: new Api.PeerChannel({ channelId: bigInt(100) }),
      untilDate: 1720000000,
      pricing: new Api.StarsSubscriptionPricing({ period: 2592000, amount: bigInt(150) }),
      canceled: true,
      title: "Premium group",
      invoiceSlug: "slug-x",
    });
    const out = summarizeStarsSubscription(sub);
    assert.strictEqual(out.id, "sub-1");
    assert.deepStrictEqual(out.peer, { kind: "channel", id: "100" });
    assert.strictEqual(out.untilDate, 1720000000);
    assert.deepStrictEqual(out.pricing, { period: 2592000, amount: "150" });
    assert.strictEqual(out.canceled, true);
    assert.strictEqual(out.title, "Premium group");
    assert.strictEqual(out.invoiceSlug, "slug-x");
    assert.strictEqual(out.missingBalance, undefined);
  });
});

describe("summarizeStarsStatus", () => {
  it("maps balance, history, subscriptions and offsets", () => {
    const resp = new Api.payments.StarsStatus({
      balance: new Api.StarsAmount({ amount: bigInt(1000), nanos: 5 }),
      history: [
        new Api.StarsTransaction({
          id: "t1",
          stars: new Api.StarsAmount({ amount: bigInt(10), nanos: 0 }),
          date: 1,
          peer: new Api.StarsTransactionPeerPremiumBot(),
        }),
      ],
      subscriptions: [
        new Api.StarsSubscription({
          id: "s1",
          peer: new Api.PeerChannel({ channelId: bigInt(7) }),
          untilDate: 100,
          pricing: new Api.StarsSubscriptionPricing({ period: 30, amount: bigInt(5) }),
        }),
      ],
      subscriptionsNextOffset: "sub-cursor",
      subscriptionsMissingBalance: bigInt(250),
      nextOffset: "tx-cursor",
      chats: [],
      users: [],
    });
    const out = summarizeStarsStatus(resp);
    assert.deepStrictEqual(out.balance, { amount: "1000", nanos: 5 });
    assert.strictEqual(out.history?.length, 1);
    assert.strictEqual(out.history?.[0].id, "t1");
    assert.strictEqual(out.subscriptions?.length, 1);
    assert.strictEqual(out.subscriptions?.[0].id, "s1");
    assert.strictEqual(out.subscriptionsNextOffset, "sub-cursor");
    assert.strictEqual(out.subscriptionsMissingBalance, "250");
    assert.strictEqual(out.nextOffset, "tx-cursor");
  });

  it("omits empty history/subscriptions and empty offset strings", () => {
    const resp = new Api.payments.StarsStatus({
      balance: new Api.StarsAmount({ amount: bigInt(0), nanos: 0 }),
      history: [],
      subscriptions: [],
      subscriptionsNextOffset: "",
      nextOffset: "",
      chats: [],
      users: [],
    });
    const out = summarizeStarsStatus(resp);
    assert.strictEqual(out.history, undefined);
    assert.strictEqual(out.subscriptions, undefined);
    assert.strictEqual(out.subscriptionsNextOffset, undefined);
    assert.strictEqual(out.nextOffset, undefined);
    assert.strictEqual(out.subscriptionsMissingBalance, undefined);
  });
});

describe("TelegramService.getStarsStatus", () => {
  it("invokes payments.GetStarsStatus with resolved peer and returns summary", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      invocations,
      () =>
        new Api.payments.StarsStatus({
          balance: new Api.StarsAmount({ amount: bigInt(42), nanos: 0 }),
          chats: [],
          users: [],
        }),
    );
    const internals = service as unknown as { resolvePeer: (id: string) => Promise<unknown> };
    internals.resolvePeer = async (_id: string) => new Api.InputPeerUser({ userId: bigInt(1), accessHash: bigInt(2) });

    const out = await service.getStarsStatus("me");
    const call = invocations.find((r) => r instanceof Api.payments.GetStarsStatus) as
      | Api.payments.GetStarsStatus
      | undefined;
    assert.ok(call);
    assert.deepStrictEqual(out.balance, { amount: "42", nanos: 0 });
  });
});

describe("isStarsEnabled gate", () => {
  it("is off by default", () => {
    const prev = process.env.MCP_TELEGRAM_ENABLE_STARS;
    delete process.env.MCP_TELEGRAM_ENABLE_STARS;
    try {
      assert.strictEqual(isStarsEnabled(), false);
    } finally {
      if (prev !== undefined) process.env.MCP_TELEGRAM_ENABLE_STARS = prev;
    }
  });

  it("turns on when env is '1'", () => {
    const prev = process.env.MCP_TELEGRAM_ENABLE_STARS;
    process.env.MCP_TELEGRAM_ENABLE_STARS = "1";
    try {
      assert.strictEqual(isStarsEnabled(), true);
    } finally {
      if (prev === undefined) delete process.env.MCP_TELEGRAM_ENABLE_STARS;
      else process.env.MCP_TELEGRAM_ENABLE_STARS = prev;
    }
  });

  it("stays off for any non-'1' value", () => {
    const prev = process.env.MCP_TELEGRAM_ENABLE_STARS;
    process.env.MCP_TELEGRAM_ENABLE_STARS = "true";
    try {
      assert.strictEqual(isStarsEnabled(), false);
    } finally {
      if (prev === undefined) delete process.env.MCP_TELEGRAM_ENABLE_STARS;
      else process.env.MCP_TELEGRAM_ENABLE_STARS = prev;
    }
  });
});
