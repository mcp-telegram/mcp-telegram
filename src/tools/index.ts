import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TelegramService } from "../telegram-client.js";
import { registerAccountTools } from "./account.js";
import { registerAuthTools } from "./auth.js";
import { registerChatTools } from "./chats.js";
import { registerContactTools } from "./contacts.js";
import { registerExtraTools } from "./extras.js";
import { registerMediaTools } from "./media.js";
import { registerMessageTools } from "./messages.js";
import { registerReactionTools } from "./reactions.js";

export function registerTools(server: McpServer, telegram: TelegramService) {
  registerAuthTools(server, telegram);
  registerMessageTools(server, telegram);
  registerChatTools(server, telegram);
  registerMediaTools(server, telegram);
  registerContactTools(server, telegram);
  registerReactionTools(server, telegram);
  registerExtraTools(server, telegram);
  registerAccountTools(server, telegram);
}
