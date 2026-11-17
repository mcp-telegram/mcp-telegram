import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram";
import { getPeerId } from "telegram/Utils.js";
import { formatChatFolder } from "../telegram-client.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Invoked = { req: unknown };

async function makeSvc(onInvoke?: (req: unknown) => unknown) {
  const { TelegramService: TS } = await import("../../src/telegram-client.js");
  const svc = Object.create(TS.prototype) as InstanceType<typeof TS>;
  const invoked: Invoked[] = [];
  svc.client = {
    invoke: async (req: unknown) => {
      invoked.push({ req });
      return onInvoke ? onInvoke(req) : undefined;
    },
    getInputEntity: async (p: unknown) => p,
  } as unknown as import("telegram").TelegramClient;
  svc.connected = true;
  svc.rateLimiter = {
    execute: (fn: () => unknown) => fn(),
  } as unknown as import("../../src/rate-limiter.js").RateLimiter;
  return { svc, invoked };
}

function makeFakeFiltersResult(filters: Api.TypeDialogFilter[]) {
  return { filters, className: "messages.DialogFilters" };
}

// ─── createFolder ─────────────────────────────────────────────────────────────

describe("createFolder", () => {
  it("invokes GetDialogFilters then UpdateDialogFilter with correct id", async () => {
    let callCount = 0;
    const { svc, invoked } = await makeSvc((_req) => {
      callCount++;
      if (callCount === 1) {
        return makeFakeFiltersResult([]);
      }
    });
    const id = await svc.createFolder({ title: "Work" });
    assert.strictEqual(id, 2);
    assert.strictEqual(invoked.length, 2);
    const updateReq = invoked[1].req as Api.messages.UpdateDialogFilter;
    assert.strictEqual(updateReq.id, 2);
    assert.ok(updateReq.filter instanceof Api.DialogFilter);
    const filter = updateReq.filter as Api.DialogFilter;
    const titleText = typeof filter.title === "string" ? filter.title : filter.title.text;
    assert.strictEqual(titleText, "Work");
  });

  it("picks next available id when 2 and 3 are taken", async () => {
    let callCount = 0;
    const { svc } = await makeSvc((_req) => {
      callCount++;
      if (callCount === 1) {
        const f2 = new Api.DialogFilter({
          id: 2,
          title: new Api.TextWithEntities({ text: "A", entities: [] }),
          pinnedPeers: [],
          includePeers: [],
          excludePeers: [],
        });
        const f3 = new Api.DialogFilter({
          id: 3,
          title: new Api.TextWithEntities({ text: "B", entities: [] }),
          pinnedPeers: [],
          includePeers: [],
          excludePeers: [],
        });
        return makeFakeFiltersResult([f2, f3]);
      }
    });
    const id = await svc.createFolder({ title: "New" });
    assert.strictEqual(id, 4);
  });

  it("sets type flags correctly", async () => {
    let callCount = 0;
    const { svc, invoked } = await makeSvc((_req) => {
      callCount++;
      if (callCount === 1) return makeFakeFiltersResult([]);
    });
    await svc.createFolder({ title: "Groups", groups: true, excludeMuted: true });
    const updateReq = invoked[1].req as Api.messages.UpdateDialogFilter;
    const filter = updateReq.filter as Api.DialogFilter;
    assert.strictEqual(filter.groups, true);
    assert.strictEqual(filter.excludeMuted, true);
    assert.strictEqual(filter.contacts, undefined);
  });
});

// ─── deleteFolder ─────────────────────────────────────────────────────────────

describe("deleteFolder", () => {
  it("invokes UpdateDialogFilter with id and no filter", async () => {
    const { svc, invoked } = await makeSvc();
    await svc.deleteFolder(5);
    assert.strictEqual(invoked.length, 1);
    const req = invoked[0].req as Api.messages.UpdateDialogFilter;
    assert.strictEqual(req.id, 5);
    assert.strictEqual(req.filter, undefined);
  });
});

// ─── reorderFolders ───────────────────────────────────────────────────────────

