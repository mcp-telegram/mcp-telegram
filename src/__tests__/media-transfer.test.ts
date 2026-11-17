import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import bigInt from "big-integer";
import { RPCError } from "telegram/errors/RPCBaseErrors.js";
import { FileMigrateError, FloodWaitError } from "telegram/errors/RPCErrorList.js";
import { Api } from "telegram/tl/index.js";
import {
  BIG_FILE_THRESHOLD_BYTES,
  isUploadedFile,
  mapMediaError,
  planRangeRequests,
  sniffMimeType,
  type TelegramMediaError,
  UPLOAD_PART_BYTES,
  type UploadedFile,
  writeAll,
} from "../media-transfer.js";
import { TelegramService } from "../telegram-client.js";

const MiB = 1024 * 1024;
const KiB = 1024;

// ─── fake client ────────────────────────────────────────────────────────────

function documentMedia(size: number, fileRef = 1, mimeType = "application/zip"): Api.MessageMediaDocument {
  return new Api.MessageMediaDocument({
    document: new Api.Document({
      id: bigInt(10),
      accessHash: bigInt(20),
      fileReference: Buffer.from([fileRef]),
      date: 0,
      mimeType,
      size: bigInt(size),
      dcId: 2,
      attributes: [new Api.DocumentAttributeFilename({ fileName: "archive.zip" })],
    }),
  });
}

function message(media?: Api.TypeMessageMedia): Api.Message {
  return new Api.Message({
    id: 7,
    peerId: new Api.PeerUser({ userId: bigInt(1) }),
    date: 0,
    message: "",
    ...(media && { media }),
  });
}

type GetFileCall = { dc: number; offset: number; limit: number; fileRef: number };

function makeService(opts: {
  file?: Buffer;
  media?: () => Api.TypeMessageMedia | undefined;
  messages?: () => Api.Message[];
  failures?: Array<(call: GetFileCall) => Error | undefined>;
  invoke?: (req: unknown) => Promise<unknown>;
  sendFile?: (peer: unknown, params: Record<string, unknown>) => Promise<unknown>;
  uploadFile?: (params: Record<string, unknown>) => Promise<unknown>;
}) {
  const file = opts.file ?? Buffer.alloc(0);
  const calls: GetFileCall[] = [];
  const senders: number[] = [];
  let messageLoads = 0;
  const failures = [...(opts.failures ?? [])];
  const fake = {
    getMessages: async () => {
      messageLoads++;
      if (opts.messages) return opts.messages();
      return [message(opts.media ? opts.media() : documentMedia(file.length))];
    },
    getSender: async (dc: number) => {
      senders.push(dc);
      return { dcId: dc };
    },
    invokeWithSender: async (req: Api.upload.GetFile, sender: { dcId: number }) => {
      const loc = req.location as Api.InputDocumentFileLocation;
      const call = {
        dc: sender.dcId,
        offset: Number(req.offset.toString()),
        limit: req.limit,
        fileRef: loc.fileReference[0] ?? 0,
      };
      calls.push(call);
      const fail = failures.shift()?.(call);
      if (fail) throw fail;
      return new Api.upload.File({
        type: new Api.storage.FileUnknown(),
        mtime: 0,
        bytes: file.subarray(call.offset, call.offset + call.limit),
      });
    },
    invoke: opts.invoke ?? (async () => true),
    sendFile: opts.sendFile ?? (async () => ({ id: 1 })),
    uploadFile:
      opts.uploadFile ?? (async () => new Api.InputFile({ id: bigInt(1), parts: 1, name: "x", md5Checksum: "" })),
    getInputEntity: async () => new Api.InputPeerSelf(),
  };
  const svc = new TelegramService(1, "hash");
  // SAFETY: tests swap in a fake GramJS client; no network is used.
  const internals = svc as unknown as { client: unknown; connected: boolean; resolvePeer: (id: string) => unknown };
  internals.client = fake;
  internals.connected = true;
  internals.resolvePeer = async () => "peer";
  return { svc, calls, senders, messageLoads: () => messageLoads };
}

function pattern(size: number): Buffer {
  const b = Buffer.alloc(size);
  for (let i = 0; i < size; i++) b[i] = (i * 31 + (i >> 12)) & 0xff;
  return b;
}

function assertTelegramRules(offset: number, limit: number): void {
  assert.equal(offset % 4096, 0, `offset ${offset} divisible by 4096`);
  assert.equal(limit % 4096, 0, `limit ${limit} divisible by 4096`);
  assert.equal(MiB % limit, 0, `1 MiB divisible by limit ${limit}`);
  assert.equal(Math.floor(offset / MiB), Math.floor((offset + limit - 1) / MiB), "request stays inside one MiB");
}

