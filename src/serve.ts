import { tryAcquireLock } from "./lock.js";
import { startOwner } from "./master.js";
import { TelegramService } from "./telegram-client.js";

/**
 * Persistent daemon mode: own the single Telegram connection and serve many concurrent
 * IPC clients, with no stdio and no stdin-exit, so closing any client never tears the
 * connection down. Intended to run under a supervisor (systemd, Docker) with Restart=always.
 */
export async function runServe(apiId: number, apiHash: string, version: string): Promise<void> {
  // The daemon must be the sole connection owner. If another owner already holds the lock,
  // refuse rather than open a second client on the same session (AUTH_KEY_DUPLICATED).
  if (!tryAcquireLock()) {
    console.error("[serve] Another owner already holds the lock; refusing to start a second daemon.");
    process.exit(1);
  }

  const telegram = new TelegramService(apiId, apiHash);

  // Owner core: socket server + IPC dispatch + auto-connect + SIGINT/SIGTERM graceful shutdown.
  // No StdioServerTransport and no process.stdin handler — the daemon's lifetime is independent
  // of any client. The listening socket keeps the event loop alive until a termination signal.
  await startOwner(telegram, version, { label: "serve" });

  console.error("[serve] daemon ready — owning the Telegram connection, no stdio attached");
}