describe("reorderFolders", () => {
  it("invokes UpdateDialogFiltersOrder with correct order", async () => {
    const { svc, invoked } = await makeSvc();
    await svc.reorderFolders([3, 2, 4]);
    assert.strictEqual(invoked.length, 1);
    const req = invoked[0].req as Api.messages.UpdateDialogFiltersOrder;
    assert.deepStrictEqual(req.order, [3, 2, 4]);
  });
});

// ─── getSuggestedFolders ──────────────────────────────────────────────────────

describe("getSuggestedFolders", () => {
  it("returns title and emoticon for DialogFilter suggestions", async () => {
    const filter = new Api.DialogFilter({
      id: 2,
      title: new Api.TextWithEntities({ text: "Work", entities: [] }),
      emoticon: "💼",
      pinnedPeers: [],
      includePeers: [],
      excludePeers: [],
    });
    const { svc } = await makeSvc(() => [new Api.DialogFilterSuggested({ filter, description: "" })]);
    const result = await svc.getSuggestedFolders();
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].title, "Work");
    assert.strictEqual(result[0].emoticon, "💼");
  });

  it("skips DialogFilterDefault entries", async () => {
    const defaultFilter = new Api.DialogFilterDefault();
    const { svc } = await makeSvc(() => [new Api.DialogFilterSuggested({ filter: defaultFilter, description: "" })]);
    const result = await svc.getSuggestedFolders();
    assert.strictEqual(result.length, 0);
  });
});

// ─── toggleDialogFilterTags ───────────────────────────────────────────────────

describe("toggleDialogFilterTags", () => {
  it("invokes ToggleDialogFilterTags with enabled=true", async () => {
    const { svc, invoked } = await makeSvc();
    await svc.toggleDialogFilterTags(true);
    assert.strictEqual(invoked.length, 1);
    const req = invoked[0].req as Api.messages.ToggleDialogFilterTags;
    assert.strictEqual(req.enabled, true);
  });

  it("invokes ToggleDialogFilterTags with enabled=false", async () => {
    const { svc, invoked } = await makeSvc();
    await svc.toggleDialogFilterTags(false);
    const req = invoked[0].req as Api.messages.ToggleDialogFilterTags;
    assert.strictEqual(req.enabled, false);
  });
});

// ─── getGlobalPrivacySettings ─────────────────────────────────────────────────

describe("getGlobalPrivacySettings", () => {
  it("returns all five fields with defaults for missing flags", async () => {
    const { svc } = await makeSvc(
      () =>
        new Api.GlobalPrivacySettings({
          archiveAndMuteNewNoncontactPeers: true,
          keepArchivedUnmuted: false,
          keepArchivedFolders: true,
          hideReadMarks: false,
          newNoncontactPeersRequirePremium: false,
        }),
    );
    const result = await svc.getGlobalPrivacySettings();
    assert.strictEqual(result.archiveAndMuteNewNoncontactPeers, true);
    assert.strictEqual(result.keepArchivedFolders, true);
    assert.strictEqual(result.hideReadMarks, false);
  });

  it("defaults undefined flags to false", async () => {
    const { svc } = await makeSvc(() => new Api.GlobalPrivacySettings({}));
    const result = await svc.getGlobalPrivacySettings();
    assert.strictEqual(result.archiveAndMuteNewNoncontactPeers, false);
    assert.strictEqual(result.hideReadMarks, false);
    assert.strictEqual(result.newNoncontactPeersRequirePremium, false);
  });
});

// ─── setGlobalPrivacySettings ─────────────────────────────────────────────────

describe("setGlobalPrivacySettings", () => {
  it("merges changed flag with current settings", async () => {
    let callCount = 0;
    const { svc, invoked } = await makeSvc((_req) => {
      callCount++;
      if (callCount === 1) {
        return new Api.GlobalPrivacySettings({
          archiveAndMuteNewNoncontactPeers: false,
          keepArchivedUnmuted: true,
          keepArchivedFolders: false,
          hideReadMarks: false,
          newNoncontactPeersRequirePremium: false,
        });
      }
    });
    await svc.setGlobalPrivacySettings({ archiveAndMuteNewNoncontactPeers: true });
    assert.strictEqual(invoked.length, 2);
    const setReq = invoked[1].req as Api.account.SetGlobalPrivacySettings;
    assert.strictEqual(setReq.settings.archiveAndMuteNewNoncontactPeers, true);
    assert.strictEqual(setReq.settings.keepArchivedUnmuted, true);
    assert.strictEqual(setReq.settings.keepArchivedFolders, false);
  });

  it("uses GetGlobalPrivacySettings before SetGlobalPrivacySettings", async () => {
    let callCount = 0;
    const { svc, invoked } = await makeSvc((_req) => {
      callCount++;
      if (callCount === 1) return new Api.GlobalPrivacySettings({});
    });
    await svc.setGlobalPrivacySettings({ hideReadMarks: true });
    assert.ok(invoked[0].req instanceof Api.account.GetGlobalPrivacySettings);
    assert.ok(invoked[1].req instanceof Api.account.SetGlobalPrivacySettings);
  });
});

