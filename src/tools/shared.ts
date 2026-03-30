import type { TelegramService } from "../telegram-client.js";
import { NetworkError, AuthError, RateLimitError } from "../errors.js";

/** MCP tool annotation presets */
export const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;
export const WRITE = { readOnlyHint: false, openWorldHint: true } as const;
export const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: true } as const;

/** Helper: success response */
export function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

/** Helper: error response with isError flag and improved error messages */
export function fail(e: unknown) {
  let errorMessage: string;
  
  if (e instanceof NetworkError) {
    errorMessage = `Network error: ${e.message}. This may be a temporary issue - the operation will be automatically retried. If the problem persists, check your internet connection.`;
  } else if (e instanceof AuthError) {
    errorMessage = `Authentication error: ${e.message}. You may need to re-authenticate using telegram-login.`;
  } else if (e instanceof RateLimitError) {
    errorMessage = `Rate limit error: ${e.message}. Please wait a moment before trying again.`;
  } else if (NetworkError.isNetworkError(e)) {
    const msg = (e as { errorMessage?: string; message?: string }).errorMessage || 
                (e as { errorMessage?: string; message?: string }).message || "Unknown network error";
    errorMessage = `Network error: ${msg}. This may be a temporary issue - please try again.`;
  } else if (AuthError.isAuthError(e)) {
    const msg = (e as { errorMessage?: string; message?: string }).errorMessage || 
                (e as { errorMessage?: string; message?: string }).message || "Authentication failed";
    errorMessage = `Authentication error: ${msg}. Run telegram-login to re-authenticate.`;
  } else if (RateLimitError.isRateLimitError(e)) {
    const msg = (e as { errorMessage?: string; message?: string }).errorMessage || 
                (e as { errorMessage?: string; message?: string }).message || "Rate limit exceeded";
    errorMessage = `Rate limit: ${msg}. Please wait before retrying.`;
  } else {
    errorMessage = `Error: ${(e as Error).message || String(e)}`;
  }
  
  return { content: [{ type: "text" as const, text: errorMessage }], isError: true as const };
}

/** Remove unpaired UTF-16 surrogates that break JSON serialization */
export function sanitize(text: string): string {
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD");
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
