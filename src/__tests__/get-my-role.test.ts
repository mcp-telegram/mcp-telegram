import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import { TelegramService } from "../telegram-client.js";

/**
 * Regression guard for `telegram-get-my-role`.
 *
 * The tool used to pass `new Api.InputUserSelf()` as `channels.GetParticipant.participant`.
 * The TL schema is `channels.getParticipant#a0ab6cc6 channel:InputChannel participant:InputPeer`,
 * so GramJS threw "Cannot cast InputUserSelf to any kind of InputPeer" at serialization time —
 * every production call failed (14 errors / 15 calls over 30 days) while types still compiled,
 * because GramJS declares both fields as the loose `TypeEntityLike`.
 *
 * These tests pin the wire-level shape, which is the only thing that caught the bug.
 */

function makeService(
  entity: unknown,
  invokeImpl: (req: unknown) => Promise<unknown>,
  invocations: unknown[],
): TelegramService {
  const fakeClient = {
    invoke: async (req: unknown) => {
      invocations.push(req);
      return invokeImpl(req);
    },
  };
  const service = new TelegramService(1, "hash");
  const internals = service as unknown as {
    client: unknown;
    connected: boolean;
    resolveChat: (id: string) => Promise<unknown>;
    getMe: () => Promise<{ id: string; username?: string }>;
  };
  internals.client = fakeClient;
  internals.connected = true;
  internals.resolveChat = async () => entity;
  internals.getMe = async () => ({ id: "1", username: "self" });
  return service;
}

function makeChannel(): Api.Channel {
  return new Api.Channel({
    id: bigInt(777),
    title: "Test Channel",
    photo: new Api.ChatPhotoEmpty(),
    date: 0,
    accessHash: bigInt(42),
  } as unknown as ConstructorParameters<typeof Api.Channel>[0]);
}

describe("getMyRole", () => {
  it("asks for the participant as an InputPeer, not an InputUser", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      makeChannel(),
      async () =>
        new Api.channels.ChannelParticipant({
          participant: new Api.ChannelParticipantAdmin({
            userId: bigInt(1),
            promotedBy: bigInt(2),
            date: 0,
            adminRights: new Api.ChatAdminRights({}),
          } as unknown as ConstructorParameters<typeof Api.ChannelParticipantAdmin>[0]),
          chats: [],
          users: [],
        }),
      invocations,
    );

    const result = await service.getMyRole("@test");

    assert.equal(invocations.length, 1);
    const req = invocations[0] as Api.channels.GetParticipant;
    assert.ok(req instanceof Api.channels.GetParticipant);
    assert.ok(
      req.participant instanceof Api.InputPeerSelf,
      `participant must be InputPeerSelf (TL: participant:InputPeer), got ${
        (req.participant as { className?: string })?.className ?? typeof req.participant
      }`,
    );
    assert.ok(
      !(req.participant instanceof Api.InputUserSelf),
      "InputUserSelf cannot be cast to InputPeer and fails at serialization time",
    );
    assert.equal(result.role, "admin");
    assert.equal(result.chatId, "777");
    assert.equal(result.chatName, "Test Channel");
  });

  it("maps the creator participant to the creator role", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      makeChannel(),
      async () =>
        new Api.channels.ChannelParticipant({
          participant: new Api.ChannelParticipantCreator({
            userId: bigInt(1),
            adminRights: new Api.ChatAdminRights({}),
          } as unknown as ConstructorParameters<typeof Api.ChannelParticipantCreator>[0]),
          chats: [],
          users: [],
        }),
      invocations,
    );

    const result = await service.getMyRole("@test");
    assert.equal(result.role, "creator");
  });

  it("returns the member role for a plain participant", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      makeChannel(),
      async () =>
        new Api.channels.ChannelParticipant({
          participant: new Api.ChannelParticipantSelf({
            userId: bigInt(1),
            inviterId: bigInt(2),
            date: 0,
          } as unknown as ConstructorParameters<typeof Api.ChannelParticipantSelf>[0]),
          chats: [],
          users: [],
        }),
      invocations,
    );

    const result = await service.getMyRole("@test");
    assert.equal(result.role, "member");
  });
});
