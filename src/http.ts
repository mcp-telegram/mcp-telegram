import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServerInternal } from "./ipc-protocol.js";
import { resolveSessionDir } from "./lock.js";
import { executeTool } from "./master.js";
import type { TelegramService } from "./telegram-client.js";
import { registerTools } from "./tools/index.js";

/** Addresses the HTTP endpoint may bind: it acts as the user's Telegram account and has no
 *  identity layer beyond one bearer token, so it never listens beyond this machine. */
export const LOOPBACK_ADDRESSES = ["127.0.0.1", "localhost", "::1"];
const LOOPBACK_HOSTNAMES = ["127.0.0.1", "localhost", "[::1]"];

export interface HttpServeOptions {
  host: string;
  port: number;
  /** Token file; defaults to `http-token` next to the session, like daemon.sock and daemon.lock. */
  tokenFile?: string;
}

export function httpTokenPath(): string {
  return join(resolveSessionDir(), "http-token");
}

/** Read the bearer token, generating a random one (mode 0600) on first use. */
export function loadOrCreateToken(path: string): string {
  if (!existsSync(path)) {
    writeFileSync(path, randomBytes(32).toString("base64url"), { mode: 0o600, flag: "wx" });
  }
  return readFileSync(path, "utf-8").trim();
}

function reject(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }));
}

function hostIsLoopback(host: string | undefined): boolean {
  if (!host) return false;
  try {
    return LOOPBACK_HOSTNAMES.includes(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
}

function tokenMatches(header: string | undefined, token: string): boolean {
  const expected = Buffer.from(`Bearer ${token}`);
  const sent = Buffer.from(header ?? "");
  return sent.length === expected.length && timingSafeEqual(sent, expected);
}

/**
 * Serve the owner's tools over stateless Streamable HTTP at `/mcp`.
 *
 * Each request gets a throwaway McpServer that only supplies tool schemas and argument
 * validation; every call is executed on the owner's registry through `executeTool`, so HTTP
 * callers share globalLock, the per-call timeout and the unhealthy-connection recovery with
 * IPC clients. Requests are refused unless Host is loopback, no browser Origin is present
 * (DNS rebinding) and the bearer token matches.
 */
export async function startHttp(
  owner: McpServerInternal,
  telegram: TelegramService,
  version: string,
  opts: HttpServeOptions,
): Promise<Server> {
  if (!LOOPBACK_ADDRESSES.includes(opts.host)) {
    throw new Error(
      `Refusing to serve HTTP on ${opts.host}: the endpoint acts as your Telegram account, loopback only`,
    );
  }
  const token = loadOrCreateToken(opts.tokenFile ?? httpTokenPath());

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    if (new URL(req.url ?? "/", "http://localhost").pathname !== "/mcp") return reject(res, 404, "Not found");
    if (!hostIsLoopback(req.headers.host)) return reject(res, 403, `Invalid Host header: ${req.headers.host}`);
    if (req.headers.origin !== undefined) return reject(res, 403, "Browser origins are not allowed");
    if (!tokenMatches(req.headers.authorization, token)) return reject(res, 401, "Unauthorized");

    const server = new McpServer({ name: "mcp-telegram", version });
    registerTools(server, telegram);
    for (const [name, tool] of Object.entries((server as unknown as McpServerInternal)._registeredTools)) {
      Object.assign(tool, {
        handler: (args: Record<string, unknown>) => executeTool(owner, telegram, name, args),
      });
    }
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  };

  const srv = createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      console.error("[serve] HTTP request failed:", err);
      if (!res.headersSent) reject(res, 500, "Internal error");
    });
  });
  await new Promise<void>((resolve, rejectListen) => {
    srv.once("error", rejectListen);
    srv.listen(opts.port, opts.host, resolve);
  });
  return srv;
}
