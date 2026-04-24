/**
 * Tests for v1.30.0 story write tools and discussion/read-receipt helpers.
 * All tests are mock-only — no real Telegram connection.
 */
import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import {
  buildStoryPrivacyRules,
  detectMediaType,
  extractStoryIdFromUpdates,
  summarizeDiscussionMessage,
  summarizeGroupsForDiscussion,
  summarizeReadParticipants,
  summarizeReportResult,
  TelegramService,
} from "../telegram-client.js";

// ─── MockClient helpers ─────────────────────────────────────────────────────

interface Internals {
  client: unknown;
  connected: boolean;
}

type MockClient = {
  invoke: (req: unknown) => Promise<unknown>;
  getInputEntity: (peer: unknown) => Promise<unknown>;
  uploadFile: (opts: unknown) => Promise<unknown>;
};

function makeService(
  invocations: unknown[],
  responder: (req: unknown) => unknown,
  uploadResponder?: (opts: unknown) => unknown,
): TelegramService {
  const fakeClient: MockClient = {
    invoke: async (req) => {
      invocations.push(req);
      return responder(req);
    },
    getInputEntity: async (peer) => peer,
    uploadFile: async (opts) => {
      if (uploadResponder) return uploadResponder(opts);
      return { id: bigInt(1), parts: 1 };
    },
  };
  const service = new TelegramService(1, "hash");
  const internals = service as unknown as Internals;
  internals.client = fakeClient;
  internals.connected = true;
  return service;
}

// ─── detectMediaType ───────────────────────────────────────────────────────

describe("detectMediaType", () => {
  it("returns photo for jpg, jpeg, png, webp, heic, heif", () => {
    for (const ext of ["jpg", "jpeg", "png", "webp", "heic", "heif"]) {
      assert.strictEqual(detectMediaType(`/tmp/file.${ext}`), "photo", ext);
    }
  });

  it("returns video for mp4, mov, webm, mkv", () => {
    for (const ext of ["mp4", "mov", "webm", "mkv"]) {
      assert.strictEqual(detectMediaType(`/tmp/file.${ext}`), "video", ext);
    }
  });

  it("returns video for unknown extension (safe default)", () => {
    assert.strictEqual(detectMediaType("/tmp/file.xyz"), "video");
  });

  it("returns video for no extension", () => {
    assert.strictEqual(detectMediaType("/tmp/noextension"), "video");
  });
});

// ─── buildStoryPrivacyRules ────────────────────────────────────────────────

describe("buildStoryPrivacyRules", () => {
  it("everyone → [InputPrivacyValueAllowAll], length 1", () => {
    const rules = buildStoryPrivacyRules("everyone");
    assert.strictEqual(rules.length, 1);
    assert.ok(rules[0] instanceof Api.InputPrivacyValueAllowAll);
  });

  it("contacts → [InputPrivacyValueAllowContacts]", () => {
    const rules = buildStoryPrivacyRules("contacts");
    assert.strictEqual(rules.length, 1);
    assert.ok(rules[0] instanceof Api.InputPrivacyValueAllowContacts);
  });

  it("contacts + disallowUserIds → 2 rules (AllowContacts + DisallowUsers)", () => {
    const rules = buildStoryPrivacyRules("contacts", undefined, ["123", "456"]);
    assert.strictEqual(rules.length, 2);
    assert.ok(rules[0] instanceof Api.InputPrivacyValueAllowContacts);
    assert.ok(rules[1] instanceof Api.InputPrivacyValueDisallowUsers);
  });

  it("close_friends → [InputPrivacyValueAllowCloseFriends]", () => {
    const rules = buildStoryPrivacyRules("close_friends");
    assert.strictEqual(rules.length, 1);
    assert.ok(rules[0] instanceof Api.InputPrivacyValueAllowCloseFriends);
  });

  it("selected with allowUserIds → [InputPrivacyValueAllowUsers]", () => {
    const rules = buildStoryPrivacyRules("selected", ["42", "99"]);
    assert.strictEqual(rules.length, 1);
    assert.ok(rules[0] instanceof Api.InputPrivacyValueAllowUsers);
  });

  it("selected + disallowUserIds → disallow ignored (only 1 rule)", () => {
    const rules = buildStoryPrivacyRules("selected", ["42"], ["99"]);
    assert.strictEqual(rules.length, 1);
    assert.ok(rules[0] instanceof Api.InputPrivacyValueAllowUsers);
  });
});

