import type { TelegramService } from "../telegram-client.js";

/** MCP tool annotation presets */
export const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;
export const WRITE = { readOnlyHint: false, openWorldHint: true } as const;
export const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: true } as const;

/** Remove unpaired UTF-16 surrogates that break JSON serialization */
export function sanitize(text: string): string {
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD");
}

/** Helper: success response — always sanitizes to prevent surrogate crashes */
export function ok(text: string) {
  return { content: [{ type: "text" as const, text: sanitize(text) }] };
}

/** Helper: error response with isError flag */
export function fail(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text" as const, text: `Error: ${sanitize(msg)}` }], isError: true as const };
}

/** Format reactions array into compact text like: [👍×5 ❤️×3(me) 🔥×1] */
export function formatReactions(reactions?: { emoji: string; count: number; me: boolean }[]): string {
  if (!reactions?.length) return "";
  const parts = reactions.map((r) => `${r.emoji}×${r.count}${r.me ? "(me)" : ""}`);
  return ` [${parts.join(" ")}]`;
}

/** Try to connect, return error text if failed */
export async function requireConnection(telegram: TelegramService): Promise<string | null> {
  if (await telegram.ensureConnected()) return null;
  const reason = telegram.lastError ? ` ${telegram.lastError}` : "";
  return `Not connected to Telegram.${reason} Run telegram-login first.`;
}
