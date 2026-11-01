import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import { TelegramService } from "../telegram-client.js";

interface Internals {
  client: unknown;
  connected: boolean;
}

function makeChannel(id: number, forum: boolean): Api.Channel {
  return new Api.Channel({
    id: bigInt(id),
    title: forum ? "Forum" : "Group",
    photo: new Api.ChatPhotoEmpty(),
    date: 1,
    megagroup: true,
    forum,
    accessHash: bigInt(7),
  });
}

function makeTopic(id: number, topMessage: number, unreadCount: number): Api.ForumTopic {
  return new Api.ForumTopic({
    id,
    date: 1,
    title: `Topic ${id}`,
    iconColor: 0,
    topMessage,
    readInboxMaxId: 0,
    readOutboxMaxId: 0,
    unreadCount,
    unreadMentionsCount: 0,
    unreadReactionsCount: 0,
    fromId: new Api.PeerUser({ userId: bigInt(1) }),
    notifySettings: new Api.PeerNotifySettings({}),
  });
}

function topicsResult(
  topics: Api.ForumTopic[],
  count = topics.length,
  orderByCreateDate = false,
): Api.messages.ForumTopics {
  return new Api.messages.ForumTopics({
    orderByCreateDate,
    count,
    topics,
    messages: topics.map(
      (t) =>
        new Api.Message({
          id: t.topMessage,
          peerId: new Api.PeerChannel({ channelId: bigInt(1) }),
          date: t.topMessage,
          message: "",
        }),
    ),
    chats: [],
    users: [],
    pts: 1,
  });
}

function makeService(opts: {
  entity: Api.Channel;
  topicPages?: Api.messages.ForumTopics[];
  /** Server-side list: pages are cut by offsetTopic, `pageLimit` topics at most per page */
  topicList?: { topics: Api.ForumTopic[]; pageLimit: number };
  dialogs?: unknown[];
  failTopic?: number;
  floodTopic?: number;
  onReadTopic?: () => void;
  topicsError?: string;
}) {
  const calls: Array<{ kind: string; detail?: unknown }> = [];
  let page = 0;
  const service = new TelegramService(1, "hash");
  const internals = service as unknown as Internals;
  internals.client = {
    getEntity: async () => opts.entity,
    getDialogs: async () => opts.dialogs ?? [],
    markAsRead: async () => {
      calls.push({ kind: "readHistory" });
      return true;
    },
    invoke: async (req: unknown) => {
      if (req instanceof Api.channels.GetForumTopics) {
        calls.push({
          kind: "getTopics",
          detail: { offsetTopic: req.offsetTopic, offsetId: req.offsetId, offsetDate: req.offsetDate },
        });
        if (opts.topicsError) throw new Error(opts.topicsError);
        if (opts.topicList) {
          const { topics, pageLimit } = opts.topicList;
          const from = req.offsetTopic ? topics.findIndex((t) => t.id === req.offsetTopic) + 1 : 0;
          return topicsResult(topics.slice(from, from + Math.min(pageLimit, req.limit)), topics.length);
        }
        return opts.topicPages?.[page++] ?? topicsResult([]);
      }
      if (req instanceof Api.messages.ReadDiscussion) {
        const msgId = Number(req.msgId);
        if (msgId === opts.floodTopic) {
          calls.push({ kind: "floodTopic", detail: { msgId } });
          throw new Error("FLOOD_WAIT_30");
        }
        if (msgId === opts.failTopic) throw new Error("TOPIC_DELETED");
        calls.push({ kind: "readTopic", detail: { msgId, readMaxId: req.readMaxId } });
        opts.onReadTopic?.();
        return true;
      }
      throw new Error(`unexpected request ${(req as { className?: string }).className}`);
    },
  };
  internals.connected = true;
  return { service, calls };
}

