import assert from "node:assert";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import { TelegramService } from "../telegram-client.js";
import { buildReplyTo, extractDiceResult, extractMessageId, generateRandomBigInt } from "../telegram-helpers.js";
import { isSafeAbsolutePath } from "../tools/shared.js";

const TMP_DIR = join(tmpdir(), `mcp-telegram-sendmedia-test-${process.pid}`);
const SESSION_PATH = join(TMP_DIR, "session");

before(() => mkdirSync(TMP_DIR, { recursive: true }));
after(() => rmSync(TMP_DIR, { recursive: true, force: true }));

type AnyFn = (...args: unknown[]) => unknown;
type MockClient = {
  invoke: AnyFn;
  sendFile: AnyFn;
  getInputEntity: AnyFn;
};

function makeService(): TelegramService {
  return new TelegramService(1, "h", { sessionPath: SESSION_PATH });
}

function primeConnected(service: TelegramService, client: MockClient): void {
  const s = service as unknown as {
    client: MockClient | null;
    connected: boolean;
    sessionString: string;
    resolvePeer: (id: string) => Promise<unknown>;
  };
  s.client = client;
  s.connected = true;
  s.sessionString = "fake-session";
  // Bypass entity resolution — return a dummy InputPeer-ish sentinel
  s.resolvePeer = async () => ({ _kind: "resolved-peer" });
}

// ------------------------------ helpers ------------------------------

describe("isSafeAbsolutePath (SSRF guard)", () => {
  it("accepts POSIX absolute paths", () => {
    assert.strictEqual(isSafeAbsolutePath("/tmp/x.ogg"), true);
    assert.strictEqual(isSafeAbsolutePath("/var/data/file with spaces.mp4"), true);
  });

  it("accepts Windows absolute paths (non-UNC)", () => {
    assert.strictEqual(isSafeAbsolutePath("C:\\tmp\\x.ogg"), true);
    assert.strictEqual(isSafeAbsolutePath("D:/data/file.mp4"), true);
  });

  it("rejects UNC / SMB shares (NTLM-relay risk)", () => {
    assert.strictEqual(isSafeAbsolutePath("\\\\server\\share\\file"), false);
    assert.strictEqual(isSafeAbsolutePath("//attacker.com/share"), false);
  });

  it("rejects URLs (http/https/file/ftp/data)", () => {
    assert.strictEqual(isSafeAbsolutePath("http://evil.com/file"), false);
    assert.strictEqual(isSafeAbsolutePath("https://169.254.169.254/latest/meta-data/"), false);
    assert.strictEqual(isSafeAbsolutePath("file:///etc/shadow"), false);
    assert.strictEqual(isSafeAbsolutePath("ftp://server/file"), false);
    assert.strictEqual(isSafeAbsolutePath("data:audio/ogg;base64,abc"), false);
  });

  it("rejects relative paths and empty", () => {
    assert.strictEqual(isSafeAbsolutePath(""), false);
    assert.strictEqual(isSafeAbsolutePath("file.ogg"), false);
    assert.strictEqual(isSafeAbsolutePath("./file.ogg"), false);
    assert.strictEqual(isSafeAbsolutePath("../file.ogg"), false);
  });

  it("rejects javascript: scheme", () => {
    assert.strictEqual(isSafeAbsolutePath("javascript:alert(1)"), false);
  });

  it("rejects embedded NUL byte", () => {
    assert.strictEqual(isSafeAbsolutePath("/tmp/file\0.ogg"), false);
    assert.strictEqual(isSafeAbsolutePath("/tmp/\0"), false);
  });

  it("rejects single '/' (cannot send a directory)", () => {
    assert.strictEqual(isSafeAbsolutePath("/"), false);
  });

  it("rejects path traversal even inside absolute paths", () => {
    assert.strictEqual(isSafeAbsolutePath("/tmp/../etc/passwd"), false);
    assert.strictEqual(isSafeAbsolutePath("/tmp/foo/../../etc/shadow"), false);
    assert.strictEqual(isSafeAbsolutePath("C:\\tmp\\..\\Windows\\System32"), false);
  });

  it("rejects POSIX kernel / device / runtime pseudo-filesystems", () => {
    assert.strictEqual(isSafeAbsolutePath("/proc/self/environ"), false);
    assert.strictEqual(isSafeAbsolutePath("/sys/kernel/debug"), false);
    assert.strictEqual(isSafeAbsolutePath("/dev/zero"), false);
    assert.strictEqual(isSafeAbsolutePath("/dev/random"), false);
    assert.strictEqual(isSafeAbsolutePath("/run/secrets/token"), false);
    // But /tmp and /home are fine
    assert.strictEqual(isSafeAbsolutePath("/tmp/process.ogg"), true);
    assert.strictEqual(isSafeAbsolutePath("/home/user/file.mp4"), true);
  });
});