// ─── extractStoryIdFromUpdates ─────────────────────────────────────────────

describe("extractStoryIdFromUpdates", () => {
  it("returns 0 for undefined", () => {
    assert.strictEqual(extractStoryIdFromUpdates(undefined), 0);
  });

  it("returns 0 for empty updates", () => {
    const upd = new Api.Updates({ updates: [], users: [], chats: [], date: 0, seq: 0 });
    assert.strictEqual(extractStoryIdFromUpdates(upd), 0);
  });

  it("finds UpdateStoryID in Updates envelope", () => {
    const storyIdUpdate = new Api.UpdateStoryID({ id: 55, randomId: bigInt(9999) });
    const upd = new Api.Updates({ updates: [storyIdUpdate], users: [], chats: [], date: 0, seq: 0 });
    assert.strictEqual(extractStoryIdFromUpdates(upd), 55);
  });

  it("falls back to UpdateStory(StoryItem) when no UpdateStoryID", () => {
    const storyItem = new Api.StoryItem({
      id: 77,
      date: 100,
      expireDate: 200,
      media: new Api.MessageMediaEmpty(),
      privacy: [],
    });
    const storyUpdate = new Api.UpdateStory({ peer: new Api.PeerUser({ userId: bigInt(1) }), story: storyItem });
    const upd = new Api.Updates({ updates: [storyUpdate], users: [], chats: [], date: 0, seq: 0 });
    assert.strictEqual(extractStoryIdFromUpdates(upd), 77);
  });
});

// ─── summarizeDiscussionMessage ────────────────────────────────────────────

describe("summarizeDiscussionMessage", () => {
  it("constructs discussionGroupId from non-broadcast chat", () => {
    const group = new Api.Channel({
      id: bigInt(12345),
      title: "Discussion Group",
      accessHash: bigInt(0),
      broadcast: false,
      megagroup: true,
    });
    const msg = new Api.Message({
      id: 10,
      date: 1710000000,
      message: "Hello world in discussion",
      peerId: new Api.PeerChannel({ channelId: bigInt(12345) }),
    });
    const result = new Api.messages.DiscussionMessage({
      messages: [msg],
      chats: [group],
      users: [],
      unreadCount: 3,
      readInboxMaxId: 8,
      readOutboxMaxId: 9,
    });
    const out = summarizeDiscussionMessage(result);
    assert.strictEqual(out.discussionGroupId, "-10012345");
    assert.strictEqual(out.discussionMsgId, 10);
    assert.strictEqual(out.unreadCount, 3);
    assert.strictEqual(out.readInboxMaxId, 8);
    assert.strictEqual(out.readOutboxMaxId, 9);
    assert.ok(out.topMessage);
    assert.strictEqual(out.topMessage?.id, 10);
    assert.strictEqual(out.topMessage?.text, "Hello world in discussion");
    assert.strictEqual(out.topMessage?.date, 1710000000);
  });

  it("handles empty messages array gracefully", () => {
    const result = new Api.messages.DiscussionMessage({
      messages: [],
      chats: [],
      users: [],
      unreadCount: 0,
    });
    const out = summarizeDiscussionMessage(result);
    assert.strictEqual(out.discussionGroupId, "");
    assert.strictEqual(out.discussionMsgId, 0);
    assert.strictEqual(out.topMessage, undefined);
  });

  it("caps topMessage text at 200 chars", () => {
    const longText = "A".repeat(300);
    const group = new Api.Channel({
      id: bigInt(999),
      title: "Group",
      accessHash: bigInt(0),
      broadcast: false,
    });
    const msg = new Api.Message({
      id: 1,
      date: 100,
      message: longText,
      peerId: new Api.PeerChannel({ channelId: bigInt(999) }),
    });
    const result = new Api.messages.DiscussionMessage({
      messages: [msg],
      chats: [group],
      users: [],
      unreadCount: 0,
    });
    const out = summarizeDiscussionMessage(result);
    assert.strictEqual(out.topMessage?.text?.length, 200);
  });
});

// ─── summarizeGroupsForDiscussion ─────────────────────────────────────────

