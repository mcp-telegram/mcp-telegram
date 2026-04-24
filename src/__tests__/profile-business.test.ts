import assert from "node:assert";
import { describe, it } from "node:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Api } from "telegram/tl/index.js";
import { summarizeEmojiStatus, summarizePeer } from "../../src/telegram-helpers.js";

// ─── Minimal MCP server stub ───────────────────────────────────────────────

function _makeMockMcpServer() {
  const handlers: Record<string, (args: unknown) => Promise<unknown>> = {};
  return {
    registerTool(name: string, _schema: unknown, handler: (args: unknown) => Promise<unknown>) {
      handlers[name] = handler;
    },
    async call(name: string, args: unknown) {
      const handler = handlers[name];
      if (!handler) throw new Error(`Tool not registered: ${name}`);
      return handler(args);
    },
  } as unknown as McpServer & {
    call(name: string, args: unknown): Promise<{ isError?: boolean; content?: Array<{ text?: string }> }>;
  };
}

// ─── summarizeEmojiStatus ──────────────────────────────────────────────────

describe("summarizeEmojiStatus", () => {
  it("handles EmojiStatusEmpty", () => {
    const result = summarizeEmojiStatus(new Api.EmojiStatusEmpty());
    assert.strictEqual(result.kind, "empty");
    assert.strictEqual(result.documentId, undefined);
  });

  it("handles EmojiStatus with documentId", () => {
    const result = summarizeEmojiStatus(
      new Api.EmojiStatus({ documentId: BigInt("5368324170671202286"), until: 1735689600 }),
    );
    assert.strictEqual(result.kind, "default");
    assert.strictEqual(result.documentId, "5368324170671202286");
    assert.strictEqual(result.until, 1735689600);
  });

  it("handles EmojiStatusCollectible", () => {
    const result = summarizeEmojiStatus(
      new Api.EmojiStatusCollectible({
        collectibleId: BigInt("99999"),
        documentId: BigInt("11111"),
        title: "Premium Star",
        slug: "premium-star",
        until: undefined,
        colors: {
          backgroundColors: [],
          patternColors: [],
          centerColor: 0,
          edgeColor: 0,
          textColor: 0,
          titleColor: 0,
        } as unknown as Api.EmojiStatusColors,
      }),
    );
    assert.strictEqual(result.kind, "collectible");
    assert.strictEqual(result.collectibleId, "99999");
    assert.strictEqual(result.title, "Premium Star");
    assert.strictEqual(result.slug, "premium-star");
  });
});

// ─── summarizePeer ────────────────────────────────────────────────────────

describe("summarizePeer", () => {
  it("PeerUser", () => {
    const p = summarizePeer(new Api.PeerUser({ userId: BigInt("123") }));
    assert.strictEqual(p.type, "user");
    assert.strictEqual(p.id, "123");
  });

  it("PeerChat", () => {
    const p = summarizePeer(new Api.PeerChat({ chatId: BigInt("456") }));
    assert.strictEqual(p.type, "chat");
    assert.strictEqual(p.id, "456");
  });

  it("PeerChannel", () => {
    const p = summarizePeer(new Api.PeerChannel({ channelId: BigInt("789") }));
    assert.strictEqual(p.type, "channel");
    assert.strictEqual(p.id, "789");
  });
});

// ─── Tool handlers via mock server ────────────────────────────────────────

function _makeConnectedTelegram(overrides: Record<string, unknown> = {}) {
  return {
    getConnectionState: () => ({ connected: true }),
    async checkConnection() {
      return null;
    },
    ...overrides,
  } as unknown as import("../../src/telegram-client.js").TelegramService;
}

// ─── Business hours day→minute-of-week conversion (via actual service) ───────