describe("buildReplyTo", () => {
  it("returns undefined when neither replyTo nor topicId is set", () => {
    assert.strictEqual(buildReplyTo(), undefined);
    assert.strictEqual(buildReplyTo(undefined, undefined), undefined);
  });

  it("wraps replyTo only", () => {
    const r = buildReplyTo(42);
    assert.ok(r instanceof Api.InputReplyToMessage);
    assert.strictEqual(r?.replyToMsgId, 42);
    assert.strictEqual(r?.topMsgId, undefined);
  });

  it("wraps topicId only (topic root)", () => {
    const r = buildReplyTo(undefined, 17);
    assert.ok(r instanceof Api.InputReplyToMessage);
    assert.strictEqual(r?.replyToMsgId, 17);
    assert.strictEqual(r?.topMsgId, 17);
  });

  it("wraps both — reply inside a topic", () => {
    const r = buildReplyTo(99, 17);
    assert.strictEqual(r?.replyToMsgId, 99);
    assert.strictEqual(r?.topMsgId, 17);
  });
});

describe("generateRandomBigInt", () => {
  it("returns a bigInt", () => {
    const a = generateRandomBigInt();
    assert.ok(a.toString().length > 0);
  });

  it("produces distinct values on successive calls", () => {
    const a = generateRandomBigInt();
    const b = generateRandomBigInt();
    assert.notStrictEqual(a.toString(), b.toString());
  });
});

describe("extractMessageId", () => {
  it("returns undefined for undefined input", () => {
    assert.strictEqual(extractMessageId(undefined), undefined);
  });

  it("extracts id from Updates with UpdateMessageID", () => {
    const result = new Api.Updates({
      updates: [new Api.UpdateMessageID({ id: 123, randomId: bigInt(1) })],
      users: [],
      chats: [],
      date: 0,
      seq: 0,
    });
    assert.strictEqual(extractMessageId(result), 123);
  });

  it("falls back to UpdateNewMessage when no UpdateMessageID", () => {
    const msg = new Api.Message({
      id: 456,
      peerId: new Api.PeerUser({ userId: bigInt(1) }),
      date: 0,
      message: "",
    });
    const result = new Api.Updates({
      updates: [new Api.UpdateNewMessage({ message: msg, pts: 0, ptsCount: 0 })],
      users: [],
      chats: [],
      date: 0,
      seq: 0,
    });
    assert.strictEqual(extractMessageId(result), 456);
  });

  it("prefers UpdateMessageID over UpdateNewMessage", () => {
    const msg = new Api.Message({
      id: 999,
      peerId: new Api.PeerUser({ userId: bigInt(1) }),
      date: 0,
      message: "",
    });
    const result = new Api.Updates({
      updates: [
        new Api.UpdateNewMessage({ message: msg, pts: 0, ptsCount: 0 }),
        new Api.UpdateMessageID({ id: 777, randomId: bigInt(1) }),
      ],
      users: [],
      chats: [],
      date: 0,
      seq: 0,
    });
    assert.strictEqual(extractMessageId(result), 777);
  });

  it("extracts id directly from Api.Message", () => {
    const msg = new Api.Message({
      id: 111,
      peerId: new Api.PeerUser({ userId: bigInt(1) }),
      date: 0,
      message: "",
    });
    assert.strictEqual(extractMessageId(msg), 111);
  });

  it("extracts id from UpdateShortSentMessage", () => {
    const short = new Api.UpdateShortSentMessage({ id: 222, pts: 0, ptsCount: 0, date: 0 });
    assert.strictEqual(extractMessageId(short), 222);
  });

  it("extracts id from UpdatesCombined envelope", () => {
    const result = new Api.UpdatesCombined({
      updates: [new Api.UpdateMessageID({ id: 333, randomId: bigInt(1) })],
      users: [],
      chats: [],
      date: 0,
      seqStart: 0,
      seq: 0,
    });
    assert.strictEqual(extractMessageId(result), 333);
  });

  it("extracts id from UpdateNewChannelMessage (channel send path)", () => {
    const msg = new Api.Message({
      id: 444,
      peerId: new Api.PeerChannel({ channelId: bigInt(5) }),
      date: 0,
      message: "",
    });
    const result = new Api.Updates({
      updates: [new Api.UpdateNewChannelMessage({ message: msg, pts: 0, ptsCount: 0 })],
      users: [],
      chats: [],
      date: 0,
      seq: 0,
    });
    assert.strictEqual(extractMessageId(result), 444);
  });
});

