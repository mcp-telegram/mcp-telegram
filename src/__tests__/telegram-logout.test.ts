import assert from "node:assert";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { TelegramService } from "../telegram-client.js";

const TMP_DIR = join(tmpdir(), `mcp-telegram-logout-test-${process.pid}`);
const SESSION_PATH = join(TMP_DIR, "session");

type MockClient = {
  invoke: (...args: unknown[]) => Promise<unknown>;
  destroy: () => Promise<void>;
};

function makeService(): TelegramService {
  return new TelegramService(1, "h", { sessionPath: SESSION_PATH });
}

function primeConnected(service: TelegramService, client: MockClient): void {
  const s = service as unknown as {
    client: MockClient | null;
    connected: boolean;
    sessionString: string;
  };
  s.client = client;
  s.connected = true;
  s.sessionString = "fake-session";
}

before(() => mkdirSync(TMP_DIR, { recursive: true }));
after(() => rmSync(TMP_DIR, { recursive: true, force: true }));
beforeEach(() => {
  if (existsSync(SESSION_PATH)) rmSync(SESSION_PATH);
});

describe("hasLocalSession()", () => {
  it("returns false when session file is absent", () => {
    const service = makeService();
    assert.strictEqual(service.hasLocalSession(), false);
  });

  it("returns true when session file exists", () => {
    writeFileSync(SESSION_PATH, "fake");
    const service = makeService();
    assert.strictEqual(service.hasLocalSession(), true);
  });
});

describe("logOut()", () => {
  it("returns false and wipes local session when not connected but file exists", async () => {
    writeFileSync(SESSION_PATH, "stale");
    const service = makeService();

    const result = await service.logOut();

    assert.strictEqual(result, false);
    assert.strictEqual(existsSync(SESSION_PATH), false);
    assert.strictEqual(service.isConnected(), false);
  });

  it("returns false and does nothing when not connected and no file", async () => {
    const service = makeService();

    const result = await service.logOut();

    assert.strictEqual(result, false);
    assert.strictEqual(existsSync(SESSION_PATH), false);
  });

  it("revokes on server, destroys client, and removes local file when connected", async () => {
    writeFileSync(SESSION_PATH, "fake");
    const service = makeService();
    let invokedLogOut = false;
    let destroyed = false;
    primeConnected(service, {
      invoke: async () => {
        invokedLogOut = true;
        return {};
      },
      destroy: async () => {
        destroyed = true;
      },
    });

    const result = await service.logOut();

    assert.strictEqual(result, true);
    assert.strictEqual(invokedLogOut, true);
    assert.strictEqual(destroyed, true);
    assert.strictEqual(existsSync(SESSION_PATH), false);
    assert.strictEqual(service.isConnected(), false);
  });

  it("wipes local state even when server-side auth.LogOut throws", async () => {
    writeFileSync(SESSION_PATH, "fake");
    const service = makeService();
    primeConnected(service, {
      invoke: async () => {
        throw new Error("NETWORK_BROKEN");
      },
      destroy: async () => {},
    });

    const result = await service.logOut();

    assert.strictEqual(result, false);
    assert.strictEqual(existsSync(SESSION_PATH), false);
    assert.strictEqual(service.isConnected(), false);
  });

  it("is idempotent — second consecutive logOut is a no-op", async () => {
    writeFileSync(SESSION_PATH, "fake");
    const service = makeService();
    primeConnected(service, {
      invoke: async () => ({}),
      destroy: async () => {},
    });

    const first = await service.logOut();
    const second = await service.logOut();

    assert.strictEqual(first, true);
    assert.strictEqual(second, false);
    assert.strictEqual(existsSync(SESSION_PATH), false);
    assert.strictEqual(service.isConnected(), false);
  });

  it("throws when local file removal fails — caller must surface this", async () => {
    writeFileSync(SESSION_PATH, "fake");
    const service = makeService();
    primeConnected(service, {
      invoke: async () => ({}),
      destroy: async () => {},
    });
    // Simulate FS error on unlink by pointing sessionPath at a directory
    // (unlink on a directory throws EISDIR / EPERM). Server revoke succeeds,
    // but logOut() must throw so the tool returns fail() instead of falsely
    // claiming local cleanup.
    const s = service as unknown as { sessionPath: string };
    const origPath = s.sessionPath;
    s.sessionPath = TMP_DIR;

    await assert.rejects(() => service.logOut());

    s.sessionPath = origPath;
  });

  it("returns true (revoked) even when client.destroy() throws", async () => {
    writeFileSync(SESSION_PATH, "fake");
    const service = makeService();
    primeConnected(service, {
      invoke: async () => ({}),
      destroy: async () => {
        throw new Error("socket already closed");
      },
    });

    const result = await service.logOut();

    assert.strictEqual(result, true, "destroy() failure must not mask successful server revoke");
    assert.strictEqual(existsSync(SESSION_PATH), false);
  });
});