describe("summarizeGroupsForDiscussion", () => {
  it("maps chats to {id, title, username, participantsCount}", () => {
    const channel = new Api.Channel({
      id: bigInt(55555),
      title: "My Group",
      accessHash: bigInt(0),
      username: "mygroup",
      participantsCount: 42,
    });
    const result = new Api.messages.Chats({ chats: [channel] });
    const out = summarizeGroupsForDiscussion(result);
    assert.strictEqual(out.groups.length, 1);
    assert.strictEqual(out.groups[0].id, "-10055555");
    assert.strictEqual(out.groups[0].title, "My Group");
    assert.strictEqual(out.groups[0].username, "mygroup");
    assert.strictEqual(out.groups[0].participantsCount, 42);
  });

  it("empty list → { groups: [] }", () => {
    const result = new Api.messages.Chats({ chats: [] });
    const out = summarizeGroupsForDiscussion(result);
    assert.deepStrictEqual(out, { groups: [] });
  });
});

// ─── summarizeReadParticipants ─────────────────────────────────────────────

describe("summarizeReadParticipants", () => {
  it("maps ReadParticipantDate to ISO readAt string", () => {
    const entry = new Api.ReadParticipantDate({ userId: bigInt(101), date: 1710000000 });
    const out = summarizeReadParticipants([entry], 42);
    assert.strictEqual(out.messageId, 42);
    assert.strictEqual(out.count, 1);
    assert.strictEqual(out.readers.length, 1);
    assert.strictEqual(out.readers[0].userId, "101");
    assert.strictEqual(out.readers[0].readAt, new Date(1710000000 * 1000).toISOString());
  });

  it("returns empty readers for empty list", () => {
    const out = summarizeReadParticipants([], 99);
    assert.strictEqual(out.count, 0);
    assert.deepStrictEqual(out.readers, []);
  });
});

// ─── summarizeReportResult ─────────────────────────────────────────────────

describe("summarizeReportResult", () => {
  it("ReportResultReported → { kind: 'reported' }", () => {
    const out = summarizeReportResult(new Api.ReportResultReported());
    assert.deepStrictEqual(out, { kind: "reported" });
  });

  it("ReportResultAddComment → { kind: 'addComment', optional }", () => {
    const out = summarizeReportResult(new Api.ReportResultAddComment({ optional: true, option: Buffer.from("") }));
    assert.deepStrictEqual(out, { kind: "addComment", optional: true });
  });

  it("ReportResultChooseOption → encodes option bytes as base64", () => {
    const optionBytes = Buffer.from("test-option");
    const option = new Api.MessageReportOption({ text: "Spam", option: optionBytes });
    const result = new Api.ReportResultChooseOption({ title: "Report reason", options: [option] });
    const out = summarizeReportResult(result);
    assert.strictEqual(out.kind, "chooseOption");
    if (out.kind !== "chooseOption") throw new Error("wrong kind");
    assert.strictEqual(out.title, "Report reason");
    assert.strictEqual(out.options.length, 1);
    assert.strictEqual(out.options[0].text, "Spam");
    assert.strictEqual(out.options[0].option, optionBytes.toString("base64"));
  });
});

// ─── TelegramService mock tests ────────────────────────────────────────────

describe("TelegramService.deleteStories", () => {
  it("invokes stories.DeleteStories and returns deleted ids", async () => {
    const invocations: unknown[] = [];
    const service = makeService(invocations, () => [1, 2]);
    const result = await service.deleteStories("123456", [1, 2, 3]);
    const call = invocations.find((r) => r instanceof Api.stories.DeleteStories) as
      | Api.stories.DeleteStories
      | undefined;
    assert.ok(call);
    assert.deepStrictEqual(call.id, [1, 2, 3]);
    assert.deepStrictEqual(result, { deleted: [1, 2] });
  });
});

