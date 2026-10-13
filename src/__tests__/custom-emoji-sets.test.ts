import assert from "node:assert";
import { describe, it } from "node:test";
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