describe("Business hours day→minute conversion (via setBusinessWorkHours)", () => {
  async function makeHoursSvc() {
    const invoked: Api.account.UpdateBusinessWorkHours[] = [];
    const { TelegramService } = await import("../../src/telegram-client.js");
    const svc = Object.create(TelegramService.prototype) as InstanceType<typeof TelegramService>;
    svc.client = {
      invoke: async (req: unknown) => {
        invoked.push(req as Api.account.UpdateBusinessWorkHours);
      },
    } as unknown as import("telegram").TelegramClient;
    svc.connected = true;
    svc.rateLimiter = {
      execute: (fn: () => unknown) => fn(),
    } as unknown as import("../../src/rate-limiter.js").RateLimiter;
    return { svc, invoked };
  }

  it("mon 09:00→18:00 → startMinute=540 endMinute=1080", async () => {
    const { svc, invoked } = await makeHoursSvc();
    await svc.setBusinessWorkHours({ timezone: "UTC", schedule: [{ day: "mon", openFrom: "09:00", openTo: "18:00" }] });
    const hours = invoked[0].businessWorkHours as Api.BusinessWorkHours;
    assert.strictEqual(hours.weeklyOpen[0].startMinute, 540);
    assert.strictEqual(hours.weeklyOpen[0].endMinute, 1080);
  });

  it("tue 00:00→00:00 → startMinute=1440 endMinute=1440", async () => {
    const { svc, invoked } = await makeHoursSvc();
    await svc.setBusinessWorkHours({ timezone: "UTC", schedule: [{ day: "tue", openFrom: "00:00", openTo: "00:00" }] });
    const hours = invoked[0].businessWorkHours as Api.BusinessWorkHours;
    assert.strictEqual(hours.weeklyOpen[0].startMinute, 1440);
    assert.strictEqual(hours.weeklyOpen[0].endMinute, 1440);
  });

  it("sun 23:59→23:59 → startMinute=10079 endMinute=10079", async () => {
    const { svc, invoked } = await makeHoursSvc();
    await svc.setBusinessWorkHours({ timezone: "UTC", schedule: [{ day: "sun", openFrom: "23:59", openTo: "23:59" }] });
    const hours = invoked[0].businessWorkHours as Api.BusinessWorkHours;
    assert.strictEqual(hours.weeklyOpen[0].startMinute, 10079);
    assert.strictEqual(hours.weeklyOpen[0].endMinute, 10079);
  });

  it("fri 09:00 → startMinute=6300", async () => {
    const { svc, invoked } = await makeHoursSvc();
    await svc.setBusinessWorkHours({ timezone: "UTC", schedule: [{ day: "fri", openFrom: "09:00", openTo: "09:00" }] });
    const hours = invoked[0].businessWorkHours as Api.BusinessWorkHours;
    assert.strictEqual(hours.weeklyOpen[0].startMinute, 6300);
  });

  it("multiple days → multiple weeklyOpen entries", async () => {
    const { svc, invoked } = await makeHoursSvc();
    await svc.setBusinessWorkHours({
      timezone: "Europe/Moscow",
      schedule: [
        { day: "mon", openFrom: "09:00", openTo: "18:00" },
        { day: "fri", openFrom: "09:00", openTo: "14:00" },
      ],
    });
    const hours = invoked[0].businessWorkHours as Api.BusinessWorkHours;
    assert.strictEqual(hours.weeklyOpen.length, 2);
    assert.strictEqual(hours.timezoneId, "Europe/Moscow");
  });
});

// ─── TelegramService profile methods (mocked client) ──────────────────────

describe("TelegramService.setEmojiStatus", () => {
  it("invokes with EmojiStatusEmpty when no IDs", async () => {
    const invoked: unknown[] = [];
    const { TelegramService } = await import("../../src/telegram-client.js");
    const svc = Object.create(TelegramService.prototype) as InstanceType<typeof TelegramService>;
    svc.client = {
      invoke: async (req: unknown) => {
        invoked.push(req);
      },
    } as unknown as import("telegram").TelegramClient;
    svc.connected = true;
    svc.rateLimiter = {
      execute: (fn: () => unknown) => fn(),
    } as unknown as import("../../src/rate-limiter.js").RateLimiter;

    await svc.setEmojiStatus({});
    assert.strictEqual(invoked.length, 1);
    assert.ok(invoked[0] instanceof Api.account.UpdateEmojiStatus);
    assert.ok((invoked[0] as Api.account.UpdateEmojiStatus).emojiStatus instanceof Api.EmojiStatusEmpty);
  });

  it("invokes with EmojiStatus when documentId given", async () => {
    const invoked: unknown[] = [];
    const { TelegramService } = await import("../../src/telegram-client.js");
    const svc = Object.create(TelegramService.prototype) as InstanceType<typeof TelegramService>;
    svc.client = {
      invoke: async (req: unknown) => {
        invoked.push(req);
      },
    } as unknown as import("telegram").TelegramClient;
    svc.connected = true;
    svc.rateLimiter = {
      execute: (fn: () => unknown) => fn(),
    } as unknown as import("../../src/rate-limiter.js").RateLimiter;

    await svc.setEmojiStatus({ documentId: "5368324170671202286" });
    const req = invoked[0] as Api.account.UpdateEmojiStatus;
    assert.ok(req.emojiStatus instanceof Api.EmojiStatus);
    assert.strictEqual((req.emojiStatus as Api.EmojiStatus).documentId.toString(), "5368324170671202286");
  });

  it("throws NOT_CONNECTED when not connected", async () => {
    const { TelegramService } = await import("../../src/telegram-client.js");
    const svc = Object.create(TelegramService.prototype) as InstanceType<typeof TelegramService>;
    svc.client = null;
    svc.connected = false;
    await assert.rejects(() => svc.setEmojiStatus({}));
  });
});

