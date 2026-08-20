import assert from "node:assert";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { lockPath, releaseLock, releaseSocket, socketPath, tryAcquireLock } from "../lock.js";

// lock.ts reads TELEGRAM_SESSION_PATH on every lockPath() call — safe to change between tests
let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `mcp-lock-test-${process.pid}-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  process.env.TELEGRAM_SESSION_PATH = join(testDir, "session");
});

afterEach(() => {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    // Temp-dir cleanup is best-effort: each test gets a fresh uniquely-named dir, so a
    // leftover cannot leak into another test. Throwing here would mask the real assertion
    // failure that is usually the reason the dir is in an odd state.
  }
  delete process.env.TELEGRAM_SESSION_PATH;
});

describe("tryAcquireLock", () => {
  it("no lock file → creates it with our PID, returns true", () => {
    assert.strictEqual(tryAcquireLock(), true);
    const written = readFileSync(lockPath(), "utf-8").trim();
    assert.strictEqual(Number(written), process.pid);
  });

  it("our own PID in lock (process is alive) → treated as live master → returns false", () => {
    // process.kill(process.pid, 0) doesn't throw → lock.ts returns false (live master detected)
    // tryAcquireLock() does NOT special-case our own PID
    writeFileSync(lockPath(), String(process.pid));
    assert.strictEqual(tryAcquireLock(), false);
  });

  it("live foreign PID in lock (ppid is always alive) → returns false", () => {
    writeFileSync(lockPath(), String(process.ppid));
    assert.strictEqual(tryAcquireLock(), false);
  });

  it("dead PID in lock (stale) → takes over, returns true", () => {
    writeFileSync(lockPath(), "999999999");
    assert.strictEqual(tryAcquireLock(), true);
    const written = readFileSync(lockPath(), "utf-8").trim();
    assert.strictEqual(Number(written), process.pid);
  });

  it("non-numeric content in lock → file not removed → wx throws EEXIST → returns false", () => {
    // parseInt("garbage") = NaN → skip kill check → file stays → wx EEXIST → false
    writeFileSync(lockPath(), "garbage-not-a-pid");
    assert.strictEqual(tryAcquireLock(), false);
    // File must NOT have been removed (no unlinkSync for NaN pid path)
    assert.strictEqual(existsSync(lockPath()), true);
  });

  it("empty lock file → file not removed → wx throws EEXIST → returns false", () => {
    // parseInt("") = NaN → skip kill check → file stays → wx EEXIST → false
    writeFileSync(lockPath(), "");
    assert.strictEqual(tryAcquireLock(), false);
    assert.strictEqual(existsSync(lockPath()), true);
  });
});

describe("releaseLock", () => {
  it("lock file has our PID → removes it", () => {
    writeFileSync(lockPath(), String(process.pid));
    releaseLock();
    assert.strictEqual(existsSync(lockPath()), false);
  });

  it("lock file has foreign PID → does not remove it", () => {
    writeFileSync(lockPath(), "12345");
    releaseLock();
    assert.strictEqual(existsSync(lockPath()), true);
  });

  it("no lock file → does not throw", () => {
    assert.doesNotThrow(() => releaseLock());
  });
});

/**
 * Regression tests for issue #69 — "Windows + Node: server crashes at startup".
 *
 * Node's `net.Server.listen(path)` only accepts the named-pipe namespace on win32, so the
 * master died with `listen EACCES` on `<sessionDir>/daemon.sock` and every MCP client on
 * Windows saw the server exit immediately. socketPath() must therefore return a pipe name
 * there — and, critically, the SAME name for master and client, or both become master.
 *
 * process.platform is stubbed because socketPath() reads it per call; this keeps the
 * behaviour testable from CI on any host OS, not only from a Windows runner.
 */
describe("socketPath() platform mapping", () => {
  const realPlatform = process.platform;
  const setPlatform = (value: NodeJS.Platform) =>
    Object.defineProperty(process, "platform", { value, configurable: true });
  afterEach(() => setPlatform(realPlatform));

  it("posix → a daemon.sock file inside the session dir", () => {
    setPlatform("linux");
    assert.strictEqual(socketPath(), join(testDir, "daemon.sock"));
  });

  it("win32 → a \\\\.\\pipe\\ name, never a filesystem path", () => {
    setPlatform("win32");
    const sock = socketPath();
    assert.ok(sock.startsWith("\\\\.\\pipe\\"), `expected a named pipe, got ${sock}`);
    assert.ok(!sock.includes("daemon.sock"), "must not hand a filesystem path to listen()");
  });

  // These use FORWARD slashes on purpose. socketPath() derives the dir via path.dirname(),
  // and on a POSIX host that is the POSIX implementation regardless of a stubbed
  // process.platform: dirname("C:\\Users\\x\\session") returns ".", which collapses every
  // input to one empty slug and makes distinctness assertions pass vacuously. Windows accepts
  // "/" as a separator, so forward slashes keep the fixtures Windows-valid while still
  // exercising the real name derivation from a Mac/Linux runner.
  it("win32 → case-insensitive: two spellings of one dir yield ONE pipe", () => {
    // If master resolved C:/Users/x and a client resolved c:/users/x to different pipes, the
    // client would never find the master and would elect itself master too — two daemons,
    // two Telegram sessions on one account.
    setPlatform("win32");
    process.env.TELEGRAM_SESSION_PATH = "C:/Users/Alex/.mcp-telegram/session";
    const upper = socketPath();
    process.env.TELEGRAM_SESSION_PATH = "c:/users/alex/.mcp-telegram/session";
    assert.strictEqual(socketPath(), upper);
    assert.ok(upper.length > "\\\\.\\pipe\\mcp-telegram-".length, "suffix must not be empty");
  });

  it("win32 → different session dirs yield different pipes (accounts stay isolated)", () => {
    setPlatform("win32");
    process.env.TELEGRAM_SESSION_PATH = "C:/Users/Alex/acct-a/session";
    const a = socketPath();
    process.env.TELEGRAM_SESSION_PATH = "C:/Users/Alex/acct-b/session";
    assert.notStrictEqual(socketPath(), a);
  });

  it("win32 → very long dirs stay short and still stay distinct (hashed, not truncated)", () => {
    // Pipe names are length-capped. Truncating would collapse two deep paths sharing a
    // prefix onto one pipe, cross-wiring two accounts; hashing keeps them apart.
    setPlatform("win32");
    const deep = `C:/Users/Alex/${"nested/".repeat(30)}`;
    process.env.TELEGRAM_SESSION_PATH = `${deep}alpha/session`;
    const a = socketPath();
    process.env.TELEGRAM_SESSION_PATH = `${deep}beta/session`;
    const b = socketPath();
    assert.notStrictEqual(a, b, "long paths must not collide");
    assert.ok(a.length < 120, `pipe name too long: ${a.length}`);
    assert.ok(a.startsWith("\\\\.\\pipe\\"));
  });
});

// On win32 socketPath() is a named pipe, not a file: writeFileSync/existsSync don't apply
// and the pipe vanishes with its owning process, so there is no stale-socket cleanup to test.
describe("releaseSocket", { skip: process.platform === "win32" ? "POSIX-only: socket is a file" : false }, () => {
  it("removes socket file if it exists (no lock → no owner)", () => {
    writeFileSync(socketPath(), "");
    releaseSocket();
    assert.strictEqual(existsSync(socketPath()), false);
  });

  it("no socket file → does not throw", () => {
    assert.doesNotThrow(() => releaseSocket());
  });

  it("keeps socket when a live foreign process owns the lock", () => {
    writeFileSync(socketPath(), "");
    writeFileSync(lockPath(), String(process.ppid)); // ppid is always alive and != our pid
    releaseSocket();
    assert.strictEqual(existsSync(socketPath()), true, "must not delete a live foreign owner's socket");
  });

  it("removes socket when we own the lock", () => {
    writeFileSync(socketPath(), "");
    writeFileSync(lockPath(), String(process.pid));
    releaseSocket();
    assert.strictEqual(existsSync(socketPath()), false);
  });

  it("removes socket when the lock owner is a dead PID (stale)", () => {
    writeFileSync(socketPath(), "");
    writeFileSync(lockPath(), "999999999");
    releaseSocket();
    assert.strictEqual(existsSync(socketPath()), false);
  });

  it("removes socket when the lock PID is non-positive (never probes our own group)", () => {
    // pid <= 0 must be ignored — process.kill(0, 0) would target our own process
    // group and falsely report a live owner. Guard skips the kill and removes the socket.
    writeFileSync(socketPath(), "");
    writeFileSync(lockPath(), "0");
    releaseSocket();
    assert.strictEqual(existsSync(socketPath()), false);
  });
});
