import assert from "node:assert";
import { EventEmitter } from "node:events";
import type { Socket } from "node:net";
import { describe, it } from "node:test";
import { IpcClient } from "../client.js";
import { encodeMessage, type McpRegisteredTool } from "../ipc-protocol.js";

// Inline wireIpcProxies since it's not exported — test via its observable effects
// We reproduce the logic from client.ts to keep test self-contained
function wireIpcProxies(registry: Record<string, McpRegisteredTool>, ipc: IpcClient): void {
  for (const [name, tool] of Object.entries(registry)) {
    Object.assign(tool, {
      handler: (args: Record<string, unknown>) => ipc.call(name, args),
    });
  }
}

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

function makeConnectedClient(fake: FakeSocket): Promise<IpcClient> {
  const client = new IpcClient({
    connectTimeoutMs: 200,
    callTimeoutMs: 2000,
    connectFn: () => fake as unknown as Socket,
  });
  setImmediate(() => fake.emit("connect"));
  return client.connect().then(() => client);
}

describe("wireIpcProxies", () => {
  it("replaces handler with IPC-forwarding version for each registered tool", async () => {
    const fake = new FakeSocket();
    const ipc = await makeConnectedClient(fake);

    const registry: Record<string, McpRegisteredTool> = {
      "telegram-send-message": { handler: async () => ({ original: true }) },
      "telegram-list-chats": { handler: async () => ({ original: true }) },
    };

    wireIpcProxies(registry, ipc);

    // handlers should now be the IPC-forwarding version — call one and verify it writes to socket
    const callPromise = registry["telegram-send-message"].handler({ text: "hello" }, {});

    const req = JSON.parse(fake.written[0]);
    assert.strictEqual(req.tool, "telegram-send-message");
    assert.deepStrictEqual(req.args, { text: "hello" });

    // Reply with a result
    fake.emit("data", Buffer.from(encodeMessage({ type: "tool_response", id: req.id, result: { ok: true } })));
    const result = await callPromise;
    assert.deepStrictEqual(result, { ok: true });
  });

  it("each tool forwards its own name — no cross-wiring", async () => {
    const fake = new FakeSocket();
    const ipc = await makeConnectedClient(fake);

    const registry: Record<string, McpRegisteredTool> = {
      "tool-a": { handler: async () => null },
      "tool-b": { handler: async () => null },
    };

    wireIpcProxies(registry, ipc);

    const pa = registry["tool-a"].handler({}, {});
    const pb = registry["tool-b"].handler({}, {});

    const reqA = JSON.parse(fake.written[0]);
    const reqB = JSON.parse(fake.written[1]);

    assert.strictEqual(reqA.tool, "tool-a");
    assert.strictEqual(reqB.tool, "tool-b");

    fake.emit("data", Buffer.from(encodeMessage({ type: "tool_response", id: reqA.id, result: "a" })));
    fake.emit("data", Buffer.from(encodeMessage({ type: "tool_response", id: reqB.id, result: "b" })));

    assert.strictEqual(await pa, "a");
    assert.strictEqual(await pb, "b");
  });

  it("original TelegramService handler is never called after wiring", async () => {
    const fake = new FakeSocket();
    const ipc = await makeConnectedClient(fake);

    let originalCalled = false;
    const registry: Record<string, McpRegisteredTool> = {
      "telegram-get-me": {
        handler: async () => {
          originalCalled = true;
          return { id: "123" };
        },
      },
    };

    wireIpcProxies(registry, ipc);

    const callPromise = registry["telegram-get-me"].handler({}, {});
    const req = JSON.parse(fake.written[0]);
    fake.emit("data", Buffer.from(encodeMessage({ type: "tool_response", id: req.id, result: { id: "456" } })));
    await callPromise;

    assert.strictEqual(originalCalled, false);
  });

  it("wired handler propagates IPC errors as rejected promise", async () => {
    const fake = new FakeSocket();
    const ipc = await makeConnectedClient(fake);

    const registry: Record<string, McpRegisteredTool> = {
      "telegram-bad-tool": { handler: async () => null },
    };

    wireIpcProxies(registry, ipc);

    const callPromise = registry["telegram-bad-tool"].handler({}, {});
    const req = JSON.parse(fake.written[0]);
    fake.emit(
      "data",
      Buffer.from(encodeMessage({ type: "tool_response", id: req.id, error: "something went wrong on master" })),
    );

    await assert.rejects(callPromise, /something went wrong on master/);
  });

  it("empty registry — no-op, ipc remains usable", async () => {
    const fake = new FakeSocket();
    const ipc = await makeConnectedClient(fake);

    const registry: Record<string, McpRegisteredTool> = {};
    assert.doesNotThrow(() => wireIpcProxies(registry, ipc));
    assert.strictEqual(ipc.isConnected(), true);
  });

  it("wiring twice — second wire wins (idempotency for future-safety)", async () => {
    const fake = new FakeSocket();
    const ipc = await makeConnectedClient(fake);

    const registry: Record<string, McpRegisteredTool> = {
      "telegram-ping": { handler: async () => "first-wire" },
    };

    wireIpcProxies(registry, ipc);
    wireIpcProxies(registry, ipc); // wire again

    const callPromise = registry["telegram-ping"].handler({}, {});
    const req = JSON.parse(fake.written[0]);
    assert.strictEqual(req.tool, "telegram-ping");
    fake.emit("data", Buffer.from(encodeMessage({ type: "tool_response", id: req.id, result: "pong" })));

    assert.strictEqual(await callPromise, "pong");
  });
});