describe("TelegramService.sendStoryReaction", () => {
  it("empty emoji → ReactionEmpty", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      invocations,
      () => new Api.Updates({ updates: [], users: [], chats: [], date: 0, seq: 0 }),
    );
    await service.sendStoryReaction("@durov", 5, "");
    const call = invocations.find((r) => r instanceof Api.stories.SendReaction) as Api.stories.SendReaction | undefined;
    assert.ok(call);
    assert.ok(call.reaction instanceof Api.ReactionEmpty);
    assert.strictEqual(call.storyId, 5);
  });

  it("non-empty emoji → ReactionEmoji with emoticon", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      invocations,
      () => new Api.Updates({ updates: [], users: [], chats: [], date: 0, seq: 0 }),
    );
    await service.sendStoryReaction("42", 7, "👍");
    const call = invocations.find((r) => r instanceof Api.stories.SendReaction) as Api.stories.SendReaction | undefined;
    assert.ok(call);
    assert.ok(call.reaction instanceof Api.ReactionEmoji);
    assert.strictEqual((call.reaction as Api.ReactionEmoji).emoticon, "👍");
  });
});

describe("TelegramService.exportStoryLink", () => {
  it("returns link from ExportedStoryLink result", async () => {
    const invocations: unknown[] = [];
    const service = makeService(invocations, () => new Api.ExportedStoryLink({ link: "https://t.me/durov/s/5" }));
    const result = await service.exportStoryLink("@durov", 5);
    const call = invocations.find((r) => r instanceof Api.stories.ExportStoryLink) as
      | Api.stories.ExportStoryLink
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.id, 5);
    assert.strictEqual(result.link, "https://t.me/durov/s/5");
  });
});

describe("TelegramService.readStories", () => {
  it("invokes stories.ReadStories with maxId and returns ids array", async () => {
    const invocations: unknown[] = [];
    const service = makeService(invocations, () => [1, 2, 3]);
    const result = await service.readStories("@durov", 10);
    const call = invocations.find((r) => r instanceof Api.stories.ReadStories) as Api.stories.ReadStories | undefined;
    assert.ok(call);
    assert.strictEqual(call.maxId, 10);
    assert.deepStrictEqual(result, { ids: [1, 2, 3] });
  });
});

describe("TelegramService.toggleStoryPinned", () => {
  it("invokes stories.TogglePinned with pinned=true and returns affected ids", async () => {
    const invocations: unknown[] = [];
    const service = makeService(invocations, () => [5, 6]);
    const result = await service.toggleStoryPinned("123456", [5, 6], true);
    const call = invocations.find((r) => r instanceof Api.stories.TogglePinned) as Api.stories.TogglePinned | undefined;
    assert.ok(call);
    assert.deepStrictEqual(call.id, [5, 6]);
    assert.strictEqual(call.pinned, true);
    assert.deepStrictEqual(result, { affected: [5, 6] });
  });
});

describe("TelegramService.toggleStoryPinnedToTop", () => {
  it("invokes stories.TogglePinnedToTop and returns ok:true", async () => {
    const invocations: unknown[] = [];
    const service = makeService(invocations, () => true);
    const result = await service.toggleStoryPinnedToTop("123456", [3, 4]);
    const call = invocations.find((r) => r instanceof Api.stories.TogglePinnedToTop) as
      | Api.stories.TogglePinnedToTop
      | undefined;
    assert.ok(call);
    assert.deepStrictEqual(call.id, [3, 4]);
    assert.deepStrictEqual(result, { ok: true });
  });

  it("empty ids clears top-pinned stories", async () => {
    const invocations: unknown[] = [];
    const service = makeService(invocations, () => true);
    await service.toggleStoryPinnedToTop("123456", []);
    const call = invocations.find((r) => r instanceof Api.stories.TogglePinnedToTop) as
      | Api.stories.TogglePinnedToTop
      | undefined;
    assert.ok(call);
    assert.deepStrictEqual(call.id, []);
  });
});

describe("TelegramService.activateStealthMode", () => {
  it("invokes stories.ActivateStealthMode with past+future flags", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      invocations,
      () => new Api.Updates({ updates: [], users: [], chats: [], date: 0, seq: 0 }),
    );
    await service.activateStealthMode(true, false);
    const call = invocations.find((r) => r instanceof Api.stories.ActivateStealthMode) as
      | Api.stories.ActivateStealthMode
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.past, true);
    assert.strictEqual(call.future, false);
  });

  it("defaults to false for unset flags", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      invocations,
      () => new Api.Updates({ updates: [], users: [], chats: [], date: 0, seq: 0 }),
    );
    await service.activateStealthMode(undefined, true);
    const call = invocations.find((r) => r instanceof Api.stories.ActivateStealthMode) as
      | Api.stories.ActivateStealthMode
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.past, false);
    assert.strictEqual(call.future, true);
  });
});