describe("extractDiceResult", () => {
  it("extracts id and value from an UpdateNewMessage carrying MessageMediaDice", () => {
    const msg = new Api.Message({
      id: 42,
      peerId: new Api.PeerUser({ userId: bigInt(1) }),
      date: 0,
      message: "",
      media: new Api.MessageMediaDice({ value: 5, emoticon: "🎲" }),
    });
    const result = new Api.Updates({
      updates: [
        new Api.UpdateMessageID({ id: 42, randomId: bigInt(1) }),
        new Api.UpdateNewMessage({ message: msg, pts: 0, ptsCount: 0 }),
      ],
      users: [],
      chats: [],
      date: 0,
      seq: 0,
    });
    const extracted = extractDiceResult(result);
    assert.deepStrictEqual(extracted, { id: 42, value: 5 });
  });

  it("returns id without value when dice media is missing", () => {
    const result = new Api.Updates({
      updates: [new Api.UpdateMessageID({ id: 10, randomId: bigInt(1) })],
      users: [],
      chats: [],
      date: 0,
      seq: 0,
    });
    assert.deepStrictEqual(extractDiceResult(result), { id: 10, value: undefined });
  });

  it("returns undefined when no id is present", () => {
    const result = new Api.Updates({ updates: [], users: [], chats: [], date: 0, seq: 0 });
    assert.strictEqual(extractDiceResult(result), undefined);
  });
});

// ------------------------------ TelegramService methods ------------------------------