describe("markAsRead in forums", () => {
  it("reads the chat history and every topic that still has unread messages", async () => {
    const { service, calls } = makeService({
      entity: makeChannel(1, true),
      topicPages: [topicsResult([makeTopic(1, 50, 0), makeTopic(10, 40, 3), makeTopic(20, 30, 1)])],
    });

    const result = await service.markAsRead("-1001");

    assert.deepStrictEqual(result, { topicsMarked: 2 });
    assert.deepStrictEqual(
      calls.filter((c) => c.kind !== "getTopics"),
      [
        { kind: "readHistory" },
        { kind: "readTopic", detail: { msgId: 10, readMaxId: 40 } },
        { kind: "readTopic", detail: { msgId: 20, readMaxId: 30 } },
      ],
    );
  });

  it("does not touch topics outside forums", async () => {
    const { service, calls } = makeService({ entity: makeChannel(1, false) });

    const result = await service.markAsRead("-1001");

    assert.deepStrictEqual(result, {});
    assert.deepStrictEqual(calls, [{ kind: "readHistory" }]);
  });

  it("keeps marking other topics when one fails and reports the failure", async () => {
    const { service, calls } = makeService({
      entity: makeChannel(1, true),
      topicPages: [topicsResult([makeTopic(10, 40, 3), makeTopic(20, 30, 1)])],
      failTopic: 10,
    });

    const result = await service.markAsRead("-1001");

    assert.deepStrictEqual(result, { topicsMarked: 1, topicsFailed: 1, topicError: "TOPIC_DELETED" });
    assert.ok(calls.some((c) => c.kind === "readTopic" && (c.detail as { msgId: number }).msgId === 20));
  });

  it("pages through topics with the last topic as the offset and caps pages and marked topics", async () => {
    const fullPage = (start: number) =>
      topicsResult(
        Array.from({ length: 100 }, (_, i) => makeTopic(start + i, 1000 + start + i, 1)),
        10_000,
      );
    const pages = Array.from({ length: 10 }, (_, p) => fullPage(p * 100 + 2));
    const { service, calls } = makeService({ entity: makeChannel(1, true), topicPages: pages });

    const result = await service.markAsRead("-1001");

    const topicCalls = calls.filter((c) => c.kind === "getTopics");
    assert.strictEqual(topicCalls.length, 5);
    // By default the cursor date is the date of the last topic's top message (equal to its id here)
    assert.deepStrictEqual(topicCalls[1].detail, { offsetTopic: 101, offsetId: 1101, offsetDate: 1101 });
    assert.strictEqual(result.topicsNotChecked, true);
    assert.strictEqual(result.topicsMarked, 100);
    assert.strictEqual(result.topicsRemaining, 400);
    assert.strictEqual(calls.filter((c) => c.kind === "readTopic").length, 100);
  });
});

describe("forum topic cursor", () => {
  it("uses the topic creation date when the server orders topics by creation", async () => {
    const page = (start: number) => {
      const topics = Array.from({ length: 100 }, (_, i) => {
        const t = makeTopic(start + i, 1000 + start + i, 0);
        t.date = 5000 + start + i;
        return t;
      });
      return topicsResult(topics, 150, true);
    };
    const { service, calls } = makeService({
      entity: makeChannel(1, true),
      topicPages: [page(2), topicsResult([makeTopic(500, 600, 0)], 150, true)],
    });

    const result = await service.markAsRead("-1001");

    const topicCalls = calls.filter((c) => c.kind === "getTopics");
    assert.deepStrictEqual(topicCalls[1].detail, { offsetTopic: 101, offsetId: 1101, offsetDate: 5101 });
    assert.strictEqual(result.topicsNotChecked, undefined);
  });
});

describe("getUnreadDialogs in forums", () => {
  function dialog(entity: Api.Channel, unreadCount: number) {
    return {
      id: bigInt(-1000000000000 - entity.id.toJSNumber()),
      title: entity.title,
      entity,
      unreadCount,
      isGroup: true,
      isChannel: true,
    };
  }

  it("lists a forum whose chat counter is 0 while topics are unread", async () => {
    const forum = makeChannel(1, true);
    const { service } = makeService({
      entity: forum,
      dialogs: [dialog(forum, 0)],
      topicPages: [topicsResult([makeTopic(10, 40, 3), makeTopic(20, 30, 0)])],
    });

    const unread = await service.getUnreadDialogs(5);

    assert.strictEqual(unread.length, 1);
    assert.strictEqual(unread[0].unreadCount, 3);
    assert.deepStrictEqual(unread[0].topics, [{ id: 10, title: "Topic 10", unreadCount: 3 }]);
  });

  it("drops a forum with nothing unread before applying the limit", async () => {
    const forum = makeChannel(1, true);
    const group = makeChannel(2, false);
    const { service } = makeService({
      entity: forum,
      dialogs: [dialog(forum, 0), dialog(group, 4)],
      topicPages: [topicsResult([makeTopic(10, 40, 0)])],
    });

    const unread = await service.getUnreadDialogs(1);

    assert.strictEqual(unread.length, 1);
    assert.strictEqual(unread[0].name, "Group");
  });

  it("skips a forum with a zero counter when its topics cannot be read", async () => {
    const forum = makeChannel(1, true);
    const { service } = makeService({ entity: forum, dialogs: [dialog(forum, 0)], topicsError: "CHANNEL_PRIVATE" });

    assert.deepStrictEqual(await service.getUnreadDialogs(5), []);
  });
});

