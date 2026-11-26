import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram";

// Users known to the fake client, by the reference the tool would pass
const USERS: Record<string, Api.User | Api.Channel> = {
  anna: new Api.User({
    id: bigInt(11),
    firstName: "Anna",
    lastName: "S",
    contact: true,
    phone: "79990001122",
    accessHash: bigInt(1),
  }),
  bob: new Api.User({ id: bigInt(13), firstName: "Bob", contact: true, accessHash: bigInt(2) }),
  helper: new Api.User({ id: bigInt(15), firstName: "Helper", bot: true, accessHash: bigInt(5) }),
  stranger: new Api.User({ id: bigInt(14), firstName: "Eve", accessHash: bigInt(3) }),
  news: new Api.Channel({
    id: bigInt(12),
    title: "News",
    photo: new Api.ChatPhotoEmpty(),
    date: 0,
    accessHash: bigInt(4),
  }),
};

async function makeSvc() {
  const { TelegramService: TS } = await import("../../src/telegram-client.js");
  const svc = Object.create(TS.prototype) as InstanceType<typeof TS>;
  const invoked: unknown[] = [];
  svc.client = {
    invoke: async (req: unknown) => {
      invoked.push(req);
    },
    getEntity: async (ref: unknown) => {
      const e = USERS[ref as string];
      if (!e) throw new Error("Could not find the input entity");
      return e;
    },
  } as unknown as import("telegram").TelegramClient;
  svc.connected = true;
  (svc as unknown as { resolvePeer: (id: string) => Promise<string> }).resolvePeer = async (id) => id;
  return { svc, invoked };
}

describe("getContactStatus", () => {
  it("reports a contact, a non-contact, a bot and a channel from a fresh getEntity, without other requests", async () => {
    const { svc, invoked } = await makeSvc();
    assert.deepStrictEqual(await svc.getContactStatus("anna"), { id: "11", kind: "user", isContact: true });
    assert.deepStrictEqual(await svc.getContactStatus("stranger"), { id: "14", kind: "user", isContact: false });
    assert.deepStrictEqual(await svc.getContactStatus("helper"), { id: "15", kind: "bot", isContact: false });
    assert.deepStrictEqual(await svc.getContactStatus("news"), { id: "12", kind: "other", isContact: false });
    // Ни GetContacts, ни других запросов: только getEntity на одного пользователя
    assert.strictEqual(invoked.length, 0);
  });

  it("resolves a username straight through GramJS, never through the entity cache or dialog titles", async () => {
    const { svc } = await makeSvc();
    // Кеш ядра хранит прежнего владельца username - метод не должен его спрашивать
    (svc as unknown as { resolvePeer: () => Promise<never> }).resolvePeer = async () => {
      throw new Error("getContactStatus must not use resolvePeer for a username");
    };
    (svc as unknown as { resolveChat: () => Promise<never> }).resolveChat = async () => {
      throw new Error("getContactStatus must not use resolveChat for a username");
    };
    assert.deepStrictEqual(await svc.getContactStatus("stranger"), { id: "14", kind: "user", isContact: false });
  });

  it("resolves a numeric ID through the dialog lookup that yields an access hash", async () => {
    const { svc } = await makeSvc();
    const seen: string[] = [];
    (svc as unknown as { resolveNumericPeer: (id: string) => Promise<string> }).resolveNumericPeer = async (id) => {
      seen.push(id);
      return "anna";
    };
    assert.deepStrictEqual(await svc.getContactStatus("11"), { id: "11", kind: "user", isContact: true });
    assert.deepStrictEqual(seen, ["11"]);
  });

  it("propagates an unknown peer", async () => {
    const { svc } = await makeSvc();
    await assert.rejects(() => svc.getContactStatus("nobody"), /Could not find the input entity/);
  });
});

describe("renameContact", () => {
  it("sends AddContact with the new name and keeps the stored phone", async () => {
    const { svc, invoked } = await makeSvc();
    const r = await svc.renameContact("anna", "Mom");
    assert.deepStrictEqual(r, { id: "11", previousName: "Anna S" });
    assert.strictEqual(invoked.length, 1);
    const req = invoked[0] as Api.contacts.AddContact;
    assert.ok(req instanceof Api.contacts.AddContact);
    assert.strictEqual(req.firstName, "Mom");
    assert.strictEqual(req.lastName, "");
    assert.strictEqual(req.phone, "79990001122");
    assert.ok(req.id instanceof Api.InputUser);
  });

  it("refuses a user who is not a contact instead of adding them", async () => {
    const { svc, invoked } = await makeSvc();
    await assert.rejects(() => svc.renameContact("stranger", "X"), /not in your contacts/);
    assert.strictEqual(invoked.length, 0);
  });

  it("refuses a channel", async () => {
    const { svc } = await makeSvc();
    await assert.rejects(() => svc.renameContact("news", "X"), /not a user/);
  });
});

describe("deleteContacts", () => {
  it("deletes contacts in one request and skips non-contacts and duplicates", async () => {
    const { svc, invoked } = await makeSvc();
    const r = await svc.deleteContacts(["anna", "stranger", "bob", "anna"]);
    assert.deepStrictEqual(r, { deleted: ["anna", "bob"], notContacts: ["stranger"] });
    assert.strictEqual(invoked.length, 1);
    const req = invoked[0] as Api.contacts.DeleteContacts;
    assert.ok(req instanceof Api.contacts.DeleteContacts);
    assert.deepStrictEqual(
      req.id.map((u) => (u as Api.InputUser).userId.toString()),
      ["11", "13"],
    );
  });

  it("sends nothing when no one is a contact", async () => {
    const { svc, invoked } = await makeSvc();
    const r = await svc.deleteContacts(["stranger"]);
    assert.deepStrictEqual(r, { deleted: [], notContacts: ["stranger"] });
    assert.strictEqual(invoked.length, 0);
  });
});
