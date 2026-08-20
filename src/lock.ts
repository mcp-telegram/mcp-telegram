import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const DEFAULT_SESSION_DIR = join(homedir(), ".mcp-telegram");

function resolveSessionDir(): string {
  const sessionPath = process.env.TELEGRAM_SESSION_PATH;
  if (sessionPath) return dirname(sessionPath);
  return DEFAULT_SESSION_DIR;
}

export function lockPath(): string {
  return join(resolveSessionDir(), "daemon.lock");
}

const WIN_PIPE_PREFIX = "\\\\.\\pipe\\mcp-telegram-";

/**
 * Windows has no filesystem-path IPC in Node: `net.Server.listen(path)` only accepts the
 * named-pipe namespace (`\\.\pipe\...`), so listening on `<sessionDir>/daemon.sock` fails
 * with `listen EACCES` and the master dies before it ever reaches Telegram.
 *
 * The name is derived from the session dir so two accounts (different TELEGRAM_SESSION_PATH)
 * get separate pipes, and it is lower-cased first because Windows paths are case-insensitive:
 * otherwise a master started via `C:\Users\x` and a client started via `c:\users\x` would look
 * for each other on two different pipes and both would try to become master.
 */
function winPipeName(dir: string): string {
  const normalized = dir.toLowerCase();
  const slug = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  // Pipe names are length-capped. Hash long dirs instead of truncating, so two deep paths
  // sharing a prefix can't collapse onto one pipe and cross-talk between accounts.
  if (slug.length <= 64) return WIN_PIPE_PREFIX + slug;
  return WIN_PIPE_PREFIX + createHash("sha1").update(normalized).digest("hex").slice(0, 32);
}

export function socketPath(): string {
  if (process.platform === "win32") return winPipeName(resolveSessionDir());
  return join(resolveSessionDir(), "daemon.sock");
}

/**
 * Try to acquire the master lock.
 * Returns true if this process is now the master.
 * Returns false if another live master process holds the lock.
 *
 * Uses PID file + kill -0 to detect stale locks after crashes.
 */
export function tryAcquireLock(): boolean {
  const lock = lockPath();
  const dir = dirname(lock);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  if (existsSync(lock)) {
    try {
      const pid = Number.parseInt(readFileSync(lock, "utf-8").trim(), 10);
      if (!Number.isNaN(pid) && pid > 0) {
        try {
          // kill -0: check if process is alive without sending a signal
          process.kill(pid, 0);
          // Process is alive — another master owns the lock
          return false;
        } catch (err) {
          // ESRCH: process not found — stale lock, take over.
          // EPERM: process is alive but owned by another uid we can't signal —
          // treat as a live owner and DON'T steal the lock.
          if ((err as NodeJS.ErrnoException).code === "EPERM") return false;
          unlinkSync(lock);
        }
      }
    } catch {
      // Unreadable lock — remove and take over
      try {
        unlinkSync(lock);
      } catch {}
    }
  }

  try {
    // O_EXCL flag: atomic exclusive create — prevents TOCTOU race between two simultaneous starts
    writeFileSync(lock, String(process.pid), { flag: "wx", mode: 0o600 });
    return true;
  } catch {
    // EEXIST: another process just created the lock — we lost the race, become client
    return false;
  }
}

export function releaseLock(): void {
  try {
    const lock = lockPath();
    if (existsSync(lock)) {
      const pid = Number.parseInt(readFileSync(lock, "utf-8").trim(), 10);
      // Only remove our own lock
      if (pid === process.pid) unlinkSync(lock);
    }
  } catch {}
}

export function releaseSocket(): void {
  try {
    const sock = socketPath();
    if (!existsSync(sock)) return;
    // Ownership guard (mirrors releaseLock): never unlink a socket owned by a different,
    // still-alive process. Otherwise any process that imports this module and exits (e.g. a
    // one-shot run or a test on the same host) would delete a running daemon's socket file,
    // leaving the daemon listening in memory but unreachable for new clients.
    const lock = lockPath();
    if (existsSync(lock)) {
      const pid = Number.parseInt(readFileSync(lock, "utf-8").trim(), 10);
      // Ignore non-positive PIDs (e.g. 0) so kill() can't probe our own process group.
      if (!Number.isNaN(pid) && pid > 0 && pid !== process.pid) {
        try {
          process.kill(pid, 0); // foreign owner still alive?
          return; // yes — leave its socket alone
        } catch (err) {
          // ESRCH: stale owner — safe to remove. EPERM: owner is alive under a
          // different uid (e.g. a systemd daemon) — leave its socket alone too.
          if ((err as NodeJS.ErrnoException).code === "EPERM") return;
        }
      }
    }
    unlinkSync(sock);
  } catch {
    // Best-effort cleanup, called from a process.on("exit") handler where throwing would
    // turn an orderly shutdown into a crash. A leftover socket file is recoverable: the
    // next master calls releaseSocket() again before listening. On win32 socketPath() is a
    // named pipe, existsSync() is false and we return before ever reaching unlinkSync.
  }
}
