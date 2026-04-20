import assert from "node:assert";
import { describe, it } from "node:test";
import { Api } from "telegram/tl/index.js";
import { summarizeBusinessChatLink, summarizeBusinessChatLinks, TelegramService } from "../telegram-client.js";

interface Internals {
  client: unknown;
  connected: boolean;
}

function makeService(invocations: unknown[], responder: (req: unknown) => unknown): TelegramService {
  const fakeClient = {
    invoke: async (req: unknown) => {
      invocations.push(req);
      return responder(req);
    },
  };
  const service = new TelegramService(1, "hash");
  const internals = service as unknown as Internals;
  internals.client = fakeClient;
  internals.connected = true;
  return service;
}

describe("summarizeBusinessChatLink", () => {
  it("maps link, message, title, views and entity count", () => {
    const link = new Api.BusinessChatLink({
      link: "https://t.me/message/abc",
      message: "Hello there",
      title: "Welcome",
      views: 42,
      entities: [
        new Api.MessageEntityBold({ offset: 0, length: 5 }),
        new Api.MessageEntityItalic({ offset: 6, length: 5 }),
      ],
    });
    const out = summarizeBusinessChatLink(link);
    assert.strictEqual(out.link, "https://t.me/message/abc");
    assert.strictEqual(out.message, "Hello there");
    assert.strictEqual(out.title, "Welcome");
    assert.strictEqual(out.views, 42);
    assert.strictEqual(out.entityCount, 2);
  });

  it("leaves title undefined and entityCount 0 when entities missing", () => {
    const link = new Api.BusinessChatLink({
      link: "https://t.me/message/xyz",
      message: "Plain",
      views: 0,
    });
    const out = summarizeBusinessChatLink(link);
    assert.strictEqual(out.title, undefined);
    assert.strictEqual(out.entityCount, 0);
    assert.strictEqual(out.views, 0);
  });
});

describe("summarizeBusinessChatLinks", () => {
  it("computes count from links length and maps each entry", () => {
    const resp = new Api.account.BusinessChatLinks({
      links: [
        new Api.BusinessChatLink({
          link: "https://t.me/message/a",
          message: "Hi",
          views: 1,
        }),
        new Api.BusinessChatLink({
          link: "https://t.me/message/b",
          message: "Hello",
          title: "Label",
          views: 5,
        }),
      ],
      chats: [],
      users: [],
    });
    const out = summarizeBusinessChatLinks(resp);
    assert.strictEqual(out.count, 2);
    assert.strictEqual(out.links.length, 2);
    assert.strictEqual(out.links[0].link, "https://t.me/message/a");
    assert.strictEqual(out.links[1].title, "Label");
  });

  it("handles empty link list", () => {
    const resp = new Api.account.BusinessChatLinks({ links: [], chats: [], users: [] });
    const out = summarizeBusinessChatLinks(resp);
    assert.strictEqual(out.count, 0);
    assert.deepStrictEqual(out.links, []);
  });
});

describe("TelegramService.getBusinessChatLinks", () => {
  it("invokes account.GetBusinessChatLinks and returns summary", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      invocations,
      () =>
        new Api.account.BusinessChatLinks({
          links: [
            new Api.BusinessChatLink({
              link: "https://t.me/message/foo",
              message: "hey",
              views: 9,
            }),
          ],
          chats: [],
          users: [],
        }),
    );

    const out = await service.getBusinessChatLinks();
    const call = invocations.find((r) => r instanceof Api.account.GetBusinessChatLinks) as
      | Api.account.GetBusinessChatLinks
      | undefined;
    assert.ok(call);
    assert.strictEqual(out.count, 1);
    assert.strictEqual(out.links[0].link, "https://t.me/message/foo");
    assert.strictEqual(out.links[0].views, 9);
  });
});
