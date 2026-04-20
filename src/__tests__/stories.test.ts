import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import {
  summarizeAllStories,
  summarizePeerStories,
  summarizeStoriesById,
  summarizeStoryItem,
  summarizeStoryView,
  summarizeStoryViewsList,
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

function makeActiveStory(id: number, opts: Partial<{ caption: string; views: number; reactions: number }> = {}) {
  return new Api.StoryItem({
    id,
    date: 1000 + id,
    expireDate: 2000 + id,
    caption: opts.caption,
    media: new Api.MessageMediaEmpty(),
    fromId: new Api.PeerUser({ userId: bigInt(42) }),
    pinned: true,
    public: true,
    views: new Api.StoryViews({
      viewsCount: opts.views ?? 0,
      reactionsCount: opts.reactions,
    }),
  });
}

describe("summarizeStoryItem", () => {
  it("summarizes active StoryItem with media className and views counters", () => {
    const item = makeActiveStory(1, { caption: "hi", views: 7, reactions: 3 });
    const out = summarizeStoryItem(item);
    assert.strictEqual(out.id, 1);
    assert.strictEqual(out.kind, "active");
    assert.strictEqual(out.caption, "hi");
    assert.strictEqual(out.mediaType, "MessageMediaEmpty");
    assert.strictEqual(out.viewsCount, 7);
    assert.strictEqual(out.reactionsCount, 3);
    assert.deepStrictEqual(out.fromId, { kind: "user", id: "42" });
    assert.strictEqual(out.pinned, true);
    assert.strictEqual(out.public, true);
  });

  it("summarizes StoryItemDeleted as kind=deleted", () => {
    const out = summarizeStoryItem(new Api.StoryItemDeleted({ id: 5 }));
    assert.deepStrictEqual(out, { id: 5, kind: "deleted" });
  });

  it("summarizes StoryItemSkipped as kind=skipped", () => {
    const out = summarizeStoryItem(new Api.StoryItemSkipped({ id: 9, date: 111, expireDate: 222, closeFriends: true }));
    assert.strictEqual(out.kind, "skipped");
    assert.strictEqual(out.id, 9);
    assert.strictEqual(out.date, 111);
    assert.strictEqual(out.expireDate, 222);
    assert.strictEqual(out.closeFriends, true);
  });
});

describe("summarizePeerStories", () => {
  it("maps peer+stories and preserves maxReadId", () => {
    const ps = new Api.PeerStories({
      peer: new Api.PeerUser({ userId: bigInt(77) }),
      maxReadId: 3,
      stories: [makeActiveStory(1), new Api.StoryItemDeleted({ id: 2 })],
    });
    const out = summarizePeerStories(ps);
    assert.ok(out);
    assert.deepStrictEqual(out?.peer, { kind: "user", id: "77" });
    assert.strictEqual(out?.maxReadId, 3);
    assert.strictEqual(out?.stories.length, 2);
    assert.strictEqual(out?.stories[0].kind, "active");
    assert.strictEqual(out?.stories[1].kind, "deleted");
  });
});

describe("summarizeAllStories", () => {
  it("returns modified=false and empty peerStories for AllStoriesNotModified", () => {
    const resp = new Api.stories.AllStoriesNotModified({
      state: "abc",
      stealthMode: new Api.StoriesStealthMode({ activeUntilDate: 123 }),
    });
    const out = summarizeAllStories(resp);
    assert.strictEqual(out.modified, false);
    assert.strictEqual(out.state, "abc");
    assert.deepStrictEqual(out.peerStories, []);
    assert.strictEqual(out.stealthMode?.activeUntilDate, 123);
  });

  it("returns modified=true with peer stories for AllStories", () => {
    const ps = new Api.PeerStories({
      peer: new Api.PeerChannel({ channelId: bigInt(500) }),
      stories: [makeActiveStory(10, { caption: "ch-story" })],
    });
    const resp = new Api.stories.AllStories({
      hasMore: true,
      count: 1,
      state: "next-token",
      peerStories: [ps],
      chats: [],
      users: [],
      stealthMode: new Api.StoriesStealthMode({}),
    });
    const out = summarizeAllStories(resp);
    assert.strictEqual(out.modified, true);
    assert.strictEqual(out.hasMore, true);
    assert.strictEqual(out.count, 1);
    assert.strictEqual(out.state, "next-token");
    assert.strictEqual(out.peerStories.length, 1);
    assert.deepStrictEqual(out.peerStories[0].peer, { kind: "channel", id: "500" });
    assert.strictEqual(out.peerStories[0].stories[0].caption, "ch-story");
  });
});

describe("TelegramService.getAllStories", () => {
  it("invokes stories.GetAllStories with passed options", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      invocations,
      () =>
        new Api.stories.AllStoriesNotModified({
          state: "s1",
          stealthMode: new Api.StoriesStealthMode({}),
        }),
    );

    const out = await service.getAllStories({ next: true, hidden: false, state: "s0" });
    const call = invocations.find((r) => r instanceof Api.stories.GetAllStories) as
      | Api.stories.GetAllStories
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.next, true);
    assert.strictEqual(call.hidden, false);
    assert.strictEqual(call.state, "s0");
    assert.strictEqual(out.modified, false);
    assert.strictEqual(out.state, "s1");
  });

  it("returns peerStories for AllStories response", async () => {
    const invocations: unknown[] = [];
    const ps = new Api.PeerStories({
      peer: new Api.PeerUser({ userId: bigInt(1) }),
      stories: [makeActiveStory(1)],
    });
    const service = makeService(
      invocations,
      () =>
        new Api.stories.AllStories({
          hasMore: false,
          count: 1,
          state: "final",
          peerStories: [ps],
          chats: [],
          users: [],
          stealthMode: new Api.StoriesStealthMode({}),
        }),
    );

    const out = await service.getAllStories();
    assert.strictEqual(out.modified, true);
    assert.strictEqual(out.peerStories.length, 1);
    assert.strictEqual(out.peerStories[0].stories[0].id, 1);
  });
});

