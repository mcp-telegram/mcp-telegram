import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import {
  peerToCompact,
  summarizeChannelDifference,
  summarizeUpdatesDifference,
  TelegramService,
} from "../telegram-client.js";

interface Internals {
  client: unknown;
  connected: boolean;
  resolveChat: (id: string) => Promise<unknown>;
}

function makeService(
  invocations: unknown[],
  responder: (req: unknown) => unknown,
  chatEntity?: unknown,
): TelegramService {
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
  internals.resolveChat = async () => chatEntity;
  return service;
}

function makeState(pts: number, qts: number, date: number, seq = 0, unreadCount = 0): Api.updates.State {
  return new Api.updates.State({ pts, qts, date, seq, unreadCount });
}

function makeChannel(id: number, megagroup = true): Api.Channel {
  return new Api.Channel({
    id: bigInt(id),
    title: "c",
    photo: new Api.ChatPhotoEmpty(),
    date: 0,
    accessHash: bigInt(1),
    megagroup,
  });
}

function makeMessage(id: number, peerId: Api.TypePeer, text = "hi"): Api.Message {
  return new Api.Message({ id, peerId, date: 10, message: text });
}

describe("peerToCompact", () => {
  it("maps PeerUser/PeerChat/PeerChannel to compact kind+id", () => {
    assert.deepStrictEqual(peerToCompact(new Api.PeerUser({ userId: bigInt(5) })), { kind: "user", id: "5" });
    assert.deepStrictEqual(peerToCompact(new Api.PeerChat({ chatId: bigInt(6) })), { kind: "chat", id: "6" });
    assert.deepStrictEqual(peerToCompact(new Api.PeerChannel({ channelId: bigInt(7) })), {
      kind: "channel",
      id: "7",
    });
    assert.strictEqual(peerToCompact(undefined), undefined);
  });
});

describe("TelegramService.getUpdatesState", () => {
  it("invokes updates.GetState and returns compact state", async () => {
    const invocations: unknown[] = [];
    const service = makeService(invocations, () => makeState(100, 200, 300, 4, 5));

    const out = await service.getUpdatesState();

    assert.ok(invocations.find((r) => r instanceof Api.updates.GetState));
    assert.deepStrictEqual(out, { pts: 100, qts: 200, date: 300, seq: 4, unreadCount: 5 });
  });
});

describe("summarizeUpdatesDifference", () => {
  it("handles DifferenceEmpty as final with no messages", () => {
    const diff = new Api.updates.DifferenceEmpty({ date: 400, seq: 1 });
    const out = summarizeUpdatesDifference(diff, { pts: 10, qts: 20, date: 30 });
    assert.strictEqual(out.isFinal, true);
    assert.strictEqual(out.state.pts, 10);
    assert.strictEqual(out.state.qts, 20);
    assert.strictEqual(out.state.date, 400);
    assert.deepStrictEqual(out.newMessages, []);
    assert.deepStrictEqual(out.deletedMessageIds, []);
    assert.strictEqual(out.fallback, undefined);
  });

  it("handles Difference (final) with newMessages, deleted updates, and final state", () => {
    const msg = makeMessage(1, new Api.PeerUser({ userId: bigInt(7) }), "yo");
    const del = new Api.UpdateDeleteMessages({ messages: [5, 6], pts: 11, ptsCount: 2 });
    const delCh = new Api.UpdateDeleteChannelMessages({
      channelId: bigInt(999),
      messages: [20, 21],
      pts: 22,
      ptsCount: 2,
    });
    const diff = new Api.updates.Difference({
      newMessages: [msg],
      newEncryptedMessages: [],
      otherUpdates: [del, delCh],
      chats: [],
      users: [],
      state: makeState(50, 60, 70, 8, 1),
    });
    const out = summarizeUpdatesDifference(diff, { pts: 1, qts: 2, date: 3 });

    assert.strictEqual(out.isFinal, true);
    assert.deepStrictEqual(out.state, { pts: 50, qts: 60, date: 70, seq: 8, unreadCount: 1 });
    assert.strictEqual(out.newMessages.length, 1);
    assert.strictEqual(out.newMessages[0].text, "yo");
    assert.deepStrictEqual(out.newMessages[0].peer, { kind: "user", id: "7" });
    assert.strictEqual(out.newMessages[0].isService, false);
    assert.strictEqual(out.deletedMessageIds.length, 2);
    assert.deepStrictEqual(out.deletedMessageIds[0], { messageIds: [5, 6] });
    assert.deepStrictEqual(out.deletedMessageIds[1], {
      peer: { kind: "channel", id: "999" },
      messageIds: [20, 21],
    });
    assert.deepStrictEqual(
      out.otherUpdates.map((u) => u.type),
      ["UpdateDeleteMessages", "UpdateDeleteChannelMessages"],
    );
  });

  it("handles DifferenceSlice as non-final with intermediateState", () => {
    const diff = new Api.updates.DifferenceSlice({
      newMessages: [],
      newEncryptedMessages: [],
      otherUpdates: [],
      chats: [],
      users: [],
      intermediateState: makeState(77, 88, 99, 0, 0),
    });
    const out = summarizeUpdatesDifference(diff, { pts: 1, qts: 2, date: 3 });
    assert.strictEqual(out.isFinal, false);
    assert.strictEqual(out.state.pts, 77);
  });

  it("handles DifferenceTooLong with fallback hint", () => {
    const diff = new Api.updates.DifferenceTooLong({ pts: 500 });
    const out = summarizeUpdatesDifference(diff, { pts: 1, qts: 2, date: 3 });
    assert.strictEqual(out.isFinal, true);
    assert.strictEqual(out.state.pts, 500);
    assert.ok(out.fallback);
    assert.strictEqual(out.fallback?.kind, "tooLong");
    assert.match(out.fallback?.suggestedAction ?? "", /telegram-read-messages|resync/);
  });
});

