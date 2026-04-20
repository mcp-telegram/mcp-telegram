import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import { TelegramService } from "../telegram-client.js";

function makeService(entity: unknown, invocations: unknown[]): TelegramService {
  const fakeClient = {
    invoke: async (req: unknown) => {
      invocations.push(req);
      return undefined;
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

describe("TelegramService.setChatAvailableReactions", () => {
  it("sends ChatReactionsAll without custom when type='all'", async () => {
    const channel = new Api.Channel({
      id: bigInt(12345),
      title: "channel",
      photo: new Api.ChatPhotoEmpty(),
      date: 0,
      accessHash: bigInt(1),
      megagroup: true,
    });
    const invocations: unknown[] = [];
    const service = makeService(channel, invocations);

    await service.setChatAvailableReactions("12345", { type: "all" });

    const call = invocations.find((r) => r instanceof Api.messages.SetChatAvailableReactions) as
      | Api.messages.SetChatAvailableReactions
      | undefined;
    assert.ok(call, "SetChatAvailableReactions was invoked");
    assert.ok(call.availableReactions instanceof Api.ChatReactionsAll);
    assert.strictEqual((call.availableReactions as Api.ChatReactionsAll).allowCustom, undefined);
  });

  it("sends ChatReactionsAll with allowCustom=true when requested", async () => {
    const channel = new Api.Channel({
      id: bigInt(22222),
      title: "channel",
      photo: new Api.ChatPhotoEmpty(),
      date: 0,
      accessHash: bigInt(1),
      megagroup: true,
    });
    const invocations: unknown[] = [];
    const service = makeService(channel, invocations);

    await service.setChatAvailableReactions("22222", { type: "all", allowCustom: true });

    const call = invocations.find((r) => r instanceof Api.messages.SetChatAvailableReactions) as
      | Api.messages.SetChatAvailableReactions
      | undefined;
    assert.ok(call);
    assert.ok(call.availableReactions instanceof Api.ChatReactionsAll);
    assert.strictEqual((call.availableReactions as Api.ChatReactionsAll).allowCustom, true);
  });

  it("sends ChatReactionsNone when type='none'", async () => {
    const channel = new Api.Channel({
      id: bigInt(33333),
      title: "channel",
      photo: new Api.ChatPhotoEmpty(),
      date: 0,
      accessHash: bigInt(1),
      megagroup: true,
    });
    const invocations: unknown[] = [];
    const service = makeService(channel, invocations);

    await service.setChatAvailableReactions("33333", { type: "none" });

    const call = invocations.find((r) => r instanceof Api.messages.SetChatAvailableReactions) as
      | Api.messages.SetChatAvailableReactions
      | undefined;
    assert.ok(call);
    assert.ok(call.availableReactions instanceof Api.ChatReactionsNone);
  });

  it("sends ChatReactionsSome with ReactionEmoji list when type='some'", async () => {
    const channel = new Api.Channel({
      id: bigInt(44444),
      title: "channel",
      photo: new Api.ChatPhotoEmpty(),
      date: 0,
      accessHash: bigInt(1),
      megagroup: true,
    });
    const invocations: unknown[] = [];
    const service = makeService(channel, invocations);

    await service.setChatAvailableReactions("44444", { type: "some", emoji: ["👍", "❤️", "🔥"] });

    const call = invocations.find((r) => r instanceof Api.messages.SetChatAvailableReactions) as
      | Api.messages.SetChatAvailableReactions
      | undefined;
    assert.ok(call);
    assert.ok(call.availableReactions instanceof Api.ChatReactionsSome);
    const some = call.availableReactions as Api.ChatReactionsSome;
    assert.strictEqual(some.reactions.length, 3);
    for (const r of some.reactions) {
      assert.ok(r instanceof Api.ReactionEmoji);
    }
    assert.deepStrictEqual(
      some.reactions.map((r) => (r as Api.ReactionEmoji).emoticon),
      ["👍", "❤️", "🔥"],
    );
  });

  it("accepts basic Chat entity (non-channel group)", async () => {
    const chat = new Api.Chat({
      id: bigInt(55555),
      title: "basic group",
      photo: new Api.ChatPhotoEmpty(),
      participantsCount: 5,
      date: 0,
      version: 0,
    });
    const invocations: unknown[] = [];
    const service = makeService(chat, invocations);

    await service.setChatAvailableReactions("55555", { type: "none" });

    const call = invocations.find((r) => r instanceof Api.messages.SetChatAvailableReactions);
    assert.ok(call, "SetChatAvailableReactions was invoked for basic group");
  });

  it("rejects User peer (non-chat)", async () => {
    const user = new Api.User({ id: bigInt(66666), accessHash: bigInt(1), firstName: "Bob" });
    const invocations: unknown[] = [];
    const service = makeService(user, invocations);

    await assert.rejects(
      service.setChatAvailableReactions("66666", { type: "none" }),
      /groups, supergroups, and channels/,
    );
    assert.strictEqual(invocations.length, 0);
  });

  it("rejects empty emoji list on type='some'", async () => {
    const channel = new Api.Channel({
      id: bigInt(77777),
      title: "channel",
      photo: new Api.ChatPhotoEmpty(),
      date: 0,
      accessHash: bigInt(1),
      megagroup: true,
    });
    const invocations: unknown[] = [];
    const service = makeService(channel, invocations);

    await assert.rejects(service.setChatAvailableReactions("77777", { type: "some", emoji: [] }), /non-empty/);
    assert.strictEqual(invocations.length, 0);
  });
});
