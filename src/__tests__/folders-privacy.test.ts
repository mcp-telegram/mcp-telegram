import assert from "node:assert";
import { describe, it } from "node:test";
import { Api } from "telegram";

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