describe("TelegramService.getUpdates", () => {
  it("invokes updates.GetDifference with cursor and caps ptsLimit to 1000", async () => {
    const invocations: unknown[] = [];
    const service = makeService(invocations, () => new Api.updates.DifferenceEmpty({ date: 99, seq: 0 }));
    await service.getUpdates({ pts: 10, qts: 20, date: 30, ptsLimit: 5000 });
    const call = invocations.find((r) => r instanceof Api.updates.GetDifference) as
      | Api.updates.GetDifference
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.pts, 10);
    assert.strictEqual(call.qts, 20);
    assert.strictEqual(call.date, 30);
    assert.strictEqual(call.ptsLimit, 1000);
  });

  it("applies defaults when ptsLimit/ptsTotalLimit omitted", async () => {
    const invocations: unknown[] = [];
    const service = makeService(invocations, () => new Api.updates.DifferenceEmpty({ date: 1, seq: 0 }));
    await service.getUpdates({ pts: 1, qts: 1, date: 1 });
    const call = invocations.find((r) => r instanceof Api.updates.GetDifference) as
      | Api.updates.GetDifference
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.ptsLimit, 100);
    assert.strictEqual(call.ptsTotalLimit, 1000);
  });
});

describe("summarizeChannelDifference", () => {
  it("summarizes ChannelDifferenceEmpty", () => {
    const diff = new Api.updates.ChannelDifferenceEmpty({ final: true, pts: 42, timeout: 30 });
    const out = summarizeChannelDifference(diff, "100", 0);
    assert.strictEqual(out.pts, 42);
    assert.strictEqual(out.isFinal, true);
    assert.strictEqual(out.timeout, 30);
    assert.deepStrictEqual(out.newMessages, []);
  });

  it("summarizes ChannelDifference with newMessages/otherUpdates", () => {
    const msg = makeMessage(10, new Api.PeerChannel({ channelId: bigInt(100) }), "chan-msg");
    const diff = new Api.updates.ChannelDifference({
      final: false,
      pts: 55,
      newMessages: [msg],
      otherUpdates: [],
      chats: [],
      users: [],
    });
    const out = summarizeChannelDifference(diff, "100", 0);
    assert.strictEqual(out.pts, 55);
    assert.strictEqual(out.isFinal, false);
    assert.strictEqual(out.newMessages.length, 1);
    assert.strictEqual(out.newMessages[0].text, "chan-msg");
  });

  it("summarizes ChannelDifferenceTooLong with fallback and dialog snapshot messages", () => {
    const msg = makeMessage(1, new Api.PeerChannel({ channelId: bigInt(100) }), "snap");
    const diff = new Api.updates.ChannelDifferenceTooLong({
      final: true,
      dialog: new Api.Dialog({
        peer: new Api.PeerChannel({ channelId: bigInt(100) }),
        topMessage: 1,
        readInboxMaxId: 0,
        readOutboxMaxId: 0,
        unreadCount: 0,
        unreadMentionsCount: 0,
        unreadReactionsCount: 0,
        notifySettings: new Api.PeerNotifySettings({}),
      }),
      messages: [msg],
      chats: [],
      users: [],
    });
    const out = summarizeChannelDifference(diff, "100", 42);
    assert.strictEqual(out.pts, 42);
    assert.strictEqual(out.newMessages.length, 1);
    assert.ok(out.fallback);
    assert.strictEqual(out.fallback?.kind, "tooLong");
  });
});

describe("TelegramService.getChannelUpdates", () => {
  it("invokes updates.GetChannelDifference with resolved channel and caps limit", async () => {
    const invocations: unknown[] = [];
    const chan = makeChannel(100);
    const service = makeService(
      invocations,
      () => new Api.updates.ChannelDifferenceEmpty({ final: true, pts: 7 }),
      chan,
    );

    await service.getChannelUpdates("100", { pts: 5, limit: 9999999, force: true });

    const call = invocations.find((r) => r instanceof Api.updates.GetChannelDifference) as
      | Api.updates.GetChannelDifference
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.pts, 5);
    assert.strictEqual(call.limit, 1_000);
    assert.strictEqual(call.force, true);
    assert.ok(call.filter instanceof Api.ChannelMessagesFilterEmpty);
  });

  it("rejects when chat entity is not a channel", async () => {
    const invocations: unknown[] = [];
    const notChan = new Api.Chat({
      id: bigInt(1),
      title: "c",
      photo: new Api.ChatPhotoEmpty(),
      participantsCount: 1,
      date: 0,
      version: 1,
    });
    const service = makeService(
      invocations,
      () => new Api.updates.ChannelDifferenceEmpty({ final: true, pts: 0 }),
      notChan,
    );
    await assert.rejects(service.getChannelUpdates("1", { pts: 1 }), /channels\/supergroups/i);
  });
});