// ─── editFolder ───────────────────────────────────────────────────────────────

describe("editFolder", () => {
  it("throws when folder not found", async () => {
    let callCount = 0;
    const { svc } = await makeSvc((_req) => {
      callCount++;
      if (callCount === 1) return makeFakeFiltersResult([]);
    });
    await assert.rejects(() => svc.editFolder(99, { title: "X" }), /not found/);
  });

  it("preserves current flags for fields not passed", async () => {
    let callCount = 0;
    const current = new Api.DialogFilter({
      id: 2,
      title: new Api.TextWithEntities({ text: "Old", entities: [] }),
      contacts: true,
      groups: true,
      pinnedPeers: [],
      includePeers: [],
      excludePeers: [],
    });
    const { svc, invoked } = await makeSvc((_req) => {
      callCount++;
      if (callCount === 1) return makeFakeFiltersResult([current]);
    });
    await svc.editFolder(2, { title: "New" });
    const updateReq = invoked[1].req as Api.messages.UpdateDialogFilter;
    const filter = updateReq.filter as Api.DialogFilter;
    const titleText = typeof filter.title === "string" ? filter.title : filter.title.text;
    assert.strictEqual(titleText, "New");
    assert.strictEqual(filter.contacts, true);
    assert.strictEqual(filter.groups, true);
  });
});

// ─── editFolder: addPeers / removePeers ──────────────────────────────────────

