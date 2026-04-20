import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import {
  summarizeGroupCall,
  summarizeGroupCallInfo,
  summarizeGroupCallParticipant,
  summarizeGroupCallParticipants,
  TelegramService,
} from "../telegram-client.js";
import { isGroupCallsEnabled } from "../tools/group-calls.js";

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

describe("summarizeGroupCallInfo", () => {
  it("maps an active GroupCall with flags and optional metadata", () => {
    const call = new Api.GroupCall({
      id: bigInt(100),
      accessHash: bigInt(200),
      participantsCount: 5,
      title: "Stand-up",
      recordStartDate: 1710000000,
      streamDcId: 2,
      unmutedVideoCount: 1,
      unmutedVideoLimit: 30,
      version: 7,
      joinMuted: true,
      canStartVideo: true,
      rtmpStream: false,
    });
    const out = summarizeGroupCallInfo(call);
    assert.strictEqual(out.kind, "active");
    if (out.kind !== "active") throw new Error("expected active");
    assert.strictEqual(out.id, "100");
    assert.strictEqual(out.accessHash, "200");
    assert.strictEqual(out.participantsCount, 5);
    assert.strictEqual(out.title, "Stand-up");
    assert.strictEqual(out.recordStartDate, 1710000000);
    assert.strictEqual(out.streamDcId, 2);
    assert.strictEqual(out.unmutedVideoCount, 1);
    assert.strictEqual(out.unmutedVideoLimit, 30);
    assert.strictEqual(out.version, 7);
    assert.strictEqual(out.joinMuted, true);
    assert.strictEqual(out.canStartVideo, true);
    assert.strictEqual(out.rtmpStream, false);
  });

  it("maps a discarded GroupCall with duration", () => {
    const call = new Api.GroupCallDiscarded({
      id: bigInt(5),
      accessHash: bigInt(6),
      duration: 1234,
    });
    const out = summarizeGroupCallInfo(call);
    assert.strictEqual(out.kind, "discarded");
    if (out.kind !== "discarded") throw new Error("expected discarded");
    assert.strictEqual(out.id, "5");
    assert.strictEqual(out.accessHash, "6");
    assert.strictEqual(out.duration, 1234);
  });
});

describe("summarizeGroupCallParticipant", () => {
  it("maps required fields and flags", () => {
    const p = new Api.GroupCallParticipant({
      peer: new Api.PeerUser({ userId: bigInt(99) }),
      date: 1700000000,
      source: 12345,
      muted: true,
      self: true,
      volume: 10000,
      about: "hello",
      raiseHandRating: bigInt(42),
      video: new Api.GroupCallParticipantVideo({
        endpoint: "vid-ep",
        sourceGroups: [],
      }),
    });
    const out = summarizeGroupCallParticipant(p);
    assert.deepStrictEqual(out.peer, { kind: "user", id: "99" });
    assert.strictEqual(out.date, 1700000000);
    assert.strictEqual(out.source, 12345);
    assert.strictEqual(out.muted, true);
    assert.strictEqual(out.self, true);
    assert.strictEqual(out.volume, 10000);
    assert.strictEqual(out.about, "hello");
    assert.strictEqual(out.raiseHandRating, "42");
    assert.strictEqual(out.hasVideo, true);
    assert.strictEqual(out.hasPresentation, undefined);
  });

  it("handles channel peer and leaves optional fields undefined", () => {
    const p = new Api.GroupCallParticipant({
      peer: new Api.PeerChannel({ channelId: bigInt(500) }),
      date: 1,
      source: 2,
    });
    const out = summarizeGroupCallParticipant(p);
    assert.deepStrictEqual(out.peer, { kind: "channel", id: "500" });
    assert.strictEqual(out.volume, undefined);
    assert.strictEqual(out.about, undefined);
    assert.strictEqual(out.raiseHandRating, undefined);
    assert.strictEqual(out.hasVideo, undefined);
  });
});

describe("summarizeGroupCall", () => {
  it("maps call info, participants and next offset", () => {
    const resp = new Api.phone.GroupCall({
      call: new Api.GroupCall({
        id: bigInt(1),
        accessHash: bigInt(2),
        participantsCount: 2,
        unmutedVideoLimit: 30,
        version: 1,
      }),
      participants: [
        new Api.GroupCallParticipant({
          peer: new Api.PeerUser({ userId: bigInt(10) }),
          date: 100,
          source: 1,
        }),
        new Api.GroupCallParticipant({
          peer: new Api.PeerUser({ userId: bigInt(11) }),
          date: 101,
          source: 2,
        }),
      ],
      participantsNextOffset: "next-cursor",
      chats: [],
      users: [],
    });
    const out = summarizeGroupCall(resp);
    assert.strictEqual(out.call.kind, "active");
    assert.strictEqual(out.call.id, "1");
    assert.strictEqual(out.participants.length, 2);
    assert.deepStrictEqual(out.participants[0].peer, { kind: "user", id: "10" });
    assert.strictEqual(out.participantsNextOffset, "next-cursor");
  });

  it("omits empty nextOffset", () => {
    const resp = new Api.phone.GroupCall({
      call: new Api.GroupCall({
        id: bigInt(1),
        accessHash: bigInt(2),
        participantsCount: 0,
        unmutedVideoLimit: 30,
        version: 1,
      }),
      participants: [],
      participantsNextOffset: "",
      chats: [],
      users: [],
    });
    const out = summarizeGroupCall(resp);
    assert.strictEqual(out.participants.length, 0);
    assert.strictEqual(out.participantsNextOffset, undefined);
  });
});

