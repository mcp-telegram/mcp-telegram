import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import { summarizeMegagroupStats, TelegramService } from "../telegram-client.js";

function makeService(
  entity: unknown,
  invokeImpl: (req: unknown) => Promise<unknown>,
  invocations: unknown[],
): TelegramService {
  const fakeClient = {
    invoke: async (req: unknown) => {
      invocations.push(req);
      return invokeImpl(req);
    },
  };
  const service = new TelegramService(1, "hash");
  const internals = service as unknown as {
    client: unknown;
    connected: boolean;
    resolveChat: (id: string) => Promise<unknown>;
  };
  internals.client = fakeClient;
  internals.connected = true;
  internals.resolveChat = async () => entity;
  return service;
}

function fakeStats(): Api.stats.MegagroupStats {
  return {
    period: { minDate: 1000, maxDate: 2000 },
    members: { current: 500, previous: 450 },
    messages: { current: 1200, previous: 1100 },
    viewers: { current: 300, previous: 280 },
    posters: { current: 80, previous: 75 },
    growthGraph: new Api.StatsGraphAsync({ token: "growth-token" }),
    membersGraph: new Api.StatsGraphAsync({ token: "members-token" }),
    newMembersBySourceGraph: new Api.StatsGraphAsync({ token: "new-members-token" }),
    languagesGraph: new Api.StatsGraphError({ error: "unavailable" }),
    messagesGraph: new Api.StatsGraph({
      json: new Api.DataJSON({ data: '{"x":[1,2,3]}' }),
      zoomToken: "zoom",
    }),
    actionsGraph: new Api.StatsGraphAsync({ token: "actions-token" }),
    topHoursGraph: new Api.StatsGraphAsync({ token: "top-hours-token" }),
    weekdaysGraph: new Api.StatsGraphAsync({ token: "weekdays-token" }),
    topPosters: [
      new Api.StatsGroupTopPoster({ userId: bigInt(111), messages: 42, avgChars: 120 }),
      new Api.StatsGroupTopPoster({ userId: bigInt(222), messages: 21, avgChars: 80 }),
    ],
    topAdmins: [new Api.StatsGroupTopAdmin({ userId: bigInt(333), deleted: 5, kicked: 2, banned: 1 })],
    topInviters: [new Api.StatsGroupTopInviter({ userId: bigInt(444), invitations: 10 })],
    users: [],
  } as unknown as Api.stats.MegagroupStats;
}

describe("summarizeMegagroupStats", () => {
  it("produces compact summary without graphs by default", () => {
    const summary = summarizeMegagroupStats(fakeStats(), false);
    assert.strictEqual(summary.graphs, undefined);
    assert.deepStrictEqual(summary.period, { minDate: 1000, maxDate: 2000 });
    assert.deepStrictEqual(summary.members, { current: 500, previous: 450 });
    assert.deepStrictEqual(summary.messages, { current: 1200, previous: 1100 });
    assert.deepStrictEqual(summary.viewers, { current: 300, previous: 280 });
    assert.deepStrictEqual(summary.posters, { current: 80, previous: 75 });
    assert.strictEqual(summary.topPosters.length, 2);
    assert.deepStrictEqual(summary.topPosters[0], {
      userId: "111",
      messages: 42,
      avgChars: 120,
    });
    assert.deepStrictEqual(summary.topAdmins[0], {
      userId: "333",
      deleted: 5,
      kicked: 2,
      banned: 1,
    });
    assert.deepStrictEqual(summary.topInviters[0], { userId: "444", invitations: 10 });
  });

  it("includes and decodes graphs when requested", () => {
    const summary = summarizeMegagroupStats(fakeStats(), true);
    assert.ok(summary.graphs);
    const graphs = summary.graphs ?? {};
    assert.deepStrictEqual(graphs.growth, { type: "async", token: "growth-token" });
    assert.deepStrictEqual(graphs.languages, { type: "error", error: "unavailable" });
    assert.deepStrictEqual(graphs.messages, { type: "data", data: { x: [1, 2, 3] }, zoomToken: "zoom" });
    assert.deepStrictEqual(graphs.weekdays, { type: "async", token: "weekdays-token" });
  });

  it("handles empty top lists gracefully", () => {
    const stats = fakeStats();
    (stats as unknown as { topPosters: unknown[]; topAdmins: unknown[]; topInviters: unknown[] }).topPosters = [];
    (stats as unknown as { topPosters: unknown[]; topAdmins: unknown[]; topInviters: unknown[] }).topAdmins = [];
    (stats as unknown as { topPosters: unknown[]; topAdmins: unknown[]; topInviters: unknown[] }).topInviters = [];
    const summary = summarizeMegagroupStats(stats, false);
    assert.deepStrictEqual(summary.topPosters, []);
    assert.deepStrictEqual(summary.topAdmins, []);
    assert.deepStrictEqual(summary.topInviters, []);
  });
});