describe("TelegramService.clearRecentEmojiStatuses", () => {
  it("invokes ClearRecentEmojiStatuses", async () => {
    const invoked: unknown[] = [];
    const { TelegramService } = await import("../../src/telegram-client.js");
    const svc = Object.create(TelegramService.prototype) as InstanceType<typeof TelegramService>;
    svc.client = {
      invoke: async (req: unknown) => {
        invoked.push(req);
      },
    } as unknown as import("telegram").TelegramClient;
    svc.connected = true;
    svc.rateLimiter = {
      execute: (fn: () => unknown) => fn(),
    } as unknown as import("../../src/rate-limiter.js").RateLimiter;

    await svc.clearRecentEmojiStatuses();
    assert.strictEqual(invoked.length, 1);
    assert.ok(invoked[0] instanceof Api.account.ClearRecentEmojiStatuses);
  });
});

describe("TelegramService.setBirthday", () => {
  it("invokes UpdateBirthday with birthday when day+month given", async () => {
    const invoked: unknown[] = [];
    const { TelegramService } = await import("../../src/telegram-client.js");
    const svc = Object.create(TelegramService.prototype) as InstanceType<typeof TelegramService>;
    svc.client = {
      invoke: async (req: unknown) => {
        invoked.push(req);
      },
    } as unknown as import("telegram").TelegramClient;
    svc.connected = true;
    svc.rateLimiter = {
      execute: (fn: () => unknown) => fn(),
    } as unknown as import("../../src/rate-limiter.js").RateLimiter;

    await svc.setBirthday({ day: 15, month: 3, year: 1990 });
    const req = invoked[0] as Api.account.UpdateBirthday;
    assert.ok(req.birthday instanceof Api.Birthday);
    assert.strictEqual((req.birthday as Api.Birthday).day, 15);
    assert.strictEqual((req.birthday as Api.Birthday).month, 3);
    assert.strictEqual((req.birthday as Api.Birthday).year, 1990);
  });

  it("invokes UpdateBirthday without birthday when clear=true", async () => {
    const invoked: unknown[] = [];
    const { TelegramService } = await import("../../src/telegram-client.js");
    const svc = Object.create(TelegramService.prototype) as InstanceType<typeof TelegramService>;
    svc.client = {
      invoke: async (req: unknown) => {
        invoked.push(req);
      },
    } as unknown as import("telegram").TelegramClient;
    svc.connected = true;
    svc.rateLimiter = {
      execute: (fn: () => unknown) => fn(),
    } as unknown as import("../../src/rate-limiter.js").RateLimiter;

    await svc.setBirthday({ clear: true });
    const req = invoked[0] as Api.account.UpdateBirthday;
    assert.strictEqual(req.birthday, undefined);
  });
});

describe("TelegramService.setProfileColor", () => {
  it("invokes UpdateColor with color and backgroundEmojiId", async () => {
    const invoked: unknown[] = [];
    const { TelegramService } = await import("../../src/telegram-client.js");
    const svc = Object.create(TelegramService.prototype) as InstanceType<typeof TelegramService>;
    svc.client = {
      invoke: async (req: unknown) => {
        invoked.push(req);
      },
    } as unknown as import("telegram").TelegramClient;
    svc.connected = true;
    svc.rateLimiter = {
      execute: (fn: () => unknown) => fn(),
    } as unknown as import("../../src/rate-limiter.js").RateLimiter;

    await svc.setProfileColor({ forProfile: true, color: 3, backgroundEmojiId: "5213928135363049200" });
    const req = invoked[0] as Api.account.UpdateColor;
    assert.strictEqual(req.color, 3);
    assert.strictEqual(req.backgroundEmojiId?.toString(), "5213928135363049200");
  });
});

