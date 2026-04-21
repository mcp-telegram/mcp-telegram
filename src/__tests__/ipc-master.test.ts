import assert from "node:assert";
import { rmSync } from "node:fs";
import { connect, createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { encodeMessage, type IpcResponse, parseMessages } from "../ipc-protocol.js";
import { handleClient } from "../master.js";

// Re-export the internal type shape so we can build a typed mock
type McpServerInternal = Parameters<typeof handleClient>[1];

type ToolFn = (args: Record<string, unknown>) => Promise<unknown>;

function makeMockServer(tools: Record<string, ToolFn>): McpServerInternal {
  return {
    _registeredTools: Object.fromEntries(Object.entries(tools).map(([name, fn]) => [name, { handler: fn }])),
  } as McpServerInternal;
}

/** Send requests and collect N responses via a real socket */
async function roundtrip(
  sockPath: string,
  requests: { id: string; tool: string; args: Record<string, unknown> }[],
  expectedCount: number,
): Promise<IpcResponse[]> {
  return new Promise((resolve, reject) => {
    const client = connect(sockPath);
    const responses: IpcResponse[] = [];
    let buf = "";

    client.on("connect", () => {
      for (const req of requests) {
        client.write(encodeMessage(req));
      }
    });

    client.on("data", (chunk) => {
      buf += chunk.toString("utf-8");
      const { messages, remaining } = parseMessages(buf);
      buf = remaining;
      for (const msg of messages) {
        responses.push(msg as IpcResponse);
        if (responses.length === expectedCount) {
          client.destroy();
          resolve(responses);
        }
      }
    });

    client.on("error", reject);
    setTimeout(() => reject(new Error("roundtrip timeout")), 3000);
  });
}

describe("handleClient / drainQueue", () => {
  let server: Server;
  let sockPath: string;

  before(async () => {
    sockPath = join(tmpdir(), `mcp-master-test-${process.pid}-${Date.now()}.sock`);
  });

  after(() => {
    server?.close();
  });

  function startServer(tools: Record<string, ToolFn>) {
    server?.close();
    // Guard against stale socket from a crashed previous test
    rmSync(sockPath, { force: true });
    const mock = makeMockServer(tools);
    server = createServer((socket) => handleClient(socket, mock));
    return new Promise<void>((resolve) => server.listen(sockPath, resolve));
  }

  it("unknown tool → error response", async () => {
    await startServer({});
    const [res] = await roundtrip(sockPath, [{ id: "1", tool: "no-such-tool", args: {} }], 1);
    assert.strictEqual(res.id, "1");
    assert.match(res.error ?? "", /Unknown tool/);
  });

  it("tool returns result → result in response", async () => {
    await startServer({ greet: async () => ({ hello: "world" }) });
    const [res] = await roundtrip(sockPath, [{ id: "2", tool: "greet", args: {} }], 1);
    assert.strictEqual(res.id, "2");
    assert.deepStrictEqual(res.result, { hello: "world" });
    assert.strictEqual(res.error, undefined);
  });

  it("tool throws → error response, queue continues", async () => {
    await startServer({
      boom: async () => {
        throw new Error("exploded");
      },
      ok: async () => "fine",
    });
    const responses = await roundtrip(
      sockPath,
      [
        { id: "3", tool: "boom", args: {} },
        { id: "4", tool: "ok", args: {} },
      ],
      2,
    );
    const byId = Object.fromEntries(responses.map((r) => [r.id, r]));
    assert.strictEqual(byId["3"].error, "exploded");
    assert.strictEqual(byId["4"].result, "fine");
  });

  it("two requests → FIFO order preserved", async () => {
    const order: number[] = [];
    await startServer({
      first: async () => {
        order.push(1);
        return 1;
      },
      second: async () => {
        order.push(2);
        return 2;
      },
    });
    const responses = await roundtrip(
      sockPath,
      [
        { id: "5", tool: "first", args: {} },
        { id: "6", tool: "second", args: {} },
      ],
      2,
    );
    assert.strictEqual(responses[0].id, "5");
    assert.strictEqual(responses[1].id, "6");
    assert.deepStrictEqual(order, [1, 2]);
  });

  it("re-entrant drainQueue: second request arrives during async handler → processed exactly once each", async () => {
    let callCount = 0;
    await startServer({
      slow: async () => {
        callCount++;
        await new Promise((r) => setTimeout(r, 20));
        return callCount;
      },
    });
    const responses = await roundtrip(
      sockPath,
      [
        { id: "7", tool: "slow", args: {} },
        { id: "8", tool: "slow", args: {} },
      ],
      2,
    );
    assert.strictEqual(callCount, 2);
    assert.strictEqual(responses.length, 2);
  });

  it("request missing id or tool → silently ignored, no response (client gets nothing)", async () => {
    await startServer({ ping: async () => "pong" });

    const result = await new Promise<"timeout" | IpcResponse>((resolve) => {
      const client = connect(sockPath);
      let buf = "";

      client.on("connect", () => {
        // Invalid request without id/tool — should be dropped
        client.write('{"args":{}}\n');
        // Follow with a valid request to confirm the connection still works
        client.write(encodeMessage({ id: "valid", tool: "ping", args: {} }));
      });

      client.on("data", (chunk) => {
        buf += chunk.toString("utf-8");
        const { messages } = parseMessages(buf);
        for (const msg of messages) {
          client.destroy();
          resolve(msg as IpcResponse);
        }
      });

      client.on("error", () => resolve("timeout"));
    });

    // Only the valid request should get a response
    assert.ok(result !== "timeout");
    assert.strictEqual((result as IpcResponse).id, "valid");
  });

  it("client disconnects during slow handler → no crash, other clients unaffected", async () => {
    let handlerStarted = false;
    await startServer({
      slow: async () => {
        handlerStarted = true;
        await new Promise((r) => setTimeout(r, 100));
        return "done";
      },
      fast: async () => "fast-result",
    });

    // Client 1: connects, sends slow request, then disconnects immediately
    await new Promise<void>((resolve, reject) => {
      const c = connect(sockPath);
      c.on("connect", () => {
        c.write(encodeMessage({ id: "s1", tool: "slow", args: {} }));
        // Disconnect while handler is running
        setTimeout(() => {
          c.destroy();
          resolve();
        }, 20);
      });
      c.on("error", reject);
    });

    assert.strictEqual(handlerStarted, true);

    // Client 2: server must still be functional after client 1 disconnected mid-handler
    const [res] = await roundtrip(sockPath, [{ id: "f1", tool: "fast", args: {} }], 1);
    assert.strictEqual(res.result, "fast-result");
  });

  it("fragmented TCP data → messages still parsed correctly", async () => {
    await startServer({ ping: async () => "pong" });

    const response = await new Promise<IpcResponse>((resolve, reject) => {
      const client = connect(sockPath);
      let buf = "";

      client.on("connect", () => {
        const msg = encodeMessage({ id: "9", tool: "ping", args: {} });
        client.write(msg.slice(0, 5));
        setTimeout(() => client.write(msg.slice(5)), 50);
      });

      client.on("data", (chunk) => {
        buf += chunk.toString("utf-8");
        const { messages } = parseMessages(buf);
        if (messages.length > 0) {
          client.destroy();
          resolve(messages[0] as IpcResponse);
        }
      });

      client.on("error", reject);
      setTimeout(() => reject(new Error("fragment timeout")), 3000);
    });

    assert.strictEqual(response.id, "9");
    assert.strictEqual(response.result, "pong");
  });
});
