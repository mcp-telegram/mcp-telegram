import bigInt from "big-integer";
import type { BinaryReader } from "telegram/extensions/BinaryReader.js";
import { toSignedLittleBuffer } from "telegram/Helpers.js";
import { Api } from "telegram/tl/index.js";

/**
 * Hand-rolled TL for `users.getSavedMusic` — the songs pinned to a Telegram profile.
 *
 * GramJS is pinned at TL layer 198 (`telegram/tl/AllTLObjects.js`), which predates this
 * method, and 2.26.22 is the newest published release — so there is no generated class to
 * use and no version to bump to. The schema (core.telegram.org/method/users.getSavedMusic):
 *
 *   users.savedMusicNotModified#e3878aa4 count:int = users.SavedMusic;
 *   users.savedMusic#34a2f297 count:int documents:Vector<Document> = users.SavedMusic;
 *   ---functions---
 *   users.getSavedMusic#788d7fe3 id:InputUser offset:int limit:int hash:long = users.SavedMusic;
 */
const GET_SAVED_MUSIC_ID = 0x788d7fe3;
const SAVED_MUSIC_ID = 0x34a2f297;
const SAVED_MUSIC_NOT_MODIFIED_ID = 0xe3878aa4;
const VECTOR_ID = 0x1cb5c415;

export type SavedMusicResponse = {
  count: number;
  documents: Api.Document[];
  notModified?: true;
};

/**
 * Minimal stand-in for a generated GramJS request class. Only the five members the runtime
 * actually touches are implemented:
 *
 * - `CONSTRUCTOR_ID` — read by `extensions/MessagePacker.js`
 * - `classType`      — gated by `client/users.js` (`!== "request"` throws)
 * - `resolve()`      — awaited unguarded by `client/users.js`
 * - `getBytes()`     — called by `network/RequestState.js`
 * - `readResult()`   — called by `network/MTProtoSender.js`
 *
 * `resolve()` is deliberately a no-op: the generated version exists only to run `AUTO_CASTS`
 * on arguments, and the caller already converts the peer with `utils.getInputUser` before
 * constructing this request. Entity caching happens on the *result* inside `invoke`.
 */
export class GetSavedMusicRequest {
  static readonly CONSTRUCTOR_ID = GET_SAVED_MUSIC_ID;

  readonly CONSTRUCTOR_ID = GET_SAVED_MUSIC_ID;
  readonly classType = "request" as const;
  readonly className = "users.GetSavedMusic";

  /** Phantom type carrying the response shape; never assigned, so it must be `declare`. */
  declare __response: SavedMusicResponse;

  constructor(
    readonly id: Api.TypeInputUser,
    readonly offset: number,
    readonly limit: number,
  ) {}

  /** Generated `resolve()` only applies AUTO_CASTS; the peer arrives pre-cast. */
  async resolve(): Promise<void> {}

  getBytes(): Buffer {
    const ctor = Buffer.alloc(4);
    // Generated getBytes() writes constructor ids unsigned unconditionally.
    ctor.writeUInt32LE(GET_SAVED_MUSIC_ID, 0);

    const offset = Buffer.alloc(4);
    offset.writeInt32LE(this.offset, 0);

    const limit = Buffer.alloc(4);
    limit.writeInt32LE(this.limit, 0);

    // `hash` is a client-side hash over previously-seen song ids. A stateless MCP call keeps
    // no such state, so it is pinned to 0 — meaning the server always answers `savedMusic`
    // and never `savedMusicNotModified`.
    const hash = toSignedLittleBuffer(bigInt(0), 8);

    return Buffer.concat([ctor, this.id.getBytes(), offset, limit, hash]);
  }

  readResult(reader: BinaryReader): SavedMusicResponse {
    // Constructor ids must be read unsigned: `savedMusicNotModified` is 0xe3878aa4, above
    // 2^31, so a signed read yields -477656412 and that branch becomes unreachable.
    const ctor = reader.readInt(false);

    if (ctor === SAVED_MUSIC_ID) {
      const count = reader.readInt();
      const vector = reader.readInt(false);
      if (vector !== VECTOR_ID) {
        throw new Error(`Expected Vector<Document> in users.savedMusic, got 0x${vector.toString(16)}`);
      }
      const length = reader.readInt();
      const documents: Api.Document[] = [];
      for (let i = 0; i < length; i++) {
        const doc = reader.tgReadObject();
        if (doc instanceof Api.Document) documents.push(doc);
      }
      return { count, documents };
    }

    if (ctor === SAVED_MUSIC_NOT_MODIFIED_ID) {
      return { count: reader.readInt(), documents: [], notModified: true };
    }

    throw new Error(`Unexpected users.SavedMusic constructor 0x${ctor.toString(16)}`);
  }
}