describe("TelegramService.getStoriesArchive", () => {
  it("invokes stories.GetStoriesArchive and summarizes result", async () => {
    const invocations: unknown[] = [];
    const storyItem = new Api.StoryItem({
      id: 20,
      date: 1000,
      expireDate: 2000,
      media: new Api.MessageMediaEmpty(),
    });
    const storiesResult = new Api.stories.Stories({
      count: 1,
      stories: [storyItem],
      chats: [],
      users: [],
    });
    const service = makeService(invocations, () => storiesResult);
    const result = await service.getStoriesArchive("123456", 0, 50);
    const call = invocations.find((r) => r instanceof Api.stories.GetStoriesArchive) as
      | Api.stories.GetStoriesArchive
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.offsetId, 0);
    assert.strictEqual(call.limit, 50);
    assert.strictEqual(result.count, 1);
    assert.strictEqual(result.stories[0].id, 20);
  });
});

describe("TelegramService.reportStory", () => {
  it("decodes base64 option and passes to stories.Report", async () => {
    const invocations: unknown[] = [];
    const service = makeService(invocations, () => new Api.ReportResultReported());
    const optionBase64 = Buffer.from("abc").toString("base64");
    const result = await service.reportStory("@durov", [10], optionBase64, "Spam content");
    const call = invocations.find((r) => r instanceof Api.stories.Report) as Api.stories.Report | undefined;
    assert.ok(call);
    assert.deepStrictEqual(call.id, [10]);
    assert.deepStrictEqual(Buffer.from(call.option as Uint8Array), Buffer.from("abc"));
    assert.strictEqual(call.message, "Spam content");
    assert.deepStrictEqual(result, { kind: "reported" });
  });
});

describe("TelegramService.getDiscussionMessage", () => {
  it("extracts discussionGroupId from non-broadcast chat", async () => {
    const invocations: unknown[] = [];
    const group = new Api.Channel({
      id: bigInt(777),
      title: "Discussion",
      accessHash: bigInt(0),
      broadcast: false,
    });
    const msg = new Api.Message({
      id: 5,
      date: 100,
      message: "first comment",
      peerId: new Api.PeerChannel({ channelId: bigInt(777) }),
    });
    const discussionResult = new Api.messages.DiscussionMessage({
      messages: [msg],
      chats: [group],
      users: [],
      unreadCount: 1,
    });
    const service = makeService(invocations, () => discussionResult);
    const result = await service.getDiscussionMessage("@channel", 42);
    const call = invocations.find((r) => r instanceof Api.messages.GetDiscussionMessage) as
      | Api.messages.GetDiscussionMessage
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.msgId, 42);
    assert.strictEqual(result.discussionGroupId, "-100777");
    assert.strictEqual(result.discussionMsgId, 5);
  });
});

describe("TelegramService.getGroupsForDiscussion", () => {
  it("maps chats from channels.GetGroupsForDiscussion", async () => {
    const invocations: unknown[] = [];
    const channel = new Api.Channel({
      id: bigInt(888),
      title: "Group A",
      accessHash: bigInt(0),
      username: "groupa",
    });
    const chatsResult = new Api.messages.Chats({ chats: [channel] });
    const service = makeService(invocations, () => chatsResult);
    const result = await service.getGroupsForDiscussion();
    const call = invocations.find((r) => r instanceof Api.channels.GetGroupsForDiscussion);
    assert.ok(call);
    assert.strictEqual(result.groups.length, 1);
    assert.strictEqual(result.groups[0].id, "-100888");
    assert.strictEqual(result.groups[0].title, "Group A");
    assert.strictEqual(result.groups[0].username, "groupa");
  });
});

describe("TelegramService.getMessageReadParticipants", () => {
  it("maps ReadParticipantDate entries", async () => {
    const invocations: unknown[] = [];
    const entry = new Api.ReadParticipantDate({ userId: bigInt(202), date: 1710000000 });
    const service = makeService(invocations, () => [entry]);
    const result = await service.getMessageReadParticipants("@group", 55);
    const call = invocations.find((r) => r instanceof Api.messages.GetMessageReadParticipants) as
      | Api.messages.GetMessageReadParticipants
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.msgId, 55);
    assert.strictEqual(result.messageId, 55);
    assert.strictEqual(result.count, 1);
    assert.strictEqual(result.readers[0].userId, "202");
    assert.strictEqual(result.readers[0].readAt, new Date(1710000000 * 1000).toISOString());
  });
});