describe("TelegramService.getMegagroupStats", () => {
  function megagroup(): Api.Channel {
    return new Api.Channel({
      id: bigInt(33333),
      title: "supergroup",
      photo: new Api.ChatPhotoEmpty(),
      date: 0,
      accessHash: bigInt(1),
      megagroup: true,
    });
  }

  it("invokes stats.GetMegagroupStats and returns compact summary", async () => {
    const invocations: unknown[] = [];
    const service = makeService(megagroup(), async () => fakeStats(), invocations);

    const summary = await service.getMegagroupStats("33333");

    const call = invocations.find((r) => r instanceof Api.stats.GetMegagroupStats) as
      | Api.stats.GetMegagroupStats
      | undefined;
    assert.ok(call, "GetMegagroupStats was invoked");
    assert.strictEqual(summary.members.current, 500);
    assert.strictEqual(summary.graphs, undefined);
  });

  it("passes dark=true when requested", async () => {
    const invocations: unknown[] = [];
    const service = makeService(megagroup(), async () => fakeStats(), invocations);

    await service.getMegagroupStats("33333", { dark: true });

    const call = invocations.find((r) => r instanceof Api.stats.GetMegagroupStats) as
      | Api.stats.GetMegagroupStats
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.dark, true);
  });

  it("includes graphs when includeGraphs=true", async () => {
    const invocations: unknown[] = [];
    const service = makeService(megagroup(), async () => fakeStats(), invocations);

    const summary = await service.getMegagroupStats("33333", { includeGraphs: true });

    assert.ok(summary.graphs);
    assert.strictEqual(summary.graphs?.growth.type, "async");
  });

  it("rejects broadcast channels with hint to use broadcast stats", async () => {
    const broadcast = new Api.Channel({
      id: bigInt(12345),
      title: "broadcast",
      photo: new Api.ChatPhotoEmpty(),
      date: 0,
      accessHash: bigInt(1),
      broadcast: true,
    });
    const invocations: unknown[] = [];
    const service = makeService(broadcast, async () => fakeStats(), invocations);

    await assert.rejects(service.getMegagroupStats("12345"), /telegram-get-broadcast-stats/);
    assert.strictEqual(
      invocations.find((r) => r instanceof Api.stats.GetMegagroupStats),
      undefined,
    );
  });

  it("rejects non-channel entities", async () => {
    const chat = new Api.Chat({
      id: bigInt(44444),
      title: "basic group",
      photo: new Api.ChatPhotoEmpty(),
      participantsCount: 5,
      date: 0,
      version: 0,
    });
    const invocations: unknown[] = [];
    const service = makeService(chat, async () => fakeStats(), invocations);

    await assert.rejects(service.getMegagroupStats("44444"), /supergroups/);
  });

  it("surfaces admin-required errors with a clearer message", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      megagroup(),
      async () => {
        throw new Error("CHAT_ADMIN_REQUIRED");
      },
      invocations,
    );

    await assert.rejects(service.getMegagroupStats("33333"), /admin rights/i);
  });

  it("surfaces stats-unavailable errors with hint", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      megagroup(),
      async () => {
        throw new Error("STATS_UNAVAILABLE");
      },
      invocations,
    );

    await assert.rejects(service.getMegagroupStats("33333"), /no stats/i);
  });
});