describe("forum topic scan", () => {
  it("keeps paging after a short page that is not the end of the list", async () => {
    // 80 topics, 20 per page: four short pages and the empty one that ends the list, the unread topic last
    const topics = Array.from({ length: 80 }, (_, i) => makeTopic(i + 2, 1000 + i, i === 79 ? 2 : 0));
    const { service, calls } = makeService({ entity: makeChannel(1, true), topicList: { topics, pageLimit: 20 } });

    const result = await service.markAsRead("-1001");

    assert.deepStrictEqual(result, { topicsMarked: 1 });
    assert.ok(calls.some((c) => c.kind === "readTopic" && (c.detail as { msgId: number }).msgId === 81));
  });

  it("continues from where the previous call stopped and starts over once the list is done", async () => {
    const topics = Array.from({ length: 600 }, (_, i) => makeTopic(i + 2, 1000 + i, i >= 550 ? 1 : 0));
    const { service, calls } = makeService({ entity: makeChannel(1, true), topicList: { topics, pageLimit: 100 } });

    const first = await service.markAsRead("-1001");
    const second = await service.markAsRead("-1001");
    const firstTopicCallOfThird = calls.length;
    const third = await service.markAsRead("-1001");

    assert.deepStrictEqual(first, { topicsMarked: 0, topicsNotChecked: true });
    assert.deepStrictEqual(second, { topicsMarked: 50 });
    // The list was finished, so the next call starts from the top again
    assert.deepStrictEqual(third, { topicsMarked: 0, topicsNotChecked: true });
    const thirdScan = calls.slice(firstTopicCallOfThird).find((c) => c.kind === "getTopics");
    assert.ok(thirdScan);
    assert.strictEqual((thirdScan.detail as { offsetTopic: number }).offsetTopic, 0);
  });

  it("rescans the same range while unread topics are left in it", async () => {
    const topics = Array.from({ length: 600 }, (_, i) => makeTopic(i + 2, 1000 + i, i < 150 ? 1 : 0));
    const { service } = makeService({ entity: makeChannel(1, true), topicList: { topics, pageLimit: 100 } });

    const first = await service.markAsRead("-1001");
    const second = await service.markAsRead("-1001");

    assert.deepStrictEqual(first, { topicsMarked: 100, topicsRemaining: 50, topicsNotChecked: true });
    // The mock keeps unread counters, so the same range is read again rather than skipped
    assert.strictEqual(second.topicsRemaining, 50);
  });

  it("does not move past a range where a topic failed", async () => {
    const topics = Array.from({ length: 600 }, (_, i) => makeTopic(i + 2, 1000 + i, i === 10 ? 1 : 0));
    const { service, calls } = makeService({
      entity: makeChannel(1, true),
      topicList: { topics, pageLimit: 100 },
      failTopic: 12,
    });

    const first = await service.markAsRead("-1001");
    const before = calls.length;
    await service.markAsRead("-1001");

    assert.deepStrictEqual(first, {
      topicsMarked: 0,
      topicsFailed: 1,
      topicError: "TOPIC_DELETED",
      topicsNotChecked: true,
    });
    const secondScan = calls.slice(before).find((c) => c.kind === "getTopics");
    assert.ok(secondScan);
    assert.strictEqual((secondScan.detail as { offsetTopic: number }).offsetTopic, 0);
  });

  it("stops reading topics on FloodWait instead of waiting it out", async () => {
    const { service, calls } = makeService({
      entity: makeChannel(1, true),
      topicPages: [topicsResult([makeTopic(10, 40, 3), makeTopic(20, 30, 1)])],
      floodTopic: 10,
    });

    const started = Date.now();
    const result = await service.markAsRead("-1001");

    assert.ok(Date.now() - started < 5000, "must not wait out the 30 s FloodWait");
    assert.strictEqual(result.topicsMarked, 0);
    assert.strictEqual(result.topicsRemaining, 2);
    assert.match(result.topicError ?? "", /^Rate limit: Telegram requires a 30s wait/);
    assert.strictEqual(calls.filter((c) => c.kind === "floodTopic").length, 1);
    assert.ok(!calls.some((c) => c.kind === "readTopic"));
  });

  it("keeps scanning after topics before the cursor were deleted between calls", async () => {
    const topics = Array.from({ length: 700 }, (_, i) => makeTopic(i + 2, 1000 + i, i === 650 ? 1 : 0));
    const topicList = { topics, pageLimit: 100 };
    const { service, calls } = makeService({ entity: makeChannel(1, true), topicList });

    const first = await service.markAsRead("-1001");
    topicList.topics = topics.slice(100);
    const second = await service.markAsRead("-1001");

    assert.deepStrictEqual(first, { topicsMarked: 0, topicsNotChecked: true });
    assert.deepStrictEqual(second, { topicsMarked: 1 });
    assert.ok(calls.some((c) => c.kind === "readTopic" && (c.detail as { msgId: number }).msgId === 652));
  });

  it("stops reading topics when the time budget runs out", async (t) => {
    let now = 1_000_000;
    t.mock.method(Date, "now", () => now);
    const topics = Array.from({ length: 10 }, (_, i) => makeTopic(i + 2, 1000 + i, 1));
    const { service } = makeService({
      entity: makeChannel(1, true),
      topicList: { topics, pageLimit: 100 },
      // Each read takes 15 s of fake time, as if GramJS slept through a FloodWait
      onReadTopic: () => {
        now += 15_000;
      },
    });

    const result = await service.markAsRead("-1001");

    assert.deepStrictEqual(result, { topicsMarked: 2, topicsRemaining: 8 });
  });
});