describe("TelegramService.sendMessage (quoteText/effect raw path)", () => {
  it("rejects quoteText without replyTo", async () => {
    const service = makeService();
    const client: MockClient = {
      invoke: async () => new Api.Updates({ updates: [], users: [], chats: [], date: 0, seq: 0 }),
      getInputEntity: async () => ({}),
      sendFile: async () => ({}),
    };
    primeConnected(service, client);

    await assert.rejects(
      () => service.sendMessage("chat", "hi", undefined, undefined, undefined, { quoteText: "q" }),
      /quoteText requires replyTo/,
    );
  });

  it("uses raw messages.SendMessage with InputReplyToMessage.quoteText", async () => {
    const service = makeService();
    const captured: Record<string, unknown> = {};
    const client: MockClient = {
      invoke: async (req: unknown) => {
        captured.req = req;
        return new Api.Updates({
          updates: [new Api.UpdateMessageID({ id: 901, randomId: bigInt(1) })],
          users: [],
          chats: [],
          date: 0,
          seq: 0,
        });
      },
      getInputEntity: async () => ({}),
      sendFile: async () => ({}),
    };
    primeConnected(service, client);

    const result = await service.sendMessage("chat", "reply", 55, undefined, undefined, {
      quoteText: "snippet",
    });

    assert.strictEqual(result?.id, 901);
    const req = captured.req as Api.messages.SendMessage;
    assert.ok(req instanceof Api.messages.SendMessage);
    const rt = req.replyTo as Api.InputReplyToMessage;
    assert.ok(rt instanceof Api.InputReplyToMessage);
    assert.strictEqual(rt.replyToMsgId, 55);
    assert.strictEqual(rt.quoteText, "snippet");
  });

  it("attaches effect as bigInt", async () => {
    const service = makeService();
    const captured: Record<string, unknown> = {};
    const client: MockClient = {
      invoke: async (req: unknown) => {
        captured.req = req;
        return new Api.Updates({
          updates: [new Api.UpdateMessageID({ id: 902, randomId: bigInt(1) })],
          users: [],
          chats: [],
          date: 0,
          seq: 0,
        });
      },
      getInputEntity: async () => ({}),
      sendFile: async () => ({}),
    };
    primeConnected(service, client);

    await service.sendMessage("chat", "boom", undefined, undefined, undefined, { effect: "1234567890" });

    const req = captured.req as Api.messages.SendMessage;
    // biome-ignore lint/suspicious/noExplicitAny: inspecting optional TL field
    assert.strictEqual((req as any).effect?.toString(), "1234567890");
  });
});

describe("TelegramService.sendVoice", () => {
  it("calls client.sendFile with voiceNote:true and returns message id", async () => {
    const service = makeService();
    const captured: Record<string, unknown> = {};
    const client: MockClient = {
      invoke: async () => undefined,
      getInputEntity: async () => ({}),
      sendFile: async (_peer: unknown, opts: Record<string, unknown>) => {
        captured.opts = opts;
        return { id: 101 } as unknown as Api.Message;
      },
    };
    primeConnected(service, client);

    const { id } = await service.sendVoice("chat", "/tmp/x.ogg", {
      caption: "hi",
      replyTo: 7,
      topicId: 42,
      parseMode: "md",
    });

    assert.strictEqual(id, 101);
    const opts = captured.opts as Record<string, unknown>;
    assert.strictEqual(opts.voiceNote, true);
    assert.strictEqual(opts.file, "/tmp/x.ogg");
    assert.strictEqual(opts.caption, "hi");
    assert.strictEqual(opts.replyTo, 7);
    assert.strictEqual(opts.topMsgId, 42);
    assert.strictEqual(opts.parseMode, "md");
    // Duration is auto-detected by GramJS — we must not override it client-side
    assert.strictEqual(opts.attributes, undefined);
  });

  it("omits replyTo/topMsgId when not provided", async () => {
    const service = makeService();
    const captured: Record<string, unknown> = {};
    const client: MockClient = {
      invoke: async () => undefined,
      getInputEntity: async () => ({}),
      sendFile: async (_peer: unknown, opts: Record<string, unknown>) => {
        captured.opts = opts;
        return { id: 1 } as unknown as Api.Message;
      },
    };
    primeConnected(service, client);

    await service.sendVoice("chat", "/tmp/x.ogg");

    const opts = captured.opts as Record<string, unknown>;
    assert.ok(!("replyTo" in opts));
    assert.ok(!("topMsgId" in opts));
  });
});

