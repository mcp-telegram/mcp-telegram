import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { NetworkError, AuthError, RateLimitError, retryWithBackoff } from "../errors.js";

describe("NetworkError", () => {
  it("should identify network errors from message patterns", () => {
    const errors = [
      { message: "Connection TIMEOUT" },
      { errorMessage: "ETIMEDOUT" },
      { message: "ECONNREFUSED" },
      { message: "network error occurred" },
    ];

    for (const err of errors) {
      assert.ok(NetworkError.isNetworkError(err), `Should detect network error: ${JSON.stringify(err)}`);
    }
  });

  it("should not identify non-network errors", () => {
    const errors = [
      { message: "AUTH_KEY_UNREGISTERED" },
      { message: "Something else" },
    ];

    for (const err of errors) {
      assert.ok(!NetworkError.isNetworkError(err), `Should not detect network error: ${JSON.stringify(err)}`);
    }
  });
});

describe("AuthError", () => {
  it("should identify auth errors from message patterns", () => {
    const errors = [
      { errorMessage: "AUTH_KEY_UNREGISTERED" },
      { errorMessage: "SESSION_REVOKED" },
      { message: "USER_DEACTIVATED" },
    ];

    for (const err of errors) {
      assert.ok(AuthError.isAuthError(err), `Should detect auth error: ${JSON.stringify(err)}`);
    }
  });

  it("should not identify non-auth errors", () => {
    const errors = [
      { message: "TIMEOUT" },
      { message: "Something else" },
    ];

    for (const err of errors) {
      assert.ok(!AuthError.isAuthError(err), `Should not detect auth error: ${JSON.stringify(err)}`);
    }
  });
});

describe("RateLimitError", () => {
  it("should identify rate limit errors", () => {
    const errors = [
      { errorMessage: "FLOOD_WAIT_10" },
      { message: "Too Many Requests" },
    ];

    for (const err of errors) {
      assert.ok(RateLimitError.isRateLimitError(err), `Should detect rate limit error: ${JSON.stringify(err)}`);
    }
  });
});

describe("retryWithBackoff", () => {
  it("should succeed on first attempt", async () => {
    let attempts = 0;
    const result = await retryWithBackoff(async () => {
      attempts++;
      return "success";
    }, { maxAttempts: 3, initialDelayMs: 10 });

    assert.equal(result, "success");
    assert.equal(attempts, 1);
  });

  it("should retry on network errors and eventually succeed", async () => {
    let attempts = 0;
    const result = await retryWithBackoff(async () => {
      attempts++;
      if (attempts < 3) {
        throw { message: "Connection TIMEOUT" };
      }
      return "success";
    }, { maxAttempts: 3, initialDelayMs: 10 });

    assert.equal(result, "success");
    assert.equal(attempts, 3);
  });

  it("should throw NetworkError after max attempts", async () => {
    let attempts = 0;
    await assert.rejects(
      async () => {
        await retryWithBackoff(async () => {
          attempts++;
          throw { message: "Connection TIMEOUT" };
        }, { maxAttempts: 2, initialDelayMs: 10 });
      },
      (err: Error) => {
        assert.ok(err instanceof NetworkError);
        assert.ok(err.message.includes("failed after 2 attempts"));
        return true;
      }
    );
    assert.equal(attempts, 2);
  });

  it("should not retry on auth errors", async () => {
    let attempts = 0;
    await assert.rejects(
      async () => {
        await retryWithBackoff(async () => {
          attempts++;
          throw { errorMessage: "AUTH_KEY_UNREGISTERED" };
        }, { maxAttempts: 3, initialDelayMs: 10 });
      },
      (err: unknown) => {
        const e = err as { errorMessage?: string };
        assert.equal(e.errorMessage, "AUTH_KEY_UNREGISTERED");
        return true;
      }
    );
    assert.equal(attempts, 1, "Should not retry on auth errors");
  });

  it("should not retry on non-network errors", async () => {
    let attempts = 0;
    await assert.rejects(
      async () => {
        await retryWithBackoff(async () => {
          attempts++;
          throw new Error("Some other error");
        }, { maxAttempts: 3, initialDelayMs: 10 });
      },
      (err: Error) => {
        assert.equal(err.message, "Some other error");
        return true;
      }
    );
    assert.equal(attempts, 1, "Should not retry on non-network errors");
  });
});
