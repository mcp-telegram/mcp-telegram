import assert from "node:assert";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { TelegramClient } from "telegram";
import { AuthKey } from "telegram/crypto/AuthKey.js";
import { StringSession } from "telegram/sessions/index.js";
import { TelegramService } from "../telegram-client.js";

/**
 * Every GramJS client this service stops using must be DESTROYED, not dropped.
 *
 * GramJS only exits a client's update loop when `_destroyed` is set (destroy()). A client that
 * is merely disconnected — or just forgotten — keeps pinging, failing and running
 * `_handleReconnect` -> getMe() forever. In production every revoked session left such a
 * zombie retrying `AUTH_KEY_UNREGISTERED (users.GetUsers)`: ~28 reconnects/s and ~1M log lines
 * per 30 min seven hours after a restart, with memory and load climbing until the next deploy.
 *
 * The root cause was connect()'s error path: on an auth error it called clearSession(), which
 * nulled `this.client`, and then `this.client.disconnect()` threw a swallowed TypeError. These
 * tests drive the real connect() with GramJS's network methods stubbed on the prototype.
 */

const TMP_DIR = join(tmpdir(), `mcp-telegram-teardown-test-${process.pid}`);
const SESSION_PATH = join(TMP_DIR, "session");

type Proto = Record<"connect" | "getMe" | "destroy" | "disconnect", unknown>;
const proto = TelegramClient.prototype as unknown as Proto;
const original: Proto = {
  connect: proto.connect,
  getMe: proto.getMe,
  destroy: proto.destroy,
  disconnect: proto.disconnect,
};

let destroyed: Set<unknown>;
let getMeError: unknown;
let validSession: string;

type Internals = { client: unknown; connected: boolean; sessionString: string };

async function makeSessionString(): Promise<string> {
  const session = new StringSession("");
  session.setDC(2, "149.154.167.51", 443);
  const key = new AuthKey();
  await key.setKey(Buffer.alloc(256, 7));
  session.setAuthKey(key);
  return session.save();
}

function makeService(): TelegramService {
  const service = new TelegramService(1, "hash", { sessionPath: SESSION_PATH });
  service.setSessionString(validSession);
  return service;
}

before(async () => {
  mkdirSync(TMP_DIR, { recursive: true });
  validSession = await makeSessionString();
});
after(() => rmSync(TMP_DIR, { recursive: true, force: true }));

beforeEach(() => {
  destroyed = new Set();
  getMeError = undefined;
  proto.connect = async () => {};
  proto.getMe = async () => {
    if (getMeError) throw getMeError;
    return { id: 1 };
  };
  proto.destroy = async function (this: unknown) {
    destroyed.add(this);
  };
  // Not a teardown: a disconnected GramJS client keeps its update loop running.
  proto.disconnect = async () => {};
});

afterEach(() => {
  Object.assign(proto, original);
});

describe("connect() error path destroys the client it created", () => {
  for (const errorMessage of ["AUTH_KEY_UNREGISTERED", "SESSION_REVOKED", "USER_DEACTIVATED"]) {
    it(`${errorMessage} → client destroyed and session cleared`, async () => {
      getMeError = { errorMessage };
      const service = makeService();
      let created: unknown;
      const origConnect = proto.connect as () => Promise<void>;
      proto.connect = async function (this: unknown) {
        created = this;
        return origConnect.call(this);
      };

      assert.strictEqual(await service.connect(), false);
      assert.ok(created, "connect() never built a client");
      assert.ok(destroyed.has(created), "the failed client was leaked instead of destroyed");
      const internals = service as unknown as Internals;
      assert.strictEqual(internals.client, null);
      assert.strictEqual(internals.sessionString, "");
      assert.match(service.lastError, /Session revoked/);
    });
  }

  it("network error → client destroyed, session kept for the next retry", async () => {
    getMeError = new Error("TIMEOUT");
    const service = makeService();

    assert.strictEqual(await service.connect(), false);
    assert.strictEqual(destroyed.size, 1, "the failed client was leaked instead of destroyed");
    const internals = service as unknown as Internals;
    assert.strictEqual(internals.client, null);
    assert.strictEqual(internals.sessionString, validSession);
    assert.match(service.lastError, /Network error/);
  });

  it("a destroy() that throws does not mask the recorded error", async () => {
    getMeError = { errorMessage: "AUTH_KEY_UNREGISTERED" };
    proto.destroy = async () => {
      throw new Error("sender already gone");
    };
    const service = makeService();

    assert.strictEqual(await service.connect(), false);
    assert.match(service.lastError, /Session revoked/);
  });
});

describe("disconnect() destroys the client even when the flag is already cleared", () => {
  it("after markUnhealthy() the client is still destroyed", async () => {
    const service = makeService();
    assert.strictEqual(await service.connect(), true);
    const client = (service as unknown as Internals).client;

    service.markUnhealthy("tool call exceeded its deadline");
    await service.disconnect();

    assert.ok(destroyed.has(client), "an unhealthy client was leaked by disconnect()");
    assert.strictEqual((service as unknown as Internals).client, null);
  });

  it("healthy client → destroyed exactly once", async () => {
    const service = makeService();
    await service.connect();
    await service.disconnect();
    assert.strictEqual(destroyed.size, 1);
  });
});

describe("clearSession() destroys the client instead of orphaning it", () => {
  it("connected client → destroyed", async () => {
    const service = makeService();
    await service.connect();
    const client = (service as unknown as Internals).client;

    await service.clearSession();

    assert.ok(destroyed.has(client), "clearSession() orphaned a live client");
    assert.strictEqual((service as unknown as Internals).client, null);
  });
});
