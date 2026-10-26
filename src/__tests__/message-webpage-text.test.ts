import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import { TelegramService } from "../telegram-client.js";

interface Internals {
  client: unknown;
  connected: boolean;
}

function makeService(messages: Api.Message[]): TelegramService {
  const service = new TelegramService(1, "hash");
  const internals = service as unknown as Internals;
  internals.client = {
    getMessages: async () => messages,
  };
  internals.connected = true;
  return service;
}

function makeCachedPage(): Api.Page {
  return new Api.Page({
    url: "https://example.com/calls/10",
    blocks: [
      new Api.PageBlockTitle({ text: new Api.TextPlain({ text: "Call transcript" }) }),
      new Api.PageBlockParagraph({
        text: new Api.TextConcat({
          texts: [
            new Api.TextPlain({ text: "Operator " }),
            new Api.TextBold({ text: new Api.TextPlain({ text: "never" }) }),
            new Api.TextPlain({ text: " joined " }),
            new Api.TextUrl({
              text: new Api.TextPlain({ text: "the call" }),
              url: "https://example.com/calls/10",
              webpageId: bigInt(10),
            }),
            new Api.TextPlain({ text: "." }),
          ],
        }),
      }),
      new Api.PageBlockList({
        items: [
          new Api.PageListItemText({ text: new Api.TextPlain({ text: "No action" }) }),
          new Api.PageListItemBlocks({
            blocks: [
              new Api.PageBlockParagraph({
                text: new Api.TextPlain({ text: "Escalation pending" }),
              }),
            ],
          }),
        ],
      }),
    ],
    photos: [],
    documents: [],
  });
}

function makeWebPageMessage(message = "", cachedPage?: Api.Page): Api.Message {
  const webpage = new Api.WebPage({
    id: bigInt(10),
    url: "https://example.com/calls/10",
    displayUrl: "example.com/calls/10",
    hash: 0,
    title: "Call transcript",
    description: "The operator never joined the call.",
    cachedPage,
  });
  return new Api.Message({
    id: 864,
    peerId: new Api.PeerUser({ userId: bigInt(1) }),
    date: 1,
    message,
    media: new Api.MessageMediaWebPage({ webpage }),
  });
}

describe("TelegramService.getMessages webpage text", () => {
  it("reads rich text and nested blocks from an Instant View cached page", async () => {
    const service = makeService([makeWebPageMessage("", makeCachedPage())]);

    const [message] = await service.getMessages("@concierge", 1);

    assert.strictEqual(
      message.text,
      "Call transcript\n\nOperator never joined the call.\n\n• No action\n• Escalation pending",
    );
    assert.deepStrictEqual(message.media, { type: "webpage" });
  });

  it("uses visible webpage title and description when the message body is empty", async () => {
    const service = makeService([makeWebPageMessage()]);

    const [message] = await service.getMessages("@concierge", 1);

    assert.strictEqual(message.text, "Call transcript\n\nThe operator never joined the call.");
    assert.deepStrictEqual(message.media, { type: "webpage" });
  });

  it("keeps an explicit message body instead of replacing it with preview text", async () => {
    const service = makeService([makeWebPageMessage("Open the transcript")]);

    const [message] = await service.getMessages("@concierge", 1);

    assert.strictEqual(message.text, "Open the transcript");
  });
});
