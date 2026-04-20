import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import { summarizeBroadcastStats, TelegramService } from "../telegram-client.js";

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

function fakeStats(): Api.stats.BroadcastStats {
  // Build a plain object that structurally matches BroadcastStats.
  // We cast through unknown so tests don't depend on GramJS constructor quirks.
  return {
    period: { minDate: 1000, maxDate: 2000 },
    followers: { current: 100, previous: 80 },
    viewsPerPost: { current: 500, previous: 400 },
    sharesPerPost: { current: 10, previous: 8 },
    reactionsPerPost: { current: 25, previous: 20 },
    viewsPerStory: { current: 50, previous: 45 },
    sharesPerStory: { current: 3, previous: 2 },
    reactionsPerStory: { current: 7, previous: 6 },
    enabledNotifications: { part: 40, total: 100 },
    growthGraph: new Api.StatsGraphAsync({ token: "growth-token" }),
    followersGraph: new Api.StatsGraphAsync({ token: "followers-token" }),
    muteGraph: new Api.StatsGraphError({ error: "unavailable" }),
    topHoursGraph: new Api.StatsGraph({
      json: new Api.DataJSON({ data: '{"x":[1,2,3]}' }),
      zoomToken: "zoom",
    }),
    interactionsGraph: new Api.StatsGraphAsync({ token: "inter-token" }),
    ivInteractionsGraph: new Api.StatsGraphAsync({ token: "iv-token" }),
    viewsBySourceGraph: new Api.StatsGraphAsync({ token: "views-src-token" }),
    newFollowersBySourceGraph: new Api.StatsGraphAsync({ token: "new-src-token" }),
    languagesGraph: new Api.StatsGraphAsync({ token: "lang-token" }),
    reactionsByEmotionGraph: new Api.StatsGraphAsync({ token: "react-token" }),
    storyInteractionsGraph: new Api.StatsGraphAsync({ token: "story-inter-token" }),
    storyReactionsByEmotionGraph: new Api.StatsGraphAsync({ token: "story-react-token" }),
    recentPostsInteractions: [
      new Api.PostInteractionCountersMessage({ msgId: 42, views: 500, forwards: 3, reactions: 12 }),
      new Api.PostInteractionCountersStory({ storyId: 7, views: 50, forwards: 1, reactions: 4 }),
    ],
  } as unknown as Api.stats.BroadcastStats;
}

describe("summarizeBroadcastStats", () => {
  it("produces compact summary without graphs by default", () => {
    const summary = summarizeBroadcastStats(fakeStats(), false);
    assert.strictEqual(summary.graphs, undefined);
    assert.deepStrictEqual(summary.period, { minDate: 1000, maxDate: 2000 });
    assert.deepStrictEqual(summary.followers, { current: 100, previous: 80 });
    assert.deepStrictEqual(summary.viewsPerPost, { current: 500, previous: 400 });
    assert.strictEqual(summary.enabledNotifications.percent, 40);
    assert.strictEqual(summary.recentPostsInteractions.length, 2);
    assert.deepStrictEqual(summary.recentPostsInteractions[0], {
      kind: "message",
      msgId: 42,
      views: 500,
      forwards: 3,
      reactions: 12,
    });
    assert.deepStrictEqual(summary.recentPostsInteractions[1], {
      kind: "story",
      storyId: 7,
      views: 50,
      forwards: 1,
      reactions: 4,
    });
  });

  it("handles zero-total enabled notifications without dividing by zero", () => {
    const stats = fakeStats();
    (stats as unknown as { enabledNotifications: { part: number; total: number } }).enabledNotifications = {
      part: 0,
      total: 0,
    };
    const summary = summarizeBroadcastStats(stats, false);
    assert.strictEqual(summary.enabledNotifications.percent, 0);
  });

  it("includes and decodes graphs when requested", () => {
    const summary = summarizeBroadcastStats(fakeStats(), true);
    assert.ok(summary.graphs);
    const graphs = summary.graphs ?? {};
    assert.deepStrictEqual(graphs.growth, { type: "async", token: "growth-token" });
    assert.deepStrictEqual(graphs.mute, { type: "error", error: "unavailable" });
    assert.deepStrictEqual(graphs.topHours, { type: "data", data: { x: [1, 2, 3] }, zoomToken: "zoom" });
  });
});

describe("TelegramService.getBroadcastStats", () => {
  function broadcastChannel(): Api.Channel {
    return new Api.Channel({
      id: bigInt(12345),
      title: "broadcast",
      photo: new Api.ChatPhotoEmpty(),
      date: 0,
      accessHash: bigInt(1),
      broadcast: true,
    });
  }

  it("invokes stats.GetBroadcastStats and returns compact summary", async () => {
    const invocations: unknown[] = [];
    const service = makeService(broadcastChannel(), async () => fakeStats(), invocations);

    const summary = await service.getBroadcastStats("12345");

    const call = invocations.find((r) => r instanceof Api.stats.GetBroadcastStats) as
      | Api.stats.GetBroadcastStats
      | undefined;
    assert.ok(call, "GetBroadcastStats was invoked");
    assert.strictEqual(summary.followers.current, 100);
    assert.strictEqual(summary.graphs, undefined);
  });

  it("passes dark=true when requested", async () => {
    const invocations: unknown[] = [];
    const service = makeService(broadcastChannel(), async () => fakeStats(), invocations);

    await service.getBroadcastStats("12345", { dark: true });

    const call = invocations.find((r) => r instanceof Api.stats.GetBroadcastStats) as
      | Api.stats.GetBroadcastStats
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.dark, true);
  });

  it("includes graphs when includeGraphs=true", async () => {
    const invocations: unknown[] = [];
    const service = makeService(broadcastChannel(), async () => fakeStats(), invocations);

    const summary = await service.getBroadcastStats("12345", { includeGraphs: true });

    assert.ok(summary.graphs);
    assert.strictEqual(summary.graphs?.growth.type, "async");
  });

  it("rejects supergroups with hint to use megagroup stats", async () => {
    const megagroup = new Api.Channel({
      id: bigInt(33333),
      title: "supergroup",
      photo: new Api.ChatPhotoEmpty(),
      date: 0,
      accessHash: bigInt(1),
      megagroup: true,
    });
    const invocations: unknown[] = [];
    const service = makeService(megagroup, async () => fakeStats(), invocations);

    await assert.rejects(service.getBroadcastStats("33333"), /telegram-get-megagroup-stats/);
    assert.strictEqual(
      invocations.find((r) => r instanceof Api.stats.GetBroadcastStats),
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

    await assert.rejects(service.getBroadcastStats("44444"), /channels/);
  });

  it("surfaces admin-required errors with a clearer message", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      broadcastChannel(),
      async () => {
        throw new Error("CHAT_ADMIN_REQUIRED");
      },
      invocations,
    );

    await assert.rejects(service.getBroadcastStats("12345"), /admin rights/i);
  });

  it("surfaces stats-unavailable errors with premium hint", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      broadcastChannel(),
      async () => {
        throw new Error("STATS_UNAVAILABLE");
      },
      invocations,
    );

    await assert.rejects(service.getBroadcastStats("12345"), /Premium/i);
  });
});