describe("TelegramService.sendVideoNote", () => {
  it("calls client.sendFile with videoNote:true + roundMessage attribute when sizes given", async () => {
    const service = makeService();
    const captured: Record<string, unknown> = {};
    const client: MockClient = {
      invoke: async () => undefined,
      getInputEntity: async () => ({}),
      sendFile: async (_peer: unknown, opts: Record<string, unknown>) => {
        captured.opts = opts;
        return { id: 202 } as unknown as Api.Message;
      },
    };
    primeConnected(service, client);

    const { id } = await service.sendVideoNote("chat", "/tmp/x.mp4", { duration: 8, length: 320 });

    assert.strictEqual(id, 202);
    const opts = captured.opts as Record<string, unknown>;
    assert.strictEqual(opts.videoNote, true);
    const attr = (opts.attributes as Api.TypeDocumentAttribute[])[0];
    assert.ok(attr instanceof Api.DocumentAttributeVideo);
    assert.strictEqual((attr as Api.DocumentAttributeVideo).roundMessage, true);
    assert.strictEqual((attr as Api.DocumentAttributeVideo).w, 320);
    assert.strictEqual((attr as Api.DocumentAttributeVideo).h, 320);
  });
});

describe("TelegramService.sendContact", () => {
  it("invokes SendMedia with InputMediaContact and extracts id", async () => {
    const service = makeService();
    const captured: Record<string, unknown> = {};
    const client: MockClient = {
      sendFile: async () => ({}),
      getInputEntity: async () => ({}),
      invoke: async (req: unknown) => {
        captured.req = req;
        return new Api.Updates({
          updates: [new Api.UpdateMessageID({ id: 303, randomId: bigInt(1) })],
          users: [],
          chats: [],
          date: 0,
          seq: 0,
        });
      },
    };
    primeConnected(service, client);

    const { id } = await service.sendContact("chat", "+79001234567", "John", {
      lastName: "Doe",
    });

    assert.strictEqual(id, 303);
    const req = captured.req as Api.messages.SendMedia;
    assert.ok(req instanceof Api.messages.SendMedia);
    const media = req.media as Api.InputMediaContact;
    assert.ok(media instanceof Api.InputMediaContact);
    assert.strictEqual(media.phoneNumber, "+79001234567");
    assert.strictEqual(media.firstName, "John");
    assert.strictEqual(media.lastName, "Doe");
  });

  it("throws when Telegram returns no message ID", async () => {
    const service = makeService();
    const client: MockClient = {
      sendFile: async () => ({}),
      getInputEntity: async () => ({}),
      invoke: async () => new Api.Updates({ updates: [], users: [], chats: [], date: 0, seq: 0 }),
    };
    primeConnected(service, client);

    await assert.rejects(() => service.sendContact("chat", "+1", "X"), /did not return a message ID/);
  });
});

describe("TelegramService.sendDice", () => {
  it("invokes SendMedia with InputMediaDice and returns id + value", async () => {
    const service = makeService();
    const captured: Record<string, unknown> = {};
    const client: MockClient = {
      sendFile: async () => ({}),
      getInputEntity: async () => ({}),
      invoke: async (req: unknown) => {
        captured.req = req;
        const msg = new Api.Message({
          id: 404,
          peerId: new Api.PeerUser({ userId: bigInt(1) }),
          date: 0,
          message: "",
          media: new Api.MessageMediaDice({ value: 6, emoticon: "🎲" }),
        });
        return new Api.Updates({
          updates: [
            new Api.UpdateMessageID({ id: 404, randomId: bigInt(1) }),
            new Api.UpdateNewMessage({ message: msg, pts: 0, ptsCount: 0 }),
          ],
          users: [],
          chats: [],
          date: 0,
          seq: 0,
        });
      },
    };
    primeConnected(service, client);

    const { id, value } = await service.sendDice("chat", "🎲");

    assert.strictEqual(id, 404);
    assert.strictEqual(value, 6);
    const req = captured.req as Api.messages.SendMedia;
    assert.ok(req.media instanceof Api.InputMediaDice);
    assert.strictEqual((req.media as Api.InputMediaDice).emoticon, "🎲");
  });

  it("returns id alone when dice value is not present in updates", async () => {
    const service = makeService();
    const client: MockClient = {
      sendFile: async () => ({}),
      getInputEntity: async () => ({}),
      invoke: async () =>
        new Api.Updates({
          updates: [new Api.UpdateMessageID({ id: 505, randomId: bigInt(1) })],
          users: [],
          chats: [],
          date: 0,
          seq: 0,
        }),
    };
    primeConnected(service, client);

    const result = await service.sendDice("chat", "🎯");
    assert.strictEqual(result.id, 505);
    assert.strictEqual(result.value, undefined);
  });
});

