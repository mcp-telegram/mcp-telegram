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

function makeService(chatEntity: unknown, messages: unknown[]): TelegramService {
  const fakeClient = {
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

function inlineMarkup(buttons: Api.TypeKeyboardButton[][]): Api.ReplyInlineMarkup {
  return new Api.ReplyInlineMarkup({
    rows: buttons.map((row) => new Api.KeyboardButtonRow({ buttons: row })),
  });
}

describe("TelegramService.getMessageButtons", () => {
  it("returns empty buttons and markupType='none' when message has no markup", async () => {
    const msg = makeMessage(1, undefined);
    const service = makeService(makeChannel(100), [msg]);

    const res = await service.getMessageButtons("100", 1);
    assert.deepStrictEqual(res, { markupType: "none", buttons: [] });
  });

  it("describes a callback button with base64 data", async () => {
    const data = Buffer.from("vote_yes");
    const msg = makeMessage(
      42,
      inlineMarkup([[new Api.KeyboardButtonCallback({ text: "Yes", data, requiresPassword: false })]]),
    );
    const service = makeService(makeChannel(100), [msg]);

    const res = await service.getMessageButtons("100", 42);
    assert.strictEqual(res.markupType, "ReplyInlineMarkup");
    assert.strictEqual(res.buttons.length, 1);
    const b = res.buttons[0];
    assert.strictEqual(b.row, 0);
    assert.strictEqual(b.col, 0);
    assert.strictEqual(b.type, "KeyboardButtonCallback");
    assert.strictEqual(b.label, "Yes");
    assert.ok(b.data, "data is set");
    assert.strictEqual(Buffer.from(b.data as string, "base64").toString(), "vote_yes");
    assert.strictEqual(b.requiresPassword, undefined);
  });

  it("flags requiresPassword callback buttons", async () => {
    const msg = makeMessage(
      1,
      inlineMarkup([
        [new Api.KeyboardButtonCallback({ text: "Admin", data: Buffer.from("x"), requiresPassword: true })],
      ]),
    );
    const service = makeService(makeChannel(100), [msg]);
    const res = await service.getMessageButtons("100", 1);
    assert.strictEqual(res.buttons[0].requiresPassword, true);
  });

  it("describes URL, switch-inline and copy buttons with type-specific fields", async () => {
    const msg = makeMessage(
      2,
      inlineMarkup([
        [
          new Api.KeyboardButtonUrl({ text: "Open", url: "https://x.test" }),
          new Api.KeyboardButtonSwitchInline({ text: "Inline", query: "q", samePeer: true }),
        ],
        [new Api.KeyboardButtonCopy({ text: "Copy", copyText: "abc" })],
      ]),
    );
    const service = makeService(makeChannel(100), [msg]);
    const res = await service.getMessageButtons("100", 2);
    assert.strictEqual(res.buttons.length, 3);

    const [urlB, inlineB, copyB] = res.buttons;
    assert.strictEqual(urlB.type, "KeyboardButtonUrl");
    assert.strictEqual(urlB.url, "https://x.test");
    assert.strictEqual(urlB.row, 0);
    assert.strictEqual(urlB.col, 0);

    assert.strictEqual(inlineB.type, "KeyboardButtonSwitchInline");
    assert.strictEqual(inlineB.switchQuery, "q");
    assert.strictEqual(inlineB.samePeer, true);
    assert.strictEqual(inlineB.row, 0);
    assert.strictEqual(inlineB.col, 1);

    assert.strictEqual(copyB.type, "KeyboardButtonCopy");
    assert.strictEqual(copyB.copyText, "abc");
    assert.strictEqual(copyB.row, 1);
    assert.strictEqual(copyB.col, 0);
  });

  it("preserves markupType for non-inline reply keyboards with buttons", async () => {
    const markup = new Api.ReplyKeyboardMarkup({
      rows: [new Api.KeyboardButtonRow({ buttons: [new Api.KeyboardButton({ text: "x" })] })],
    });
    const msg = makeMessage(3, markup);
    const service = makeService(makeChannel(100), [msg]);

    const res = await service.getMessageButtons("100", 3);
    assert.strictEqual(res.markupType, "ReplyKeyboardMarkup");
    assert.strictEqual(res.buttons.length, 1);
    assert.strictEqual(res.buttons[0].type, "KeyboardButton");
    assert.strictEqual(res.buttons[0].label, "x");
  });

  it("returns empty buttons for ReplyKeyboardHide-like markup without rows", async () => {
    const markup = new Api.ReplyKeyboardHide({ selective: false });
    const msg = makeMessage(4, markup);
    const service = makeService(makeChannel(100), [msg]);

    const res = await service.getMessageButtons("100", 4);
    assert.strictEqual(res.markupType, "ReplyKeyboardHide");
    assert.deepStrictEqual(res.buttons, []);
  });

  it("rejects when message is not found", async () => {
    const service = makeService(makeChannel(100), []);
    await assert.rejects(service.getMessageButtons("100", 999), /not found/i);
  });
});
