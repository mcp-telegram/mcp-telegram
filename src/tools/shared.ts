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

/**
 * Page text from a third party: one line, and square brackets swapped for round ones
 * so the page cannot close the media label and fake a message line of its own.
 */
function oneLineThirdParty(text: string): string {
  return text.replace(/\s+/g, " ").replace(/\[/g, "(").replace(/\]/g, ")").trim();
}

/**
 * Message text from another Telegram user: continuation lines are indented, so a message
 * cannot start a line of its own that looks like the next `[#id] [date] sender:` entry.
 */
export function messageText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\n/g, "\n  ");
}

/** A name chosen by another user (sender, chat title): kept on one line. */
export function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Format a message media descriptor like: [photo], [document: a.pdf], [webpage: Title | Instant View: ...].
 * Instant View text comes from a third-party page, so it is labelled and kept on one line.
 */
export function formatMedia(media?: { type: string; fileName?: string; title?: string; text?: string }): string {
  if (!media) return "";
  const parts = [oneLineThirdParty(media.fileName ?? media.title ?? "")];
  if (media.text) parts.push(`Instant View: ${oneLineThirdParty(media.text)}`);
  const details = parts.filter(Boolean).join(" | ");
  return ` [${media.type}${details ? `: ${details}` : ""}]`;
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

/**
 * Telegram's hard cap for a single message's text, in UTF-16 code units — the same unit
 * `String.length` counts, and the same unit MTProto measures. Captions are capped lower
 * (1024) but that limit is enforced by the media tools.
 */
export const MAX_MESSAGE_LENGTH = 4096;

/**
 * Pre-flight check for message text length.
 *
 * Without it, an over-long message costs a full MTProto round-trip and comes back as the
 * opaque `400: MESSAGE_TOO_LONG (caused by messages.SendMessage)` — the single most common
 * `telegram-send-message` failure in production (18 of 22 errors over 7 days), because LLM
 * clients have no feel for the 4096 cap. Returning the measured size and the overshoot lets
 * the caller fix it in one step instead of guessing.
 *
 * Deliberately NOT auto-splitting: silently turning one requested message into three is a
 * visible, unrequested action in someone else's chat.
 *
 * Returns null (defer to Telegram) whenever `parseMode` is set — see the comment inside.
 */
export function checkMessageLength(text: string, parseMode?: string): string | null {
  // Telegram applies the cap to the PARSED message, not to the markup source: GramJS strips
  // `<b>`/`**` into entities before sending, so a 4097-char HTML source can carry a legal
  // 4090-char message. Since parsed <= raw, `raw <= limit` always implies the message fits,
  // but `raw > limit` proves nothing once markup is in play. Rather than reimplement the
  // GramJS parsers here, only decide locally when raw and parsed are the same string, and
  // otherwise leave the verdict to Telegram (i.e. the pre-existing behaviour).
  if (parseMode) return null;
  if (text.length <= MAX_MESSAGE_LENGTH) return null;
  const over = text.length - MAX_MESSAGE_LENGTH;
  return (
    `Message text is ${text.length} characters — Telegram's limit is ${MAX_MESSAGE_LENGTH} (${over} over). ` +
    `Split it into separate messages, or send it as a file with telegram-send-file.`
  );
}

/** Try to connect, return error text if failed */
export async function requireConnection(telegram: TelegramService): Promise<string | null> {
  if (await telegram.ensureConnected()) return null;
  const reason = telegram.lastError ? ` ${telegram.lastError}` : "";
  return `Not connected to Telegram.${reason} Run telegram-login first.`;
}