describe("TelegramService.sendLocation", () => {
  const okUpdates = () =>
    new Api.Updates({
      updates: [new Api.UpdateMessageID({ id: 700, randomId: bigInt(1) })],
      users: [],
      chats: [],
      date: 0,
      seq: 0,
    });

  it("wraps static coords in InputMediaGeoPoint when livePeriod is omitted", async () => {
    const service = makeService();
    const captured: Record<string, unknown> = {};
    const client: MockClient = {
      sendFile: async () => ({}),
      getInputEntity: async () => ({}),
      invoke: async (req: unknown) => {
        captured.req = req;
        return okUpdates();
      },
    };
    primeConnected(service, client);

    const { id } = await service.sendLocation("chat", 55.7539, 37.6208);

    assert.strictEqual(id, 700);
    const req = captured.req as Api.messages.SendMedia;
    assert.ok(req instanceof Api.messages.SendMedia);
    assert.ok(req.media instanceof Api.InputMediaGeoPoint);
    const geo = (req.media as Api.InputMediaGeoPoint).geoPoint as Api.InputGeoPoint;
    assert.ok(geo instanceof Api.InputGeoPoint);
    assert.strictEqual(geo.lat, 55.7539);
    assert.strictEqual(geo.long, 37.6208);
  });

  it("uses InputMediaGeoLive with period when livePeriod is set", async () => {
    const service = makeService();
    const captured: Record<string, unknown> = {};
    const client: MockClient = {
      sendFile: async () => ({}),
      getInputEntity: async () => ({}),
      invoke: async (req: unknown) => {
        captured.req = req;
        return okUpdates();
      },
    };
    primeConnected(service, client);

    const { id } = await service.sendLocation("chat", 48.8584, 2.2945, {
      livePeriod: 900,
      heading: 180,
      proximityRadius: 50,
    });

    assert.strictEqual(id, 700);
    const req = captured.req as Api.messages.SendMedia;
    const live = req.media as Api.InputMediaGeoLive;
    assert.ok(live instanceof Api.InputMediaGeoLive);
    assert.strictEqual(live.period, 900);
    assert.strictEqual(live.heading, 180);
    assert.strictEqual(live.proximityNotificationRadius, 50);
    const geo = live.geoPoint as Api.InputGeoPoint;
    assert.strictEqual(geo.lat, 48.8584);
    assert.strictEqual(geo.long, 2.2945);
  });

  it("propagates accuracyRadius into InputGeoPoint for static pin", async () => {
    const service = makeService();
    const captured: Record<string, unknown> = {};
    const client: MockClient = {
      sendFile: async () => ({}),
      getInputEntity: async () => ({}),
      invoke: async (req: unknown) => {
        captured.req = req;
        return okUpdates();
      },
    };
    primeConnected(service, client);

    await service.sendLocation("chat", 0, 0, { accuracyRadius: 25 });

    const req = captured.req as Api.messages.SendMedia;
    const geo = (req.media as Api.InputMediaGeoPoint).geoPoint as Api.InputGeoPoint;
    assert.strictEqual(geo.accuracyRadius, 25);
  });

  it("throws when Telegram returns no message ID", async () => {
    const service = makeService();
    const client: MockClient = {
      sendFile: async () => ({}),
      getInputEntity: async () => ({}),
      invoke: async () => new Api.Updates({ updates: [], users: [], chats: [], date: 0, seq: 0 }),
    };
    primeConnected(service, client);

    await assert.rejects(() => service.sendLocation("chat", 10, 20), /did not return a message ID/);
  });
});

