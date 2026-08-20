import assert from "node:assert";
import { describe, it } from "node:test";
import { extractFloodWaitSeconds, RateLimiter } from "../rate-limiter.js";

/**
 * Regression guard for GramJS-shaped flood errors.
 *
 * The limiter used to detect floods with `/FLOOD_WAIT_(\d+)/` against `errorMessage`. A real
 * GramJS `FloodWaitError` does not match that: its `errorMessage` is `"FLOOD"` (from the
 * FloodError base class) and the wait lives in `message` ("A wait of N seconds is required
 * (caused by ...)") plus a numeric `seconds` property. The whole retry/backoff branch was
 * therefore dead for real errors — production logged 0 `flood_wait` events in 30 days while
 * raw "A wait of N seconds is required" errors surfaced to users from telegram-archive-chat.
 *
 * These tests pin BOTH shapes so the branch cannot silently die again.
 */

/** Mirrors GramJS `FloodWaitError` (telegram/errors/RPCErrorList.js) without importing it. */
function gramJsFloodWaitError(seconds: number, request = "folders.EditPeerFolders"): Error {
  const err = new Error(`A wait of ${seconds} seconds is required (caused by ${request})`) as Error & {
    errorMessage: string;
    seconds: number;
    code: number;
  };
  err.errorMessage = "FLOOD";
  err.seconds = seconds;
  err.code = 420;
  return err;
}

describe("extractFloodWaitSeconds", () => {
  it("reads the wait from a GramJS FloodWaitError object", () => {
    const err = gramJsFloodWaitError(358);
    assert.strictEqual(extractFloodWaitSeconds(err, "FLOOD"), 358);
  });

  it("still reads the wait from a raw FLOOD_WAIT_N string", () => {
    const err = new Error("FLOOD_WAIT_42");
    assert.strictEqual(extractFloodWaitSeconds(err, "FLOOD_WAIT_42"), 42);
  });

  it("reads the wait from the message alone when no seconds property exists", () => {
    const err = new Error("A wait of 7 seconds is required (caused by messages.SendMessage)");
    assert.strictEqual(extractFloodWaitSeconds(err, err.message), 7);
  });

  it("does not treat an unrelated error carrying a seconds property as a flood", () => {
    const err = new Error("CHAT_ADMIN_REQUIRED") as Error & { seconds: number };
    err.seconds = 30;
    assert.strictEqual(extractFloodWaitSeconds(err, "CHAT_ADMIN_REQUIRED"), null);
  });

  it("returns null for ordinary errors", () => {
    const err = new Error("MESSAGE_AUTHOR_REQUIRED");
    assert.strictEqual(extractFloodWaitSeconds(err, err.message), null);
  });
});

describe("RateLimiter with GramJS flood errors", () => {
  it("retries a GramJS FloodWaitError instead of leaking it to the caller", async () => {
    const limiter = new RateLimiter({ maxRetries: 2, maxRequestsPerSecond: 100 });
    let attempts = 0;

    const result = await limiter.execute(async () => {
      attempts++;
      if (attempts < 2) throw gramJsFloodWaitError(0);
      return "recovered";
    }, "archiveChat");

    assert.strictEqual(result, "recovered");
    assert.strictEqual(attempts, 2);
  });

  it("reports the required wait when throwOnFloodWait is set", async () => {
    const limiter = new RateLimiter({ maxRetries: 2, maxRequestsPerSecond: 100 });

    await assert.rejects(
      limiter.execute(
        async () => {
          throw gramJsFloodWaitError(358);
        },
        "archiveChat",
        { throwOnFloodWait: true },
      ),
      (err: Error) => {
        assert.match(err.message, /requires a 358s wait for archiveChat/);
        assert.match(err.message, /6 minute/);
        return true;
      },
    );
  });

  it("gives a rate-limit message, not a raw GramJS string, after exhausting retries", async () => {
    const limiter = new RateLimiter({ maxRetries: 1, maxRequestsPerSecond: 100 });

    await assert.rejects(
      limiter.execute(async () => {
        throw gramJsFloodWaitError(0);
      }, "archiveChat"),
      (err: Error) => {
        assert.match(err.message, /Rate limit exceeded after 1 retries/);
        assert.doesNotMatch(err.message, /A wait of/);
        return true;
      },
    );
  });
});