async function collect(it: AsyncIterable<Buffer>): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const p of it) parts.push(p);
  return Buffer.concat(parts);
}

async function* chunks(buf: Buffer, size: number): AsyncGenerator<Uint8Array> {
  for (let i = 0; i < buf.length; i += size) yield buf.subarray(i, i + size);
}

// ─── range planning ─────────────────────────────────────────────────────────

describe("planRangeRequests", () => {
  it("keeps every request within Telegram's alignment rules and covers the range", () => {
    const offsets = [0, 1, 4095, 4096, 65_536, 300_000, 524_288, MiB - 1, MiB, 3 * MiB + 12_345];
    const lengths = [1, 4096, 65_536, 100_000, 524_288, 2 * MiB + 7];
    for (const offset of offsets) {
      for (const length of lengths) {
        const plan = planRangeRequests(offset, length);
        let pos = plan[0]?.offset ?? -1;
        assert.ok(pos <= offset);
        for (const r of plan) {
          assertTelegramRules(r.offset, r.limit);
          assert.equal(r.offset, pos, "requests are contiguous");
          pos += r.limit;
        }
        assert.ok(pos >= offset + length, "plan covers the whole range");
      }
    }
  });

  it("uses a single 64 KiB request for an aligned MCP chunk", () => {
    assert.deepEqual(planRangeRequests(5 * 65_536, 65_536), [{ offset: 5 * 65_536, limit: 65_536 }]);
    assert.deepEqual(planRangeRequests(0, 65_536), [{ offset: 0, limit: 65_536 }]);
  });

  it("rejects negative or fractional ranges", () => {
    assert.throws(() => planRangeRequests(-1, 10), { code: "INVALID_RANGE" } as object);
    assert.throws(() => planRangeRequests(1.5, 10), { code: "INVALID_RANGE" } as object);
  });
});

// ─── downloads ──────────────────────────────────────────────────────────────

describe("getMediaInfo", () => {
  it("returns size, MIME and name without fetching any bytes", async () => {
    const f = makeService({ file: pattern(1234) });
    const info = await f.svc.getMediaInfo("@chat", 7);
    assert.deepEqual(info, {
      kind: "document",
      fileId: "document:10:20",
      size: 1234,
      mimeType: "application/zip",
      fileName: "archive.zip",
    });
    assert.equal(f.calls.length, 0);
  });

  it("gives replaced media a different fileId even at the same size", async () => {
    let id = 10;
    const f = makeService({
      media: () =>
        new Api.MessageMediaDocument({
          document: new Api.Document({
            id: bigInt(id++),
            accessHash: bigInt(20),
            fileReference: Buffer.from([1]),
            date: 0,
            mimeType: "application/zip",
            size: bigInt(5),
            dcId: 2,
            attributes: [],
          }),
        }),
    });
    const a = await f.svc.getMediaInfo("@chat", 7);
    const b = await f.svc.getMediaInfo("@chat", 7);
    assert.equal(a.size, b.size);
    assert.notEqual(a.fileId, b.fileId);
  });

  it("describes the largest photo size", async () => {
    const photo = new Api.Photo({
      id: bigInt(1),
      accessHash: bigInt(2),
      fileReference: Buffer.from([1]),
      date: 0,
      dcId: 4,
      sizes: [
        new Api.PhotoSize({ type: "m", w: 320, h: 320, size: 10_000 }),
        new Api.PhotoSizeProgressive({ type: "y", w: 1280, h: 1280, sizes: [5_000, 40_000, 90_000] }),
        new Api.PhotoStrippedSize({ type: "i", bytes: Buffer.from([1, 2, 3]) }),
      ],
    });
    const f = makeService({ media: () => new Api.MessageMediaPhoto({ photo }) });
    assert.deepEqual(await f.svc.getMediaInfo("@chat", 7), {
      kind: "photo",
      fileId: "photo:1:2:y",
      size: 90_000,
      mimeType: "image/jpeg",
    });
  });

  it("names the media type that cannot be downloaded", async () => {
    const contact = new Api.MessageMediaContact({
      phoneNumber: "+1",
      firstName: "A",
      lastName: "",
      vcard: "",
      userId: bigInt(0),
    });
    const f = makeService({ media: () => contact });
    await assert.rejects(
      () => f.svc.getMediaInfo("@chat", 7),
      (e: TelegramMediaError) => e.code === "MEDIA_NOT_DOWNLOADABLE" && /contact/.test(e.message),
    );
    const poll = makeService({ media: () => new Api.MessageMediaGeo({ geo: new Api.GeoPointEmpty() }) });
    await assert.rejects(
      () => poll.svc.getMediaInfo("@chat", 7),
      (e: TelegramMediaError) => e.code === "MEDIA_NOT_DOWNLOADABLE" && /location/.test(e.message),
    );
  });

  it("reports a missing message and a message without media with their own codes", async () => {
    const missing = makeService({ messages: () => [] });
    await assert.rejects(() => missing.svc.getMediaInfo("@chat", 7), { code: "MESSAGE_NOT_FOUND" } as object);
    const empty = makeService({ messages: () => [message()] });
    await assert.rejects(() => empty.svc.getMediaInfo("@chat", 7), { code: "NO_MEDIA" } as object);
  });
});