describe("TelegramService.sendVenue", () => {
  const okUpdates = () =>
    new Api.Updates({
      updates: [new Api.UpdateMessageID({ id: 800, randomId: bigInt(1) })],
      users: [],
      chats: [],
      date: 0,
      seq: 0,
    });

  it("defaults provider to foursquare and fills empty venueId/venueType", async () => {
    const service = makeService();
    const captured: Record<string, unknown> = {};
    const client: MockClient = {
      sendFile: async () => ({}),
      getInputEntity: async () => ({}),
      invoke: async (req: unknown) => {
        captured.req = req;
        return okUpdates();
      },
    };
    primeConnected(service, client);

    const { id } = await service.sendVenue("chat", 55.75, 37.62, "Red Square", "Moscow");

    assert.strictEqual(id, 800);
    const req = captured.req as Api.messages.SendMedia;
    const venue = req.media as Api.InputMediaVenue;
    assert.ok(venue instanceof Api.InputMediaVenue);
    assert.strictEqual(venue.title, "Red Square");
    assert.strictEqual(venue.address, "Moscow");
    assert.strictEqual(venue.provider, "foursquare");
    assert.strictEqual(venue.venueId, "");
    assert.strictEqual(venue.venueType, "");
  });

  it("passes explicit provider, venueId and venueType through", async () => {
    const service = makeService();
    const captured: Record<string, unknown> = {};
    const client: MockClient = {
      sendFile: async () => ({}),
      getInputEntity: async () => ({}),
      invoke: async (req: unknown) => {
        captured.req = req;
        return okUpdates();
      },
    };
    primeConnected(service, client);

    await service.sendVenue("chat", 48.8584, 2.2945, "Eiffel Tower", "Champ de Mars", {
      provider: "gplaces",
      venueId: "fsq-123",
      venueType: "landmark",
    });

    const req = captured.req as Api.messages.SendMedia;
    const venue = req.media as Api.InputMediaVenue;
    assert.strictEqual(venue.provider, "gplaces");
    assert.strictEqual(venue.venueId, "fsq-123");
    assert.strictEqual(venue.venueType, "landmark");
    const geo = venue.geoPoint as Api.InputGeoPoint;
    assert.strictEqual(geo.lat, 48.8584);
    assert.strictEqual(geo.long, 2.2945);
  });

  it("throws when Telegram returns no message ID", async () => {
    const service = makeService();
    const client: MockClient = {
      sendFile: async () => ({}),
      getInputEntity: async () => ({}),
      invoke: async () => new Api.Updates({ updates: [], users: [], chats: [], date: 0, seq: 0 }),
    };
    primeConnected(service, client);

    await assert.rejects(() => service.sendVenue("chat", 0, 0, "X", "Y"), /did not return a message ID/);
  });
});