describe("TelegramService.setBusinessLocation (clear)", () => {
  it("invokes UpdateBusinessLocation with no args to clear", async () => {
    const invoked: unknown[] = [];
    const { TelegramService } = await import("../../src/telegram-client.js");
    const svc = Object.create(TelegramService.prototype) as InstanceType<typeof TelegramService>;
    svc.client = {
      invoke: async (req: unknown) => {
        invoked.push(req);
      },
    } as unknown as import("telegram").TelegramClient;
    svc.connected = true;
    svc.rateLimiter = {
      execute: (fn: () => unknown) => fn(),
    } as unknown as import("../../src/rate-limiter.js").RateLimiter;

    await svc.setBusinessLocation({ clear: true });
    assert.ok(invoked[0] instanceof Api.account.UpdateBusinessLocation);
  });

  it("invokes UpdateBusinessLocation with geo when lat/long given", async () => {
    const invoked: unknown[] = [];
    const { TelegramService } = await import("../../src/telegram-client.js");
    const svc = Object.create(TelegramService.prototype) as InstanceType<typeof TelegramService>;
    svc.client = {
      invoke: async (req: unknown) => {
        invoked.push(req);
      },
    } as unknown as import("telegram").TelegramClient;
    svc.connected = true;
    svc.rateLimiter = {
      execute: (fn: () => unknown) => fn(),
    } as unknown as import("../../src/rate-limiter.js").RateLimiter;

    await svc.setBusinessLocation({ address: "Moscow", latitude: 55.75, longitude: 37.61 });
    const req = invoked[0] as Api.account.UpdateBusinessLocation;
    assert.strictEqual(req.address, "Moscow");
    assert.ok(req.geoPoint instanceof Api.InputGeoPoint);
    assert.strictEqual((req.geoPoint as Api.InputGeoPoint).lat, 55.75);
  });
});

describe("TelegramService.setBusinessWorkHours", () => {
  it("invokes UpdateBusinessWorkHours with clear", async () => {
    const invoked: unknown[] = [];
    const { TelegramService } = await import("../../src/telegram-client.js");
    const svc = Object.create(TelegramService.prototype) as InstanceType<typeof TelegramService>;
    svc.client = {
      invoke: async (req: unknown) => {
        invoked.push(req);
      },
    } as unknown as import("telegram").TelegramClient;
    svc.connected = true;
    svc.rateLimiter = {
      execute: (fn: () => unknown) => fn(),
    } as unknown as import("../../src/rate-limiter.js").RateLimiter;

    await svc.setBusinessWorkHours({ clear: true });
    assert.ok(invoked[0] instanceof Api.account.UpdateBusinessWorkHours);
    const req = invoked[0] as Api.account.UpdateBusinessWorkHours;
    assert.strictEqual(req.businessWorkHours, undefined);
  });

  it("converts mon 09:00→18:00 to correct minute-of-week range", async () => {
    const invoked: unknown[] = [];
    const { TelegramService } = await import("../../src/telegram-client.js");
    const svc = Object.create(TelegramService.prototype) as InstanceType<typeof TelegramService>;
    svc.client = {
      invoke: async (req: unknown) => {
        invoked.push(req);
      },
    } as unknown as import("telegram").TelegramClient;
    svc.connected = true;
    svc.rateLimiter = {
      execute: (fn: () => unknown) => fn(),
    } as unknown as import("../../src/rate-limiter.js").RateLimiter;

    await svc.setBusinessWorkHours({
      timezone: "Europe/Moscow",
      schedule: [{ day: "mon", openFrom: "09:00", openTo: "18:00" }],
    });
    const req = invoked[0] as Api.account.UpdateBusinessWorkHours;
    const hours = req.businessWorkHours as Api.BusinessWorkHours;
    assert.strictEqual(hours.timezoneId, "Europe/Moscow");
    assert.strictEqual(hours.weeklyOpen.length, 1);
    assert.strictEqual(hours.weeklyOpen[0].startMinute, 540); // 9*60
    assert.strictEqual(hours.weeklyOpen[0].endMinute, 1080); // 18*60
  });
});

describe("TelegramService.resolveBusinessChatLink", () => {
  it("returns peer summary and message from result", async () => {
    const { TelegramService } = await import("../../src/telegram-client.js");
    const svc = Object.create(TelegramService.prototype) as InstanceType<typeof TelegramService>;
    svc.client = {
      invoke: async () => ({
        peer: new Api.PeerUser({ userId: BigInt("42") }),
        message: "Hello!",
        entities: [],
        chats: [],
        users: [],
      }),
    } as unknown as import("telegram").TelegramClient;
    svc.connected = true;
    svc.rateLimiter = {
      execute: (fn: () => unknown) => fn(),
    } as unknown as import("../../src/rate-limiter.js").RateLimiter;

    const result = await svc.resolveBusinessChatLink("abc123");
    assert.strictEqual(result.peer.type, "user");
    assert.strictEqual(result.peer.id, "42");
    assert.strictEqual(result.message, "Hello!");
    assert.strictEqual(result.entityCount, 0);
  });
});

