import assert from "node:assert";
import { EventEmitter } from "node:events";
import type { Socket } from "node:net";
import { describe, it } from "node:test";
import { IpcClient } from "../client.js";
import { encodeMessage, type IpcToolResponse } from "../ipc-protocol.js";

/** Fake Socket that behaves like net.Socket but is fully controllable */
class FakeSocket extends EventEmitter {
  written: string[] = [];
  destroyed = false;

  write(data: string) {
    this.written.push(data);
    return true;
  }

  destroy() {
    this.destroyed = true;
    this.emit("close");
  }
}

function makeClient(fake: FakeSocket, opts?: { connectTimeoutMs?: number; callTimeoutMs?: number }) {
  return new IpcClient({
    connectTimeoutMs: opts?.connectTimeoutMs ?? 200,
    callTimeoutMs: opts?.callTimeoutMs ?? 200,
    connectFn: () => fake as unknown as Socket,
  });
}

describe("IpcClient.connect()", () => {
  it("socket emits connect → returns true, isConnected() = true", async () => {
    const fake = new FakeSocket();
    const client = makeClient(fake);
    setImmediate(() => fake.emit("connect"));
    assert.strictEqual(await client.connect(), true);
    assert.strictEqual(client.isConnected(), true);
  });

  it("socket emits error → returns false", async () => {
    const fake = new FakeSocket();
    const client = makeClient(fake);
    setImmediate(() => fake.emit("error", new Error("ECONNREFUSED")));
    assert.strictEqual(await client.connect(), false);
  });

  it("socket is silent → connect timeout → returns false", async () => {
    const fake = new FakeSocket();
    const client = makeClient(fake, { connectTimeoutMs: 50 });
    // fake never emits "connect" or "error"
    assert.strictEqual(await client.connect(), false);
  });
});