describe("TelegramService.getOutboxReadDate", () => {
  it("returns ISO string when result has date", async () => {
    const invocations: unknown[] = [];
    const service = makeService(invocations, () => new Api.OutboxReadDate({ date: 1710000000 }));
    const result = await service.getOutboxReadDate("@user", 99);
    const call = invocations.find((r) => r instanceof Api.messages.GetOutboxReadDate) as
      | Api.messages.GetOutboxReadDate
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.msgId, 99);
    assert.strictEqual(result.readAt, new Date(1710000000 * 1000).toISOString());
  });

  it("returns null when NOT_READ_YET error thrown", async () => {
    const invocations: unknown[] = [];
    const service = makeService(invocations, () => {
      throw new Error("NOT_READ_YET");
    });
    const result = await service.getOutboxReadDate("@user", 99);
    assert.strictEqual(result.readAt, null);
  });

  it("re-throws non-NOT_READ_YET errors", async () => {
    const invocations: unknown[] = [];
    const service = makeService(invocations, () => {
      throw new Error("USER_PRIVACY_RESTRICTED");
    });
    await assert.rejects(() => service.getOutboxReadDate("@user", 99), /USER_PRIVACY_RESTRICTED/);
  });
});

// ─── Tool handler pre-check tests (via registerStoryTools + McpServer stub) ─

import { registerStoryTools } from "../tools/stories.js";

function makeMockMcpServer() {
  const handlers: Record<string, (args: unknown) => Promise<unknown>> = {};
  return {
    registerTool(name: string, _schema: unknown, handler: (args: unknown) => Promise<unknown>) {
      handlers[name] = handler;
    },
    async call(name: string, args: unknown) {
      return handlers[name](args);
    },
  } as unknown as ReturnType<typeof Object.assign> & {
    call(name: string, args: unknown): Promise<{ isError?: boolean; content: { text: string }[] }>;
  };
}

describe("tool handler pre-checks — real handler invocation", () => {
  it("sendStory with privacy=selected and no allowUserIds → isError response", async () => {
    const server = makeMockMcpServer();
    // Service that would fail if called — should NOT be reached
    const service = makeService([], () => {
      throw new Error("service should not be called");
    });
    registerStoryTools(server as unknown as Parameters<typeof registerStoryTools>[0], service);
    const result = await server.call("telegram-send-story", {
      chatId: "me",
      filePath: "/tmp/photo.jpg",
      privacy: "selected",
      // allowUserIds omitted
    });
    assert.ok((result as { isError?: boolean }).isError, "expected isError");
    assert.ok(
      (result as { content: { text: string }[] }).content[0].text.includes("allowUserIds"),
      "expected allowUserIds in error",
    );
  });

  it("editStory with all optional fields undefined → isError response", async () => {
    const server = makeMockMcpServer();
    const service = makeService([], () => {
      throw new Error("service should not be called");
    });
    registerStoryTools(server as unknown as Parameters<typeof registerStoryTools>[0], service);
    const result = await server.call("telegram-edit-story", {
      chatId: "me",
      storyId: 42,
      // no filePath, caption, or privacy
    });
    assert.ok((result as { isError?: boolean }).isError, "expected isError");
    assert.ok(
      (result as { content: { text: string }[] }).content[0].text.includes("At least one field"),
      "expected error message",
    );
  });

  it("activateStealthMode with neither past nor future → isError response", async () => {
    const server = makeMockMcpServer();
    const service = makeService([], () => {
      throw new Error("service should not be called");
    });
    registerStoryTools(server as unknown as Parameters<typeof registerStoryTools>[0], service);
    const result = await server.call("telegram-activate-stealth-mode", {});
    assert.ok((result as { isError?: boolean }).isError, "expected isError");
    assert.ok(
      (result as { content: { text: string }[] }).content[0].text.includes("past"),
      "expected past/future in error",
    );
  });
});
