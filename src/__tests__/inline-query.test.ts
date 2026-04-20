import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import { TelegramService } from "../telegram-client.js";

function makeService(
  chatEntity: unknown,
  botEntity: unknown,
  invocations: unknown[],
  response: unknown,
): TelegramService {
  const fakeClient = {
    invoke: async (req: unknown) => {
      invocations.push(req);
      return response;
    },
    getEntity: async (_id: string) => botEntity,
  };
  const service = new TelegramService(1, "hash");
  const internals = service as unknown as {
    client: unknown;
    connected: boolean;
    resolveChat: (id: string) => Promise<unknown>;
  };
  internals.client = fakeClient;
  internals.connected = true;
  internals.resolveChat = async () => chatEntity;
  return service;
}

function makeBotUser(id: number, isBot: boolean): Api.User {
  return new Api.User({
    id: bigInt(id),
    accessHash: bigInt(42),
    firstName: "InlineBot",
    bot: isBot,
  });
}

function makeChannel(id: number): Api.Channel {
  return new Api.Channel({
    id: bigInt(id),
    title: "test",
    photo: new Api.ChatPhotoEmpty(),
    date: 0,
    accessHash: bigInt(1),
    megagroup: true,
  });
}

function makeBotResults(): Api.messages.BotResults {
  return new Api.messages.BotResults({
    queryId: bigInt("9876543210"),
    nextOffset: "20",
    cacheTime: 300,
    gallery: false,
    users: [],
    results: [
      new Api.BotInlineResult({
        id: "r1",
        type: "article",
        title: "First",
        description: "desc1",
        url: "https://example.com/1",
        sendMessage: new Api.BotInlineMessageText({ message: "pick me" }),
      }),
      new Api.BotInlineMediaResult({
        id: "r2",
        type: "gif",
        title: "Media",
        description: "a gif",
        sendMessage: new Api.BotInlineMessageText({ message: "gif" }),
      }),
    ],
  });
}

describe("TelegramService.getInlineBotResults", () => {
  it("invokes GetInlineBotResults with resolved bot InputUser and returns compact results", async () => {
    const invocations: unknown[] = [];
    const service = makeService(makeChannel(12345), makeBotUser(777, true), invocations, makeBotResults());

    const out = await service.getInlineBotResults("@gif", "12345", "cat", undefined);

    const call = invocations.find((r) => r instanceof Api.messages.GetInlineBotResults) as
      | Api.messages.GetInlineBotResults
      | undefined;
    assert.ok(call, "GetInlineBotResults was invoked");
    assert.ok(call.bot instanceof Api.InputUser);
    assert.strictEqual((call.bot as Api.InputUser).userId.toString(), "777");
    assert.strictEqual(call.query, "cat");
    assert.strictEqual(call.offset, "");

    assert.strictEqual(out.queryId, "9876543210");
    assert.strictEqual(out.nextOffset, "20");
    assert.strictEqual(out.cacheTime, 300);
    assert.strictEqual(out.gallery, false);
    assert.strictEqual(out.results.length, 2);
    assert.deepStrictEqual(out.results[0], {
      id: "r1",
      type: "article",
      title: "First",
      description: "desc1",
      url: "https://example.com/1",
    });
    assert.deepStrictEqual(out.results[1], {
      id: "r2",
      type: "gif",
      title: "Media",
      description: "a gif",
    });
  });

  it("passes through offset when provided", async () => {
    const invocations: unknown[] = [];
    const service = makeService(makeChannel(10), makeBotUser(1, true), invocations, makeBotResults());

    await service.getInlineBotResults("@b", "10", "q", "20");

    const call = invocations.find((r) => r instanceof Api.messages.GetInlineBotResults) as
      | Api.messages.GetInlineBotResults
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.offset, "20");
  });

  it("rejects when bot is not a bot account", async () => {
    const invocations: unknown[] = [];
    const service = makeService(makeChannel(10), makeBotUser(1, false), invocations, makeBotResults());

    await assert.rejects(service.getInlineBotResults("@notbot", "10", "q"), /not a bot/i);
    assert.strictEqual(
      invocations.find((r) => r instanceof Api.messages.GetInlineBotResults),
      undefined,
      "no API call when target is not a bot",
    );
  });

  it("rejects when bot entity is not a User", async () => {
    const invocations: unknown[] = [];
    const notUser = makeChannel(99);
    const service = makeService(makeChannel(10), notUser, invocations, makeBotResults());

    await assert.rejects(service.getInlineBotResults("@chan", "10", "q"), /not a user/i);
  });
});
