import assert from "node:assert";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import { TelegramService } from "../telegram-client.js";

/**
 * Regression tests for numeric-peer resolution. A bare numeric ID (as emitted
 * by list-chats / search) used to be handed straight to GramJS, which throws
 * "Could not find the input entity" when the peer isn't cached and the account
 * is not a contact — and a positive number is ambiguously treated as a PeerUser,
 * so channel IDs failed outright. resolveNumericPeer recovers by scanning dialogs
 * for a matching entity (which carries the access_hash), for users AND channels.
 */

const TMP_DIR = join(tmpdir(), `mcp-telegram-resolvepeer-test-${process.pid}`);
const SESSION_PATH = join(TMP_DIR, "session");

before(() => mkdirSync(TMP_DIR, { recursive: true }));
after(() => rmSync(TMP_DIR, { recursive: true, force: true }));

type AnyFn = (...args: unknown[]) => unknown;
interface MockClient {
  getEntity: AnyFn;
  getDialogs: AnyFn;
}

interface ServiceInternals {
  client: MockClient | null;
  connected: boolean;
  entityCache: Map<string, unknown>;
  resolveNumericPeer(chatId: string): Promise<unknown>;
}

function makeService(client: MockClient): ServiceInternals {
  const svc = new TelegramService(1, "h", { sessionPath: SESSION_PATH });
  const s = svc as unknown as ServiceInternals;
  s.client = client;
  s.connected = true;
  return s;
}

const makeUser = (id: number) => new Api.User({ id: bigInt(id), accessHash: bigInt(42), firstName: "U" });
const makeChannel = (id: number) =>
  new Api.Channel({
    id: bigInt(id),
    title: "C",
    photo: new Api.ChatPhotoEmpty(),
    date: 0,
    accessHash: bigInt(1),
    megagroup: true,
  });
const makeChat = (id: number) =>
  new Api.Chat({
    id: bigInt(id),
    title: "G",
    photo: new Api.ChatPhotoEmpty(),
    participantsCount: 1,
    date: 0,
    version: 1,
  });

/** A throw-on-call stub so a test asserts a path is NOT taken. */
const mustNotBeCalled =
  (label: string): AnyFn =>
  () => {
    throw new Error(`unexpected call: ${label}`);
  };

const DIRECT_RESOLVE_FAILS: AnyFn = () => {
  throw new Error("Could not find the input entity");
};

describe("resolveNumericPeer", () => {
  it("returns a cached entity without hitting the network", async () => {
    const entity = makeUser(555);
    const s = makeService({
      getEntity: mustNotBeCalled("getEntity"),
      getDialogs: mustNotBeCalled("getDialogs"),
    });
    s.entityCache.set("555", entity);

    const out = await s.resolveNumericPeer("555");
    assert.strictEqual(out, entity);
  });

  it("resolves directly via getEntity when GramJS already knows the peer", async () => {
    const entity = makeUser(777);
    const s = makeService({
      getEntity: async (id: unknown) => {
        assert.strictEqual(id, "777");
        return entity;
      },
      getDialogs: mustNotBeCalled("getDialogs"),
    });

    const out = await s.resolveNumericPeer("777");
    assert.strictEqual(out, entity);
    assert.strictEqual(s.entityCache.get("777"), entity, "result is cached");
  });

  it("recovers a USER id via dialog scan when direct resolve fails", async () => {
    const userEntity = makeUser(1282175136);
    const s = makeService({
      getEntity: DIRECT_RESOLVE_FAILS,
      getDialogs: async () => [{ entity: makeChannel(999) }, { entity: userEntity }],
    });

    const out = await s.resolveNumericPeer("1282175136");
    assert.strictEqual(out, userEntity, "must return the dialog entity, not the raw id");
    assert.strictEqual(s.entityCache.get("1282175136"), userEntity);
  });

  it("recovers a CHANNEL id given BARE (the real prod failure shape)", async () => {
    // SigNoz showed send-message failing with a bare channelId "1004294063929"
    // (no -100 prefix) — GramJS treats a bare positive as PeerUser and fails.
    const channelEntity = makeChannel(1004294063929);
    const s = makeService({
      getEntity: DIRECT_RESOLVE_FAILS,
      getDialogs: async () => [{ entity: channelEntity }],
    });

    const out = await s.resolveNumericPeer("1004294063929");
    assert.strictEqual(out, channelEntity);
  });

  it("recovers a CHANNEL id given in -100… marked form", async () => {
    const channelEntity = makeChannel(1004294063929);
    const s = makeService({
      getEntity: DIRECT_RESOLVE_FAILS,
      getDialogs: async () => [{ entity: channelEntity }],
    });

    // Caller passes the marked form; dialog entity carries the bare id.
    const out = await s.resolveNumericPeer("-1001004294063929");
    assert.strictEqual(out, channelEntity);
  });

  it("recovers a basic GROUP id given in -<id> marked form", async () => {
    const chatEntity = makeChat(123);
    const s = makeService({
      getEntity: DIRECT_RESOLVE_FAILS,
      getDialogs: async () => [{ entity: chatEntity }],
    });

    const out = await s.resolveNumericPeer("-123");
    assert.strictEqual(out, chatEntity);
  });

  it("does NOT cross-match a group id -123 against a user with bare id 123", async () => {
    // The sign/-100 prefix disambiguates Telegram's overlapping id spaces.
    // A naive bare compare would wrongly return this user; the marked compare must not.
    const s = makeService({
      getEntity: DIRECT_RESOLVE_FAILS,
      getDialogs: async () => [{ entity: makeUser(123) }],
    });

    const out = await s.resolveNumericPeer("-123");
    assert.strictEqual(out, "-123", "no marked match → raw-id fallback, not the user 123");
  });

  it("falls back to the raw id string when no dialog matches", async () => {
    const s = makeService({
      getEntity: DIRECT_RESOLVE_FAILS,
      getDialogs: async () => [{ entity: makeUser(111) }],
    });

    const out = await s.resolveNumericPeer("222");
    assert.strictEqual(out, "222", "must not regress the GramJS GetUsers path for contacts");
  });

  it("falls back to the raw id when the dialog fetch itself throws", async () => {
    const s = makeService({
      getEntity: DIRECT_RESOLVE_FAILS,
      getDialogs: async () => {
        throw new Error("network down");
      },
    });

    const out = await s.resolveNumericPeer("333");
    assert.strictEqual(out, "333");
  });
});
