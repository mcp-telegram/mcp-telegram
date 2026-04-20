import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import { TelegramService } from "../telegram-client.js";

function makeService(entity: unknown, user: unknown, invocations: unknown[]): TelegramService {
  const fakeClient = {
    invoke: async (req: unknown) => {
      invocations.push(req);
      return undefined;
    },
    getEntity: async (_id: string) => user,
  };
  const service = new TelegramService(1, "hash");
  const internals = service as unknown as {
    client: unknown;
    connected: boolean;
    resolveChat: (id: string) => Promise<unknown>;
  };
  internals.client = fakeClient;
  internals.connected = true;
  internals.resolveChat = async () => entity;
  return service;
}

describe("TelegramService.approveChatJoinRequest", () => {
  const makeUser = (id: number) =>
    new Api.User({
      id: bigInt(id),
      accessHash: bigInt(42),
      firstName: "Test",
    });

  it("invokes HideChatJoinRequest with approved=true for channel peer", async () => {
    const megagroup = new Api.Channel({
      id: bigInt(10000),
      title: "sg",
      photo: new Api.ChatPhotoEmpty(),
      date: 0,
      accessHash: bigInt(1),
      megagroup: true,
    });
    const invocations: unknown[] = [];
    const service = makeService(megagroup, makeUser(555), invocations);

    await service.approveChatJoinRequest("10000", "555", true);

    const call = invocations.find((r) => r instanceof Api.messages.HideChatJoinRequest) as
      | Api.messages.HideChatJoinRequest
      | undefined;
    assert.ok(call, "HideChatJoinRequest was invoked");
    assert.strictEqual(call.approved, true);
    assert.ok(call.userId instanceof Api.InputUser);
    assert.strictEqual(call.userId.userId.toString(), "555");
  });

  it("invokes HideChatJoinRequest with approved=false (denied)", async () => {
    const megagroup = new Api.Channel({
      id: bigInt(20000),
      title: "sg",
      photo: new Api.ChatPhotoEmpty(),
      date: 0,
      accessHash: bigInt(1),
      megagroup: true,
    });
    const invocations: unknown[] = [];
    const service = makeService(megagroup, makeUser(777), invocations);

    await service.approveChatJoinRequest("20000", "777", false);

    const call = invocations.find((r) => r instanceof Api.messages.HideChatJoinRequest) as
      | Api.messages.HideChatJoinRequest
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.approved, false);
  });

  it("rejects basic Chat peer (basic groups do not support join requests)", async () => {
    const chat = new Api.Chat({
      id: bigInt(33333),
      title: "basic group",
      photo: new Api.ChatPhotoEmpty(),
      participantsCount: 5,
      date: 0,
      version: 0,
    });
    const invocations: unknown[] = [];
    const service = makeService(chat, makeUser(888), invocations);

    await assert.rejects(service.approveChatJoinRequest("33333", "888", true), /supergroups and channels/i);
    assert.strictEqual(
      invocations.find((r) => r instanceof Api.messages.HideChatJoinRequest),
      undefined,
      "no API call for basic group",
    );
  });

  it("rejects when user resolves to non-User entity", async () => {
    const megagroup = new Api.Channel({
      id: bigInt(44444),
      title: "sg",
      photo: new Api.ChatPhotoEmpty(),
      date: 0,
      accessHash: bigInt(1),
      megagroup: true,
    });
    const notAUser = new Api.Chat({
      id: bigInt(99),
      title: "not a user",
      photo: new Api.ChatPhotoEmpty(),
      participantsCount: 1,
      date: 0,
      version: 0,
    });
    const invocations: unknown[] = [];
    const service = makeService(megagroup, notAUser, invocations);

    await assert.rejects(service.approveChatJoinRequest("44444", "99", true), /not a user/i);
    assert.strictEqual(
      invocations.find((r) => r instanceof Api.messages.HideChatJoinRequest),
      undefined,
      "no API call when target is not a user",
    );
  });

  it("rejects when chat entity is a private user (not a group/channel)", async () => {
    const userPeer = new Api.User({
      id: bigInt(1),
      accessHash: bigInt(1),
      firstName: "Peer",
    });
    const invocations: unknown[] = [];
    const service = makeService(userPeer, makeUser(123), invocations);

    await assert.rejects(service.approveChatJoinRequest("1", "123", true), /supergroups and channels/i);
  });
});