describe("TelegramService.deleteProfilePhotos", () => {
  it("returns missing when photo not found in GetUserPhotos", async () => {
    const { TelegramService } = await import("../../src/telegram-client.js");
    const svc = Object.create(TelegramService.prototype) as InstanceType<typeof TelegramService>;
    svc.client = {
      getMe: async () => ({ id: BigInt("1") }),
      invoke: async (req: unknown) => {
        if (req instanceof Api.photos.GetUserPhotos) return { photos: [] };
        throw new Error("unexpected invoke");
      },
    } as unknown as import("telegram").TelegramClient;
    svc.connected = true;
    svc.rateLimiter = {
      execute: (fn: () => unknown) => fn(),
    } as unknown as import("../../src/rate-limiter.js").RateLimiter;

    await assert.rejects(() => svc.deleteProfilePhotos(["9999"]), /No matching photos/);
  });

  it("deletes when photo found", async () => {
    const { TelegramService } = await import("../../src/telegram-client.js");
    const svc = Object.create(TelegramService.prototype) as InstanceType<typeof TelegramService>;
    const photoId = BigInt("12345");
    let deleteCalled = false;
    svc.client = {
      getMe: async () => ({ id: BigInt("1") }),
      invoke: async (req: unknown) => {
        if (req instanceof Api.photos.GetUserPhotos) {
          return {
            photos: [
              new Api.Photo({
                id: photoId,
                accessHash: BigInt("0"),
                fileReference: Buffer.from([]),
                date: 0,
                sizes: [],
                dcId: 1,
              }),
            ],
          };
        }
        if (req instanceof Api.photos.DeletePhotos) {
          deleteCalled = true;
          return [photoId];
        }
        throw new Error("unexpected invoke");
      },
    } as unknown as import("telegram").TelegramClient;
    svc.connected = true;
    svc.rateLimiter = {
      execute: (fn: () => unknown) => fn(),
    } as unknown as import("../../src/rate-limiter.js").RateLimiter;

    const result = await svc.deleteProfilePhotos(["12345"]);
    assert.ok(deleteCalled, "DeletePhotos should have been called");
    assert.ok(result.deleted.includes("12345"));
    assert.strictEqual(result.missing.length, 0);
  });
});

describe("TelegramService.listEmojiStatuses", () => {
  it("returns empty array for NotModified response", async () => {
    const { TelegramService } = await import("../../src/telegram-client.js");
    const svc = Object.create(TelegramService.prototype) as InstanceType<typeof TelegramService>;
    svc.client = {
      invoke: async () => ({ className: "account.EmojiStatusesNotModified" }),
    } as unknown as import("telegram").TelegramClient;
    svc.connected = true;
    svc.rateLimiter = {
      execute: (fn: () => unknown) => fn(),
    } as unknown as import("../../src/rate-limiter.js").RateLimiter;

    const result = await svc.listEmojiStatuses("default", 50);
    assert.deepStrictEqual(result, []);
  });

  it("returns mapped items for EmojiStatuses response", async () => {
    const { TelegramService } = await import("../../src/telegram-client.js");
    const svc = Object.create(TelegramService.prototype) as InstanceType<typeof TelegramService>;
    svc.client = {
      invoke: async () => ({
        className: "account.EmojiStatuses",
        statuses: [new Api.EmojiStatus({ documentId: BigInt("999"), until: undefined })],
      }),
    } as unknown as import("telegram").TelegramClient;
    svc.connected = true;
    svc.rateLimiter = {
      execute: (fn: () => unknown) => fn(),
    } as unknown as import("../../src/rate-limiter.js").RateLimiter;

    const result = await svc.listEmojiStatuses("default", 50);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].kind, "default");
    assert.strictEqual(result[0].documentId, "999");
  });
});

describe("TelegramService.createBusinessChatLink", () => {
  it("returns summary with slug extracted from link", async () => {
    const { TelegramService } = await import("../../src/telegram-client.js");
    const svc = Object.create(TelegramService.prototype) as InstanceType<typeof TelegramService>;
    svc.client = {
      invoke: async () => ({
        link: "https://t.me/m/abc123slug",
        message: "Hello!",
        title: "Test",
        views: 0,
        entities: [],
      }),
    } as unknown as import("telegram").TelegramClient;
    svc.connected = true;
    svc.rateLimiter = {
      execute: (fn: () => unknown) => fn(),
    } as unknown as import("../../src/rate-limiter.js").RateLimiter;
    svc.parseEntities = async (text: string) => ({ text });

    const result = await svc.createBusinessChatLink({ message: "Hello!" });
    assert.strictEqual(result.slug, "abc123slug");
    assert.strictEqual(result.message, "Hello!");
  });
});
