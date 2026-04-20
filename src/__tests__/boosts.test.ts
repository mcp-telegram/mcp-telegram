import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import {
  summarizeBoost,
  summarizeBoostsList,
  summarizeBoostsStatus,
  summarizeMyBoost,
  summarizeMyBoosts,
  summarizePrepaidGiveaway,
  TelegramService,
} from "../telegram-client.js";

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

describe("summarizeMyBoost", () => {
  it("maps slot, peer, dates and cooldown", () => {
    const boost = new Api.MyBoost({
      slot: 2,
      peer: new Api.PeerChannel({ channelId: bigInt(900) }),
      date: 1710000000,
      expires: 1720000000,
      cooldownUntilDate: 1715000000,
    });
    const out = summarizeMyBoost(boost);
    assert.strictEqual(out.slot, 2);
    assert.deepStrictEqual(out.peer, { kind: "channel", id: "900" });
    assert.strictEqual(out.date, 1710000000);
    assert.strictEqual(out.expires, 1720000000);
    assert.strictEqual(out.cooldownUntilDate, 1715000000);
  });

  it("leaves peer undefined when boost is unassigned", () => {
    const boost = new Api.MyBoost({
      slot: 1,
      date: 100,
      expires: 200,
    });
    const out = summarizeMyBoost(boost);
    assert.strictEqual(out.slot, 1);
    assert.strictEqual(out.peer, undefined);
    assert.strictEqual(out.cooldownUntilDate, undefined);
  });
});

describe("summarizeMyBoosts", () => {
  it("computes count from myBoosts length and maps each entry", () => {
    const resp = new Api.premium.MyBoosts({
      myBoosts: [
        new Api.MyBoost({
          slot: 1,
          peer: new Api.PeerChannel({ channelId: bigInt(10) }),
          date: 1,
          expires: 2,
        }),
        new Api.MyBoost({ slot: 2, date: 3, expires: 4 }),
      ],
      chats: [],
      users: [],
    });
    const out = summarizeMyBoosts(resp);
    assert.strictEqual(out.count, 2);
    assert.strictEqual(out.myBoosts.length, 2);
    assert.deepStrictEqual(out.myBoosts[0].peer, { kind: "channel", id: "10" });
    assert.strictEqual(out.myBoosts[1].peer, undefined);
  });

  it("handles empty boost list", () => {
    const resp = new Api.premium.MyBoosts({ myBoosts: [], chats: [], users: [] });
    const out = summarizeMyBoosts(resp);
    assert.strictEqual(out.count, 0);
    assert.deepStrictEqual(out.myBoosts, []);
  });
});

describe("summarizePrepaidGiveaway", () => {
  it("maps premium PrepaidGiveaway (months + quantity)", () => {
    const g = new Api.PrepaidGiveaway({
      id: bigInt(123),
      months: 3,
      quantity: 10,
      date: 1700000000,
    });
    const out = summarizePrepaidGiveaway(g);
    assert.deepStrictEqual(out, {
      kind: "premium",
      id: "123",
      months: 3,
      quantity: 10,
      date: 1700000000,
    });
  });

  it("maps PrepaidStarsGiveaway with stars + boosts", () => {
    const g = new Api.PrepaidStarsGiveaway({
      id: bigInt(456),
      stars: bigInt(5000),
      quantity: 20,
      boosts: 4,
      date: 1710000000,
    });
    const out = summarizePrepaidGiveaway(g);
    assert.deepStrictEqual(out, {
      kind: "stars",
      id: "456",
      stars: "5000",
      quantity: 20,
      boosts: 4,
      date: 1710000000,
    });
  });
});

