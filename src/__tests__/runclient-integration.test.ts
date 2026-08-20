import assert from "node:assert";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { socketPath } from "../lock.js";

/** Integration test: client subprocess must exit when its master socket closes. */

// Run the TypeScript entry directly via tsx — avoids depending on a compiled
// dist/ which is gitignored and may be absent (CI, clean checkout) or stale.
const TSX_BIN = join(process.cwd(), "node_modules", ".bin", "tsx");
const ENTRY = join(process.cwd(), "src", "index.ts");

let testDir: string;
let lockFile: string;
let sockFile: string;
let fakeMaster: Server | null = null;

beforeEach(() => {
  testDir = join(tmpdir(), `mcp-runclient-test-${process.pid}-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  lockFile = join(testDir, "daemon.lock");
  // Derive the endpoint through the production helper instead of hardcoding
  // "<dir>/daemon.sock". The spawned child computes it via socketPath() from
  // TELEGRAM_SESSION_PATH, so a hardcoded path lets the two silently disagree — and on win32
  // it must be a named pipe, which is the whole point of issue #69.
  const prev = process.env.TELEGRAM_SESSION_PATH;
  process.env.TELEGRAM_SESSION_PATH = join(testDir, "session");
  sockFile = socketPath();
  if (prev === undefined) delete process.env.TELEGRAM_SESSION_PATH;
  else process.env.TELEGRAM_SESSION_PATH = prev;
});

afterEach(async () => {
  if (fakeMaster) {
    await new Promise<void>((r) => fakeMaster?.close(() => r()));
    fakeMaster = null;
  }
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup: each test gets a fresh uniquely-named temp dir, so a leftover
    // cannot leak into another test. On Windows the just-killed child process can still hold
    // a handle briefly, and throwing here would mask the real assertion failure.
  }
});

function waitExit(child: ChildProcess, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(null);
    }, timeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

describe("runClient integration", () => {
  it("exits with code 1 when master socket closes unexpectedly", async () => {
    // Fake master: accept one connection, then close it after 200ms
    fakeMaster = createServer((socket) => {
      setTimeout(() => socket.destroy(), 200);
    });
    await new Promise<void>((resolve) => fakeMaster?.listen(sockFile, resolve));

    // Pretend master is alive so child becomes client (lock PID = our PID)
    writeFileSync(lockFile, String(process.pid), { mode: 0o600 });

    const session = join(testDir, "session");
    const child = spawn(TSX_BIN, [ENTRY], {
      env: {
        ...process.env,
        TELEGRAM_API_ID: "12345",
        TELEGRAM_API_HASH: "deadbeef",
        TELEGRAM_SESSION_PATH: session,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Drain stdio so pipes don't fill
    child.stdout?.on("data", () => {});
    child.stderr?.on("data", () => {});

    const code = await waitExit(child, 5000);
    assert.strictEqual(code, 1, "client must exit 1 after master closed its socket");
  });

  it("exits with code 0 when stdin closes (parent gone)", async () => {
    // Fake master: keep connection open indefinitely
    fakeMaster = createServer((_socket) => {});
    await new Promise<void>((resolve) => fakeMaster?.listen(sockFile, resolve));

    writeFileSync(lockFile, String(process.pid), { mode: 0o600 });
    const session = join(testDir, "session");

    const child = spawn(TSX_BIN, [ENTRY], {
      env: {
        ...process.env,
        TELEGRAM_API_ID: "12345",
        TELEGRAM_API_HASH: "deadbeef",
        TELEGRAM_SESSION_PATH: session,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdout?.on("data", () => {});
    child.stderr?.on("data", () => {});

    // Give it time to fully start (IPC connect + MCP stdio ready)
    await new Promise((r) => setTimeout(r, 800));

    // Close stdin → EOF → process.stdin "end" → exit 0
    child.stdin?.end();

    const code = await waitExit(child, 5000);
    assert.strictEqual(code, 0, "client must exit 0 on stdin EOF");
  });
});