describe("editFolder incremental peers", () => {
  const user = (id: number) => new Api.InputPeerUser({ userId: bigInt(id), accessHash: bigInt(1) });
  const channel = (id: number) => new Api.InputPeerChannel({ channelId: bigInt(id), accessHash: bigInt(1) });
  const folder = () =>
    new Api.DialogFilter({
      id: 2,
      title: new Api.TextWithEntities({ text: "Family", entities: [] }),
      pinnedPeers: [user(10)],
      includePeers: [user(11), channel(12)],
      excludePeers: [user(13)],
    });

  async function svcWith(current: Api.DialogFilter, known: Record<string, Api.TypeInputPeer> = {}) {
    let callCount = 0;
    const made = await makeSvc(() => (++callCount === 1 ? makeFakeFiltersResult([current]) : undefined));
    // Own user ID is 1
    (made.svc.client as unknown as { getMe: () => Promise<unknown> }).getMe = async () => ({ id: bigInt(1) });
    // Resolve "u<N>" to a user peer, as GramJS would after resolvePeer
    // "u<N>" resolves to user N, entries of `known` to their peer; anything else is unknown to Telegram
    (made.svc as unknown as { resolvePeer: (id: string) => Promise<unknown> }).resolvePeer = async (id: string) => {
      if (/^u\d+$/.test(id)) return user(Number(id.slice(1)));
      if (known[id]) return known[id];
      if (id === "@flood") throw new Error("A wait of 30 seconds is required (FLOOD_WAIT_30)");
      if (id === "missingname") throw new Error('Cannot find chat "missingname". Use a numeric ID, @username');
      throw new Error("Could not find the input entity");
    };
    return made;
  }
  const sent = (invoked: Invoked[]) => (invoked[1].req as Api.messages.UpdateDialogFilter).filter as Api.DialogFilter;
  const ids = (peers: Api.TypeInputPeer[]) => peers.map((p) => getPeerId(p));

  it("addPeers keeps existing chats and appends new ones", async () => {
    const { svc, invoked } = await svcWith(folder());
    const r = await svc.editFolder(2, { addPeers: ["u14", "u11"] });
    assert.deepStrictEqual(ids(sent(invoked).includePeers), ["11", "-10012", "14"]);
    assert.deepStrictEqual(ids(sent(invoked).pinnedPeers), ["10"]);
    assert.deepStrictEqual(r, { added: 1, removed: 0, excluded: [], alreadyIncluded: ["u11"], notInFolder: [] });
  });

  it("addPeers treats pinned chats as already in the folder and lifts an exclusion", async () => {
    const { svc, invoked } = await svcWith(folder());
    const r = await svc.editFolder(2, { addPeers: ["u10", "u13"] });
    assert.deepStrictEqual(ids(sent(invoked).includePeers), ["11", "-10012", "13"]);
    assert.deepStrictEqual(ids(sent(invoked).excludePeers), []);
    assert.deepStrictEqual(r.alreadyIncluded, ["u10"]);
  });

  it("removePeers matches numeric IDs from included and pinned chats", async () => {
    const { svc, invoked } = await svcWith(folder());
    const r = await svc.editFolder(2, { removePeers: ["-10012", "10", "999"] });
    assert.deepStrictEqual(ids(sent(invoked).includePeers), ["11"]);
    assert.deepStrictEqual(ids(sent(invoked).pinnedPeers), []);
    assert.deepStrictEqual(r, { added: 0, removed: 2, excluded: [], alreadyIncluded: [], notInFolder: ["999"] });
  });

  it("removePeers accepts a bare channel ID as get-chat-info prints it", async () => {
    const { svc, invoked } = await svcWith(folder());
    const r = await svc.editFolder(2, { removePeers: ["12"] });
    assert.deepStrictEqual(ids(sent(invoked).includePeers), ["11"]);
    assert.strictEqual(r.removed, 1);
  });

  it("resolves a bare ID before matching, so user 12 is not mistaken for channel -10012", async () => {
    const added = await svcWith(folder(), { "12": user(12) });
    const r1 = await added.svc.editFolder(2, { addPeers: ["12"] });
    assert.strictEqual(r1.added, 1);
    assert.deepStrictEqual(ids(sent(added.invoked).includePeers), ["11", "-10012", "12"]);

    const removed = await svcWith(folder(), { "12": user(12) });
    const r2 = await removed.svc.editFolder(2, { removePeers: ["12"] });
    assert.deepStrictEqual(r2.notInFolder, ["12"]);
    assert.deepStrictEqual(ids(sent(removed.invoked).includePeers), ["11", "-10012"]);
  });

  it("treats Saved Messages stored under our own user ID as me", async () => {
    const withSelf = folder();
    withSelf.includePeers.push(user(1));
    const added = await svcWith(withSelf);
    const r1 = await added.svc.editFolder(2, { addPeers: ["me"] });
    assert.deepStrictEqual(r1.alreadyIncluded, ["me"]);
    assert.deepStrictEqual(ids(sent(added.invoked).includePeers), ["11", "-10012", "1"]);

    const removed = await svcWith(withSelf);
    const r2 = await removed.svc.editFolder(2, { removePeers: ["@me"] });
    assert.strictEqual(r2.removed, 1);
    assert.deepStrictEqual(ids(sent(removed.invoked).includePeers), ["11", "-10012"]);
  });

  it("with type filters on, removePeers also excludes the chat so its category does not bring it back", async () => {
    const withContacts = folder();
    withContacts.contacts = true;
    const { svc, invoked } = await svcWith(withContacts);
    // u11 is listed explicitly, u20 is only in the folder through the contacts filter
    const r = await svc.editFolder(2, { removePeers: ["u11", "u20", "u13"] });
    assert.deepStrictEqual(ids(sent(invoked).includePeers), ["-10012"]);
    assert.deepStrictEqual(ids(sent(invoked).excludePeers), ["13", "11", "20"]);
    assert.deepStrictEqual(r, { added: 0, removed: 1, excluded: ["u11", "u20"], alreadyIncluded: [], notInFolder: [] });
  });

  it("a flood wait while resolving fails the edit instead of reporting the chat as not in the folder", async () => {
    const { svc, invoked } = await svcWith(folder());
    await assert.rejects(() => svc.editFolder(2, { removePeers: ["@flood"] }), /FLOOD_WAIT/);
    assert.strictEqual(invoked.length, 1);
  });

  it("an unknown chat name is reported as not in the folder, the rest of the batch still applies", async () => {
    const { svc, invoked } = await svcWith(folder());
    const r = await svc.editFolder(2, { removePeers: ["missingname", "u11"] });
    assert.deepStrictEqual(r.notInFolder, ["missingname"]);
    assert.strictEqual(r.removed, 1);
    assert.deepStrictEqual(ids(sent(invoked).includePeers), ["-10012"]);
  });

  it("rejects includePeers together with addPeers", async () => {
    const { svc } = await svcWith(folder());
    await assert.rejects(() => svc.editFolder(2, { includePeers: ["u1"], addPeers: ["u2"] }), /not both/);
  });

  it("explains that a shared folder is not editable here", async () => {
    const shared = new Api.DialogFilterChatlist({
      id: 3,
      title: new Api.TextWithEntities({ text: "Shared", entities: [] }),
      pinnedPeers: [],
      includePeers: [],
    });
    const { svc } = await makeSvc(() => makeFakeFiltersResult([shared]));
    await assert.rejects(() => svc.editFolder(3, { addPeers: ["u1"] }), /shared folder/);
  });
});

