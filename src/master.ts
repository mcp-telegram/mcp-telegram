import { createServer, type Server, type Socket } from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  encodeMessage,
  type IpcRequest,
  type IpcResponse,
  type McpServerInternal,
  parseMessages,
} from "./ipc-protocol.js";
import { releaseLock, releaseSocket, socketPath } from "./lock.js";
import { TelegramService } from "./telegram-client.js";
import { registerTools } from "./tools/index.js";

let socketServer: Server | null = null;
let cleanedUp = false;

function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  releaseLock();
  releaseSocket();
  socketServer?.close();
}

process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

export function handleClient(socket: Socket, mcpServer: McpServerInternal) {
  let buf = "";
  // Processing queue — ensures sequential handling even when handler awaits
  let processing = false;
  const queue: IpcRequest[] = [];

  async function drainQueue() {
    if (processing) return;
    processing = true;
    while (queue.length > 0) {
      const req = queue.shift();
      if (!req) break;
      const tool = mcpServer._registeredTools[req.tool];
      const response: IpcResponse = { id: req.id };

      if (!tool) {
        response.error = `Unknown tool: ${req.tool}`;
      } else {
        try {
          response.result = await tool.handler(req.args ?? {}, {});
        } catch (err) {
          response.error = err instanceof Error ? err.message : String(err);
        }
      }

      if (!socket.destroyed) {
        socket.write(encodeMessage(response));
      }
    }
    processing = false;
  }

  socket.on("data", (chunk) => {
    buf += chunk.toString("utf-8");
    const { messages, remaining } = parseMessages(buf);
    buf = remaining;
    for (const msg of messages) {
      const req = msg as IpcRequest;
      if (!req.id || !req.tool) continue;
      queue.push(req);
    }
    drainQueue();
  });

  socket.on("error", () => {});
}

export async function runMaster(apiId: number, apiHash: string, version: string): Promise<void> {
  const telegram = new TelegramService(apiId, apiHash);

  const server = new McpServer({ name: "mcp-telegram", version });
  registerTools(server, telegram);
  const mcpServer = server as unknown as McpServerInternal;

  // Remove stale socket file from previous crash before attempting to listen (HIGH-2)
  releaseSocket();

  const sock = socketPath();
  const srv = createServer((socket) => handleClient(socket, mcpServer));
  socketServer = srv;

  await new Promise<void>((resolve, reject) => {
    srv.listen(sock, resolve);
    srv.once("error", reject);
  });

  const { chmod } = await import("node:fs/promises");
  try {
    await chmod(sock, 0o600);
  } catch {}

  console.error(`[mcp-telegram] Master mode — IPC socket ready: ${sock}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp-telegram] MCP server running on stdio (master)");

  // Auto-connect with saved session — catch to avoid unhandled rejection (MEDIUM-2)
  telegram
    .loadSession()
    .then(async () => {
      if (await telegram.connect()) {
        const me = await telegram.getMe();
        console.error(`[mcp-telegram] Auto-connected as @${me.username}`);
      } else if (telegram.lastError) {
        console.error(`[mcp-telegram] ${telegram.lastError}`);
      }
    })
    .catch((err: unknown) => {
      console.error("[mcp-telegram] Auto-connect failed:", err);
    });
}