describe("TelegramService.getPeerStories", () => {
  it("invokes stories.GetPeerStories with resolved numeric peer", async () => {
    const invocations: unknown[] = [];
    const inner = new Api.PeerStories({
      peer: new Api.PeerUser({ userId: bigInt(42) }),
      maxReadId: 5,
      stories: [makeActiveStory(11, { caption: "hello" }), new Api.StoryItemDeleted({ id: 12 })],
    });
    const service = makeService(
      invocations,
      () =>
        new Api.stories.PeerStories({
          stories: inner,
          chats: [],
          users: [],
        }),
    );

    const out = await service.getPeerStories("42");
    const call = invocations.find((r) => r instanceof Api.stories.GetPeerStories) as
      | Api.stories.GetPeerStories
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.peer, "42");
    assert.ok(out);
    assert.deepStrictEqual(out?.peer, { kind: "user", id: "42" });
    assert.strictEqual(out?.maxReadId, 5);
    assert.strictEqual(out?.stories.length, 2);
    assert.strictEqual(out?.stories[0].caption, "hello");
    assert.strictEqual(out?.stories[1].kind, "deleted");
  });

  it("passes @username peers through unchanged", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      invocations,
      () =>
        new Api.stories.PeerStories({
          stories: new Api.PeerStories({
            peer: new Api.PeerChannel({ channelId: bigInt(777) }),
            stories: [],
          }),
          chats: [],
          users: [],
        }),
    );

    await service.getPeerStories("@durov");
    const call = invocations.find((r) => r instanceof Api.stories.GetPeerStories) as
      | Api.stories.GetPeerStories
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.peer, "@durov");
  });
});

describe("summarizeStoriesById", () => {
  it("maps count, stories and pinnedToTop", () => {
    const resp = new Api.stories.Stories({
      count: 2,
      stories: [makeActiveStory(10, { caption: "first" }), new Api.StoryItemDeleted({ id: 11 })],
      pinnedToTop: [10],
      chats: [],
      users: [],
    });
    const out = summarizeStoriesById(resp);
    assert.strictEqual(out.count, 2);
    assert.strictEqual(out.stories.length, 2);
    assert.strictEqual(out.stories[0].caption, "first");
    assert.strictEqual(out.stories[1].kind, "deleted");
    assert.deepStrictEqual(out.pinnedToTop, [10]);
  });
});

describe("TelegramService.getStoriesById", () => {
  it("invokes stories.GetStoriesByID with resolved peer and ids", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      invocations,
      () =>
        new Api.stories.Stories({
          count: 1,
          stories: [makeActiveStory(7, { caption: "single" })],
          chats: [],
          users: [],
        }),
    );

    const out = await service.getStoriesById("42", [7, 8]);
    const call = invocations.find((r) => r instanceof Api.stories.GetStoriesByID) as
      | Api.stories.GetStoriesByID
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.peer, "42");
    assert.deepStrictEqual(call.id, [7, 8]);
    assert.strictEqual(out.count, 1);
    assert.strictEqual(out.stories[0].id, 7);
    assert.strictEqual(out.stories[0].caption, "single");
  });

  it("passes @username peers through unchanged", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      invocations,
      () =>
        new Api.stories.Stories({
          count: 0,
          stories: [],
          chats: [],
          users: [],
        }),
    );

    await service.getStoriesById("@durov", [1]);
    const call = invocations.find((r) => r instanceof Api.stories.GetStoriesByID) as
      | Api.stories.GetStoriesByID
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.peer, "@durov");
  });
});

