import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TelegramService } from "../telegram-client.js";

function makeService({
  size = 5,
  full = Buffer.from("OggS!"),
  thumb,
  progress = 0,
  onDownload,
}: {
  size?: number;
  full?: Buffer;
  thumb?: Buffer;
  progress?: number;
  onDownload?: () => void;
} = {}) {
  let calls = 0;
  const svc = new TelegramService(1, "hash");
  const fake = {
    getMessages: async () => [
      {
        media: {
          document: {
            size: { toString: () => String(size) },
            mimeType: "audio/ogg",
            attributes: [{ fileName: "voice.ogg" }],
          },
        },
      },
    ],
    downloadMedia: async (
      _m: unknown,
      opts?: { thumb?: number; progressCallback?: (n: { toString(): string }) => void },
    ) => {
      calls++;
      onDownload?.();
      if (opts?.thumb !== undefined) return thumb;
      opts?.progressCallback?.({ toString: () => String(progress) });
      return full;
    },
  };
  // SAFETY: fake has exactly the methods exercised by this media path; no
  // network is connected and the service's private state is only set in tests.
  const internals = svc as unknown as { client: unknown; connected: boolean };
  internals.client = fake;
  internals.connected = true;
  return { svc, calls: () => calls };
}

describe("downloadMediaBounded", () => {
  it("rejects document size before native download/allocation", async () => {
    const f = makeService({ size: 100 });
    await assert.rejects(() => f.svc.downloadMediaBounded("@chat", 1, { maxBytes: 10 }), /exceeds/);
    assert.equal(f.calls(), 0);
  });
  it("allows a cheap thumbnail of a large document, but bounds fallback to the original", async () => {
    const cheap = makeService({ size: 100, thumb: Buffer.from([0xff, 0xd8, 0xff]) });
    const result = await cheap.svc.downloadMediaBounded("@chat", 1, { maxBytes: 10, thumb: 0 });
    assert.equal(result.isThumb, true);
    assert.equal(result.mimeType, "image/jpeg");
    const missing = makeService({ size: 100 });
    await assert.rejects(() => missing.svc.downloadMediaBounded("@chat", 1, { maxBytes: 10, thumb: 0 }), /exceeds/);
    assert.equal(missing.calls(), 1, "only thumb attempted; full download was denied");
  });
  it("guards actual chunk progress even when metadata understates the size", async () => {
    const f = makeService({ size: 1, progress: 20 });
    await assert.rejects(() => f.svc.downloadMediaBounded("@chat", 1, { maxBytes: 10 }), /exceeds/);
  });
  it("checks final cached bytes when native download doesn't invoke progress", async () => {
    const f = makeService({ size: 1, full: Buffer.alloc(20) });
    await assert.rejects(() => f.svc.downloadMediaBounded("@chat", 1, { maxBytes: 10 }), /exceeds/);
  });
  it("returns filename and honors cancellation before and after IO", async () => {
    const f = makeService();
    const result = await f.svc.downloadMediaBounded("@chat", 1, { maxBytes: 10 });
    assert.equal(result.fileName, "voice.ogg");
    assert.equal(result.mimeType, "audio/ogg");
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    const aborted = makeService();
    await assert.rejects(
      () => aborted.svc.downloadMediaBounded("@chat", 1, { maxBytes: 10, signal: controller.signal }),
      /cancelled/,
    );
    assert.equal(aborted.calls(), 0);
    const duringIo = new AbortController();
    const later = makeService({ onDownload: () => duringIo.abort(new Error("cancelled during IO")) });
    const inFlight = later.svc.downloadMediaBounded("@chat", 1, { maxBytes: 10, signal: duringIo.signal });
    await assert.rejects(() => inFlight, /cancelled during IO/);
    assert.equal(later.calls(), 1);
  });
  it("rejects nonsensical limits", async () => {
    for (const maxBytes of [0, -1, 1.5, NaN, Infinity]) {
      const f = makeService();
      await assert.rejects(() => f.svc.downloadMediaBounded("@chat", 1, { maxBytes }), /positive safe integer/);
      assert.equal(f.calls(), 0);
    }
  });
});
