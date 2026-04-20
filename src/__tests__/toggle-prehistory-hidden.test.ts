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

describe("TelegramService.togglePrehistoryHidden", () => {
  it("invokes channels.TogglePreHistoryHidden with enabled=true for supergroup", async () => {
    const megagroup = new Api.Channel({
      id: bigInt(12345),
      title: "supergroup",
      photo: new Api.ChatPhotoEmpty(),
      date: 0,
      accessHash: bigInt(1),
      megagroup: true,
    });
    const invocations: unknown[] = [];
    const service = makeService(megagroup, invocations);

    await service.togglePrehistoryHidden("12345", true);

    const call = invocations.find((r) => r instanceof Api.channels.TogglePreHistoryHidden) as
      | Api.channels.TogglePreHistoryHidden
      | undefined;
    assert.ok(call, "TogglePreHistoryHidden was invoked");
    assert.strictEqual(call.enabled, true);
  });

  it("invokes channels.TogglePreHistoryHidden with enabled=false", async () => {
    const megagroup = new Api.Channel({
      id: bigInt(22222),
      title: "supergroup",
      photo: new Api.ChatPhotoEmpty(),
      date: 0,
      accessHash: bigInt(1),
      megagroup: true,
    });
    const invocations: unknown[] = [];
    const service = makeService(megagroup, invocations);

    await service.togglePrehistoryHidden("22222", false);

    const call = invocations.find((r) => r instanceof Api.channels.TogglePreHistoryHidden) as
      | Api.channels.TogglePreHistoryHidden
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.enabled, false);
  });

  it("rejects broadcast channels (not megagroup)", async () => {
    const broadcast = new Api.Channel({
      id: bigInt(33333),
      title: "broadcast",
      photo: new Api.ChatPhotoEmpty(),
      date: 0,
      accessHash: bigInt(1),
      broadcast: true,
    });
    const invocations: unknown[] = [];
    const service = makeService(broadcast, invocations);

    await assert.rejects(service.togglePrehistoryHidden("33333", true), /supergroups, not broadcast channels/);
    assert.strictEqual(
      invocations.find((r) => r instanceof Api.channels.TogglePreHistoryHidden),
      undefined,
      "no API call on invalid target",
    );
  });

  it("rejects non-channel entities (basic group)", async () => {
    const chat = new Api.Chat({
      id: bigInt(44444),
      title: "basic group",
      photo: new Api.ChatPhotoEmpty(),
      participantsCount: 5,
      date: 0,
      version: 0,
    });
    const invocations: unknown[] = [];
    const service = makeService(chat, invocations);

    await assert.rejects(service.togglePrehistoryHidden("44444", true), /supergroups/);
  });
});
