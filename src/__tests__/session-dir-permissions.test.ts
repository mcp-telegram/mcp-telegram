/**
 * Session folder permissions (security audit 2026-11-02).
 *
 * The folder was set to 0700 only when it was created, so an existing ~/.mcp-telegram
 * kept whatever mode it had (seen as 0775 on a dev machine): another account in the
 * group could replace daemon.sock or daemon.lock. secureSessionDir tightens it on start.
 */
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { secureSessionDir } from "../lock.js";

const posix = process.platform !== "win32";
const mode = (p: string) => statSync(p).mode & 0o777;

describe("secureSessionDir", { skip: !posix && "POSIX modes only" }, () => {
  it("creates a missing folder as 0700", () => {
    const base = mkdtempSync(join(tmpdir(), "sessdir-"));
    try {
      const dir = join(base, "new");
      secureSessionDir(dir, dir);
      assert.equal(mode(dir), 0o700);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("tightens an existing dedicated folder to 0700", () => {
    const dir = mkdtempSync(join(tmpdir(), "sessdir-"));
    try {
      chmodSync(dir, 0o775);
      secureSessionDir(dir, dir);
      assert.equal(mode(dir), 0o700);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps setgid on a shared folder while removing group write", () => {
    const dir = mkdtempSync(join(tmpdir(), "sessdir-"));
    try {
      chmodSync(dir, 0o2775);
      secureSessionDir(dir, "/nonexistent-dedicated");
      assert.equal(statSync(dir).mode & 0o7777, 0o2755);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("only removes group/other write from a shared custom folder", () => {
    const dir = mkdtempSync(join(tmpdir(), "sessdir-"));
    try {
      chmodSync(dir, 0o777);
      secureSessionDir(dir, "/nonexistent-dedicated");
      assert.equal(mode(dir), 0o755);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
