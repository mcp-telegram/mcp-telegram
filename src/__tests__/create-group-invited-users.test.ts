import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import { TelegramService } from "../telegram-client.js";

/**
 * Regression guard for `telegram-create-group` and `telegram-invite-to-group`.
 *
 * `messages.createChat`, `messages.addChatUser` and `channels.inviteToChannel` all return
 * `messages.InvitedUsers` — `{ updates, missingInvitees }` — not `Updates`. The old code
 * cast the result with `as unknown as Api.Updates` and read `.chats[0]` off it, which is
 * always `undefined` on the wrapper. Every basic-group creation therefore threw
 * "Failed to create group" *after Telegram had already created the group* (3 errors on
 * 3 calls over 7 days in production), and every invite was reported as successful even
 * when Telegram declined it.
 *
 * The cast compiled because GramJS types these fields loosely, so only a wire-shape test
 * catches it. These tests feed the real `Api.messages.InvitedUsers` constructor through
 * `invoke` — do not replace it with a plain object.
 */

function makeChat(id: number, title: string): Api.Chat {
  return new Api.Chat({
    id: bigInt(id),
    title,
    photo: new Api.ChatPhotoEmpty(),
    participantsCount: 1,
    date: 0,
    version: 1,
  });
}

function makeUser(id: number): Api.User {
  return new Api.User({ id: bigInt(id), accessHash: bigInt(42) });
}

function makeService(
  invokeImpl: (req: unknown) => Promise<unknown>,
  opts: { entity?: unknown; getEntity?: (u: string) => Promise<unknown> } = {},
): TelegramService {
  const service = new TelegramService(1, "hash");
  const internals = service as unknown as {
    client: unknown;
    connected: boolean;
    resolveChat: (id: string) => Promise<unknown>;
  };
  internals.client = {
    invoke: invokeImpl,
    getEntity: opts.getEntity ?? (async () => makeUser(777)),
  };
  internals.connected = true;
  internals.resolveChat = async () => opts.entity;
  return service;
}

describe("createGroup unwraps messages.InvitedUsers", () => {
  it("returns the created basic group instead of throwing", async () => {
    const created = makeChat(1234, "Test Group");
    const service = makeService(async (req) => {
      assert.ok(req instanceof Api.messages.CreateChat, "expected messages.CreateChat");
      return new Api.messages.InvitedUsers({
        updates: new Api.Updates({ updates: [], users: [], chats: [created], date: 0, seq: 0 }),
        missingInvitees: [],
      });
    });

    const result = await service.createGroup({ title: "Test Group", users: ["@someone"] });

    assert.equal(result.id, "1234");
    assert.equal(result.type, "group");
    assert.equal(result.missingInvitees, undefined);
  });

  it("surfaces users Telegram declined to add", async () => {
    const created = makeChat(555, "Partial Group");
    const service = makeService(async () => {
      return new Api.messages.InvitedUsers({
        updates: new Api.Updates({ updates: [], users: [], chats: [created], date: 0, seq: 0 }),
        missingInvitees: [new Api.MissingInvitee({ userId: bigInt(999) })],
      });
    });

    const result = await service.createGroup({ title: "Partial Group", users: ["@someone"] });

    assert.equal(result.id, "555");
    assert.deepEqual(result.missingInvitees, ["999"]);
  });

  it("still works if Telegram returns a bare Updates (layer rollback)", async () => {
    const created = makeChat(77, "Legacy");
    const service = makeService(async () => {
      return new Api.Updates({ updates: [], users: [], chats: [created], date: 0, seq: 0 });
    });

    const result = await service.createGroup({ title: "Legacy", users: ["@someone"] });

    assert.equal(result.id, "77");
  });

  it("keeps throwing when no chat came back at all", async () => {
    const service = makeService(async () => {
      return new Api.messages.InvitedUsers({
        updates: new Api.Updates({ updates: [], users: [], chats: [], date: 0, seq: 0 }),
        missingInvitees: [],
      });
    });

    await assert.rejects(() => service.createGroup({ title: "Doomed", users: ["@someone"] }), /Failed to create group/);
  });
});

describe("inviteToGroup honours missingInvitees", () => {
  it("reports a declined invite as failed, not invited", async () => {
    const chat = makeChat(10, "Group");
    const service = makeService(
      async (req) => {
        assert.ok(req instanceof Api.messages.AddChatUser, "expected messages.AddChatUser");
        return new Api.messages.InvitedUsers({
          updates: new Api.Updates({ updates: [], users: [], chats: [], date: 0, seq: 0 }),
          missingInvitees: [new Api.MissingInvitee({ userId: bigInt(777) })],
        });
      },
      { entity: chat },
    );

    const result = await service.inviteToGroup("10", ["@blocked"]);

    assert.deepEqual(result.invited, []);
    assert.deepEqual(result.failed, ["@blocked"]);
  });

  it("reports an accepted invite as invited", async () => {
    const chat = makeChat(10, "Group");
    const service = makeService(
      async () =>
        new Api.messages.InvitedUsers({
          updates: new Api.Updates({ updates: [], users: [], chats: [], date: 0, seq: 0 }),
          missingInvitees: [],
        }),
      { entity: chat },
    );

    const result = await service.inviteToGroup("10", ["@ok"]);

    assert.deepEqual(result.invited, ["@ok"]);
    assert.deepEqual(result.failed, []);
  });
});
