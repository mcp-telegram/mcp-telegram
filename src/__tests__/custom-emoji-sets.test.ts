import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import { TelegramService } from "../telegram-client.js";

function makeService(invocations: unknown[]): TelegramService {
  const service = new TelegramService(1, "hash");
  const internals = service as unknown as { client: unknown; connected: boolean };
  internals.client = {
    invoke: async (req: unknown) => {
      invocations.push(req);
      return new Api.messages.AllStickersNotModified();
    },
  };
  internals.connected = true;
  return service;
}

describe("getInstalledStickerSets", () => {
  it("requests sticker sets by default", async () => {
    const calls: unknown[] = [];
    await makeService(calls).getInstalledStickerSets();
    assert.ok(calls[0] instanceof Api.messages.GetAllStickers);
  });

  it("requests custom emoji sets when emoji=true", async () => {
    const calls: unknown[] = [];
    await makeService(calls).getInstalledStickerSets(true);
    assert.ok(calls[0] instanceof Api.messages.GetEmojiStickers);
  });
});

describe("getStickerSet custom emoji", () => {
  it("prefers the document's custom emoji alt over the pack emoticon", async () => {
    const service = new TelegramService(1, "hash");
    const internals = service as unknown as { client: unknown; connected: boolean };
    const doc = new Api.Document({
      id: bigInt(42),
      accessHash: bigInt(1),
      fileReference: Buffer.alloc(0),
      date: 0,
      mimeType: "application/x-tgsticker",
      size: bigInt(0),
      dcId: 2,
      attributes: [new Api.DocumentAttributeCustomEmoji({ alt: "🔥", stickerset: new Api.InputStickerSetEmpty() })],
    });
    internals.client = {
      invoke: async () =>
        new Api.messages.StickerSet({
          set: new Api.StickerSet({
            id: bigInt(7),
            accessHash: bigInt(8),
            title: "Emoji pack",
            shortName: "emoji_pack",
            count: 1,
            hash: 0,
            emojis: true,
          }),
          packs: [
            new Api.StickerPack({ emoticon: "🔥", documents: [bigInt(42)] }),
            new Api.StickerPack({ emoticon: "😀", documents: [bigInt(42)] }),
          ],
          keywords: [],
          documents: [doc],
        }),
    };
    internals.connected = true;
    const set = await service.getStickerSet("emoji_pack");
    assert.strictEqual(set.stickers[0].emoji, "🔥");
  });
});