// ─── getChatFolder ───────────────────────────────────────────────────────────

describe("getChatFolder", () => {
  it("returns flags and named pinned/included/excluded chats", async () => {
    const f = new Api.DialogFilter({
      id: 2,
      title: new Api.TextWithEntities({ text: "Family", entities: [] }),
      emoticon: "🏠",
      contacts: true,
      excludeMuted: true,
      pinnedPeers: [new Api.InputPeerSelf()],
      includePeers: [
        new Api.InputPeerUser({ userId: bigInt(11), accessHash: bigInt(1) }),
        new Api.InputPeerChannel({ channelId: bigInt(12), accessHash: bigInt(1) }),
        new Api.InputPeerChat({ chatId: bigInt(15) }),
      ],
      excludePeers: [new Api.InputPeerUser({ userId: bigInt(13), accessHash: bigInt(1) })],
    });
    const { svc, invoked } = await makeSvc((req) => {
      if (req instanceof Api.messages.GetDialogFilters) return makeFakeFiltersResult([f]);
      if (req instanceof Api.users.GetUsers)
        return [
          new Api.User({ id: bigInt(11), firstName: "Anna", lastName: "S\n- Fake (777)" }),
          new Api.User({ id: bigInt(13), firstName: "", username: "bob" }),
        ];
      if (req instanceof Api.channels.GetChannels)
        return {
          chats: [new Api.Channel({ id: bigInt(12), title: "News", photo: new Api.ChatPhotoEmpty(), date: 0 })],
        };
      if (req instanceof Api.messages.GetChats) throw new Error("CHAT_ID_INVALID");
    });
    const d = await svc.getChatFolder(2);
    assert.strictEqual(d.shared, false);
    assert.strictEqual(d.flags.contacts, true);
    assert.strictEqual(d.flags.excludeMuted, true);
    assert.strictEqual(d.flags.groups, false);
    assert.deepStrictEqual(d.pinnedPeers, [{ id: "me", name: "Saved Messages" }]);
    // A failed name lookup keeps the chat, just without a name
    assert.deepStrictEqual(d.includePeers, [
      { id: "11", name: "Anna S\n- Fake (777)" },
      { id: "-10012", name: "News" },
      { id: "-15", name: undefined },
    ]);
    assert.deepStrictEqual(d.excludePeers, [{ id: "13", name: "bob" }]);
    // One batched request per peer kind
    assert.strictEqual(invoked.filter((i) => i.req instanceof Api.users.GetUsers).length, 1);

    const text = formatChatFolder(d);
    assert.match(text, /^\[2\] 🏠 Family\nType filters: contacts, excludeMuted\n/);
    assert.match(text, /Included chats \(3\):\n- Anna S - Fake \(777\) \(11\)\n- News \(-10012\)\n- \(-15\)/);
  });

  it("throws for an unknown folder", async () => {
    const { svc } = await makeSvc(() => makeFakeFiltersResult([]));
    await assert.rejects(() => svc.getChatFolder(7), /not found/);
  });
});
