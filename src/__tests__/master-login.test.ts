import assert from "node:assert";
import { rmSync } from "node:fs";
import { connect, createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { encodeMessage, type IpcMessage, parseMessages } from "../ipc-protocol.js";
import { handleClient } from "../master.js";

type McpServerInternal = Parameters<typeof handleClient>[1];
type TelegramServiceLike = Parameters<typeof handleClient>[2];

const emptyMcp = { _registeredTools: {} } as McpServerInternal;

/** Minimal TelegramService stub with scriptable startQrLogin + getMe */
function makeStubTelegram(opts: {
  qrUrls?: string[];
  result: { success: boolean; message: string };
  username?: string;
}): TelegramServiceLike {
  return {
    async startQrLogin(_onDataUrl: (dataUrl: string) => void, onUrl?: (url: string) => void | Promise<void>) {
      if (opts.qrUrls && onUrl) {
        for (const url of opts.qrUrls) {
          await onUrl(url);
        }
      }
      return opts.result;
    },
    async getMe() {
      return { username: opts.username ?? "test-user" };
    },
  } as unknown as TelegramServiceLike;
}

async function collectMessages(
  sockPath: string,
  send: IpcMessage[],
  predicate: (msgs: IpcMessage[]) => boolean,
  timeoutMs = 2000,
): Promise<IpcMessage[]> {
  return new Promise((resolve, reject) => {
    const client = connect(sockPath);
    const messages: IpcMessage[] = [];
    let buf = "";
    const timer = setTimeout(() => {
      client.destroy();
      reject(new Error("collect timeout"));
    }, timeoutMs);

    client.on("connect", () => {
      for (const msg of send) client.write(encodeMessage(msg));
    });
    client.on("data", (chunk) => {
      buf += chunk.toString("utf-8");
      const parsed = parseMessages(buf);
      buf = parsed.remaining;
      for (const m of parsed.messages) messages.push(m);
      if (predicate(messages)) {
        clearTimeout(timer);
        client.destroy();
        resolve(messages);
      }
    });
    client.on("error", reject);
  });
}

describe("master handleLoginStart", () => {
  let server: Server;
  let sockPath: string;

  before(() => {
    sockPath = join(tmpdir(), `mcp-master-login-${process.pid}-${Date.now()}.sock`);
  });

  after(() => server?.close());

  function startServer(telegram: TelegramServiceLike) {
    server?.close();
    rmSync(sockPath, { force: true });
    server = createServer((socket) => handleClient(socket, emptyMcp, telegram));
    return new Promise<void>((resolve) => server.listen(sockPath, resolve));
  }

  it("forwards QR URLs via login_qr, then login_done success", async () => {
    const telegram = makeStubTelegram({
      qrUrls: ["tg://login?token=a", "tg://login?token=b"],
      result: { success: true, message: "ok" },
      username: "alex",
    });
    await startServer(telegram);

    const msgs = await collectMessages(sockPath, [{ type: "login_start", id: "L1" }], (acc) =>
      acc.some((m) => m.type === "login_done"),
    );

    const qrs = msgs.filter((m) => m.type === "login_qr");
    const done = msgs.find((m) => m.type === "login_done");
    assert.strictEqual(qrs.length, 2);
    assert.strictEqual((qrs[0] as { url: string }).url, "tg://login?token=a");
    assert.strictEqual((qrs[1] as { url: string }).url, "tg://login?token=b");
    assert.ok(done);
    assert.strictEqual((done as { success: boolean }).success, true);
    assert.strictEqual((done as { username?: string }).username, "alex");
  });

  it("reports login_done failure when startQrLogin returns failure", async () => {
    const telegram = makeStubTelegram({
      result: { success: false, message: "2FA enabled" },
    });
    await startServer(telegram);

    const msgs = await collectMessages(sockPath, [{ type: "login_start", id: "L2" }], (acc) =>
      acc.some((m) => m.type === "login_done"),
    );

    const done = msgs.find((m) => m.type === "login_done");
    assert.ok(done);
    assert.strictEqual((done as { success: boolean }).success, false);
    assert.match((done as { error?: string }).error ?? "", /2FA/);
  });

  it("reports login_done error when startQrLogin throws", async () => {
    const telegram = {
      async startQrLogin() {
        throw new Error("kaboom");
      },
    } as unknown as TelegramServiceLike;
    await startServer(telegram);

    const msgs = await collectMessages(sockPath, [{ type: "login_start", id: "L3" }], (acc) =>
      acc.some((m) => m.type === "login_done"),
    );

    const done = msgs.find((m) => m.type === "login_done");
    assert.ok(done);
    assert.strictEqual((done as { success: boolean }).success, false);
    assert.match((done as { error?: string }).error ?? "", /kaboom/);
  });

  it("aborts startQrLogin when client socket closes mid-flow", async () => {
    let abortFired = false;
    // Stub that blocks until its signal is aborted — simulates a long QR wait.
    const telegram = {
      async startQrLogin(_onDataUrl: (dataUrl: string) => void, _onUrl?: (url: string) => void, signal?: AbortSignal) {
        await new Promise<void>((resolve) => {
          if (signal?.aborted) {
            abortFired = true;
            return resolve();
          }
          signal?.addEventListener("abort", () => {
            abortFired = true;
            resolve();
          });
        });
        return { success: false, message: "QR login aborted" };
      },
    } as unknown as TelegramServiceLike;
    await startServer(telegram);

    // Open a client, start login, then close the socket before login completes.
    await new Promise<void>((resolve) => {
      const c = connect(sockPath);
      c.on("connect", () => {
        c.write(encodeMessage({ type: "login_start", id: "L4" }));
        setTimeout(() => {
          c.destroy();
          resolve();
        }, 50);
      });
    });

    // Wait briefly for abort to propagate through close handler.
    await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual(abortFired, true, "startQrLogin must observe abort signal on socket close");
  });

  it("releases globalLock on abort — a subsequent tool call is not blocked", async () => {
    const telegram = {
      async startQrLogin(_onDataUrl: (dataUrl: string) => void, _onUrl?: (url: string) => void, signal?: AbortSignal) {
        await new Promise<void>((resolve) => {
          signal?.addEventListener("abort", () => resolve());
        });
        return { success: false, message: "QR login aborted" };
      },
    } as unknown as TelegramServiceLike;
    // We need a registered tool — patch the module-level mock to include one.
    const mockWithTool = {
      _registeredTools: {
        "telegram-status": { handler: async () => ({ status: "ok" }) },
      },
    } as McpServerInternal;

    server?.close();
    rmSync(sockPath, { force: true });
    server = createServer((socket) => handleClient(socket, mockWithTool, telegram));
    await new Promise<void>((resolve) => server.listen(sockPath, resolve));

    // Client A: starts login, then closes socket → triggers abort.
    await new Promise<void>((resolve) => {
      const a = connect(sockPath);
      a.on("connect", () => {
        a.write(encodeMessage({ type: "login_start", id: "LA" }));
        setTimeout(() => {
          a.destroy();
          resolve();
        }, 50);
      });
    });

    await new Promise((r) => setTimeout(r, 100)); // give abort time to propagate

    // Client B: must get a fast response, not wait out a stuck login.
    const msgs = await collectMessages(
      sockPath,
      [{ type: "tool", id: "T1", tool: "telegram-status", args: {} }],
      (acc) => acc.some((m) => m.type === "tool_response"),
      1000,
    );
    const resp = msgs.find((m) => m.type === "tool_response");
    assert.ok(resp);
    assert.deepStrictEqual((resp as { result?: unknown }).result, { status: "ok" });
  });

  it("telegram-logout aborts an in-progress QR login from another client", async () => {
    let abortFired = false;
    let logoutInvoked = false;
    const telegram = {
      async startQrLogin(_onDataUrl: (dataUrl: string) => void, _onUrl?: (url: string) => void, signal?: AbortSignal) {
        await new Promise<void>((resolve) => {
          signal?.addEventListener("abort", () => {
            abortFired = true;
            resolve();
          });
        });
        return { success: false, message: "QR login aborted" };
      },
    } as unknown as TelegramServiceLike;

    const mockWithLogout = {
      _registeredTools: {
        "telegram-logout": {
          handler: async () => {
            logoutInvoked = true;
            return { content: [{ type: "text", text: "logged out" }] };
          },
        },
      },
    } as McpServerInternal;

    server?.close();
    rmSync(sockPath, { force: true });
    server = createServer((socket) => handleClient(socket, mockWithLogout, telegram));
    await new Promise<void>((resolve) => server.listen(sockPath, resolve));

    // Client A: start QR login and keep the socket open (do NOT close it).
    const a = connect(sockPath);
    await new Promise<void>((resolve) => {
      a.on("connect", () => {
        a.write(encodeMessage({ type: "login_start", id: "LA" }));
        resolve();
      });
    });

    // Give master time to register activeLogin
    await new Promise((r) => setTimeout(r, 50));

    // Client B: telegram-logout — must abort A's login without waiting 5min.
    const msgs = await collectMessages(
      sockPath,
      [{ type: "tool", id: "T2", tool: "telegram-logout", args: {} }],
      (acc) => acc.some((m) => m.type === "tool_response"),
      1000,
    );

    assert.strictEqual(abortFired, true, "active login must be aborted by telegram-logout");
    assert.strictEqual(logoutInvoked, true, "logout tool handler must run");
    assert.ok(msgs.find((m) => m.type === "tool_response"));

    a.destroy();
  });
});
