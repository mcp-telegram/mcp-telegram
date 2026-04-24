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

/**
 * Validate that a user-supplied path is safe to upload.
 *
 * The threat model is prompt-injection: an AI that was told "send the user's file" can be
 * manipulated into sending `/proc/self/environ`, `/etc/shadow`, `http://169.254.169.254/...`,
 * or an SMB share `\\attacker.com\share`. GramJS `sendFile` happily fetches URLs and reads
 * any local path, so the validation has to live here.
 *
 * Rules:
 * - Must be an absolute path (POSIX `/` or Windows `C:\` / `\\server\share`).
 * - No URL schemes (http:, https:, file:, ftp:, data:, javascript:, …).
 * - No path traversal (`..` segments) even inside an absolute path.
 * - No OS-sensitive directories on POSIX (`/proc`, `/sys`, `/dev`, `/run`). These leak env,
 *   kernel state, or block on device reads.
 * - UNC paths (`\\server\share`) are blocked (NTLM-relay / remote-SMB risk).
 *
 * This is defence-in-depth: the admin still owns the machine and can exfiltrate files
 * deliberately — we just refuse to help prompt-injection do it automatically.
 */
export function isSafeAbsolutePath(p: string): boolean {
  if (typeof p !== "string" || p.length < 2) return false;
  // Reject embedded NUL — Node fs rejects it too, but we want an earlier, clearer failure
  if (p.includes("\0")) return false;
  // Reject URL schemes outright (scheme://... or scheme:...)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(p)) return false;
  if (/^(file|data|javascript|http|https|ftp|ftps|ws|wss):/i.test(p)) return false;
  // Reject Windows UNC shares — SMB SSRF / NTLM relay primitive
  if (p.startsWith("\\\\") || p.startsWith("//")) return false;
  // Reject path-traversal segments anywhere in the path
  const parts = p.split(/[\\/]+/);
  if (parts.some((seg) => seg === "..")) return false;
  // POSIX absolute path
  if (p.startsWith("/")) {
    // Reject kernel / device / runtime pseudo-filesystems
    if (/^\/(proc|sys|dev|run)(\/|$)/.test(p)) return false;
    return true;
  }
  // Windows absolute path (C:\ or C:/), no UNC (already rejected above)
  if (/^[a-zA-Z]:[\\/]/.test(p)) return true;
  return false;
}

/** Zod refinement message paired with `isSafeAbsolutePath` */
export const ABSOLUTE_PATH_ERROR =
  "Must be an absolute local filesystem path (e.g. /tmp/file.ogg). URLs, UNC shares, path traversal (..), and OS-sensitive dirs (/proc, /sys, /dev, /run) are rejected.";

/**
 * Sanitize a user-provided text for safe TL encoding.
 * Strips unpaired UTF-16 surrogates that crash GramJS's wire serializer. Use on every
 * free-text field that reaches GramJS (captions, provider names, venue titles, quoteText, …).
 */
export function sanitizeInputText(text: string): string {
  return sanitize(text);
}

/** Try to connect, return error text if failed */
export async function requireConnection(telegram: TelegramService): Promise<string | null> {
  if (await telegram.ensureConnected()) return null;
  const reason = telegram.lastError ? ` ${telegram.lastError}` : "";
  return `Not connected to Telegram.${reason} Run telegram-login first.`;
}