describe("summarizeBoostsStatus", () => {
  it("maps core counters and boost url", () => {
    const resp = new Api.premium.BoostsStatus({
      level: 3,
      currentLevelBoosts: 10,
      boosts: 15,
      giftBoosts: 2,
      nextLevelBoosts: 25,
      boostUrl: "https://t.me/boost/test",
      myBoost: true,
      myBoostSlots: [1, 2],
    });
    const out = summarizeBoostsStatus(resp);
    assert.strictEqual(out.level, 3);
    assert.strictEqual(out.boosts, 15);
    assert.strictEqual(out.currentLevelBoosts, 10);
    assert.strictEqual(out.nextLevelBoosts, 25);
    assert.strictEqual(out.giftBoosts, 2);
    assert.strictEqual(out.boostUrl, "https://t.me/boost/test");
    assert.strictEqual(out.myBoost, true);
    assert.deepStrictEqual(out.myBoostSlots, [1, 2]);
    assert.strictEqual(out.premiumAudience, undefined);
    assert.strictEqual(out.prepaidGiveaways, undefined);
  });

  it("includes premiumAudience and prepaidGiveaways when present", () => {
    const resp = new Api.premium.BoostsStatus({
      level: 1,
      currentLevelBoosts: 0,
      boosts: 5,
      boostUrl: "https://t.me/boost/x",
      premiumAudience: new Api.StatsPercentValue({ part: 2, total: 100 }),
      prepaidGiveaways: [new Api.PrepaidGiveaway({ id: bigInt(1), months: 6, quantity: 5, date: 111 })],
    });
    const out = summarizeBoostsStatus(resp);
    assert.deepStrictEqual(out.premiumAudience, { part: 2, total: 100 });
    assert.ok(out.prepaidGiveaways);
    assert.strictEqual(out.prepaidGiveaways?.length, 1);
    assert.strictEqual(out.prepaidGiveaways?.[0].kind, "premium");
    assert.strictEqual(out.prepaidGiveaways?.[0].id, "1");
  });

  it("omits empty prepaidGiveaways list", () => {
    const resp = new Api.premium.BoostsStatus({
      level: 0,
      currentLevelBoosts: 0,
      boosts: 0,
      boostUrl: "https://t.me/boost/y",
      prepaidGiveaways: [],
    });
    const out = summarizeBoostsStatus(resp);
    assert.strictEqual(out.prepaidGiveaways, undefined);
  });
});

describe("TelegramService.getBoostsStatus", () => {
  it("invokes premium.GetBoostsStatus with resolved peer and returns summary", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      invocations,
      () =>
        new Api.premium.BoostsStatus({
          level: 2,
          currentLevelBoosts: 5,
          boosts: 7,
          boostUrl: "https://t.me/boost/foo",
        }),
    );

    const internals = service as unknown as { resolvePeer: (id: string) => Promise<unknown> };
    internals.resolvePeer = async (_id: string) =>
      new Api.InputPeerChannel({ channelId: bigInt(500), accessHash: bigInt(0) });

    const out = await service.getBoostsStatus("@foo");
    const call = invocations.find((r) => r instanceof Api.premium.GetBoostsStatus) as
      | Api.premium.GetBoostsStatus
      | undefined;
    assert.ok(call);
    assert.strictEqual(out.level, 2);
    assert.strictEqual(out.boosts, 7);
    assert.strictEqual(out.boostUrl, "https://t.me/boost/foo");
  });
});

describe("summarizeBoost", () => {
  it("maps core boost fields and converts bigInt ids to strings", () => {
    const boost = new Api.Boost({
      id: "boost-1",
      userId: bigInt(123),
      date: 1700000000,
      expires: 1702000000,
      gift: true,
      giveaway: false,
      unclaimed: false,
      giveawayMsgId: 55,
      usedGiftSlug: "slug-abc",
      multiplier: 2,
      stars: bigInt(500),
    });
    const out = summarizeBoost(boost);
    assert.strictEqual(out.id, "boost-1");
    assert.strictEqual(out.userId, "123");
    assert.strictEqual(out.date, 1700000000);
    assert.strictEqual(out.expires, 1702000000);
    assert.strictEqual(out.gift, true);
    assert.strictEqual(out.giveaway, false);
    assert.strictEqual(out.unclaimed, false);
    assert.strictEqual(out.giveawayMsgId, 55);
    assert.strictEqual(out.usedGiftSlug, "slug-abc");
    assert.strictEqual(out.multiplier, 2);
    assert.strictEqual(out.stars, "500");
  });

  it("leaves optional fields undefined when missing", () => {
    const boost = new Api.Boost({
      id: "boost-2",
      date: 10,
      expires: 20,
    });
    const out = summarizeBoost(boost);
    assert.strictEqual(out.id, "boost-2");
    assert.strictEqual(out.userId, undefined);
    assert.strictEqual(out.stars, undefined);
    assert.strictEqual(out.multiplier, undefined);
  });
});

