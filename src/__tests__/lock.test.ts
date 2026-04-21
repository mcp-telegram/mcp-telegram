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
  } catch {}
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

describe("releaseSocket", () => {
  it("removes socket file if it exists", () => {
    writeFileSync(socketPath(), "");
    releaseSocket();
    assert.strictEqual(existsSync(socketPath()), false);
  });

  it("no socket file → does not throw", () => {
    assert.doesNotThrow(() => releaseSocket());
  });
});