describe("TelegramService.getGroupCall", () => {
  it("resolves channel, extracts input group call from ChannelFull, and invokes phone.GetGroupCall", async () => {
    const channelEntity = new Api.Channel({
      id: bigInt(777),
      title: "Test Channel",
      photo: new Api.ChatPhotoEmpty(),
      date: 0,
      participantsCount: 5,
      accessHash: bigInt(888),
    });
    const inputCall = new Api.InputGroupCall({ id: bigInt(1001), accessHash: bigInt(2002) });
    const fullChannel = new Api.ChannelFull({
      id: bigInt(777),
      about: "x",
      readInboxMaxId: 0,
      readOutboxMaxId: 0,
      unreadCount: 0,
      chatPhoto: new Api.PhotoEmpty({ id: bigInt(0) }),
      notifySettings: new Api.PeerNotifySettings({}),
      botInfo: [],
      pts: 0,
      call: inputCall,
    });
    const fullResponse = new Api.messages.ChatFull({
      fullChat: fullChannel,
      chats: [channelEntity],
      users: [],
    });
    const groupCallResponse = new Api.phone.GroupCall({
      call: new Api.GroupCall({
        id: bigInt(1001),
        accessHash: bigInt(2002),
        participantsCount: 3,
        unmutedVideoLimit: 30,
        version: 1,
      }),
      participants: [],
      participantsNextOffset: "",
      chats: [],
      users: [],
    });
    const invocations: unknown[] = [];
    const service = makeService(invocations, (req) => {
      if (req instanceof Api.channels.GetFullChannel) return fullResponse;
      if (req instanceof Api.phone.GetGroupCall) return groupCallResponse;
      throw new Error(`Unexpected request ${(req as { className?: string }).className}`);
    });
    const internals = service as unknown as { resolveChat: (id: string) => Promise<unknown> };
    internals.resolveChat = async () => channelEntity;

    const out = await service.getGroupCall("@foo", { limit: 0 });
    const getCall = invocations.find((r) => r instanceof Api.phone.GetGroupCall) as Api.phone.GetGroupCall | undefined;
    assert.ok(getCall, "phone.GetGroupCall should be invoked");
    assert.strictEqual(getCall.limit, 0);
    assert.ok(getCall.call instanceof Api.InputGroupCall);
    assert.strictEqual((getCall.call as Api.InputGroupCall).id.toString(), "1001");
    assert.strictEqual(out.call.kind, "active");
    assert.strictEqual(out.call.id, "1001");
  });

  it("throws when chat has no active group call", async () => {
    const channelEntity = new Api.Channel({
      id: bigInt(1),
      title: "T",
      photo: new Api.ChatPhotoEmpty(),
      date: 0,
      participantsCount: 1,
      accessHash: bigInt(2),
    });
    const fullChannel = new Api.ChannelFull({
      id: bigInt(1),
      about: "x",
      readInboxMaxId: 0,
      readOutboxMaxId: 0,
      unreadCount: 0,
      chatPhoto: new Api.PhotoEmpty({ id: bigInt(0) }),
      notifySettings: new Api.PeerNotifySettings({}),
      botInfo: [],
      pts: 0,
    });
    const fullResponse = new Api.messages.ChatFull({
      fullChat: fullChannel,
      chats: [channelEntity],
      users: [],
    });
    const service = makeService([], () => fullResponse);
    const internals = service as unknown as { resolveChat: (id: string) => Promise<unknown> };
    internals.resolveChat = async () => channelEntity;

    await assert.rejects(() => service.getGroupCall("@no-call"), /No active group call/);
  });

  it("rejects non-group peers (e.g. users)", async () => {
    const userEntity = new Api.User({ id: bigInt(1), accessHash: bigInt(2), firstName: "x" });
    const service = makeService([], () => {
      throw new Error("should not invoke");
    });
    const internals = service as unknown as { resolveChat: (id: string) => Promise<unknown> };
    internals.resolveChat = async () => userEntity;
    await assert.rejects(() => service.getGroupCall("@user"), /only available for groups/);
  });
});

