import { randomUUID } from "node:crypto";
import { connect, type Socket } from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { encodeMessage, type IpcResponse, parseMessages } from "./ipc-protocol.js";
import { socketPath } from "./lock.js";
import { TelegramService } from "./telegram-client.js";
import { registerTools } from "./tools/index.js";

const CONNECT_TIMEOUT_MS = 5_000;
const IPC_CALL_TIMEOUT_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 5;

type PendingCall = { resolve: (r: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

/** Thin IPC proxy: forwards tool calls to the master process over Unix socket */
export class IpcClient {
  private socket: Socket | null = null;
  private pending = new Map<string, PendingCall>();
  private buf = "";
  private connected = false;

  async connect(): Promise<boolean> {
    return new Promise((resolve) => {
      const sock = socketPath();
      const s = connect(sock);

      // One-shot connect timeout — cleared immediately on connect (HIGH-3)
      const connectTimer = setTimeout(() => {
        s.destroy();
        resolve(false);
      }, CONNECT_TIMEOUT_MS);

      const onConnect = () => {
        clearTimeout(connectTimer);
        this.socket = s;
        this.connected = true;
        s.removeListener("error", onError);

        s.on("data", (chunk) => {
          this.buf += chunk.toString("utf-8");
          const { messages, remaining } = parseMessages(this.buf);
          this.buf = remaining;
          for (const msg of messages) {
            const res = msg as IpcResponse;
            const pending = this.pending.get(res.id);
            if (!pending) continue;
            clearTimeout(pending.timer);
            this.pending.delete(res.id);
            if (res.error) {
              pending.reject(new Error(res.error));
            } else {
              pending.resolve(res.result);
            }
          }
        });

        s.on("close", () => {
          this.connected = false;
          for (const [, p] of this.pending) {
            clearTimeout(p.timer);
            p.reject(new Error("IPC connection closed"));
          }
          this.pending.clear();
        });

        s.on("error", () => {});

        resolve(true);
      };

      const onError = () => {
        clearTimeout(connectTimer);
        resolve(false);
      };

      s.once("connect", onConnect);
      s.once("error", onError);
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  async call(tool: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.socket || !this.connected) {
      throw new Error("IPC client not connected");
    }
    const id = randomUUID();
    const socket = this.socket;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`IPC call timeout: ${tool}`));
      }, IPC_CALL_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      socket.write(encodeMessage({ id, tool, args }));
    });
  }

  destroy() {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("IPC client destroyed"));
    }
    this.pending.clear();
    this.socket?.destroy();
    this.socket = null;
    this.connected = false;
  }
}

// Access internal tool registry — field name "handler" confirmed in MCP SDK v1.29.0
type RegisteredTool = {
  handler: (args: Record<string, unknown>, extra: Record<string, unknown>) => Promise<unknown>;
};
interface McpServerInternal {
  _registeredTools: Record<string, RegisteredTool>;
}

function wireIpcProxies(server: McpServer, ipc: IpcClient): void {
  const s = server as unknown as McpServerInternal;
  for (const [name, tool] of Object.entries(s._registeredTools)) {
    Object.assign(tool, {
      handler: (args: Record<string, unknown>) => ipc.call(name, args),
    });
  }
}

export async function runClient(apiId: number, apiHash: string, version: string): Promise<void> {
  // Try to connect to master with retries — master may still be initializing its socket
  let ipc: IpcClient | null = null;
  for (let attempt = 0; attempt < MAX_RECONNECT_ATTEMPTS; attempt++) {
    const candidate = new IpcClient();
    if (await candidate.connect()) {
      ipc = candidate;
      break;
    }
    if (attempt < MAX_RECONNECT_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, 150 * 2 ** attempt)); // 150ms, 300ms, 600ms, 1200ms
    }
  }

  if (!ipc) {
    // Master acquired lock but socket not ready — this process should not become master
    // (it lost the lock race). Exit with clear message instead of creating two masters (CRITICAL-2)
    console.error("[mcp-telegram] Cannot connect to master process. Try again in a moment.");
    process.exit(1);
  }

  console.error(`[mcp-telegram] Client mode — proxying to master via ${socketPath()}`);

  // Register all tools for MCP schema; dummy telegram instance is never used for actual calls
  const telegram = new TelegramService(apiId, apiHash);
  const server = new McpServer({ name: "mcp-telegram", version });
  registerTools(server, telegram);

  // Replace all handlers with IPC-forwarding versions
  wireIpcProxies(server, ipc);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp-telegram] MCP server running on stdio (client)");
}
