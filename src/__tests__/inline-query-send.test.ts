import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import { TelegramService } from "../telegram-client.js";

function makeService(
  chatEntity: unknown,
  invocations: unknown[],
  responder: (req: unknown) => unknown,
): TelegramService {
  const fakeClient = {
    invoke: async (req: unknown) => {
      invocations.push(req);
      return responder(req);
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
  internals.resolveChat = async () => chatEntity;
  return service;
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

function updatesWithMessageId(randomId: ReturnType<typeof bigInt>, messageId: number): Api.Updates {
  return new Api.Updates({
    updates: [new Api.UpdateMessageID({ id: messageId, randomId })],
    users: [],
    chats: [],
    date: 0,
    seq: 0,
  });
}

describe("TelegramService.sendInlineBotResult", () => {
  it("invokes SendInlineBotResult with resolved peer, queryId, resultId and returns messageId", async () => {
    const invocations: unknown[] = [];
    let capturedRandomId: ReturnType<typeof bigInt> | undefined;
    const service = makeService(makeChannel(12345), invocations, (req) => {
      const r = req as Api.messages.SendInlineBotResult;
      capturedRandomId = r.randomId as ReturnType<typeof bigInt>;
      return updatesWithMessageId(capturedRandomId, 4242);
    });

    const out = await service.sendInlineBotResult("12345", "9876543210", "r1");

    const call = invocations.find((r) => r instanceof Api.messages.SendInlineBotResult) as
      | Api.messages.SendInlineBotResult
      | undefined;
    assert.ok(call, "SendInlineBotResult was invoked");
    assert.strictEqual(call.queryId.toString(), "9876543210");
    assert.strictEqual(call.id, "r1");
    assert.ok(call.randomId, "randomId is set");
    assert.strictEqual(call.replyTo, undefined);
    assert.strictEqual(call.silent, undefined);
    assert.strictEqual(call.hideVia, undefined);
    assert.strictEqual(call.clearDraft, undefined);
    assert.deepStrictEqual(out, { messageId: 4242 });
  });

  it("passes replyTo, silent, hideVia, clearDraft when provided", async () => {
    const invocations: unknown[] = [];
    const service = makeService(makeChannel(10), invocations, (req) => {
      const r = req as Api.messages.SendInlineBotResult;
      return updatesWithMessageId(r.randomId as ReturnType<typeof bigInt>, 7);
    });

    const out = await service.sendInlineBotResult("10", "1", "r1", {
      replyTo: 99,
      silent: true,
      hideVia: true,
      clearDraft: true,
    });

    const call = invocations.find((r) => r instanceof Api.messages.SendInlineBotResult) as
      | Api.messages.SendInlineBotResult
      | undefined;
    assert.ok(call);
    assert.ok(call.replyTo instanceof Api.InputReplyToMessage, "replyTo is InputReplyToMessage");
    assert.strictEqual((call.replyTo as Api.InputReplyToMessage).replyToMsgId, 99);
    assert.strictEqual(call.silent, true);
    assert.strictEqual(call.hideVia, true);
    assert.strictEqual(call.clearDraft, true);
    assert.strictEqual(out.messageId, 7);
  });

  it("returns messageId=0 when update has no matching UpdateMessageID", async () => {
    const invocations: unknown[] = [];
    const service = makeService(makeChannel(10), invocations, () => {
      return new Api.Updates({ updates: [], users: [], chats: [], date: 0, seq: 0 });
    });

    const out = await service.sendInlineBotResult("10", "1", "r1");
    assert.strictEqual(out.messageId, 0);
  });

  it("throws when response is null/undefined", async () => {
    const invocations: unknown[] = [];
    const service = makeService(makeChannel(10), invocations, () => undefined);

    await assert.rejects(service.sendInlineBotResult("10", "1", "r1"), /No response/i);
  });
});