describe("summarizeGroupCallParticipants", () => {
  it("maps count, participants, nextOffset, and version", () => {
    const resp = new Api.phone.GroupParticipants({
      count: 7,
      participants: [
        new Api.GroupCallParticipant({
          peer: new Api.PeerUser({ userId: bigInt(42) }),
          date: 100,
          source: 555,
        }),
      ],
      nextOffset: "cursor-2",
      chats: [],
      users: [],
      version: 9,
    });
    const out = summarizeGroupCallParticipants(resp);
    assert.strictEqual(out.count, 7);
    assert.strictEqual(out.participants.length, 1);
    assert.deepStrictEqual(out.participants[0].peer, { kind: "user", id: "42" });
    assert.strictEqual(out.nextOffset, "cursor-2");
    assert.strictEqual(out.version, 9);
  });

  it("omits empty nextOffset", () => {
    const resp = new Api.phone.GroupParticipants({
      count: 0,
      participants: [],
      nextOffset: "",
      chats: [],
      users: [],
      version: 1,
    });
    const out = summarizeGroupCallParticipants(resp);
    assert.strictEqual(out.nextOffset, undefined);
    assert.strictEqual(out.participants.length, 0);
  });
});

describe("TelegramService.getGroupCallParticipants", () => {
  it("resolves call from chat and forwards ids/sources/offset/limit", async () => {
    const channelEntity = new Api.Channel({
      id: bigInt(777),
      title: "Call Chat",
      photo: new Api.ChatPhotoEmpty(),
      date: 0,
      participantsCount: 10,
      accessHash: bigInt(888),
    });
    const inputCall = new Api.InputGroupCall({ id: bigInt(1001), accessHash: bigInt(2002) });
    const fullChannel = new Api.ChannelFull({
      id: bigInt(777),
      about: "x",
      readInboxMaxId: 0,
      readOutboxMaxId: 0,
      unreadCount: 0,
      chatPhoto: new Api.PhotoEmpty({ id: bigInt(0) }),
      notifySettings: new Api.PeerNotifySettings({}),
      botInfo: [],
      pts: 0,
      call: inputCall,
    });
    const fullResponse = new Api.messages.ChatFull({
      fullChat: fullChannel,
      chats: [channelEntity],
      users: [],
    });
    const participantsResponse = new Api.phone.GroupParticipants({
      count: 3,
      participants: [
        new Api.GroupCallParticipant({
          peer: new Api.PeerUser({ userId: bigInt(50) }),
          date: 200,
          source: 111,
        }),
      ],
      nextOffset: "next-page",
      chats: [],
      users: [],
      version: 4,
    });

    const invocations: unknown[] = [];
    const service = makeService(invocations, (req) => {
      if (req instanceof Api.channels.GetFullChannel) return fullResponse;
      if (req instanceof Api.phone.GetGroupParticipants) return participantsResponse;
      throw new Error(`Unexpected request ${(req as { className?: string }).className}`);
    });
    const internals = service as unknown as {
      resolveChat: (id: string) => Promise<unknown>;
      resolvePeer: (id: string) => Promise<unknown>;
    };
    internals.resolveChat = async () => channelEntity;
    internals.resolvePeer = async (id: string) => ({ stubPeerFor: id });

    const out = await service.getGroupCallParticipants("@foo", {
      ids: ["@alice", "123"],
      sources: [10, 20],
      offset: "start",
      limit: 50,
    });

    const req = invocations.find((r) => r instanceof Api.phone.GetGroupParticipants) as
      | Api.phone.GetGroupParticipants
      | undefined;
    assert.ok(req, "phone.GetGroupParticipants should be invoked");
    assert.ok(req.call instanceof Api.InputGroupCall);
    assert.strictEqual((req.call as Api.InputGroupCall).id.toString(), "1001");
    assert.strictEqual(req.offset, "start");
    assert.strictEqual(req.limit, 50);
    assert.deepStrictEqual(req.sources, [10, 20]);
    assert.strictEqual(req.ids?.length, 2);

    assert.strictEqual(out.count, 3);
    assert.strictEqual(out.participants.length, 1);
    assert.deepStrictEqual(out.participants[0].peer, { kind: "user", id: "50" });
    assert.strictEqual(out.nextOffset, "next-page");
    assert.strictEqual(out.version, 4);
  });

  it("defaults to empty ids/sources, empty offset, limit 100", async () => {
    const channelEntity = new Api.Channel({
      id: bigInt(1),
      title: "C",
      photo: new Api.ChatPhotoEmpty(),
      date: 0,
      participantsCount: 2,
      accessHash: bigInt(2),
    });
    const inputCall = new Api.InputGroupCall({ id: bigInt(9), accessHash: bigInt(10) });
    const fullChannel = new Api.ChannelFull({
      id: bigInt(1),
      about: "x",
      readInboxMaxId: 0,
      readOutboxMaxId: 0,
      unreadCount: 0,
      chatPhoto: new Api.PhotoEmpty({ id: bigInt(0) }),
      notifySettings: new Api.PeerNotifySettings({}),
      botInfo: [],
      pts: 0,
      call: inputCall,
    });
    const fullResponse = new Api.messages.ChatFull({
      fullChat: fullChannel,
      chats: [channelEntity],
      users: [],
    });
    const participantsResponse = new Api.phone.GroupParticipants({
      count: 0,
      participants: [],
      nextOffset: "",
      chats: [],
      users: [],
      version: 1,
    });
    const invocations: unknown[] = [];
    const service = makeService(invocations, (req) => {
      if (req instanceof Api.channels.GetFullChannel) return fullResponse;
      if (req instanceof Api.phone.GetGroupParticipants) return participantsResponse;
      throw new Error("unexpected");
    });
    const internals = service as unknown as { resolveChat: (id: string) => Promise<unknown> };
    internals.resolveChat = async () => channelEntity;

    await service.getGroupCallParticipants("@foo");

    const req = invocations.find((r) => r instanceof Api.phone.GetGroupParticipants) as
      | Api.phone.GetGroupParticipants
      | undefined;
    assert.ok(req);
    assert.deepStrictEqual(req.ids, []);
    assert.deepStrictEqual(req.sources, []);
    assert.strictEqual(req.offset, "");
    assert.strictEqual(req.limit, 100);
  });

  it("throws when chat has no active group call", async () => {
    const channelEntity = new Api.Channel({
      id: bigInt(1),
      title: "T",
      photo: new Api.ChatPhotoEmpty(),
      date: 0,
      participantsCount: 1,
      accessHash: bigInt(2),
    });
    const fullChannel = new Api.ChannelFull({
      id: bigInt(1),
      about: "x",
      readInboxMaxId: 0,
      readOutboxMaxId: 0,
      unreadCount: 0,
      chatPhoto: new Api.PhotoEmpty({ id: bigInt(0) }),
      notifySettings: new Api.PeerNotifySettings({}),
      botInfo: [],
      pts: 0,
    });
    const fullResponse = new Api.messages.ChatFull({
      fullChat: fullChannel,
      chats: [channelEntity],
      users: [],
    });
    const service = makeService([], () => fullResponse);
    const internals = service as unknown as { resolveChat: (id: string) => Promise<unknown> };
    internals.resolveChat = async () => channelEntity;

    await assert.rejects(() => service.getGroupCallParticipants("@no-call"), /No active group call/);
  });

  it("rejects non-group peers", async () => {
    const userEntity = new Api.User({ id: bigInt(1), accessHash: bigInt(2), firstName: "x" });
    const service = makeService([], () => {
      throw new Error("should not invoke");
    });
    const internals = service as unknown as { resolveChat: (id: string) => Promise<unknown> };
    internals.resolveChat = async () => userEntity;
    await assert.rejects(() => service.getGroupCallParticipants("@user"), /only available for groups/);
  });
});

