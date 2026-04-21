import assert from "node:assert";
import { describe, it } from "node:test";
import { RateLimiter } from "../rate-limiter.js";

/**
 * Tests for branches not covered by the existing rate-limiter.test.ts:
 *  - throwOnFloodWait option
 *  - network errors exhausting maxRetries
 *  - temporary (5xx) errors with retry and exhaustion
 *  - errorMessage field on GramJS error objects (vs .message)
 *  - maxRetryDelay cap
 */

describe("RateLimiter — throwOnFloodWait", () => {
  it("FLOOD_WAIT + throwOnFloodWait=true → throws immediately with wait message", async () => {
    const limiter = new RateLimiter({ maxRetries: 3, maxRequestsPerSecond: 100 });

    await assert.rejects(
      () =>
        limiter.execute(
          async () => {
            throw new Error("FLOOD_WAIT_30");
          },
          "test-context",
          { throwOnFloodWait: true },
        ),
      (err: Error) => {
        assert.match(err.message, /Rate limit: Telegram requires a 30s wait/);
        assert.match(err.message, /test-context/);
        return true;
      },
    );
  });

  it("throwOnFloodWait=true → does NOT retry (only 1 fn call)", async () => {
    const limiter = new RateLimiter({ maxRetries: 3, maxRequestsPerSecond: 100 });
    let calls = 0;

    await assert.rejects(() =>
      limiter.execute(
        async () => {
          calls++;
          throw new Error("FLOOD_WAIT_5");
        },
        "ctx",
        { throwOnFloodWait: true },
      ),
    );

    assert.strictEqual(calls, 1);
  });

  it("FLOOD_WAIT wait time shown in minutes when >= 60s", async () => {
    const limiter = new RateLimiter({ maxRetries: 3, maxRequestsPerSecond: 100 });

    await assert.rejects(
      () =>
        limiter.execute(
          async () => {
            throw new Error("FLOOD_WAIT_120");
          },
          "ctx",
          { throwOnFloodWait: true },
        ),
      (err: Error) => {
        assert.match(err.message, /2 minute/);
        return true;
      },
    );
  });
});

describe("RateLimiter — network errors", () => {
  it("exhausts maxRetries on network error → throws with retry count in message", async () => {
    const limiter = new RateLimiter({
      maxRetries: 2,
      initialRetryDelay: 1,
      maxRequestsPerSecond: 100,
    });
    let calls = 0;

    await assert.rejects(
      () =>
        limiter.execute(async () => {
          calls++;
          throw new Error("ECONNREFUSED");
        }),
      (err: Error) => {
        assert.match(err.message, /Network error after 2 retries/);
        assert.match(err.message, /ECONNREFUSED/);
        return true;
      },
    );

    assert.strictEqual(calls, 3); // initial + 2 retries
  });

  it("ETIMEDOUT is recognized as network error and retried", async () => {
    const limiter = new RateLimiter({ maxRetries: 1, initialRetryDelay: 1, maxRequestsPerSecond: 100 });
    let calls = 0;

    const result = await limiter.execute(async () => {
      calls++;
      if (calls === 1) throw new Error("ETIMEDOUT");
      return "ok";
    });

    assert.strictEqual(result, "ok");
    assert.strictEqual(calls, 2);
  });

  it("'timed out' substring is recognized as network error", async () => {
    const limiter = new RateLimiter({ maxRetries: 1, initialRetryDelay: 1, maxRequestsPerSecond: 100 });
    let calls = 0;

    const result = await limiter.execute(async () => {
      calls++;
      if (calls === 1) throw new Error("Request timed out waiting for response");
      return "recovered";
    });

    assert.strictEqual(result, "recovered");
  });
});

describe("RateLimiter — temporary (5xx) errors", () => {
  it("INTERNAL error → retries and recovers", async () => {
    const limiter = new RateLimiter({ maxRetries: 2, initialRetryDelay: 1, maxRequestsPerSecond: 100 });
    let calls = 0;

    const result = await limiter.execute(async () => {
      calls++;
      if (calls < 3) throw new Error("INTERNAL");
      return "ok";
    });

    assert.strictEqual(result, "ok");
    assert.strictEqual(calls, 3);
  });

  it("exhausts maxRetries on 5xx → throws with error message", async () => {
    const limiter = new RateLimiter({ maxRetries: 1, initialRetryDelay: 1, maxRequestsPerSecond: 100 });
    let calls = 0;

    await assert.rejects(
      () =>
        limiter.execute(async () => {
          calls++;
          throw new Error("Internal Server Error");
        }),
      (err: Error) => {
        assert.match(err.message, /Temporary error after 1 retries/);
        return true;
      },
    );

    assert.strictEqual(calls, 2); // initial + 1 retry
  });

  it("Service Unavailable is recognized as temporary error", async () => {
    const limiter = new RateLimiter({ maxRetries: 1, initialRetryDelay: 1, maxRequestsPerSecond: 100 });
    let calls = 0;

    await assert.rejects(() =>
      limiter.execute(async () => {
        calls++;
        throw new Error("Service Unavailable");
      }),
    );

    assert.strictEqual(calls, 2);
  });
});

describe("RateLimiter — GramJS errorMessage field", () => {
  it("uses errorMessage field from GramJS error objects instead of .message", async () => {
    const limiter = new RateLimiter({ maxRetries: 1, maxRequestsPerSecond: 100 });
    // GramJS errors have an `errorMessage` field (not .message)
    const gramJsError = Object.assign(new Error("RPCError"), { errorMessage: "FLOOD_WAIT_2" });

    await assert.rejects(
      () =>
        limiter.execute(async () => {
          throw gramJsError;
        }),
      (err: Error) => {
        // Should have recognized FLOOD_WAIT from errorMessage field
        assert.match(err.message, /Rate limit exceeded|Telegram requires 2s wait/);
        return true;
      },
    );
  });
});

describe("RateLimiter — maxRetryDelay cap", () => {
  it("delay is capped at maxRetryDelay (never sleeps longer)", async () => {
    const limiter = new RateLimiter({
      maxRetries: 3,
      initialRetryDelay: 100,
      maxRetryDelay: 150, // cap at 150ms
      maxRequestsPerSecond: 100,
    });
    let calls = 0;
    const start = Date.now();

    await assert.rejects(() =>
      limiter.execute(async () => {
        calls++;
        throw new Error("ECONNREFUSED");
      }),
    );

    const elapsed = Date.now() - start;
    // 3 retries × 150ms cap = 450ms max, not 100+200+400=700ms uncapped
    assert.ok(elapsed < 600, `Expected < 600ms with cap, got ${elapsed}ms`);
    assert.strictEqual(calls, 4); // initial + 3 retries
  });
});