describe("readMediaRange / streamMedia", () => {
  it("reads an exact range with aligned GetFile requests from the file's DC", async () => {
    const file = pattern(3 * MiB + 1000);
    const f = makeService({ file });
    const got = await f.svc.readMediaRange("@chat", 7, 1_000_000, 200_000);
    assert.deepEqual(got, file.subarray(1_000_000, 1_200_000));
    for (const c of f.calls) assertTelegramRules(c.offset, c.limit);
    assert.ok(f.senders.length > 0 && f.senders.every((dc) => dc === 2), "sender for the document's DC");
  });

  it("returns a short read at end of file and nothing past it", async () => {
    const file = pattern(100_000);
    const f = makeService({ file });
    assert.deepEqual(await f.svc.readMediaRange("@chat", 7, 65_536, 65_536), file.subarray(65_536));
    assert.equal((await f.svc.readMediaRange("@chat", 7, 100_000, 65_536)).length, 0);
  });

  it("streams the whole file in 512 KiB requests aligned to 512 KiB", async () => {
    const file = pattern(2 * MiB + 77);
    const f = makeService({ file });
    assert.deepEqual(await collect(f.svc.streamMedia("@chat", 7)), file);
    for (const c of f.calls) {
      assert.equal(c.limit, 512 * KiB);
      assertTelegramRules(c.offset, c.limit);
    }
  });

  it("streams from an unaligned offset", async () => {
    const file = pattern(MiB + 5);
    const f = makeService({ file });
    assert.deepEqual(await collect(f.svc.streamMedia("@chat", 7, { offset: 70_001 })), file.subarray(70_001));
    for (const c of f.calls) assertTelegramRules(c.offset, c.limit);
  });

  it("follows FILE_MIGRATE to the DC that holds the file", async () => {
    const file = pattern(10_000);
    const f = makeService({
      file,
      failures: [(c) => new FileMigrateError({ request: c as never, capture: 4 })],
    });
    assert.deepEqual(await f.svc.readMediaRange("@chat", 7, 0, 10_000), file);
    assert.deepEqual(f.senders, [2, 4]);
    assert.equal(f.calls.at(-1)?.dc, 4);
  });

  it("asks GramJS for the sender before every request (idle senders get disconnected)", async () => {
    const file = pattern(2 * MiB);
    const f = makeService({ file });
    await collect(f.svc.streamMedia("@chat", 7));
    assert.equal(f.calls.length, 4);
    assert.equal(f.senders.length, f.calls.length, "one getSender per GetFile");
  });

  it("reloads the message once when the file reference expired", async () => {
    const file = pattern(10_000);
    let ref = 1;
    const f = makeService({
      file,
      media: () => documentMedia(file.length, ref++),
      failures: [() => new RPCError("FILE_REFERENCE_EXPIRED", undefined as never, 400)],
    });
    assert.deepEqual(await f.svc.readMediaRange("@chat", 7, 0, 10_000), file);
    assert.equal(f.messageLoads(), 2);
    assert.deepEqual(
      f.calls.map((c) => c.fileRef),
      [1, 2],
      "retried with the fresh reference",
    );
  });

  it("refuses to continue when the refreshed message holds a different file", async () => {
    let id = 10;
    const f = makeService({
      file: pattern(10_000),
      media: () =>
        new Api.MessageMediaDocument({
          document: new Api.Document({
            id: bigInt(id++),
            accessHash: bigInt(20),
            fileReference: Buffer.from([1]),
            date: 0,
            mimeType: "application/zip",
            size: bigInt(10_000),
            dcId: 2,
            attributes: [],
          }),
        }),
      failures: [() => new RPCError("FILE_REFERENCE_EXPIRED", undefined as never, 400)],
    });
    await assert.rejects(() => f.svc.readMediaRange("@chat", 7, 0, 100), { code: "MEDIA_CHANGED" } as object);
    assert.equal(f.calls.length, 1, "no bytes are read from the replacement file");
  });

  it("does not return bytes when the signal aborts during the last request", async () => {
    const ctrl = new AbortController();
    const f = makeService({
      file: pattern(10_000),
      failures: [
        () => {
          ctrl.abort(new Error("client went away"));
          return undefined;
        },
      ],
    });
    await assert.rejects(() => f.svc.readMediaRange("@chat", 7, 0, 10_000, ctrl.signal), /client went away/);
    assert.equal(f.calls.length, 1);
  });

  it("concurrent reads share one file-reference refresh", async () => {
    const file = pattern(200_000);
    let ref = 1;
    const expired = () => new RPCError("FILE_REFERENCE_EXPIRED", undefined as never, 400);
    const f = makeService({
      file,
      media: () => documentMedia(file.length, ref++),
      failures: [expired, expired],
    });
    const reader = await f.svc.openMedia("@chat", 7);
    const [a, b] = await Promise.all([reader.readRange(0, 65_536), reader.readRange(65_536, 65_536)]);
    assert.deepEqual(a, file.subarray(0, 65_536));
    assert.deepEqual(b, file.subarray(65_536, 131_072));
    assert.equal(f.messageLoads(), 2, "one initial load plus one shared refresh");
  });

  it("gives up with FILE_REFERENCE_EXPIRED when the fresh reference fails too", async () => {
    const expired = () => new RPCError("FILE_REFERENCE_EXPIRED", undefined as never, 400);
    const f = makeService({ file: pattern(10_000), failures: [expired, expired] });
    await assert.rejects(() => f.svc.readMediaRange("@chat", 7, 0, 100), { code: "FILE_REFERENCE_EXPIRED" } as object);
    assert.equal(f.messageLoads(), 2);
  });

  it("treats a short answer before the known end as a retryable failure, not EOF", async () => {
    const f = makeService({ file: pattern(100), media: () => documentMedia(10_000) });
    const isTruncation = (e: TelegramMediaError) => e.code === "DOWNLOAD_FAILED" && e.retryable === true;
    await assert.rejects(() => f.svc.readMediaRange("@chat", 7, 0, 10_000), isTruncation);
    await assert.rejects(() => collect(f.svc.streamMedia("@chat", 7)), isTruncation);
    const dir = await mkdtemp(join(tmpdir(), "media-transfer-short-"));
    try {
      await assert.rejects(() => f.svc.downloadMedia("@chat", 7, join(dir, "out.bin")), isTruncation);
      assert.equal((await readFile(join(dir, "out.bin"))).length, 0, "no truncated file is left behind");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not hand out inline photo bytes after an abort", async () => {
    const photo = new Api.Photo({
      id: bigInt(1),
      accessHash: bigInt(2),
      fileReference: Buffer.from([1]),
      date: 0,
      dcId: 4,
      sizes: [new Api.PhotoCachedSize({ type: "s", w: 10, h: 10, bytes: Buffer.from([0xff, 0xd8, 0xff, 1]) })],
    });
    const f = makeService({ media: () => new Api.MessageMediaPhoto({ photo }) });
    assert.equal((await f.svc.readMediaRange("@chat", 7, 0, 4)).length, 4, "inline bytes are served normally");
    const ctrl = new AbortController();
    ctrl.abort(new Error("client went away"));
    const reader = await f.svc.openMedia("@chat", 7);
    await assert.rejects(() => reader.readRange(0, 4, ctrl.signal), /client went away/);
    await assert.rejects(() => collect(reader.stream(0, ctrl.signal)), /client went away/);
  });

  it("stops at an aborted signal", async () => {
    const f = makeService({ file: pattern(MiB) });
    const ctrl = new AbortController();
    ctrl.abort(new Error("client went away"));
    await assert.rejects(() => collect(f.svc.streamMedia("@chat", 7, { signal: ctrl.signal })), /client went away/);
    assert.equal(f.calls.length, 0);
  });
});

describe("downloadMedia to disk", () => {
  it("writeAll loops over partial writes", async () => {
    const out: number[] = [];
    await writeAll(
      async (buf, offset, length) => {
        const n = Math.min(3, length);
        out.push(...buf.subarray(offset, offset + n));
        return { bytesWritten: n };
      },
      Buffer.from([1, 2, 3, 4, 5, 6, 7]),
    );
    assert.deepEqual(out, [1, 2, 3, 4, 5, 6, 7]);
    await assert.rejects(() => writeAll(async () => ({ bytesWritten: 0 }), Buffer.from([1])), /no progress/);
  });

  it("streams the whole file into the target path", async () => {
    const file = pattern(MiB + 123);
    const f = makeService({ file });
    const dir = await mkdtemp(join(tmpdir(), "media-transfer-test-"));
    try {
      const target = join(dir, "out.bin");
      await f.svc.downloadMedia("@chat", 7, target);
      assert.deepEqual(await readFile(target), file);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("download error mapping (#94, #96)", () => {
  it("maps GramJS 'not implemented' to MEDIA_NOT_DOWNLOADABLE", () => {
    const e = mapMediaError(new Error("not implemented")) as TelegramMediaError;
    assert.equal(e.code, "MEDIA_NOT_DOWNLOADABLE");
  });

  it("keeps the Telegram error name instead of a generic failure", () => {
    const e = mapMediaError(new RPCError("SOMETHING_ODD", undefined as never, 400)) as TelegramMediaError;
    assert.equal(e.code, "DOWNLOAD_FAILED");
    assert.match(e.message, /SOMETHING_ODD/);
  });

  it("maps Telegram timeouts by direction", () => {
    const timeout = () => new RPCError("TIMEOUT", undefined as never, -503);
    const up = mapMediaError(timeout(), "upload") as TelegramMediaError;
    assert.equal(up.code, "UPLOAD_FAILED");
    assert.equal(up.retryable, true);
    assert.equal((mapMediaError(timeout(), "download") as TelegramMediaError).code, "DOWNLOAD_FAILED");
  });

  it("keeps the original Telegram error as cause", () => {
    const rpc = new RPCError("AUTH_KEY_UNREGISTERED", undefined as never, 401);
    const mapped = mapMediaError(rpc);
    assert.notEqual(mapped, rpc);
    assert.equal(mapped.cause, rpc);
  });

  it("marks flood waits as retryable with a delay", () => {
    const e = mapMediaError(new FloodWaitError({ request: undefined as never, capture: 7 })) as TelegramMediaError;
    assert.equal(e.code, "RATE_LIMITED");
    assert.equal(e.retryable, true);
    assert.equal(e.retryAfterMs, 7000);
  });

  it("passes our own guard and abort errors through unchanged", () => {
    const guard = new Error("Media exceeds 10 byte limit");
    assert.equal(mapMediaError(guard), guard);
  });

  it("downloadMediaAsBuffer refuses a contact before GramJS reaches 'not implemented'", async () => {
    const contact = new Api.MessageMediaContact({
      phoneNumber: "+1",
      firstName: "A",
      lastName: "",
      vcard: "",
      userId: bigInt(0),
    });
    const f = makeService({ media: () => contact });
    await assert.rejects(() => f.svc.downloadMediaAsBuffer("@chat", 7), { code: "MEDIA_NOT_DOWNLOADABLE" } as object);
  });
});

// ─── uploads ────────────────────────────────────────────────────────────────

function uploadService() {
  const requests: Array<Api.upload.SaveFilePart | Api.upload.SaveBigFilePart> = [];
  const f = makeService({
    invoke: async (req) => {
      requests.push(req as Api.upload.SaveFilePart);
      return true;
    },
  });
  return { ...f, requests };
}

describe("uploadStream", () => {
  it("splits a small file into 512 KiB SaveFilePart requests regardless of source chunking", async () => {
    const f = uploadService();
    const data = pattern(UPLOAD_PART_BYTES * 2 + 1000);
    const file = await f.svc.uploadStream(chunks(data, 70_000), data.length, "clip.mp4");
    assert.equal(f.requests.length, 3);
    assert.ok(f.requests.every((r) => r instanceof Api.upload.SaveFilePart));
    assert.deepEqual(
      f.requests.map((r) => r.bytes.length),
      [UPLOAD_PART_BYTES, UPLOAD_PART_BYTES, 1000],
    );
    assert.deepEqual(
      [...f.requests].sort((a, b) => a.filePart - b.filePart).map((r) => r.filePart),
      [0, 1, 2],
    );
    assert.deepEqual(Buffer.concat([...f.requests].sort((a, b) => a.filePart - b.filePart).map((r) => r.bytes)), data);
    assert.ok(file.inputFile instanceof Api.InputFile);
    assert.equal(file.inputFile.parts, 3);
    assert.equal(file.inputFile.name, "clip.mp4");
    assert.equal(file.size, data.length);
    assert.ok(isUploadedFile(file));
  });

  it("copies source chunks, so a source that reuses one buffer cannot corrupt parts", async () => {
    const f = uploadService();
    const shared = new Uint8Array(UPLOAD_PART_BYTES / 2);
    async function* reusing() {
      for (const value of [1, 2, 3, 4]) {
        shared.fill(value);
        yield shared;
      }
    }
    await f.svc.uploadStream(reusing(), UPLOAD_PART_BYTES * 2, "a.bin");
    const parts = [...f.requests].sort((a, b) => a.filePart - b.filePart).map((r) => r.bytes);
    assert.deepEqual(
      parts.map((p) => [p[0], p[UPLOAD_PART_BYTES / 2]]),
      [
        [1, 2],
        [3, 4],
      ],
    );
  });

  it("uses SaveBigFilePart with the total part count above 10 MiB", async () => {
    const f = uploadService();
    const size = BIG_FILE_THRESHOLD_BYTES + 1;
    const file = await f.svc.uploadStream(chunks(Buffer.alloc(size), MiB), size, "big.bin");
    const parts = Math.ceil(size / UPLOAD_PART_BYTES);
    assert.equal(f.requests.length, parts);
    for (const r of f.requests) {
      assert.ok(r instanceof Api.upload.SaveBigFilePart);
      assert.equal(r.fileTotalParts, parts);
    }
    assert.ok(file.inputFile instanceof Api.InputFileBig);
  });

  it("fails when the source is shorter or longer than declared", async () => {
    const f = uploadService();
    await assert.rejects(() => f.svc.uploadStream(chunks(Buffer.alloc(100), 10), 101, "a.bin"), {
      code: "UPLOAD_SIZE_MISMATCH",
    } as object);
    await assert.rejects(() => f.svc.uploadStream(chunks(Buffer.alloc(UPLOAD_PART_BYTES * 3), MiB), 1000, "a.bin"), {
      code: "UPLOAD_SIZE_MISMATCH",
    } as object);
    assert.ok(f.requests.length <= 1, "stops reading as soon as the size is exceeded");
  });

  it("fails fast on an aborted signal instead of waiting for the first chunk", async () => {
    const f = uploadService();
    const ctrl = new AbortController();
    ctrl.abort(new Error("cancelled"));
    async function* never(): AsyncGenerator<Uint8Array> {
      await new Promise(() => {});
    }
    const outcome = await Promise.race([
      f.svc.uploadStream(never(), 10, "a.bin", ctrl.signal).then(
        () => "resolved",
        (e: Error) => e.message,
      ),
      new Promise((r) => setTimeout(() => r("hung"), 500)),
    ]);
    assert.equal(outcome, "cancelled");
  });

  /** A source that yields `first` chunks, then waits forever; records return(). */
  function stallingSource(first: Uint8Array[]) {
    let returned = false;
    let i = 0;
    const iterable: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]: () => ({
        next: () =>
          i < first.length
            ? Promise.resolve({ done: false, value: first[i++] as Uint8Array })
            : new Promise<IteratorResult<Uint8Array>>(() => {}),
        return: async () => {
          returned = true;
          return { done: true, value: undefined };
        },
      }),
    };
    return { iterable, returned: () => returned };
  }
  const settleWithin = (p: Promise<unknown>, ms = 500) =>
    Promise.race([
      p.then(
        () => "resolved",
        (e: Error & { code?: string }) => e.code ?? e.message,
      ),
      new Promise((r) => setTimeout(() => r("hung"), ms)),
    ]);

  it("a failed part interrupts a source that is waiting for its next chunk", async () => {
    const f = makeService({
      invoke: async () => {
        throw new RPCError("FILE_PARTS_INVALID", undefined as never, 400);
      },
    });
    const src = stallingSource([new Uint8Array(UPLOAD_PART_BYTES)]);
    assert.equal(await settleWithin(f.svc.uploadStream(src.iterable, UPLOAD_PART_BYTES * 3, "a.bin")), "UPLOAD_FAILED");
    assert.equal(src.returned(), true, "the source is told to stop");
  });

  it("an abort interrupts a source that is waiting for its next chunk", async () => {
    const f = uploadService();
    const ctrl = new AbortController();
    const src = stallingSource([new Uint8Array(10)]);
    const upload = f.svc.uploadStream(src.iterable, 100, "a.bin", ctrl.signal);
    setTimeout(() => ctrl.abort(new Error("client went away")), 20);
    assert.equal(await settleWithin(upload), "client went away");
    assert.equal(src.returned(), true);
  });

  it("does not keep already uploaded chunks alive while the upload runs", async () => {
    setFlagsFromString("--expose-gc");
    const gc = runInNewContext("gc") as () => void;
    const f = makeService({ invoke: async () => true });
    const refs: WeakRef<Uint8Array>[] = [];
    let release!: () => void;
    const paused = new Promise<void>((r) => {
      release = r;
    });
    let reachedPause!: () => void;
    const atPause = new Promise<void>((r) => {
      reachedPause = r;
    });
    const parts = 40;
    async function* source() {
      for (let i = 0; i < parts; i++) {
        const chunk = new Uint8Array(UPLOAD_PART_BYTES);
        refs.push(new WeakRef(chunk));
        yield chunk;
      }
      reachedPause();
      await paused; // upload still in progress while we check
      yield new Uint8Array(10);
    }
    const upload = f.svc.uploadStream(source(), parts * UPLOAD_PART_BYTES + 10, "big.bin");
    await atPause;
    for (let i = 0; i < 5; i++) {
      gc();
      await new Promise((r) => setTimeout(r, 10));
    }
    const alive = refs.slice(0, parts - 2).filter((r) => r.deref() !== undefined).length;
    release();
    await upload;
    assert.ok(alive <= 2, `${alive} earlier chunks are still reachable`);
  });

  it("waits for parts already sent before rejecting", async () => {
    let finishParts!: () => void;
    const partsDone = new Promise<void>((r) => {
      finishParts = r;
    });
    const f = makeService({ invoke: () => partsDone.then(() => true) });
    const ctrl = new AbortController();
    const src = stallingSource([new Uint8Array(UPLOAD_PART_BYTES)]);
    let settled = false;
    const upload = f.svc.uploadStream(src.iterable, UPLOAD_PART_BYTES * 3, "a.bin", ctrl.signal).finally(() => {
      settled = true;
    });
    upload.catch(() => {});
    await new Promise((r) => setTimeout(r, 10));
    ctrl.abort(new Error("client went away"));
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(settled, false, "Telegram is still working on a part");
    finishParts();
    await assert.rejects(upload, /client went away/);
  });

  it("refuses files above Telegram's limit before reading", async () => {
    const f = uploadService();
    await assert.rejects(() => f.svc.uploadStream(chunks(Buffer.alloc(1), 1), 2001 * MiB, "a.bin"), {
      code: "MEDIA_TOO_LARGE",
    } as object);
    assert.equal(f.requests.length, 0);
  });

  it("sniffs the MIME type and strips path parts from the name", async () => {
    const f = uploadService();
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]), Buffer.alloc(50)]);
    const file = await f.svc.uploadStream(chunks(png, 3), png.length, "../../etc/photo");
    assert.equal(file.fileName, "photo");
    assert.equal(file.mimeType, "image/png");
    assert.equal(sniffMimeType(Buffer.from("....ftypisom")), "video/mp4");
  });

  it("classifies ISO-BMFF files by brand instead of calling every ftyp a video", () => {
    const ftyp = (major: string, ...compatible: string[]) => {
      const body = Buffer.from(`ftyp${major}\0\0\0\0${compatible.join("")}`, "latin1");
      const size = Buffer.alloc(4);
      size.writeUInt32BE(body.length + 4);
      return Buffer.concat([size, body]);
    };
    assert.equal(sniffMimeType(ftyp("M4A ", "M4A ", "mp42", "isom")), "audio/mp4");
    assert.equal(sniffMimeType(ftyp("M4B ", "M4B ")), "audio/mp4");
    assert.equal(sniffMimeType(ftyp("heic", "mif1", "heic")), "image/heic");
    assert.equal(sniffMimeType(ftyp("mif1", "mif1", "heic")), "image/heic");
    assert.equal(sniffMimeType(ftyp("avif", "avif", "mif1")), "image/avif");
    assert.equal(sniffMimeType(ftyp("mif1", "avif", "mif1", "miaf")), "image/avif");
    assert.equal(sniffMimeType(ftyp("isom", "isom", "iso2", "avc1", "mp41")), "video/mp4");
    assert.equal(sniffMimeType(ftyp("mp42", "isom")), "video/mp4");
    assert.equal(sniffMimeType(ftyp("qt  ", "qt  ")), "video/quicktime");
    assert.equal(sniffMimeType(ftyp("abcd", "efgh")), undefined, "unknown brand falls back to the name");
    assert.equal(sniffMimeType(ftyp("mif1", "mif1")), undefined);
  });

  it("surfaces a rejected part as a coded upload error", async () => {
    const f = makeService({
      invoke: async () => {
        throw new RPCError("FILE_PARTS_INVALID", undefined as never, 400);
      },
    });
    await assert.rejects(() => f.svc.uploadStream(chunks(Buffer.alloc(10), 10), 10, "a.bin"), {
      code: "UPLOAD_FAILED",
    } as object);
  });
});

