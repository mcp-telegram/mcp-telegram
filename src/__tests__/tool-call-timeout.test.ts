import assert from "node:assert";
import { connect, createServer, type Server } from "node:net";
import { after, before, describe, it } from "node:test";
import { encodeMessage, type IpcToolRequest, type IpcToolResponse, parseMessages } from "../ipc-protocol.js";
import { handleClient } from "../master.js";
import { cleanupIpcEndpoint, makeIpcEndpoint } from "./ipc-endpoint.helper.js";

/**
 * Regression tests for the second half of issue #71.
 *
 * A tool call issued on a dead MTProto client never settles. handleToolRequest holds
 * globalLock for the whole call, so one stuck call wedges *every* client's tool calls, not
 * just its own — the caller-side IPC_CALL_TIMEOUT_MS only rejects one promise and leaves the
 * master exactly as stuck. The fix bounds each call and marks the connection unhealthy so the
 * next one reconnects.
 */

type McpServerInternal = Parameters<typeof handleClient>[1];
type TelegramServiceLike = Parameters<typeof handleClient>[2];
type ToolFn = (args: Record<string, unknown>) => Promise<unknown>;

// Platform-appropriate endpoint — a filesystem path is rejected by listen() on win32.
const SOCK = makeIpcEndpoint("mcp-tool-timeout");
// Short enough to keep the suite fast, long enough that a fast tool wins the race on a
// loaded CI box.
const TIMEOUT_MS = 120;

function makeMockServer(tools: Record<string, ToolFn>): McpServerInternal {
  return {
    _registeredTools: Object.fromEntries(Object.entries(tools).map(([name, fn]) => [name, { handler: fn }])),
  } as McpServerInternal;
}

/** Records markUnhealthy() calls so we can assert the recovery hand-off fires. */
function makeSpyTelegram() {
  const reasons: string[] = [];
  return {
    reasons,
    service: { markUnhealthy: (reason: string) => reasons.push(reason) } as unknown as TelegramServiceLike,
  };
}

const never = () => new Promise<unknown>(() => {});

let server: Server;
let spy: ReturnType<typeof makeSpyTelegram>;

before(async () => {
  cleanupIpcEndpoint(SOCK);

  spy = makeSpyTelegram();
  const mcp = makeMockServer({
    // Simulates a call issued on a dead client: the promise never settles.
    "telegram-hangs": never,
    "telegram-fast": async () => ({ content: [{ type: "text", text: "ok" }] }),
  });

  server = createServer((socket) => handleClient(socket, mcp, spy.service, { toolCallTimeoutMs: TIMEOUT_MS }));
  await new Promise<void>((resolve) => server.listen(SOCK, resolve));
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  cleanupIpcEndpoint(SOCK);
});

/** Send requests on one socket and collect `expected` responses. */
function roundtrip(requests: IpcToolRequest[], expected: number, budgetMs = 5000): Promise<IpcToolResponse[]> {
  return new Promise((resolve, reject) => {
    const client = connect(SOCK);
    const responses: IpcToolResponse[] = [];
    let buf = "";

    client.on("connect", () => {
      for (const req of requests) client.write(encodeMessage(req));
    });

    client.on("data", (chunk) => {
      buf += chunk.toString("utf-8");
      const { messages, remaining } = parseMessages(buf);
      buf = remaining;
      for (const msg of messages) {
        if (msg.type !== "tool_response") continue;
        responses.push(msg);
        if (responses.length === expected) {
          client.destroy();
          resolve(responses);
        }
      }
    });

    client.on("error", reject);
    const timer = setTimeout(() => {
      client.destroy();
      reject(new Error("roundtrip budget exceeded — master never answered"));
    }, budgetMs);
    timer.unref();
  });
}

const req = (id: string, tool: string): IpcToolRequest => ({ type: "tool", id, tool, args: {} });

describe("per-call timeout in the master", () => {
  it("a hanging tool gets an error response instead of silence", async () => {
    const [res] = await roundtrip([req("1", "telegram-hangs")], 1);
    assert.strictEqual(res.id, "1");
    assert.match(String(res.error), /timed out after 120ms: telegram-hangs/);
  });

  it("marks the Telegram connection unhealthy so the next call reconnects", async () => {
    spy.reasons.length = 0;
    await roundtrip([req("2", "telegram-hangs")], 1);
    assert.deepStrictEqual(spy.reasons, ["tool call timed out: telegram-hangs"]);
  });

  it("a normal tool is unaffected and reports no error", async () => {
    const [res] = await roundtrip([req("3", "telegram-fast")], 1);
    assert.strictEqual(res.error, undefined);
    assert.deepStrictEqual(res.result, { content: [{ type: "text", text: "ok" }] });
  });

  it("releases globalLock — a hung call must not wedge later calls on the same socket", async () => {
    // The core of #71: pre-fix the second request would never be answered, because the
    // first still holds globalLock. Both must come back, in order.
    const responses = await roundtrip([req("4", "telegram-hangs"), req("5", "telegram-fast")], 2);
    assert.deepStrictEqual(
      responses.map((r) => r.id),
      ["4", "5"],
    );
    assert.match(String(responses[0].error), /timed out/);
    assert.strictEqual(responses[1].error, undefined, "a later call must still succeed");
  });

  it("releases globalLock across clients — a hung call on socket A must not wedge socket B", async () => {
    // globalLock is process-wide, so the cross-client case is the one that actually took
    // production down: one wedged client starved every other MCP client of the daemon.
    const hung = roundtrip([req("6", "telegram-hangs")], 1);
    const other = roundtrip([req("7", "telegram-fast")], 1);
    const [hungRes, otherRes] = await Promise.all([hung, other]);
    assert.match(String(hungRes[0].error), /timed out/);
    assert.strictEqual(otherRes[0].error, undefined);
  });
});
