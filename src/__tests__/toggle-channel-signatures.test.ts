import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import { TelegramService } from "../telegram-client.js";

function makeService(entity: unknown, invocations: unknown[]): TelegramService {
  const fakeClient = {
    invoke: async (req: unknown) => {
      invocations.push(req);
      return undefined;
    },
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

describe("TelegramService.toggleChannelSignatures", () => {
  it("invokes channels.ToggleSignatures with signaturesEnabled=true for broadcast channel", async () => {
    const channel = new Api.Channel({
      id: bigInt(12345),
      title: "broadcast",
      photo: new Api.ChatPhotoEmpty(),
      date: 0,
      accessHash: bigInt(1),
      broadcast: true,
    });
    const invocations: unknown[] = [];
    const service = makeService(channel, invocations);

    await service.toggleChannelSignatures("12345", true);

    const call = invocations.find((r) => r instanceof Api.channels.ToggleSignatures) as
      | Api.channels.ToggleSignatures
      | undefined;
    assert.ok(call, "ToggleSignatures was invoked");
    assert.strictEqual(call.signaturesEnabled, true);
  });

  it("invokes channels.ToggleSignatures with signaturesEnabled=false", async () => {
    const channel = new Api.Channel({
      id: bigInt(22222),
      title: "broadcast",
      photo: new Api.ChatPhotoEmpty(),
      date: 0,
      accessHash: bigInt(1),
      broadcast: true,
    });
    const invocations: unknown[] = [];
    const service = makeService(channel, invocations);

    await service.toggleChannelSignatures("22222", false);

    const call = invocations.find((r) => r instanceof Api.channels.ToggleSignatures) as
      | Api.channels.ToggleSignatures
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.signaturesEnabled, false);
  });

  it("rejects supergroups (megagroup)", async () => {
    const megagroup = new Api.Channel({
      id: bigInt(33333),
      title: "supergroup",
      photo: new Api.ChatPhotoEmpty(),
      date: 0,
      accessHash: bigInt(1),
      megagroup: true,
    });
    const invocations: unknown[] = [];
    const service = makeService(megagroup, invocations);

    await assert.rejects(service.toggleChannelSignatures("33333", true), /broadcast channels/);
    assert.strictEqual(
      invocations.find((r) => r instanceof Api.channels.ToggleSignatures),
      undefined,
      "no API call on invalid target",
    );
  });

  it("rejects non-channel entities", async () => {
    const chat = new Api.Chat({
      id: bigInt(44444),
      title: "small group",
      photo: new Api.ChatPhotoEmpty(),
      participantsCount: 5,
      date: 0,
      version: 0,
    });
    const invocations: unknown[] = [];
    const service = makeService(chat, invocations);

    await assert.rejects(service.toggleChannelSignatures("44444", true), /broadcast channels/);
  });
});
