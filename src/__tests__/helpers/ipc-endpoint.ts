import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A unique IPC endpoint that `net.createServer().listen()` accepts on the current platform.
 *
 * Tests used to hardcode `join(tmpdir(), "x.sock")`, which is precisely the mistake issue #69
 * reported in production code: on win32 Node's `listen(path)` only accepts the named-pipe
 * namespace, so a filesystem path fails with `listen EACCES`. That made every IPC test fail
 * on a Windows runner even though the shipped code was already fixed.
 *
 * Not named *.test.ts on purpose — the `src/**\/*.test.ts` glob would otherwise try to run
 * this module as a test file.
 */
export function makeIpcEndpoint(label: string): string {
  const unique = `${label}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (process.platform === "win32") return `\\\\.\\pipe\\${unique}`;
  return join(tmpdir(), `${unique}.sock`);
}

/**
 * Remove an endpoint created by makeIpcEndpoint. On win32 the named pipe is owned by the
 * process and disappears with it, so there is nothing on disk to unlink.
 */
export function cleanupIpcEndpoint(endpoint: string): void {
  if (process.platform === "win32") return;
  rmSync(endpoint, { force: true });
}
