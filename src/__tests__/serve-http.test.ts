import assert from "node:assert";
import { mkdirSync, rmSync, statSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { httpTokenPath, loadOrCreateToken, startHttp } from "../http.js";
import type { McpServerInternal } from "../ipc-protocol.js";
import { type OwnerHandle, startOwner } from "../master.js";
import { parseHttpOptions } from "../serve.js";
import type { TelegramService } from "../telegram-client.js";

// Every TelegramService method is an async no-op: no network, no real account.
const stubTelegram = new Proxy({}, { get: () => async () => ({}) }) as unknown as TelegramService;

const INIT = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } },
};

describe("serve HTTP endpoint", () => {
  let owner: OwnerHandle;
  let registry: McpServerInternal;
  let http: Server;
  let sessionDir: string;
  let url: string;
  let token: string;
  const prevSessionPath = process.env.TELEGRAM_SESSION_PATH;

  before(async () => {
    sessionDir = join(tmpdir(), `serve-http-test-${process.pid}-${Date.now()}`);
    mkdirSync(sessionDir, { recursive: true });
    process.env.TELEGRAM_SESSION_PATH = join(sessionDir, "session");
    owner = await startOwner(stubTelegram, "test", { label: "serve-http-test" });
    registry = owner.server as unknown as McpServerInternal;
    http = await startHttp(registry, stubTelegram, "test", { host: "127.0.0.1", port: 0 });
    url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`;
    token = loadOrCreateToken(httpTokenPath());
  });

  after(async () => {
    await new Promise<void>((resolve) => http.close(() => resolve()));
    await new Promise<void>((resolve) => owner.srv.close(() => resolve()));
    rmSync(sessionDir, { recursive: true, force: true });
    if (prevSessionPath === undefined) delete process.env.TELEGRAM_SESSION_PATH;
    else process.env.TELEGRAM_SESSION_PATH = prevSessionPath;
  });

  async function connectClient(): Promise<Client> {
    const client = new Client({ name: "test", version: "0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    );
    return client;
  }

  function post(headers: Record<string, string>, path = "/mcp") {
    return fetch(url.replace("/mcp", path), {
      method: "POST",
      headers: { Accept: "application/json, text/event-stream", "Content-Type": "application/json", ...headers },
      body: JSON.stringify(INIT),
    });
  }

  it("creates the bearer token next to the session and reuses it", () => {
    assert.strictEqual(httpTokenPath(), join(sessionDir, "http-token"));
    assert.strictEqual(loadOrCreateToken(httpTokenPath()), token, "token is reused, not regenerated");
  });

  it("writes the token with mode 0600", {
    skip: process.platform === "win32" ? "POSIX-only: Windows ignores file modes" : false,
  }, () => {
    assert.strictEqual(statSync(httpTokenPath()).mode & 0o777, 0o600);
  });

  it("lists the same tools the owner registered", async () => {
    const client = await connectClient();
    try {
      const { tools } = await client.listTools();
      assert.deepStrictEqual(tools.map((t) => t.name).sort(), Object.keys(registry._registeredTools).sort());
    } finally {
      await client.close();
    }
  });

  it("executes calls on the owner's registry", async () => {
    const tool = registry._registeredTools["telegram-status"];
    const original = tool.handler;
    let calls = 0;
    tool.handler = async () => {
      calls++;
      return { content: [{ type: "text", text: "from-owner" }] };
    };
    const client = await connectClient();
    try {
      const result = await client.callTool({ name: "telegram-status", arguments: {} });
      assert.deepStrictEqual(result.content, [{ type: "text", text: "from-owner" }]);
      assert.strictEqual(calls, 1);
    } finally {
      tool.handler = original;
      await client.close();
    }
  });

  it("returns owner failures as tool errors", async () => {
    const tool = registry._registeredTools["telegram-status"];
    const original = tool.handler;
    tool.handler = async () => {
      throw new Error("boom from owner");
    };
    const client = await connectClient();
    try {
      const result = await client.callTool({ name: "telegram-status", arguments: {} });
      assert.strictEqual(result.isError, true);
      assert.match(JSON.stringify(result.content), /boom from owner/);
    } finally {
      tool.handler = original;
      await client.close();
    }
  });

  it("serializes concurrent calls through the owner's global lock, like IPC clients", async () => {
    const tool = registry._registeredTools["telegram-status"];
    const original = tool.handler;
    let running = 0;
    let peak = 0;
    tool.handler = async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 50));
      running--;
      return { content: [{ type: "text", text: "ok" }] };
    };
    const clients = await Promise.all([connectClient(), connectClient(), connectClient()]);
    try {
      await Promise.all(clients.map((c) => c.callTool({ name: "telegram-status", arguments: {} })));
      assert.strictEqual(peak, 1);
    } finally {
      tool.handler = original;
      await Promise.all(clients.map((c) => c.close()));
    }
  });

  it("rejects a missing or wrong bearer token", async () => {
    assert.strictEqual((await post({})).status, 401);
    assert.strictEqual((await post({ Authorization: "Bearer wrong" })).status, 401);
  });

  it("rejects a non-loopback Host (DNS rebinding)", async () => {
    // fetch() forbids overriding Host, so send the raw request through node:http.
    const { request } = await import("node:http");
    const status = await new Promise<number>((resolve, rejectReq) => {
      const req = request(
        url,
        {
          method: "POST",
          headers: {
            Host: "attacker.example",
            Authorization: `Bearer ${token}`,
            Accept: "application/json, text/event-stream",
            "Content-Type": "application/json",
          },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on("error", rejectReq);
      req.end(JSON.stringify(INIT));
    });
    assert.strictEqual(status, 403);
  });

  it("rejects any browser Origin, loopback ones included", async () => {
    for (const origin of ["https://attacker.example", "http://localhost:3000", "null"]) {
      assert.strictEqual((await post({ Authorization: `Bearer ${token}`, Origin: origin })).status, 403, origin);
    }
  });

  it("answers 404 outside /mcp", async () => {
    assert.strictEqual((await post({ Authorization: `Bearer ${token}` }, "/other")).status, 404);
  });

  it("accepts an authorized request", async () => {
    assert.strictEqual((await post({ Authorization: `Bearer ${token}` })).status, 200);
  });

  it("refuses to bind a non-loopback address", async () => {
    await assert.rejects(startHttp(registry, stubTelegram, "test", { host: "0.0.0.0", port: 0 }), /loopback only/);
  });
});

describe("parseHttpOptions", () => {
  it("stays IPC-only when no port is given", () => {
    assert.strictEqual(parseHttpOptions([], {}), undefined);
  });

  it("reads --http-port and --http-host, in both flag forms", () => {
    assert.deepStrictEqual(parseHttpOptions(["--http-port", "8933"], {}), { host: "127.0.0.1", port: 8933 });
    assert.deepStrictEqual(parseHttpOptions(["--http-port=8933", "--http-host=::1"], {}), { host: "::1", port: 8933 });
  });

  it("falls back to MCP_TELEGRAM_HTTP_PORT and MCP_TELEGRAM_HTTP_HOST", () => {
    assert.deepStrictEqual(
      parseHttpOptions([], { MCP_TELEGRAM_HTTP_PORT: "9000", MCP_TELEGRAM_HTTP_HOST: "localhost" }),
      { host: "localhost", port: 9000 },
    );
  });

  it("rejects an invalid port", () => {
    assert.throws(() => parseHttpOptions(["--http-port", "http"], {}), /Invalid HTTP port/);
    assert.throws(() => parseHttpOptions(["--http-port", "70000"], {}), /Invalid HTTP port/);
  });
});
