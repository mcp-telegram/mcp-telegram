import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import {
  summarizeQuickReplies,
  summarizeQuickReply,
  summarizeQuickReplyMessage,
  summarizeQuickReplyMessages,
  TelegramService,
} from "../telegram-client.js";
import { isQuickRepliesEnabled } from "../tools/quick-replies.js";

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

describe("summarizeQuickReply", () => {
  it("maps shortcutId, shortcut, topMessage, count", () => {
    const out = summarizeQuickReply(
      new Api.QuickReply({ shortcutId: 5, shortcut: "hello", topMessage: 100, count: 3 }),
    );
    assert.deepStrictEqual(out, { shortcutId: 5, shortcut: "hello", topMessage: 100, count: 3 });
  });
});

describe("summarizeQuickReplies", () => {
  it("returns notModified flag for QuickRepliesNotModified", () => {
    const out = summarizeQuickReplies(new Api.messages.QuickRepliesNotModified());
    assert.deepStrictEqual(out, { notModified: true });
  });

  it("maps quickReplies array, ignoring messages/chats/users", () => {
    const resp = new Api.messages.QuickReplies({
      quickReplies: [
        new Api.QuickReply({ shortcutId: 1, shortcut: "hi", topMessage: 10, count: 1 }),
        new Api.QuickReply({ shortcutId: 2, shortcut: "bye", topMessage: 20, count: 2 }),
      ],
      messages: [],
      chats: [],
      users: [],
    });
    const out = summarizeQuickReplies(resp);
    assert.strictEqual(out.notModified, undefined);
    assert.strictEqual(out.quickReplies?.length, 2);
    assert.deepStrictEqual(out.quickReplies?.[0], { shortcutId: 1, shortcut: "hi", topMessage: 10, count: 1 });
    assert.deepStrictEqual(out.quickReplies?.[1], { shortcutId: 2, shortcut: "bye", topMessage: 20, count: 2 });
  });
});

describe("TelegramService.getQuickReplies", () => {
  it("invokes messages.GetQuickReplies with hash=0 by default", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      invocations,
      () =>
        new Api.messages.QuickReplies({
          quickReplies: [new Api.QuickReply({ shortcutId: 7, shortcut: "gm", topMessage: 4, count: 1 })],
          messages: [],
          chats: [],
          users: [],
        }),
    );
    const out = await service.getQuickReplies();
    const call = invocations.find((r) => r instanceof Api.messages.GetQuickReplies) as
      | Api.messages.GetQuickReplies
      | undefined;
    assert.ok(call, "GetQuickReplies must be invoked");
    assert.ok(call.hash.equals(bigInt(0)), "default hash should be 0");
    assert.strictEqual(out.quickReplies?.length, 1);
    assert.strictEqual(out.quickReplies?.[0].shortcut, "gm");
  });

  it("passes the provided hash through (bigInt parsed from decimal string)", async () => {
    const invocations: unknown[] = [];
    const service = makeService(invocations, () => new Api.messages.QuickRepliesNotModified());
    const out = await service.getQuickReplies("123456789012345");
    const call = invocations.find((r) => r instanceof Api.messages.GetQuickReplies) as
      | Api.messages.GetQuickReplies
      | undefined;
    assert.ok(call);
    assert.ok(call.hash.equals(bigInt("123456789012345")));
    assert.strictEqual(out.notModified, true);
  });

  it("throws when not connected", async () => {
    const service = new TelegramService(1, "hash");
    await assert.rejects(() => service.getQuickReplies(), /Not connected/i);
  });
});

describe("summarizeQuickReplyMessage", () => {
  it("returns null for MessageEmpty", () => {
    const out = summarizeQuickReplyMessage(new Api.MessageEmpty({ id: 1 }));
    assert.strictEqual(out, null);
  });

  it("maps regular message with reply header", () => {
    const msg = new Api.Message({
      id: 42,
      peerId: new Api.PeerUser({ userId: bigInt(123) }),
      date: 1_700_000_000,
      message: "hello quick reply",
      fromId: new Api.PeerUser({ userId: bigInt(55) }),
      replyTo: new Api.MessageReplyHeader({ replyToMsgId: 40 }),
    });
    const out = summarizeQuickReplyMessage(msg);
    assert.deepStrictEqual(out, {
      id: 42,
      date: 1_700_000_000,
      text: "hello quick reply",
      isService: false,
      fromId: { kind: "user", id: "55" },
      replyToMsgId: 40,
    });
  });

  it("marks service messages with isService=true and bracketed action className", () => {
    const action = new Api.MessageActionChatCreate({ title: "t", users: [] });
    const msg = new Api.MessageService({
      id: 7,
      peerId: new Api.PeerChat({ chatId: bigInt(9) }),
      date: 1_700_000_001,
      action,
    });
    const out = summarizeQuickReplyMessage(msg);
    assert.strictEqual(out?.isService, true);
    assert.strictEqual(out?.id, 7);
    assert.ok(out?.text.startsWith("[") && out?.text.endsWith("]"));
  });
});

