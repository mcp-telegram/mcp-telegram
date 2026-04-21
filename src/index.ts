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

if (!API_ID || !API_HASH) {
  console.error("[mcp-telegram] Missing TELEGRAM_API_ID and TELEGRAM_API_HASH");
  console.error("Get your credentials at https://my.telegram.org/apps (API development tools)");
  console.error("Set them in .env or export as environment variables");
  process.exit(1);
}

async function main() {
  const isMaster = tryAcquireLock();

  if (isMaster) {
    console.error("[mcp-telegram] Starting as master process");
    const { runMaster } = await import("./master.js");
    await runMaster(API_ID, API_HASH as string, version);
  } else {
    console.error("[mcp-telegram] Starting as client process (master already running)");
    const { runClient } = await import("./client.js");
    await runClient(API_ID, API_HASH as string, version);
  }
}

main().catch((err) => {
  console.error("[mcp-telegram] Fatal:", err);
  process.exit(1);
});
