import assert from "node:assert";
import { mkdirSync, rmSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { encodeMessage, type IpcMessage, parseMessages } from "../ipc-protocol.js";
import { socketPath } from "../lock.js";
import { type OwnerHandle, startOwner } from "../master.js";
import { runServe } from "../serve.js";
import type { TelegramService } from "../telegram-client.js";

// A TelegramService whose every method is an async no-op — startOwner's auto-connect and any
// tool handler resolve harmlessly without touching a real network.
const stubTelegram = new Proxy({}, { get: () => async () => ({}) }) as unknown as TelegramService;

function sendAndCollect(
  sockPath: string,
  toSend: IpcMessage[],
  predicate: (msgs: IpcMessage[]) => boolean,
  timeoutMs = 3000,
): Promise<{ messages: IpcMessage[]; client: ReturnType<typeof connect> }> {
  return new Promise((resolve, reject) => {
    const client = connect(sockPath);
    const messages: IpcMessage[] = [];
    let buf = "";
    const timer = setTimeout(() => {
      client.destroy();
      reject(new Error("collect timeout"));
    }, timeoutMs);
    client.on("connect", () => {
      for (const m of toSend) client.write(encodeMessage(m));
    });
    client.on("data", (chunk) => {
      buf += chunk.toString("utf-8");
      const parsed = parseMessages(buf);
      buf = parsed.remaining;
      for (const m of parsed.messages) messages.push(m);
      if (predicate(messages)) {
        clearTimeout(timer);
        resolve({ messages, client });
      }
    });
    client.on("error", reject);
  });
}

describe("serve owner-core (startOwner)", () => {
  let owner: OwnerHandle;
  let sessionDir: string;
  const prevSessionPath = process.env.TELEGRAM_SESSION_PATH;

  before(async () => {
    sessionDir = join(tmpdir(), `serve-test-${process.pid}-${Date.now()}`);
    mkdirSync(sessionDir, { recursive: true });
    process.env.TELEGRAM_SESSION_PATH = join(sessionDir, "session");
    owner = await startOwner(stubTelegram, "test", { label: "serve-test" });
  });

  after(() => {
    owner?.srv.close();
    rmSync(sessionDir, { recursive: true, force: true });
    if (prevSessionPath === undefined) delete process.env.TELEGRAM_SESSION_PATH;
    else process.env.TELEGRAM_SESSION_PATH = prevSessionPath;
  });

  it("listens on the IPC socket without any stdio transport", () => {
    assert.strictEqual(owner.srv.listening, true);
  });

  it("serves two concurrent clients, routing each response to its own request id", async () => {
    const sock = socketPath();
    const [a, b] = await Promise.all([
      sendAndCollect(
        sock,
        [{ type: "tool", id: "A1", tool: "telegram-status", args: {} }],
        (m) => m.some((x) => x.type === "tool_response"),
      ),
      sendAndCollect(
        sock,
        [{ type: "tool", id: "B1", tool: "telegram-status", args: {} }],
        (m) => m.some((x) => x.type === "tool_response"),
      ),
    ]);

    const aResp = a.messages.find((m) => m.type === "tool_response");
    const bResp = b.messages.find((m) => m.type === "tool_response");
    assert.strictEqual((aResp as { id: string }).id, "A1", "client A gets only its own response");
    assert.strictEqual((bResp as { id: string }).id, "B1", "client B gets only its own response");
    assert.ok(!a.messages.some((m) => (m as { id?: string }).id === "B1"));
    assert.ok(!b.messages.some((m) => (m as { id?: string }).id === "A1"));
    a.client.destroy();
    b.client.destroy();
  });

  it("survives a client disconnect — the daemon and other clients keep working", async () => {
    const sock = socketPath();
    await new Promise<void>((resolve) => {
      const a = connect(sock);
      a.on("connect", () => {
        a.write(encodeMessage({ type: "tool", id: "D1", tool: "telegram-status", args: {} }));
        setTimeout(() => {
          a.destroy();
          resolve();
        }, 20);
      });
      a.on("error", () => resolve());
    });

    assert.strictEqual(owner.srv.listening, true);

    const b = await sendAndCollect(
      sock,
      [{ type: "tool", id: "D2", tool: "telegram-status", args: {} }],
      (m) => m.some((x) => x.type === "tool_response"),
    );
    const bResp = b.messages.find((m) => m.type === "tool_response");
    assert.strictEqual((bResp as { id: string }).id, "D2");
    b.client.destroy();
  });

  it("exports runServe as a function (daemon entrypoint)", () => {
    assert.strictEqual(typeof runServe, "function");
  });
});
