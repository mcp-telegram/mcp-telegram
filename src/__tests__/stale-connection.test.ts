import assert from "node:assert";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { TelegramService } from "../telegram-client.js";

/**
 * Regression tests for issue #71 — "Master daemon never recovers from a dropped MTProto
 * connection".
 *
 * `TelegramService.connected` is a sticky boolean: set in connect(), cleared only by
 * disconnect()/clearSession()/logOut(). When GramJS exhausts its `connectionRetries` budget
 * and the sender dies, the flag stays true, so ensureConnected() reports a healthy client and
 * every tool call is issued on a dead one and never settles.
 *
 * The fix consults GramJS's own `get connected()` (`_sender && _sender.isConnected()`) instead
 * of trusting the cached flag. These tests pin that behaviour; each was verified RED against
 * the pre-fix implementation.
 */

const TMP_DIR = join(tmpdir(), `mcp-telegram-stale-conn-test-${process.pid}`);
// Deliberately never created: connect() must bail at loadSession() so no test touches the
// network. That still exercises everything before it — crucially dropDeadClient().
const SESSION_PATH = join(TMP_DIR, "session");

/**
 * Stand-in for GramJS's TelegramClient. `connected` mirrors the real getter, which returns
 * `_sender && _sender.isConnected()` — hence `undefined` when there is no sender at all.
 */
type FakeClient = {
  connected: boolean | undefined;
  destroyed: boolean;
  destroy: () => Promise<void>;
};

function makeFakeClient(connected: boolean | undefined): FakeClient {
  const client: FakeClient = {
    connected,
    destroyed: false,
    destroy: async () => {
      client.destroyed = true;
    },
  };
  return client;
}

type ServiceInternals = {
  client: FakeClient | null;
  connected: boolean;
  sessionString: string;
};

function makeService(): TelegramService {
  return new TelegramService(1, "hash", { sessionPath: SESSION_PATH });
}

/** Reproduce the wedged state: our flag says connected, the transport underneath is `state`. */
function primeWith(service: TelegramService, state: boolean | undefined): FakeClient {
  const client = makeFakeClient(state);
  const internals = service as unknown as ServiceInternals;
  internals.client = client;
  internals.connected = true;
  internals.sessionString = "";
  return client;
}

before(() => mkdirSync(TMP_DIR, { recursive: true }));
after(() => rmSync(TMP_DIR, { recursive: true, force: true }));
beforeEach(() => {
  if (existsSync(SESSION_PATH)) rmSync(SESSION_PATH);
});

describe("isConnected() reflects the live transport, not the cached flag", () => {
  it("live sender → true", () => {
    const service = makeService();
    primeWith(service, true);
    assert.strictEqual(service.isConnected(), true);
  });

  it("dead sender (connected === false) → false even though the flag says connected", () => {
    const service = makeService();
    primeWith(service, false);
    assert.strictEqual(service.isConnected(), false, "sticky flag must not mask a dead sender");
  });

  it("unknown state (connected === undefined) → treated as alive, NOT dead", () => {
    // Deliberate: `undefined` is what a GramJS version without the getter would report, and
    // also what a client with no sender yet reports. Treating it as dead would rebuild the
    // client on every call after such an upgrade. Unknown must degrade to the old behaviour,
    // never to a reconnect storm. Real dead transports report an explicit `false`.
    const service = makeService();
    primeWith(service, undefined);
    assert.strictEqual(service.isConnected(), true);
  });

  it("no client at all → false, and isTransportDead() must not fire on a null client", () => {
    const service = makeService();
    assert.strictEqual(service.isConnected(), false);
  });
});

describe("ensureConnected() re-validates instead of trusting the flag", () => {
  it("live sender → short-circuits to true without rebuilding", async () => {
    const service = makeService();
    const client = primeWith(service, true);

    assert.strictEqual(await service.ensureConnected(), true);
    assert.strictEqual(client.destroyed, false, "a healthy client must not be torn down");
    assert.strictEqual((service as unknown as ServiceInternals).client, client);
  });

  it("dead sender → drops the stale client and attempts a rebuild", async () => {
    const service = makeService();
    const client = primeWith(service, false);

    // No session file exists, so the rebuild bails at loadSession() and returns false —
    // but only AFTER the stale client has been dropped. Pre-fix this returned true here.
    assert.strictEqual(await service.ensureConnected(), false);
    assert.strictEqual(client.destroyed, true, "dead client must be destroyed, not leaked");
    assert.strictEqual((service as unknown as ServiceInternals).client, null);
    assert.strictEqual((service as unknown as ServiceInternals).connected, false);
  });

  it("unknown state (undefined) → short-circuits, never rebuilds", async () => {
    // Guards the reconnect-storm regression: mocks and future GramJS versions that don't
    // expose `connected` must not be torn down on every call.
    const service = makeService();
    const client = primeWith(service, undefined);

    assert.strictEqual(await service.ensureConnected(), true);
    assert.strictEqual(client.destroyed, false);
  });

  it("a destroy() that throws must not block the rebuild", async () => {
    const service = makeService();
    const client = primeWith(service, false);
    client.destroy = async () => {
      throw new Error("sender already gone");
    };

    await assert.doesNotReject(() => service.ensureConnected());
    assert.strictEqual((service as unknown as ServiceInternals).client, null);
  });
});

describe("connect() does not short-circuit on a stale flag", () => {
  it("dead sender → tears down and re-runs the connect path", async () => {
    const service = makeService();
    const client = primeWith(service, false);

    assert.strictEqual(await service.connect(), false);
    assert.strictEqual(client.destroyed, true);
    assert.strictEqual((service as unknown as ServiceInternals).client, null);
  });

  it("live sender → still short-circuits (no reconnect storm on every call)", async () => {
    const service = makeService();
    const client = primeWith(service, true);

    assert.strictEqual(await service.connect(), true);
    assert.strictEqual(client.destroyed, false);
  });
});

describe("markUnhealthy()", () => {
  it("clears the flag so the next ensureConnected() revalidates", async () => {
    const service = makeService();
    // Transport still *looks* alive — this is the case the liveness probe cannot catch,
    // e.g. a call that hung past its budget while the sender reports connected.
    const client = primeWith(service, true);

    service.markUnhealthy("tool call timed out: telegram-read-messages");
    assert.strictEqual(service.isConnected(), false);

    assert.strictEqual(await service.ensureConnected(), false);
    assert.strictEqual(client.destroyed, true, "revalidation must rebuild, not reuse");
  });

  it("records a diagnosable reason in lastError", () => {
    const service = makeService();
    primeWith(service, true);
    service.markUnhealthy("tool call timed out: telegram-send-message");
    assert.match(service.lastError, /tool call timed out: telegram-send-message/);
  });

  it("is a no-op when nothing was connected (must not clobber a real lastError)", () => {
    const service = makeService();
    service.lastError = "Session revoked. Run telegram-login to re-authenticate.";
    service.markUnhealthy("spurious");
    assert.match(service.lastError, /Session revoked/);
  });
});