describe("summarizeQuickReplyMessages", () => {
  it("returns notModified flag with count for MessagesNotModified", () => {
    const out = summarizeQuickReplyMessages(new Api.messages.MessagesNotModified({ count: 3 }));
    assert.deepStrictEqual(out, { notModified: true, count: 3 });
  });

  it("maps messages.Messages and drops empties", () => {
    const resp = new Api.messages.Messages({
      messages: [
        new Api.Message({
          id: 1,
          peerId: new Api.PeerUser({ userId: bigInt(11) }),
          date: 100,
          message: "one",
        }),
        new Api.MessageEmpty({ id: 2 }),
        new Api.Message({
          id: 3,
          peerId: new Api.PeerUser({ userId: bigInt(11) }),
          date: 101,
          message: "three",
        }),
      ],
      chats: [],
      users: [],
    });
    const out = summarizeQuickReplyMessages(resp);
    assert.strictEqual(out.notModified, undefined);
    assert.strictEqual(out.count, 2);
    assert.strictEqual(out.messages?.length, 2);
    assert.strictEqual(out.messages?.[0].id, 1);
    assert.strictEqual(out.messages?.[1].id, 3);
  });

  it("maps messages.MessagesSlice using slice.count (not array length)", () => {
    const resp = new Api.messages.MessagesSlice({
      count: 42,
      messages: [
        new Api.Message({
          id: 5,
          peerId: new Api.PeerUser({ userId: bigInt(11) }),
          date: 100,
          message: "five",
        }),
      ],
      chats: [],
      users: [],
    });
    const out = summarizeQuickReplyMessages(resp);
    assert.strictEqual(out.count, 42);
    assert.strictEqual(out.messages?.length, 1);
  });
});

describe("TelegramService.getQuickReplyMessages", () => {
  it("invokes messages.GetQuickReplyMessages with shortcutId and default hash=0", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      invocations,
      () =>
        new Api.messages.Messages({
          messages: [
            new Api.Message({
              id: 10,
              peerId: new Api.PeerUser({ userId: bigInt(1) }),
              date: 1,
              message: "x",
            }),
          ],
          chats: [],
          users: [],
        }),
    );
    const out = await service.getQuickReplyMessages(7);
    const call = invocations.find((r) => r instanceof Api.messages.GetQuickReplyMessages) as
      | Api.messages.GetQuickReplyMessages
      | undefined;
    assert.ok(call, "GetQuickReplyMessages must be invoked");
    assert.strictEqual(call.shortcutId, 7);
    assert.strictEqual(call.id, undefined);
    assert.ok(call.hash.equals(bigInt(0)));
    assert.strictEqual(out.messages?.length, 1);
  });

  it("passes ids and hash through", async () => {
    const invocations: unknown[] = [];
    const service = makeService(invocations, () => new Api.messages.MessagesNotModified({ count: 5 }));
    const out = await service.getQuickReplyMessages(9, { ids: [1, 2, 3], hash: "987654321" });
    const call = invocations.find((r) => r instanceof Api.messages.GetQuickReplyMessages) as
      | Api.messages.GetQuickReplyMessages
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.shortcutId, 9);
    assert.deepStrictEqual(call.id, [1, 2, 3]);
    assert.ok(call.hash.equals(bigInt("987654321")));
    assert.strictEqual(out.notModified, true);
    assert.strictEqual(out.count, 5);
  });

  it("throws when not connected", async () => {
    const service = new TelegramService(1, "hash");
    await assert.rejects(() => service.getQuickReplyMessages(1), /Not connected/i);
  });
});

describe("isQuickRepliesEnabled gate", () => {
  it("is off by default", () => {
    const prev = process.env.MCP_TELEGRAM_ENABLE_QUICK_REPLIES;
    delete process.env.MCP_TELEGRAM_ENABLE_QUICK_REPLIES;
    try {
      assert.strictEqual(isQuickRepliesEnabled(), false);
    } finally {
      if (prev !== undefined) process.env.MCP_TELEGRAM_ENABLE_QUICK_REPLIES = prev;
    }
  });

  it("turns on when env is '1'", () => {
    const prev = process.env.MCP_TELEGRAM_ENABLE_QUICK_REPLIES;
    process.env.MCP_TELEGRAM_ENABLE_QUICK_REPLIES = "1";
    try {
      assert.strictEqual(isQuickRepliesEnabled(), true);
    } finally {
      if (prev === undefined) delete process.env.MCP_TELEGRAM_ENABLE_QUICK_REPLIES;
      else process.env.MCP_TELEGRAM_ENABLE_QUICK_REPLIES = prev;
    }
  });

  it("stays off for any non-'1' value", () => {
    const prev = process.env.MCP_TELEGRAM_ENABLE_QUICK_REPLIES;
    process.env.MCP_TELEGRAM_ENABLE_QUICK_REPLIES = "true";
    try {
      assert.strictEqual(isQuickRepliesEnabled(), false);
    } finally {
      if (prev === undefined) delete process.env.MCP_TELEGRAM_ENABLE_QUICK_REPLIES;
      else process.env.MCP_TELEGRAM_ENABLE_QUICK_REPLIES = prev;
    }
  });
});