describe("isGroupCallsEnabled gate", () => {
  it("is off by default", () => {
    const prev = process.env.MCP_TELEGRAM_ENABLE_GROUP_CALLS;
    delete process.env.MCP_TELEGRAM_ENABLE_GROUP_CALLS;
    try {
      assert.strictEqual(isGroupCallsEnabled(), false);
    } finally {
      if (prev !== undefined) process.env.MCP_TELEGRAM_ENABLE_GROUP_CALLS = prev;
    }
  });

  it("turns on when env is '1'", () => {
    const prev = process.env.MCP_TELEGRAM_ENABLE_GROUP_CALLS;
    process.env.MCP_TELEGRAM_ENABLE_GROUP_CALLS = "1";
    try {
      assert.strictEqual(isGroupCallsEnabled(), true);
    } finally {
      if (prev === undefined) delete process.env.MCP_TELEGRAM_ENABLE_GROUP_CALLS;
      else process.env.MCP_TELEGRAM_ENABLE_GROUP_CALLS = prev;
    }
  });

  it("stays off for any non-'1' value", () => {
    const prev = process.env.MCP_TELEGRAM_ENABLE_GROUP_CALLS;
    process.env.MCP_TELEGRAM_ENABLE_GROUP_CALLS = "true";
    try {
      assert.strictEqual(isGroupCallsEnabled(), false);
    } finally {
      if (prev === undefined) delete process.env.MCP_TELEGRAM_ENABLE_GROUP_CALLS;
      else process.env.MCP_TELEGRAM_ENABLE_GROUP_CALLS = prev;
    }
  });
});
