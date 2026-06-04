import { createServer, type Server, type Socket } from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GlobalLock } from "./global-lock.js";
import {
  encodeMessage,
  type IpcLoginStart,
  type IpcMessage,
  type IpcToolRequest,
  type IpcToolResponse,
  type McpServerInternal,
  parseMessages,
} from "./ipc-protocol.js";
import { releaseLock, releaseSocket, socketPath } from "./lock.js";
import { TelegramService } from "./telegram-client.js";
import { registerTools } from "./tools/index.js";

let cleanedUp = false;

function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  // Sync unlink only — process.exit handlers cannot await async server.close(),
  // and unlinking the socket file is sufficient to release the listening address.
  releaseLock();
  releaseSocket();
}

process.on("exit", cleanup);

// Serializes tool calls with QR login — login holds the lock for up to minutes,
// tool calls queue behind it. Prevents tool calls from running against a stale
// Telegram client mid-relogin.
const globalLock = new GlobalLock();

// Only one concurrent QR login — second call sees this set and returns error
// instead of invalidating the just-adopted session.
type ActiveLogin = { socket: Socket; abort: AbortController };
let activeLogin: ActiveLogin | null = null;

export function handleClient(socket: Socket, mcpServer: McpServerInternal, telegram: TelegramService) {
  let buf = "";
  let processing = false;
  const queue: IpcMessage[] = [];

  // Per-socket FIFO: messages from one client execute in arrival order.
  // Parallelism across DIFFERENT clients is enforced by globalLock (acquired per handler),
  // not here — a tool call from client A can proceed while client B is in login flow.
  async function drainQueue() {
    if (processing) return;
    processing = true;
    while (queue.length > 0) {
      const msg = queue.shift();
      if (!msg) break;
      if (msg.type === "tool") {
        await handleToolRequest(socket, msg, mcpServer);
      } else if (msg.type === "login_start") {
        await handleLoginStart(socket, msg, telegram);
      }
      // Responses and QR frames are master→client only — client-side messages ignored here
    }
    processing = false;
  }

  socket.on("data", (chunk) => {
    buf += chunk.toString("utf-8");
    const { messages, remaining } = parseMessages(buf);
    buf = remaining;
    for (const msg of messages) queue.push(msg);
    drainQueue();
  });

  // If this socket owned an in-progress QR login, abort it so globalLock
  // releases and tool calls from other clients aren't blocked for minutes.
  socket.on("close", () => {
    if (activeLogin && activeLogin.socket === socket) {
      activeLogin.abort.abort();
    }
  });

  // Node requires an error listener on sockets. EPIPE/ECONNRESET happen when the peer
  // disappears mid-write; log for diagnostics but don't crash the master.
  socket.on("error", (err) => {
    console.error("[mcp-telegram] IPC socket error:", err.message);
  });
}

function send(socket: Socket, msg: IpcMessage): void {
  if (!socket.destroyed) socket.write(encodeMessage(msg));
}

async function handleToolRequest(socket: Socket, req: IpcToolRequest, mcpServer: McpServerInternal) {
  const tool = mcpServer._registeredTools[req.tool];
  const response: IpcToolResponse = { type: "tool_response", id: req.id };

  if (!tool) {
    response.error = `Unknown tool: ${req.tool}`;
  } else {
    // telegram-logout must cancel an in-progress QR login instead of queueing behind it
    // for up to 5 minutes. Aborting releases the globalLock held by handleLoginStart.
    if (req.tool === "telegram-logout" && activeLogin) {
      activeLogin.abort.abort();
    }
    const unlock = await globalLock.acquire();
    try {
      response.result = await tool.handler(req.args ?? {}, {});
    } catch (err) {
      response.error = err instanceof Error ? err.message : String(err);
    } finally {
      unlock();
    }
  }

  send(socket, response);
}

async function handleLoginStart(socket: Socket, req: IpcLoginStart, telegram: TelegramService) {
  const fail = (error: string) => send(socket, { type: "login_done", id: req.id, success: false, error });

  if (activeLogin) {
    fail("Another QR login is already in progress");
    return;
  }

  const abort = new AbortController();
  activeLogin = { socket, abort };
  const unlock = await globalLock.acquire();
  try {
    const result = await telegram.startQrLogin(
      () => {},
      (url) => send(socket, { type: "login_qr", id: req.id, url }),
      abort.signal,
    );

    if (result.success) {
      const me = await telegram.getMe();
      send(socket, { type: "login_done", id: req.id, success: true, username: me.username ?? undefined });
    } else {
      fail(result.message);
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  } finally {
    activeLogin = null;
    unlock();
  }
}

export interface OwnerHandle {
  server: McpServer;
  srv: Server;
  gracefulExit: () => Promise<void>;
}

/**
 * Bootstrap the connection owner shared by master (stdio) and serve (daemon) modes:
 * build the tool registry, listen on the IPC socket, install a graceful shutdown that
 * disconnects Telegram, and auto-connect the single client. No stdio is attached here —
 * the caller decides whether to also serve a stdio MCP session (master) or not (serve).
 */
export async function startOwner(
  telegram: TelegramService,
  version: string,
  opts: { label?: string } = {},
): Promise<OwnerHandle> {
  const label = opts.label ?? "mcp-telegram";

  const server = new McpServer({ name: "mcp-telegram", version });
  registerTools(server, telegram);
  const mcpServer = server as unknown as McpServerInternal;

  // Remove a stale socket file from a previous crash before attempting to listen.
  releaseSocket();

  const sock = socketPath();
  const srv = createServer((socket) => {
    console.error(`[${label}] client connected`);
    socket.on("close", () => console.error(`[${label}] client disconnected`));
    handleClient(socket, mcpServer, telegram);
  });

  await new Promise<void>((resolve, reject) => {
    srv.listen(sock, resolve);
    srv.once("error", reject);
  });

  const { chmod } = await import("node:fs/promises");
  try {
    await chmod(sock, 0o600);
  } catch {}

  console.error(`[${label}] IPC socket ready: ${sock}`);

  let shuttingDown = false;
  const gracefulExit = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error(`[${label}] Shutting down, disconnecting from Telegram...`);
    try {
      await telegram.disconnect();
    } catch (err) {
      console.error(`[${label}] Disconnect error:`, err);
    }
    process.exit(0);
  };

  process.on("SIGINT", gracefulExit);
  process.on("SIGTERM", gracefulExit);

  // Auto-connect with saved session — catch to avoid unhandled rejection.
  telegram
    .loadSession()
    .then(async () => {
      if (await telegram.connect()) {
        const me = await telegram.getMe();
        console.error(`[${label}] connected as @${me.username}`);
      } else if (telegram.lastError) {
        console.error(`[${label}] ${telegram.lastError}`);
      }
    })
    .catch((err: unknown) => {
      console.error(`[${label}] Auto-connect failed:`, err);
    });

  return { server, srv, gracefulExit };
}

export async function runMaster(apiId: number, apiHash: string, version: string): Promise<void> {
  const telegram = new TelegramService(apiId, apiHash);
  const { server, gracefulExit } = await startOwner(telegram, version, { label: "mcp-telegram (master)" });

  // Parent (Claude Code / MCP client) can close stdio without sending a signal.
  // Without this, the process keeps running as an orphan with a live Telegram connection,
  // blocking auth_key from being reused — causes AUTH_KEY_DUPLICATED on next start.
  process.stdin.on("end", gracefulExit);

  // Master also serves the launching window directly over stdio.
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp-telegram] MCP server running on stdio (master)");
}