// ─── send methods with an uploaded file ─────────────────────────────────────

function handle(name: string, mimeType?: string, big = false): UploadedFile {
  const inputFile = big
    ? new Api.InputFileBig({ id: bigInt(9), parts: 30, name })
    : new Api.InputFile({ id: bigInt(9), parts: 2, name, md5Checksum: "" });
  return { kind: "uploaded-file", inputFile, fileName: name, size: 100, ...(mimeType && { mimeType }) };
}

function sendCapture() {
  const sent: Array<Record<string, unknown>> = [];
  const invoked: unknown[] = [];
  const f = makeService({
    sendFile: async (_peer, params) => {
      sent.push(params);
      return { id: 55 };
    },
    invoke: async (req) => {
      invoked.push(req);
      if (req instanceof Api.photos.UploadProfilePhoto) {
        return {
          photo: new Api.Photo({
            id: bigInt(3),
            accessHash: bigInt(0),
            fileReference: Buffer.alloc(0),
            date: 0,
            sizes: [],
            dcId: 2,
          }),
        };
      }
      return new Api.Updates({ updates: [], users: [], chats: [], date: 0, seq: 0 });
    },
    uploadFile: async () => {
      throw new Error("an uploaded file must not be uploaded again");
    },
  });
  return { ...f, sent, invoked };
}