describe("summarizeStoryView", () => {
  it("maps StoryView (user) with reaction", () => {
    const view = new Api.StoryView({
      userId: bigInt(501),
      date: 1710000000,
      reaction: new Api.ReactionEmoji({ emoticon: "👍" }),
      blocked: false,
    });
    const out = summarizeStoryView(view);
    assert.strictEqual(out.kind, "user");
    if (out.kind !== "user") throw new Error("wrong kind");
    assert.strictEqual(out.userId, "501");
    assert.strictEqual(out.date, 1710000000);
    assert.strictEqual(out.reaction, "👍");
    assert.strictEqual(out.blocked, false);
  });

  it("maps StoryView without reaction to reaction:undefined", () => {
    const view = new Api.StoryView({ userId: bigInt(7), date: 1, blockedMyStoriesFrom: true });
    const out = summarizeStoryView(view);
    assert.strictEqual(out.kind, "user");
    if (out.kind !== "user") throw new Error("wrong kind");
    assert.strictEqual(out.userId, "7");
    assert.strictEqual(out.reaction, undefined);
    assert.strictEqual(out.blockedMyStoriesFrom, true);
  });

  it("maps StoryViewPublicRepost with peer and story id", () => {
    const view = new Api.StoryViewPublicRepost({
      peerId: new Api.PeerChannel({ channelId: bigInt(900) }),
      story: new Api.StoryItemDeleted({ id: 44 }),
    });
    const out = summarizeStoryView(view);
    assert.strictEqual(out.kind, "publicRepost");
    if (out.kind !== "publicRepost") throw new Error("wrong kind");
    assert.deepStrictEqual(out.peer, { kind: "channel", id: "900" });
    assert.strictEqual(out.storyId, 44);
  });
});

describe("summarizeStoryViewsList", () => {
  it("maps counts, views array and nextOffset", () => {
    const list = new Api.stories.StoryViewsList({
      count: 2,
      viewsCount: 5,
      forwardsCount: 1,
      reactionsCount: 3,
      views: [
        new Api.StoryView({
          userId: bigInt(10),
          date: 100,
          reaction: new Api.ReactionEmoji({ emoticon: "❤" }),
        }),
        new Api.StoryView({ userId: bigInt(11), date: 101 }),
      ],
      chats: [],
      users: [],
      nextOffset: "cursor-1",
    });
    const out = summarizeStoryViewsList(list);
    assert.strictEqual(out.count, 2);
    assert.strictEqual(out.viewsCount, 5);
    assert.strictEqual(out.forwardsCount, 1);
    assert.strictEqual(out.reactionsCount, 3);
    assert.strictEqual(out.nextOffset, "cursor-1");
    assert.strictEqual(out.views.length, 2);
    assert.strictEqual(out.views[0].kind, "user");
    if (out.views[0].kind !== "user") throw new Error("wrong kind");
    assert.strictEqual(out.views[0].userId, "10");
    assert.strictEqual(out.views[0].reaction, "❤");
  });
});

describe("TelegramService.getStoryViewsList", () => {
  it("invokes stories.GetStoryViewsList with resolved peer and options", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      invocations,
      () =>
        new Api.stories.StoryViewsList({
          count: 0,
          viewsCount: 0,
          forwardsCount: 0,
          reactionsCount: 0,
          views: [],
          chats: [],
          users: [],
        }),
    );

    const out = await service.getStoryViewsList("42", {
      id: 99,
      q: "alice",
      justContacts: true,
      reactionsFirst: true,
      limit: 25,
    });
    const call = invocations.find((r) => r instanceof Api.stories.GetStoryViewsList) as
      | Api.stories.GetStoryViewsList
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.peer, "42");
    assert.strictEqual(call.id, 99);
    assert.strictEqual(call.q, "alice");
    assert.strictEqual(call.justContacts, true);
    assert.strictEqual(call.reactionsFirst, true);
    assert.strictEqual(call.limit, 25);
    assert.strictEqual(call.offset, "");
    assert.strictEqual(out.count, 0);
    assert.strictEqual(out.views.length, 0);
  });

  it("passes offset cursor through", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      invocations,
      () =>
        new Api.stories.StoryViewsList({
          count: 0,
          viewsCount: 0,
          forwardsCount: 0,
          reactionsCount: 0,
          views: [],
          chats: [],
          users: [],
        }),
    );

    await service.getStoryViewsList("@durov", { id: 1, offset: "prev-cursor" });
    const call = invocations.find((r) => r instanceof Api.stories.GetStoryViewsList) as
      | Api.stories.GetStoryViewsList
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.offset, "prev-cursor");
    assert.strictEqual(call.limit, 50);
  });
});
