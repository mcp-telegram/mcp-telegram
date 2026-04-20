import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import { mergeBannedRights, TelegramService } from "../telegram-client.js";

describe("mergeBannedRights", () => {
  it("preserves omitted flags from current rights", () => {
    const current = { pinMessages: true, inviteUsers: true, sendMessages: false };
    const merged = mergeBannedRights(current, { sendMessages: false });
    assert.strictEqual(merged.sendMessages, true, "user-specified denial applies");
    assert.strictEqual(merged.pinMessages, true, "omitted flag stays banned");
    assert.strictEqual(merged.inviteUsers, true, "omitted flag stays banned");
    assert.strictEqual(merged.sendMedia, false, "omitted flag with no current stays unbanned");
  });

  it("user-provided value overrides current", () => {
    const current = { pinMessages: true };
    const merged = mergeBannedRights(current, { pinMessages: true });
    assert.strictEqual(merged.pinMessages, false, "pinMessages:true allowed -> not banned");
  });

  it("fills missing flags with false when current is undefined", () => {
    const merged = mergeBannedRights(undefined, { sendMessages: true });
    assert.strictEqual(merged.sendMessages, false);
    assert.strictEqual(merged.sendMedia, false);
    assert.strictEqual(merged.pinMessages, false);
  });

  it("covers all nineteen flags (10 exposed + 9 extra preserved)", () => {
    const merged = mergeBannedRights(undefined, {});
    const keys = Object.keys(merged).sort();
    assert.deepStrictEqual(keys, [
      "changeInfo",
      "embedLinks",
      "inviteUsers",
      "manageTopics",
      "pinMessages",
      "sendAudios",
      "sendDocs",
      "sendGames",
      "sendGifs",
      "sendInline",
      "sendMedia",
      "sendMessages",
      "sendPhotos",
      "sendPlain",
      "sendPolls",
      "sendRoundvideos",
      "sendStickers",
      "sendVideos",
      "sendVoices",
    ]);
  });
});

describe("TelegramService.setChatPermissions", () => {
  it("merges new permissions with existing defaultBannedRights", async () => {
    const existingRights = new Api.ChatBannedRights({
      untilDate: 0,
      pinMessages: true,
      inviteUsers: true,
    });
    const channel = new Api.Channel({
      id: bigInt(12345),
      title: "test",
      photo: new Api.ChatPhotoEmpty(),
      date: 0,
      accessHash: bigInt(1),
      defaultBannedRights: existingRights,
    });
    const inputChannel = new Api.InputPeerChannel({ channelId: bigInt(12345), accessHash: bigInt(1) });

    const invocations: unknown[] = [];
    const fakeClient = {
      invoke: async (req: unknown) => {
        invocations.push(req);
        if (req instanceof Api.channels.GetFullChannel) {
          return new Api.messages.ChatFull({
            fullChat: new Api.ChannelFull({
              id: bigInt(12345),
              about: "",
              readInboxMaxId: 0,
              readOutboxMaxId: 0,
              unreadCount: 0,
              chatPhoto: new Api.PhotoEmpty({ id: bigInt(0) }),
              notifySettings: new Api.PeerNotifySettings({}),
              pts: 0,
              botInfo: [],
            }),
            chats: [channel],
            users: [],
          });
        }
        return undefined;
      },
      getInputEntity: async () => inputChannel,
    };

    const service = new TelegramService(1, "hash");
    const internals = service as unknown as {
      client: unknown;
      connected: boolean;
      resolveChat: (id: string) => Promise<unknown>;
    };
    internals.client = fakeClient;
    internals.connected = true;
    internals.resolveChat = async () => channel;

    await service.setChatPermissions("12345", { sendMessages: false });

    const editCall = invocations.find((r) => r instanceof Api.messages.EditChatDefaultBannedRights) as
      | Api.messages.EditChatDefaultBannedRights
      | undefined;
    assert.ok(editCall, "EditChatDefaultBannedRights was invoked");
    const rights = editCall.bannedRights as Api.ChatBannedRights;
    assert.strictEqual(rights.sendMessages, true, "sendMessages becomes banned");
    assert.strictEqual(rights.pinMessages, true, "pinMessages stays banned (preserved)");
    assert.strictEqual(rights.inviteUsers, true, "inviteUsers stays banned (preserved)");
    assert.strictEqual(rights.sendMedia, false, "omitted flag with no prior value stays unbanned");
  });
});
