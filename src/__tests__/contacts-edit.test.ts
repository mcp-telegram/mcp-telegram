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