describe("summarizeBoostsList", () => {
  it("maps count, boosts and nextOffset", () => {
    const resp = new Api.premium.BoostsList({
      count: 2,
      boosts: [
        new Api.Boost({ id: "a", userId: bigInt(1), date: 1, expires: 2 }),
        new Api.Boost({ id: "b", giveaway: true, date: 3, expires: 4 }),
      ],
      nextOffset: "cursor-xyz",
      users: [],
    });
    const out = summarizeBoostsList(resp);
    assert.strictEqual(out.count, 2);
    assert.strictEqual(out.boosts.length, 2);
    assert.strictEqual(out.boosts[0].id, "a");
    assert.strictEqual(out.boosts[0].userId, "1");
    assert.strictEqual(out.boosts[1].giveaway, true);
    assert.strictEqual(out.nextOffset, "cursor-xyz");
  });

  it("handles empty boosts and missing nextOffset", () => {
    const resp = new Api.premium.BoostsList({
      count: 0,
      boosts: [],
      users: [],
    });
    const out = summarizeBoostsList(resp);
    assert.strictEqual(out.count, 0);
    assert.deepStrictEqual(out.boosts, []);
    assert.strictEqual(out.nextOffset, undefined);
  });
});

describe("TelegramService.getBoostsList", () => {
  it("invokes premium.GetBoostsList with defaults (empty offset, limit 50)", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      invocations,
      () =>
        new Api.premium.BoostsList({
          count: 1,
          boosts: [new Api.Boost({ id: "boost-1", userId: bigInt(7), date: 10, expires: 20 })],
          nextOffset: "next",
          users: [],
        }),
    );
    const internals = service as unknown as { resolvePeer: (id: string) => Promise<unknown> };
    internals.resolvePeer = async (_id: string) =>
      new Api.InputPeerChannel({ channelId: bigInt(500), accessHash: bigInt(0) });

    const out = await service.getBoostsList("@foo");
    const call = invocations.find((r) => r instanceof Api.premium.GetBoostsList) as
      | Api.premium.GetBoostsList
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.offset, "");
    assert.strictEqual(call.limit, 50);
    assert.strictEqual(call.gifts, undefined);
    assert.strictEqual(out.count, 1);
    assert.strictEqual(out.boosts[0].id, "boost-1");
    assert.strictEqual(out.nextOffset, "next");
  });

  it("passes gifts/offset/limit through to GetBoostsList", async () => {
    const invocations: unknown[] = [];
    const service = makeService(invocations, () => new Api.premium.BoostsList({ count: 0, boosts: [], users: [] }));
    const internals = service as unknown as { resolvePeer: (id: string) => Promise<unknown> };
    internals.resolvePeer = async (_id: string) =>
      new Api.InputPeerChannel({ channelId: bigInt(1), accessHash: bigInt(0) });

    await service.getBoostsList("@bar", { gifts: true, offset: "cur", limit: 10 });
    const call = invocations.find((r) => r instanceof Api.premium.GetBoostsList) as
      | Api.premium.GetBoostsList
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.gifts, true);
    assert.strictEqual(call.offset, "cur");
    assert.strictEqual(call.limit, 10);
  });
});

describe("TelegramService.getMyBoosts", () => {
  it("invokes premium.GetMyBoosts and returns summary", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      invocations,
      () =>
        new Api.premium.MyBoosts({
          myBoosts: [
            new Api.MyBoost({
              slot: 1,
              peer: new Api.PeerChannel({ channelId: bigInt(42) }),
              date: 100,
              expires: 200,
            }),
          ],
          chats: [],
          users: [],
        }),
    );

    const out = await service.getMyBoosts();
    const call = invocations.find((r) => r instanceof Api.premium.GetMyBoosts) as Api.premium.GetMyBoosts | undefined;
    assert.ok(call);
    assert.strictEqual(out.count, 1);
    assert.strictEqual(out.myBoosts[0].slot, 1);
    assert.deepStrictEqual(out.myBoosts[0].peer, { kind: "channel", id: "42" });
  });
});