describe("TelegramService.sendAlbum", () => {
  const makeMessage = (id: number): Api.Message =>
    new Api.Message({
      id,
      peerId: new Api.PeerUser({ userId: bigInt(1) }),
      date: 0,
      message: "",
    });

  it("calls sendFile with array of files and returns all message ids", async () => {
    const service = makeService();
    const captured: Record<string, unknown> = {};
    const client: MockClient = {
      invoke: async () => undefined,
      getInputEntity: async () => ({}),
      sendFile: async (_peer: unknown, opts: Record<string, unknown>) => {
        captured.opts = opts;
        return [makeMessage(1001), makeMessage(1002), makeMessage(1003)] as unknown as Api.Message;
      },
    };
    primeConnected(service, client);

    const { ids } = await service.sendAlbum("chat", [
      { filePath: "/tmp/1.jpg" },
      { filePath: "/tmp/2.jpg" },
      { filePath: "/tmp/3.jpg" },
    ]);

    assert.deepStrictEqual(ids, [1001, 1002, 1003]);
    const opts = captured.opts as Record<string, unknown>;
    assert.deepStrictEqual(opts.file, ["/tmp/1.jpg", "/tmp/2.jpg", "/tmp/3.jpg"]);
    assert.ok(Array.isArray(opts.caption));
    assert.deepStrictEqual(opts.caption, ["", "", ""]);
  });

  it("puts album-level caption on the first item and preserves per-item captions", async () => {
    const service = makeService();
    const captured: Record<string, unknown> = {};
    const client: MockClient = {
      invoke: async () => undefined,
      getInputEntity: async () => ({}),
      sendFile: async (_peer: unknown, opts: Record<string, unknown>) => {
        captured.opts = opts;
        return [makeMessage(1), makeMessage(2), makeMessage(3)] as unknown as Api.Message;
      },
    };
    primeConnected(service, client);

    await service.sendAlbum(
      "chat",
      [
        { filePath: "/tmp/1.jpg", caption: "first-item" },
        { filePath: "/tmp/2.jpg", caption: "second-item" },
        { filePath: "/tmp/3.jpg" },
      ],
      { caption: "album-caption" },
    );

    const opts = captured.opts as Record<string, unknown>;
    // Album-level caption overrides the first item's caption; others stay per-item
    assert.deepStrictEqual(opts.caption, ["album-caption", "second-item", ""]);
  });

  it("handles a single Api.Message return (fallback path)", async () => {
    const service = makeService();
    const client: MockClient = {
      invoke: async () => undefined,
      getInputEntity: async () => ({}),
      sendFile: async () => makeMessage(555),
    };
    primeConnected(service, client);

    const { ids } = await service.sendAlbum("chat", [{ filePath: "/tmp/1.jpg" }, { filePath: "/tmp/2.jpg" }]);

    assert.deepStrictEqual(ids, [555]);
  });

  it("propagates replyTo and topicId", async () => {
    const service = makeService();
    const captured: Record<string, unknown> = {};
    const client: MockClient = {
      invoke: async () => undefined,
      getInputEntity: async () => ({}),
      sendFile: async (_peer: unknown, opts: Record<string, unknown>) => {
        captured.opts = opts;
        return [makeMessage(1), makeMessage(2)] as unknown as Api.Message;
      },
    };
    primeConnected(service, client);

    await service.sendAlbum("chat", [{ filePath: "/tmp/1.jpg" }, { filePath: "/tmp/2.jpg" }], {
      replyTo: 7,
      topicId: 42,
    });

    const opts = captured.opts as Record<string, unknown>;
    assert.strictEqual(opts.replyTo, 7);
    assert.strictEqual(opts.topMsgId, 42);
  });

  it("rejects fewer than 2 items", async () => {
    const service = makeService();
    const client: MockClient = {
      invoke: async () => undefined,
      getInputEntity: async () => ({}),
      sendFile: async () => makeMessage(1),
    };
    primeConnected(service, client);

    await assert.rejects(() => service.sendAlbum("chat", [{ filePath: "/tmp/1.jpg" }]), /Album requires 2-10 items/);
  });

  it("rejects more than 10 items", async () => {
    const service = makeService();
    const client: MockClient = {
      invoke: async () => undefined,
      getInputEntity: async () => ({}),
      sendFile: async () => makeMessage(1),
    };
    primeConnected(service, client);

    const items = Array.from({ length: 11 }, (_, i) => ({ filePath: `/tmp/${i}.jpg` }));
    await assert.rejects(() => service.sendAlbum("chat", items), /Album requires 2-10 items/);
  });

  it("throws when sendFile returns no messages", async () => {
    const service = makeService();
    const client: MockClient = {
      invoke: async () => undefined,
      getInputEntity: async () => ({}),
      sendFile: async () => undefined as unknown as Api.Message,
    };
    primeConnected(service, client);

    await assert.rejects(
      () => service.sendAlbum("chat", [{ filePath: "/tmp/1.jpg" }, { filePath: "/tmp/2.jpg" }]),
      /did not return any message IDs/,
    );
  });
});
