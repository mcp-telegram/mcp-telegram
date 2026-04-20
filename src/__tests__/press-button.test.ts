import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import { TelegramService } from "../telegram-client.js";

interface Internals {
  client: unknown;
  connected: boolean;
  resolveChat: (id: string) => Promise<unknown>;
}

function makeService(
  chatEntity: unknown,
  invocations: unknown[],
  messages: unknown[],
  responder: (req: unknown) => unknown,
): TelegramService {
  const fakeClient = {
    invoke: async (req: unknown) => {
      invocations.push(req);
      return responder(req);
    },
    getMessages: async (_entity: unknown, _opts: unknown) => messages,
  };
  const service = new TelegramService(1, "hash");
  const internals = service as unknown as Internals;
  internals.client = fakeClient;
  internals.connected = true;
  internals.resolveChat = async () => chatEntity;
  return service;
}

function makeChannel(id: number): Api.Channel {
  return new Api.Channel({
    id: bigInt(id),
    title: "t",
    photo: new Api.ChatPhotoEmpty(),
    date: 0,
    accessHash: bigInt(1),
    megagroup: true,
  });
}

function makeMessage(id: number, markup?: Api.TypeReplyMarkup): Api.Message {
  return new Api.Message({
    id,
    peerId: new Api.PeerChannel({ channelId: bigInt(100) }),
    date: 0,
    message: "hi",
    replyMarkup: markup,
  });
}

function callbackButton(text: string, data: Buffer, requiresPassword = false): Api.KeyboardButtonCallback {
  return new Api.KeyboardButtonCallback({ text, data, requiresPassword });
}

function urlButton(text: string, url: string): Api.KeyboardButtonUrl {
  return new Api.KeyboardButtonUrl({ text, url });
}

function inlineMarkup(buttons: Api.TypeKeyboardButton[][]): Api.ReplyInlineMarkup {
  return new Api.ReplyInlineMarkup({
    rows: buttons.map((row) => new Api.KeyboardButtonRow({ buttons: row })),
  });
}

function callbackAnswer(): Api.messages.BotCallbackAnswer {
  return new Api.messages.BotCallbackAnswer({
    alert: true,
    message: "Clicked",
    cacheTime: 60,
  });
}

describe("TelegramService.pressButton", () => {
  it("presses a callback button by (row, column) and returns the answer", async () => {
    const invocations: unknown[] = [];
    const data = Buffer.from("vote_yes");
    const msg = makeMessage(42, inlineMarkup([[callbackButton("Yes", data)]]));
    const service = makeService(makeChannel(100), invocations, [msg], () => callbackAnswer());

    const out = await service.pressButton("100", 42, { buttonIndex: { row: 0, column: 0 } });

    const call = invocations.find((r) => r instanceof Api.messages.GetBotCallbackAnswer) as
      | Api.messages.GetBotCallbackAnswer
      | undefined;
    assert.ok(call, "GetBotCallbackAnswer was invoked");
    assert.strictEqual(call.msgId, 42);
    assert.ok(call.data, "data is set");
    assert.strictEqual(Buffer.from(call.data as Uint8Array).toString(), "vote_yes");
    assert.strictEqual(out.alert, true);
    assert.strictEqual(out.message, "Clicked");
    assert.strictEqual(out.cacheTime, 60);
  });

  it("accepts raw data as base64 without fetching the message", async () => {
    const invocations: unknown[] = [];
    const service = makeService(makeChannel(100), invocations, [], () => callbackAnswer());
    const payload = Buffer.from([0x01, 0x02, 0xff]);

    await service.pressButton("100", 7, { data: payload.toString("base64") });

    const call = invocations.find((r) => r instanceof Api.messages.GetBotCallbackAnswer) as
      | Api.messages.GetBotCallbackAnswer
      | undefined;
    assert.ok(call);
    assert.deepStrictEqual(Buffer.from(call.data as Uint8Array), payload);
  });

  it("rejects when button type is not Callback", async () => {
    const invocations: unknown[] = [];
    const msg = makeMessage(1, inlineMarkup([[urlButton("Open", "https://x.test")]]));
    const service = makeService(makeChannel(100), invocations, [msg], () => callbackAnswer());

    await assert.rejects(service.pressButton("100", 1, { buttonIndex: { row: 0, column: 0 } }), /not callable/i);
    assert.strictEqual(
      invocations.find((r) => r instanceof Api.messages.GetBotCallbackAnswer),
      undefined,
      "no API call when button is not callable",
    );
  });

  it("rejects when message has no reply markup", async () => {
    const invocations: unknown[] = [];
    const msg = makeMessage(1, undefined);
    const service = makeService(makeChannel(100), invocations, [msg], () => callbackAnswer());

    await assert.rejects(service.pressButton("100", 1, { buttonIndex: { row: 0, column: 0 } }), /no reply markup/i);
  });

  it("rejects when reply markup is ReplyKeyboardMarkup (not inline)", async () => {
    const invocations: unknown[] = [];
    const markup = new Api.ReplyKeyboardMarkup({
      rows: [new Api.KeyboardButtonRow({ buttons: [new Api.KeyboardButton({ text: "x" })] })],
    });
    const msg = makeMessage(1, markup);
    const service = makeService(makeChannel(100), invocations, [msg], () => callbackAnswer());

    await assert.rejects(service.pressButton("100", 1, { buttonIndex: { row: 0, column: 0 } }), /ReplyInlineMarkup/);
  });

  it("rejects when row/column is out of bounds", async () => {
    const invocations: unknown[] = [];
    const msg = makeMessage(1, inlineMarkup([[callbackButton("A", Buffer.from("a"))]]));
    const service = makeService(makeChannel(100), invocations, [msg], () => callbackAnswer());

    await assert.rejects(service.pressButton("100", 1, { buttonIndex: { row: 5, column: 0 } }), /out of bounds/i);
    await assert.rejects(service.pressButton("100", 1, { buttonIndex: { row: 0, column: 9 } }), /out of bounds/i);
  });

  it("rejects when button requires 2FA password", async () => {
    const invocations: unknown[] = [];
    const msg = makeMessage(1, inlineMarkup([[callbackButton("Admin", Buffer.from("x"), true)]]));
    const service = makeService(makeChannel(100), invocations, [msg], () => callbackAnswer());

    await assert.rejects(service.pressButton("100", 1, { buttonIndex: { row: 0, column: 0 } }), /2FA password/i);
  });

  it("rejects when neither buttonIndex nor data is provided", async () => {
    const invocations: unknown[] = [];
    const service = makeService(makeChannel(100), invocations, [], () => callbackAnswer());

    await assert.rejects(service.pressButton("100", 1, {}), /buttonIndex or data/i);
  });
});
