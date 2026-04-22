import assert from "node:assert";
import { rmSync } from "node:fs";
import { connect, createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  encodeMessage,
  type IpcMessage,
  type IpcToolRequest,
  type IpcToolResponse,
  parseMessages,
} from "../ipc-protocol.js";
import { handleClient } from "../master.js";

type McpServerInternal = Parameters<typeof handleClient>[1];
type TelegramServiceLike = Parameters<typeof handleClient>[2];

type ToolFn = (args: Record<string, unknown>) => Promise<unknown>;

function makeMockServer(tools: Record<string, ToolFn>): McpServerInternal {
  return {
    _registeredTools: Object.fromEntries(Object.entries(tools).map(([name, fn]) => [name, { handler: fn }])),
  } as McpServerInternal;
}

/** Minimal TelegramService stub — tool tests don't exercise login */
const stubTelegram = {} as TelegramServiceLike;

function toolRequest(id: string, tool: string, args: Record<string, unknown> = {}): IpcToolRequest {
  return { type: "tool", id, tool, args };
}

/** Send requests and collect N responses via a real socket */
async function roundtrip(
  sockPath: string,
  requests: IpcToolRequest[],
  expectedCount: number,
): Promise<IpcToolResponse[]> {
  return new Promise((resolve, reject) => {
    const client = connect(sockPath);
    const responses: IpcToolResponse[] = [];
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
        if (msg.type === "tool_response") {
          responses.push(msg);
          if (responses.length === expectedCount) {
            client.destroy();
            resolve(responses);
          }
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
    rmSync(sockPath, { force: true });
    const mock = makeMockServer(tools);
    server = createServer((socket) => handleClient(socket, mock, stubTelegram));
    return new Promise<void>((resolve) => server.listen(sockPath, resolve));
  }

  it("unknown tool → error response", async () => {
    await startServer({});
    const [res] = await roundtrip(sockPath, [toolRequest("1", "no-such-tool")], 1);
    assert.strictEqual(res.id, "1");
    assert.match(res.error ?? "", /Unknown tool/);
  });

  it("tool returns result → result in response", async () => {
    await startServer({ greet: async () => ({ hello: "world" }) });
    const [res] = await roundtrip(sockPath, [toolRequest("2", "greet")], 1);
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
    const responses = await roundtrip(sockPath, [toolRequest("3", "boom"), toolRequest("4", "ok")], 2);
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
    const responses = await roundtrip(sockPath, [toolRequest("5", "first"), toolRequest("6", "second")], 2);
    assert.strictEqual(responses[0].id, "5");
    assert.strictEqual(responses[1].id, "6");
    assert.deepStrictEqual(order, [1, 2]);
  });

  it("re-entrant drainQueue: two slow requests each processed exactly once", async () => {
    let callCount = 0;
    await startServer({
      slow: async () => {
        callCount++;
        await new Promise((r) => setTimeout(r, 20));
        return callCount;
      },
    });
    const responses = await roundtrip(sockPath, [toolRequest("7", "slow"), toolRequest("8", "slow")], 2);
    assert.strictEqual(callCount, 2);
    assert.strictEqual(responses.length, 2);
  });

  it("request without type tag → silently ignored, valid request still answered", async () => {
    await startServer({ ping: async () => "pong" });

    const result = await new Promise<"timeout" | IpcMessage>((resolve) => {
      const client = connect(sockPath);
      let buf = "";

      client.on("connect", () => {
        // Legacy-shape request without `type` is rejected at parse layer
        client.write('{"id":"legacy","tool":"ping","args":{}}\n');
        client.write(encodeMessage(toolRequest("valid", "ping")));
      });

      client.on("data", (chunk) => {
        buf += chunk.toString("utf-8");
        const { messages } = parseMessages(buf);
        for (const msg of messages) {
          client.destroy();
          resolve(msg);
        }
      });

      client.on("error", () => resolve("timeout"));
    });

    assert.ok(result !== "timeout");
    assert.strictEqual((result as IpcToolResponse).id, "valid");
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

    await new Promise<void>((resolve, reject) => {
      const c = connect(sockPath);
      c.on("connect", () => {
        c.write(encodeMessage(toolRequest("s1", "slow")));
        setTimeout(() => {
          c.destroy();
          resolve();
        }, 20);
      });
      c.on("error", reject);
    });

    assert.strictEqual(handlerStarted, true);

    const [res] = await roundtrip(sockPath, [toolRequest("f1", "fast")], 1);
    assert.strictEqual(res.result, "fast-result");
  });

  it("fragmented TCP data → messages still parsed correctly", async () => {
    await startServer({ ping: async () => "pong" });

    const response = await new Promise<IpcToolResponse>((resolve, reject) => {
      const client = connect(sockPath);
      let buf = "";

      client.on("connect", () => {
        const msg = encodeMessage(toolRequest("9", "ping"));
        client.write(msg.slice(0, 5));
        setTimeout(() => client.write(msg.slice(5)), 50);
      });

      client.on("data", (chunk) => {
        buf += chunk.toString("utf-8");
        const { messages } = parseMessages(buf);
        const response = messages.find((m) => m.type === "tool_response");
        if (response) {
          client.destroy();
          resolve(response as IpcToolResponse);
        }
      });

      client.on("error", reject);
      setTimeout(() => reject(new Error("fragment timeout")), 3000);
    });

    assert.strictEqual(response.id, "9");
    assert.strictEqual(response.result, "pong");
  });
});
