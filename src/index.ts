#!/usr/bin/env node

// Redirect console.log to stderr BEFORE any imports.
// GramJS Logger uses console.log (stdout) which corrupts MCP JSON-RPC stream.
console.log = (...args: unknown[]) => {
  console.error(...args);
};

import "dotenv/config";
import { createRequire } from "node:module";
import { tryAcquireLock } from "./lock.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

// Telegram API credentials from env
const API_ID = Number(process.env.TELEGRAM_API_ID);
const API_HASH = process.env.TELEGRAM_API_HASH;

// Credentials are required only on the OWNER paths (serve/master) that open the real
// Telegram connection. A client proxies every call over IPC and never connects, so it
// runs without them — letting credentials stay only where the daemon runs.
function requireCreds(): void {
  if (!API_ID || !API_HASH) {
    console.error(
      "[mcp-telegram] Missing TELEGRAM_API_ID and TELEGRAM_API_HASH (required to own the Telegram connection)",
    );
    console.error("Get your credentials at https://my.telegram.org/apps (API development tools)");
    console.error("Set them in .env or export as environment variables");
    process.exit(1);
  }
}

async function main() {
  // Persistent daemon mode: `mcp-telegram serve` (or MCP_TELEGRAM_DAEMON=1). The daemon owns
  // the connection with no stdio attached; every other process becomes a client.
  if (process.argv[2] === "serve" || process.env.MCP_TELEGRAM_DAEMON === "1") {
    requireCreds();
    console.error("[mcp-telegram] Starting in serve (daemon) mode");
    const { runServe } = await import("./serve.js");
    await runServe(API_ID, API_HASH as string, version);
    return;
  }

  const isMaster = tryAcquireLock();

  if (isMaster) {
    requireCreds();
    console.error("[mcp-telegram] Starting as master process");
    const { runMaster } = await import("./master.js");
    await runMaster(API_ID, API_HASH as string, version);
  } else {
    // Client proxies all tool calls to the owner over IPC; the dummy TelegramService is
    // never used for real calls, so API credentials are optional here.
    console.error("[mcp-telegram] Starting as client process (owner already running)");
    const { runClient } = await import("./client.js");
    await runClient(API_ID || 0, API_HASH ?? "", version);
  }
}

main().catch((err) => {
  console.error("[mcp-telegram] Fatal:", err);
  process.exit(1);
});
