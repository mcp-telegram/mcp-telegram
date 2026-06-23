import assert from "node:assert";
import { describe, it } from "node:test";
import { TelegramService } from "../telegram-client.js";

// ─── Mock helpers ─────────────────────────────────────────────────────────────

interface Internals {
  client: unknown;
  connected: boolean;
}

// Minimal JPEG so detectMimeType() returns "image/jpeg" from magic bytes.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02]);
const THUMB = Buffer.from([0xff, 0xd8, 0xff, 0x00]); // smaller "thumbnail"

/**
 * Build a service whose fake client returns `full` for a normal download and
 * `thumbResult` when a thumb is requested. `thumbResult: undefined` simulates
 * media that has no thumbnail at the requested size (GramJS returns undefined).
 */
function makeService(opts: {
  full: Buffer;
  thumbResult?: Buffer;
  recordThumb?: (thumb: unknown) => void;
}): TelegramService {
  const fakeClient = {
    getMessages: async () => [{ media: { _: "messageMediaPhoto" } }],
    downloadMedia: async (_message: unknown, params?: { thumb?: number }) => {
      if (params?.thumb !== undefined) {
        opts.recordThumb?.(params.thumb);
        return opts.thumbResult;
      }
      return opts.full;
    },
  };
  const service = new TelegramService(1, "hash");
  const internals = service as unknown as Internals;
  internals.client = fakeClient;
  internals.connected = true;
  return service;
}

describe("downloadMediaAsBuffer thumb support", () => {
  it("returns the full file when no thumb is requested", async () => {
    const svc = makeService({ full: JPEG });
    const res = await svc.downloadMediaAsBuffer("@test", 1);
    assert.deepEqual(res.buffer, JPEG);
    assert.equal(res.mimeType, "image/jpeg");
    assert.equal(res.isThumb, false);
  });

  it("returns the thumbnail and flags isThumb when thumb is available", async () => {
    let seen: unknown;
    const svc = makeService({ full: JPEG, thumbResult: THUMB, recordThumb: (t) => (seen = t) });
    const res = await svc.downloadMediaAsBuffer("@test", 1, { thumb: 0 });
    assert.equal(seen, 0, "thumb index forwarded to GramJS");
    assert.deepEqual(res.buffer, THUMB);
    assert.equal(res.mimeType, "image/jpeg", "mime detected from thumbnail bytes");
    assert.equal(res.isThumb, true);
  });

  it("falls back to the full file when the media has no thumbnail at that size", async () => {
    // GramJS returns undefined for thumb when none exists — must not throw.
    const svc = makeService({ full: JPEG, thumbResult: undefined });
    const res = await svc.downloadMediaAsBuffer("@test", 1, { thumb: 0 });
    assert.deepEqual(res.buffer, JPEG, "fell back to full file bytes");
    assert.equal(res.isThumb, false, "isThumb false since full file was served");
  });

  it("falls back to the full file when the thumb download yields an empty buffer", async () => {
    // GramJS returns Buffer.alloc(0) (truthy!) on some no-thumb paths — must
    // still fall back to the full file, not return 0 bytes as success.
    const svc = makeService({ full: JPEG, thumbResult: Buffer.alloc(0) });
    const res = await svc.downloadMediaAsBuffer("@test", 1, { thumb: 0 });
    assert.deepEqual(res.buffer, JPEG, "empty thumb buffer fell back to full file");
    assert.equal(res.isThumb, false);
  });

  it("throws when the full download yields an empty buffer (undownloadable media)", async () => {
    // GramJS returns Buffer.alloc(0) for geo/poll/dice and failure paths.
    // An empty Buffer is truthy, so a naive !buffer guard would let it through.
    const svc = makeService({ full: Buffer.alloc(0) });
    await assert.rejects(() => svc.downloadMediaAsBuffer("@test", 1), /Failed to download media/);
  });
});