describe("send methods accept an uploaded file", () => {
  it("sendFile sends the InputFile as a document under its real name", async () => {
    const f = sendCapture();
    await f.svc.sendFile("@chat", handle("report.pdf"), "cap");
    const params = f.sent[0] as { file: Api.InputFile; forceDocument: boolean; caption: string };
    assert.ok(params.file instanceof Api.InputFile);
    assert.equal(params.file.name, "report.pdf");
    assert.equal(params.forceDocument, true);
    assert.equal(params.caption, "cap");
  });

  it("sendFile adds an extension from sniffed bytes when the name has none", async () => {
    const f = sendCapture();
    await f.svc.sendFile("@chat", handle("scan", "application/pdf"));
    assert.equal((f.sent[0]?.file as Api.InputFile | undefined)?.name, "scan.pdf");
  });

  it("sendVideoNote sends a round video, not a document", async () => {
    const f = sendCapture();
    const { id } = await f.svc.sendVideoNote("@chat", handle("upl_abc"), { duration: 5, length: 240 });
    assert.equal(id, 55);
    const params = f.sent[0] as { file: Api.InputFile; attributes: Api.DocumentAttributeVideo[]; videoNote?: boolean };
    assert.equal(params.file.name, "upl_abc.mp4", "an .mp4 name makes GramJS use video/mp4");
    assert.equal(params.attributes[0]?.roundMessage, true);
    assert.equal(params.attributes[0]?.w, 240);
    assert.equal(params.videoNote, undefined, "GramJS videoNote flag would add a voice-audio attribute");
  });

  it("sendVoice keeps voiceNote and names the audio", async () => {
    const f = sendCapture();
    await f.svc.sendVoice("@chat", handle("memo", "audio/ogg"));
    assert.equal((f.sent[0]?.file as Api.InputFile | undefined)?.name, "memo.ogg");
    assert.equal(f.sent[0]?.voiceNote, true);
  });

  it("sendAlbum passes uploaded files as documents", async () => {
    const f = makeService({
      sendFile: async (_peer, params) => {
        assert.equal(params.forceDocument, true);
        const files = params.file as Api.InputFile[];
        assert.deepEqual(
          files.map((x) => x.name),
          ["a.jpg", "b.png"],
        );
        return [message(), message()];
      },
    });
    const { ids } = await f.svc.sendAlbum("@chat", [{ filePath: handle("a.jpg") }, { filePath: handle("b.png") }]);
    assert.equal(ids.length, 2);
  });

  it("setProfilePhoto gives an extension-less photo a .jpg name instead of failing PHOTO_EXT_INVALID", async () => {
    const f = sendCapture();
    const { id } = await f.svc.setProfilePhoto({ filePath: handle("upl_123"), isVideo: false, fallback: false });
    assert.equal(id, "3");
    const req = f.invoked.find((r) => r instanceof Api.photos.UploadProfilePhoto) as Api.photos.UploadProfilePhoto;
    assert.equal((req.file as Api.InputFile).name, "upl_123.jpg");
    const png = sendCapture();
    await png.svc.setProfilePhoto({ filePath: handle("pic", "image/png"), isVideo: false, fallback: false });
    const req2 = png.invoked.find((r) => r instanceof Api.photos.UploadProfilePhoto) as Api.photos.UploadProfilePhoto;
    assert.equal((req2.file as Api.InputFile).name, "pic.png");
  });

  it("an extension-less M4A keeps an audio name, not .mp4", async () => {
    const f = sendCapture();
    await f.svc.sendFile("@chat", handle("song", "audio/mp4"));
    assert.equal((f.sent[0]?.file as Api.InputFile | undefined)?.name, "song.m4a");
  });

  it("sendStory treats a sniffed HEIC as a photo, not a video", async () => {
    const f = sendCapture();
    await f.svc.sendStory("me", handle("shot", "image/heic"), { privacy: "everyone" });
    const req = f.invoked.find((r) => r instanceof Api.stories.SendStory) as Api.stories.SendStory;
    assert.ok(req.media instanceof Api.InputMediaUploadedPhoto);
  });

  it("sendStory picks photo from sniffed bytes and names it for Telegram", async () => {
    const f = sendCapture();
    await f.svc.sendStory("me", handle("story", "image/jpeg", true), { privacy: "everyone" });
    const req = f.invoked.find((r) => r instanceof Api.stories.SendStory) as Api.stories.SendStory;
    const media = req.media as Api.InputMediaUploadedPhoto;
    assert.ok(media instanceof Api.InputMediaUploadedPhoto);
    assert.ok(media.file instanceof Api.InputFileBig);
    assert.equal(media.file.name, "story.jpg");
  });
});
