import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TelegramService } from "../telegram-client.js";
import { registerAccountTools } from "./account.js";
import { registerAuthTools } from "./auth.js";
import { registerBoostTools } from "./boosts.js";
import { registerChatTools } from "./chats.js";
import { registerContactTools } from "./contacts.js";
import { registerExtraTools } from "./extras.js";
import { registerFactCheckTools } from "./fact-check.js";
import { registerGroupCallTools } from "./group-calls.js";
import { registerMediaTools } from "./media.js";
import { registerMessageTools } from "./messages.js";
import { registerQuickRepliesTools } from "./quick-replies.js";
import { registerReactionTools } from "./reactions.js";
import { registerSendMediaTools } from "./send-media.js";
import { registerStarsTools } from "./stars.js";
import { registerStickerTools } from "./stickers.js";
import { registerStoryTools } from "./stories.js";
import { registerTranscribeTools } from "./transcribe.js";

export function registerTools(server: McpServer, telegram: TelegramService) {
  registerAuthTools(server, telegram);
  registerMessageTools(server, telegram);
  registerChatTools(server, telegram);
  registerMediaTools(server, telegram);
  registerSendMediaTools(server, telegram);
  registerContactTools(server, telegram);
  registerReactionTools(server, telegram);
  registerTranscribeTools(server, telegram);
  registerFactCheckTools(server, telegram);
  registerExtraTools(server, telegram);
  registerAccountTools(server, telegram);
  registerStickerTools(server, telegram);
  registerStoryTools(server, telegram);
  registerBoostTools(server, telegram);
  registerGroupCallTools(server, telegram);
  registerStarsTools(server, telegram);
  registerQuickRepliesTools(server, telegram);
}
