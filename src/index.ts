#!/usr/bin/env node

// Redirect console.log to stderr BEFORE any imports.
// GramJS Logger uses console.log (stdout) which corrupts MCP JSON-RPC stream.
const _origLog = console.log;
console.log = (...args: unknown[]) => {
  console.error(...args);
};

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TelegramService } from "./telegram-client.js";
import { registerTools } from "./tools/index.js";

// Telegram API credentials from env
const API_ID = Number(process.env.TELEGRAM_API_ID);
const API_HASH = process.env.TELEGRAM_API_HASH;

if (!API_ID || !API_HASH) {
  console.error("[mcp-telegram] Missing TELEGRAM_API_ID and TELEGRAM_API_HASH");
  console.error("Get your credentials at https://my.telegram.org/apps (API development tools)");
  console.error("Set them in .env or export as environment variables");
  process.exit(1);
}

const telegram = new TelegramService(API_ID, API_HASH);

const server = new McpServer({
  name: "mcp-telegram",
  version: "1.0.0",
});

registerTools(server, telegram);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp-telegram] MCP server running on stdio");

  // Auto-connect with saved session after MCP is ready (non-blocking)
  telegram.loadSession().then(async () => {
    if (await telegram.connect()) {
      const me = await telegram.getMe();
      console.error(`[mcp-telegram] Auto-connected as @${me.username}`);
    } else if (telegram.lastError) {
      console.error(`[mcp-telegram] ${telegram.lastError}`);
    }
  });
}

main().catch((err) => {
  console.error("[mcp-telegram] Fatal:", err);
  process.exit(1);
});
