import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { BinaryReader } from "telegram/extensions/BinaryReader.js";
import { Api } from "telegram/tl/index.js";
import { summarizeSavedMusic } from "../telegram-client.js";
import { GetSavedMusicRequest } from "../tl/saved-music.js";

const GET_SAVED_MUSIC_ID = 0x788d7fe3;
const SAVED_MUSIC_ID = 0x34a2f297;
const SAVED_MUSIC_NOT_MODIFIED_ID = 0xe3878aa4;
const VECTOR_ID = 0x1cb5c415;

function makeDocument(id: number, attributes: Api.TypeDocumentAttribute[]): Api.Document {
  return new Api.Document({
    id: bigInt(id),
    accessHash: bigInt(id * 7),
    fileReference: Buffer.from([1, 2, 3]),
    date: 1710000000,
    mimeType: "audio/mpeg",
    size: bigInt(4096 + id),
    dcId: 2,
    attributes,
  });
}

/** Build a `users.savedMusic` body (constructor id already consumed by readResult's caller). */
function savedMusicBody(count: number, docs: Api.Document[], vectorId = VECTOR_ID): Buffer {
  const header = Buffer.alloc(16);
  header.writeUInt32LE(SAVED_MUSIC_ID, 0);
  header.writeInt32LE(count, 4);
  header.writeUInt32LE(vectorId, 8);
  header.writeInt32LE(docs.length, 12);
  return Buffer.concat([header, ...docs.map((d) => d.getBytes())]);
}

describe("GetSavedMusicRequest.getBytes", () => {
  it("serializes constructor id, InputUser payload, offset, limit and a zero hash", () => {
    const bytes = new GetSavedMusicRequest(new Api.InputUserSelf(), 0, 50).getBytes();

    // 4 (ctor) + 4 (InputUserSelf) + 4 (offset) + 4 (limit) + 8 (hash)
    assert.strictEqual(bytes.length, 24);
    assert.strictEqual(bytes.readUInt32LE(0), GET_SAVED_MUSIC_ID);
    // Field 2 must carry an InputUser-family constructor, never an InputPeer one — the
    // server parses this slot as InputUser and a hand-rolled request has no AUTO_CASTS repair.
    assert.strictEqual(bytes.readUInt32LE(4), new Api.InputUserSelf().CONSTRUCTOR_ID);
    assert.strictEqual(bytes.readInt32LE(8), 0);
    assert.strictEqual(bytes.readInt32LE(12), 50);
    assert.deepStrictEqual(bytes.subarray(16), Buffer.alloc(8));
  });

  it("serializes a full InputUser with its own access hash", () => {
    const id = new Api.InputUser({ userId: bigInt(777), accessHash: bigInt(12345) });
    const bytes = new GetSavedMusicRequest(id, 7, 25).getBytes();

    assert.strictEqual(bytes.readUInt32LE(0), GET_SAVED_MUSIC_ID);
    assert.deepStrictEqual(bytes.subarray(4, 4 + id.getBytes().length), id.getBytes());
    assert.strictEqual(bytes.readInt32LE(4 + id.getBytes().length), 7);
    assert.strictEqual(bytes.readInt32LE(8 + id.getBytes().length), 25);
  });
});

describe("GetSavedMusicRequest.readResult", () => {
  const request = new GetSavedMusicRequest(new Api.InputUserSelf(), 0, 50);

  it("parses users.savedMusic with its document vector", () => {
    const docs = [
      makeDocument(1, [new Api.DocumentAttributeAudio({ duration: 210, title: "A", performer: "X" })]),
      makeDocument(2, [new Api.DocumentAttributeFilename({ fileName: "b.mp3" })]),
    ];
    const out = request.readResult(new BinaryReader(savedMusicBody(9, docs)));

    assert.strictEqual(out.count, 9);
    assert.strictEqual(out.documents.length, 2);
    assert.deepStrictEqual(
      out.documents.map((d) => d.id.toString()),
      ["1", "2"],
    );
    assert.strictEqual(out.notModified, undefined);
  });

  it("parses users.savedMusicNotModified, preserving count with an empty document list", () => {
    // 0xe3878aa4 exceeds 2^31: this case only passes when dispatch reads the id unsigned.
    const body = Buffer.alloc(8);
    body.writeUInt32LE(SAVED_MUSIC_NOT_MODIFIED_ID, 0);
    body.writeInt32LE(4, 4);

    const out = request.readResult(new BinaryReader(body));

    assert.strictEqual(out.count, 4);
    assert.deepStrictEqual(out.documents, []);
    assert.strictEqual(out.notModified, true);
  });

  it("throws when the documents field is not a vector", () => {
    const body = savedMusicBody(1, [], 0xdeadbeef);
    assert.throws(() => request.readResult(new BinaryReader(body)), /deadbeef/);
  });

  it("throws naming the hex id for an unknown response constructor", () => {
    const body = Buffer.alloc(8);
    body.writeUInt32LE(0xabcd1234, 0);
    assert.throws(() => request.readResult(new BinaryReader(body)), /abcd1234/);
  });
});

describe("summarizeSavedMusic", () => {
  it("maps audio attributes to title, performer and duration", () => {
    const doc = makeDocument(55, [
      new Api.DocumentAttributeAudio({ duration: 197, title: "Summertime", performer: "Mareux" }),
      new Api.DocumentAttributeFilename({ fileName: "mareux.mp3" }),
    ]);
    const out = summarizeSavedMusic({ count: 1, documents: [doc] }, 0);

    assert.deepStrictEqual(out.tracks, [
      {
        id: "55",
        mimeType: "audio/mpeg",
        size: "4151",
        title: "Summertime",
        performer: "Mareux",
        duration: 197,
        fileName: "mareux.mp3",
      },
    ]);
  });

  it("falls back to fileName when no audio attribute is present", () => {
    const doc = makeDocument(3, [new Api.DocumentAttributeFilename({ fileName: "unknown.flac" })]);
    const [track] = summarizeSavedMusic({ count: 1, documents: [doc] }, 0).tracks;

    assert.strictEqual(track.fileName, "unknown.flac");
    assert.strictEqual(track.title, undefined);
    assert.strictEqual(track.performer, undefined);
    assert.strictEqual(track.duration, undefined);
  });

  it("stringifies id and size so JSON.stringify does not emit empty objects", () => {
    const doc = makeDocument(9, []);
    const json = JSON.parse(JSON.stringify(summarizeSavedMusic({ count: 1, documents: [doc] }, 0)));

    assert.strictEqual(json.tracks[0].id, "9");
    assert.strictEqual(json.tracks[0].size, "4105");
  });

  it("emits nextOffset while the page ends before count", () => {
    const docs = [makeDocument(1, []), makeDocument(2, [])];
    const out = summarizeSavedMusic({ count: 5, documents: docs }, 1);

    assert.strictEqual(out.nextOffset, 3);
  });

  it("omits nextOffset at the list boundary", () => {
    const docs = [makeDocument(1, []), makeDocument(2, [])];
    const out = summarizeSavedMusic({ count: 4, documents: docs }, 2);

    assert.strictEqual(out.nextOffset, undefined);
    assert.strictEqual("nextOffset" in out, false);
  });

  it("maps a notModified response to the reported count and no tracks", () => {
    const out = summarizeSavedMusic({ count: 6, documents: [], notModified: true }, 0);

    assert.strictEqual(out.count, 6);
    assert.deepStrictEqual(out.tracks, []);
    assert.strictEqual(out.notModified, true);
    // Nothing was consumed, so the cursor stays at the requested offset.
    assert.strictEqual(out.nextOffset, 0);
  });
});
