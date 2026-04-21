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

export function socketPath(): string {
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
        } catch {
          // ESRCH: process not found — stale lock, take over
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
    if (existsSync(sock)) unlinkSync(sock);
  } catch {}
}