describe("IpcClient.call()", () => {
  it("throws if not connected", async () => {
    const fake = new FakeSocket();
    const client = makeClient(fake);
    await assert.rejects(() => client.call("foo", {}), /IPC client not connected/);
  });

  it("sends request and resolves with result", async () => {
    const fake = new FakeSocket();
    const client = makeClient(fake, { callTimeoutMs: 2000 });
    setImmediate(() => fake.emit("connect"));
    await client.connect();

    const callPromise = client.call("my-tool", { x: 1 });

    // Extract the id from the written message and reply
    const req = JSON.parse(fake.written[0]);
    const response: IpcToolResponse = { type: "tool_response", id: req.id, result: { ok: true } };
    setImmediate(() => fake.emit("data", Buffer.from(encodeMessage(response))));

    const result = await callPromise;
    assert.deepStrictEqual(result, { ok: true });
  });

  it("response with error → rejects", async () => {
    const fake = new FakeSocket();
    const client = makeClient(fake, { callTimeoutMs: 2000 });
    setImmediate(() => fake.emit("connect"));
    await client.connect();

    const callPromise = client.call("bad-tool", {});
    const req = JSON.parse(fake.written[0]);
    const response: IpcToolResponse = { type: "tool_response", id: req.id, error: "tool blew up" };
    setImmediate(() => fake.emit("data", Buffer.from(encodeMessage(response))));

    await assert.rejects(callPromise, /tool blew up/);
  });

  it("no response within callTimeoutMs → rejects with timeout error", async () => {
    const fake = new FakeSocket();
    const client = makeClient(fake, { callTimeoutMs: 50 });
    setImmediate(() => fake.emit("connect"));
    await client.connect();

    await assert.rejects(() => client.call("slow-tool", {}), /IPC call timeout: slow-tool/);
  });

  it("socket closes while call pending → rejects with connection closed", async () => {
    const fake = new FakeSocket();
    const client = makeClient(fake, { callTimeoutMs: 2000 });
    setImmediate(() => fake.emit("connect"));
    await client.connect();

    const callPromise = client.call("tool", {});
    // Use destroy() to trigger close via the same path as real socket disconnection
    setImmediate(() => fake.destroy());

    await assert.rejects(callPromise, /IPC connection closed/);
  });

  it("parallel calls — out-of-order responses routed correctly by id", async () => {
    const fake = new FakeSocket();
    const client = makeClient(fake, { callTimeoutMs: 2000 });
    setImmediate(() => fake.emit("connect"));
    await client.connect();

    const p1 = client.call("tool-a", {});
    const p2 = client.call("tool-b", {});

    const req1 = JSON.parse(fake.written[0]);
    const req2 = JSON.parse(fake.written[1]);

    // Reply in reverse order
    setImmediate(() => {
      fake.emit("data", Buffer.from(encodeMessage({ type: "tool_response", id: req2.id, result: "b-result" })));
      fake.emit("data", Buffer.from(encodeMessage({ type: "tool_response", id: req1.id, result: "a-result" })));
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    assert.strictEqual(r1, "a-result");
    assert.strictEqual(r2, "b-result");
  });

  it("fragmented response data is buffered and parsed correctly", async () => {
    const fake = new FakeSocket();
    const client = makeClient(fake, { callTimeoutMs: 2000 });
    setImmediate(() => fake.emit("connect"));
    await client.connect();

    const callPromise = client.call("ping", {});
    const req = JSON.parse(fake.written[0]);
    const full = encodeMessage({ type: "tool_response", id: req.id, result: "pong" });

    setImmediate(() => {
      fake.emit("data", Buffer.from(full.slice(0, 5)));
      setTimeout(() => fake.emit("data", Buffer.from(full.slice(5))), 50);
    });

    assert.strictEqual(await callPromise, "pong");
  });
});

describe("IpcClient.destroy()", () => {
  it("rejects all pending calls and marks disconnected", async () => {
    const fake = new FakeSocket();
    const client = makeClient(fake, { callTimeoutMs: 5000 });
    setImmediate(() => fake.emit("connect"));
    await client.connect();

    const p1 = client.call("a", {});
    const p2 = client.call("b", {});

    client.destroy();

    await assert.rejects(p1, /IPC client destroyed/);
    await assert.rejects(p2, /IPC client destroyed/);
    assert.strictEqual(client.isConnected(), false);
    assert.strictEqual(fake.destroyed, true);
  });

  it("call() after destroy() → throws not connected", async () => {
    const fake = new FakeSocket();
    const client = makeClient(fake);
    setImmediate(() => fake.emit("connect"));
    await client.connect();

    client.destroy();

    await assert.rejects(() => client.call("tool", {}), /IPC client not connected/);
  });
});

describe("IpcClient.loginFlow()", () => {
  it("sends login_start and resolves on login_done success", async () => {
    const fake = new FakeSocket();
    const client = makeClient(fake);
    setImmediate(() => fake.emit("connect"));
    await client.connect();

    const qrUrls: string[] = [];
    const promise = client.loginFlow((url) => qrUrls.push(url));

    const sent = JSON.parse(fake.written[0]);
    assert.strictEqual(sent.type, "login_start");
    const id = sent.id;

    setImmediate(() => {
      fake.emit("data", Buffer.from(encodeMessage({ type: "login_qr", id, url: "tg://login?token=x" })));
      fake.emit("data", Buffer.from(encodeMessage({ type: "login_qr", id, url: "tg://login?token=y" })));
      fake.emit("data", Buffer.from(encodeMessage({ type: "login_done", id, success: true, username: "alex" })));
    });

    const result = await promise;
    assert.deepStrictEqual(qrUrls, ["tg://login?token=x", "tg://login?token=y"]);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.username, "alex");
  });

  it("resolves on login_done failure", async () => {
    const fake = new FakeSocket();
    const client = makeClient(fake);
    setImmediate(() => fake.emit("connect"));
    await client.connect();

    const promise = client.loginFlow(() => {});
    const sent = JSON.parse(fake.written[0]);

    setImmediate(() => {
      fake.emit(
        "data",
        Buffer.from(encodeMessage({ type: "login_done", id: sent.id, success: false, error: "2FA required" })),
      );
    });

    const result = await promise;
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, "2FA required");
  });

  it("rejects with timeout if login_done never arrives", async () => {
    const fake = new FakeSocket();
    const client = new IpcClient({
      connectTimeoutMs: 200,
      callTimeoutMs: 2000,
      loginTimeoutMs: 50,
      connectFn: () => fake as unknown as Socket,
    });
    setImmediate(() => fake.emit("connect"));
    await client.connect();

    await assert.rejects(() => client.loginFlow(() => {}), /Login flow timeout/);
  });

  it("pending login rejected when socket closes", async () => {
    const fake = new FakeSocket();
    const client = makeClient(fake);
    setImmediate(() => fake.emit("connect"));
    await client.connect();

    const promise = client.loginFlow(() => {});
    setImmediate(() => fake.destroy());

    await assert.rejects(promise, /IPC connection closed/);
  });

  it("throws if not connected", async () => {
    const fake = new FakeSocket();
    const client = makeClient(fake);
    await assert.rejects(() => client.loginFlow(() => {}), /IPC client not connected/);
  });
});

describe("IpcClient onDisconnect callback", () => {
  it("fires when socket closes unexpectedly (master died)", async () => {
    const fake = new FakeSocket();
    const client = makeClient(fake);
    setImmediate(() => fake.emit("connect"));
    await client.connect();

    let fired = 0;
    client.setOnDisconnect(() => fired++);

    fake.destroy(); // simulate master disconnect

    assert.strictEqual(fired, 1);
  });

  it("does NOT fire when client.destroy() was called explicitly", async () => {
    const fake = new FakeSocket();
    const client = makeClient(fake);
    setImmediate(() => fake.emit("connect"));
    await client.connect();

    let fired = 0;
    client.setOnDisconnect(() => fired++);

    client.destroy(); // explicit teardown — no callback

    assert.strictEqual(fired, 0);
  });

  it("does NOT fire when close happens before setOnDisconnect is wired", async () => {
    // Simulates the retry loop: connect attempts that close before the caller wires the callback.
    const fake = new FakeSocket();
    const client = makeClient(fake);
    setImmediate(() => fake.emit("connect"));
    await client.connect();

    fake.destroy(); // close before any callback was registered

    // Subsequent registration must not retroactively fire
    let fired = 0;
    client.setOnDisconnect(() => fired++);
    assert.strictEqual(fired, 0);
  });
});
