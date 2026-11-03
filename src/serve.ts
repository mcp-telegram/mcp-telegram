import type { HttpServeOptions } from "./http.js";
import type { McpServerInternal } from "./ipc-protocol.js";
import { tryAcquireLock } from "./lock.js";
import { startOwner } from "./master.js";
import { TelegramService } from "./telegram-client.js";

/**
 * Read the optional HTTP endpoint settings from `--http-port`/`--http-host` or
 * MCP_TELEGRAM_HTTP_PORT/MCP_TELEGRAM_HTTP_HOST. Returns undefined when no port is given,
 * which keeps serve IPC-only.
 */
export function parseHttpOptions(argv: string[], env: NodeJS.ProcessEnv): HttpServeOptions | undefined {
  const flag = (name: string) => {
    const i = argv.indexOf(name);
    return i !== -1 ? argv[i + 1] : argv.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
  };
  const port = flag("--http-port") ?? env.MCP_TELEGRAM_HTTP_PORT;
  if (!port) return undefined;
  const parsed = Number(port);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid HTTP port: ${port}`);
  }
  return { host: flag("--http-host") ?? env.MCP_TELEGRAM_HTTP_HOST ?? "127.0.0.1", port: parsed };
}

/**
 * Persistent daemon mode: own the single Telegram connection and serve many concurrent
 * IPC clients, with no stdio and no stdin-exit, so closing any client never tears the
 * connection down. Intended to run under a supervisor (systemd, Docker) with Restart=always.
 *
 * With `http`, it also serves the tools over Streamable HTTP, so MCP hosts can connect
 * without starting a client process per session.
 */
export async function runServe(
  apiId: number,
  apiHash: string,
  version: string,
  http?: HttpServeOptions,
): Promise<void> {
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
  const { server } = await startOwner(telegram, version, { label: "serve" });

  if (http) {
    const { httpTokenPath, startHttp } = await import("./http.js");
    try {
      await startHttp(server as unknown as McpServerInternal, telegram, version, http);
    } catch (err) {
      console.error(`[serve] ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
    const url = `http://${http.host.includes(":") ? `[${http.host}]` : http.host}:${http.port}/mcp`;
    console.error(`[serve] HTTP endpoint ready: ${url} (bearer token in ${http.tokenFile ?? httpTokenPath()})`);
  }

  console.error("[serve] daemon ready — owning the Telegram connection, no stdio attached");
}
