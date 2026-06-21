import assert from "node:assert";
import { describe, it } from "node:test";
import { Api } from "telegram/tl/index.js";
import { completeTwoFactorLogin } from "../telegram-client.js";

/**
 * Tests for the SRP cloud-password (2FA) step of QR login. The branch runs when
 * Telegram answers a scanned QR with SESSION_PASSWORD_NEEDED. We stub the client
 * `invoke` and inject a fake `compute` so the GetPassword → computeCheck →
 * CheckPassword orchestration is exercised without GramJS's real crypto or a
 * live TelegramClient.
 */

/** Opaque stand-ins — the helper only forwards these between calls, never
 *  inspects them (the real crypto lives in the injected `compute`). */
const PASSWORD_INFO = { _: "account.password" } as unknown as Api.account.Password;
const fakeSrp = { _: "inputCheckPasswordSRP" } as unknown as Api.TypeInputCheckPasswordSRP;

const okCompute = async () => fakeSrp;

describe("completeTwoFactorLogin", () => {
  it("returns a guiding message when no password is supplied", async () => {
    let invoked = false;
    const client = {
      invoke: async () => {
        invoked = true;
        return undefined;
      },
    };

    const outcome = await completeTwoFactorLogin(client, undefined, okCompute);

    assert.strictEqual(outcome.ok, false);
    assert.ok(!invoked, "must not contact Telegram when there is no password to check");
    assert.match(outcome.ok === false ? outcome.message : "", /TELEGRAM_2FA_PASSWORD/);
  });

  it("treats an empty-string password as missing", async () => {
    const outcome = await completeTwoFactorLogin({ invoke: async () => undefined }, "", okCompute);
    assert.strictEqual(outcome.ok, false);
    assert.match(outcome.ok === false ? outcome.message : "", /2FA is enabled/);
  });

  it("surfaces a clear failure when the SRP check is rejected", async () => {
    const client = {
      invoke: async (request: unknown) => {
        if (request instanceof Api.account.GetPassword) return PASSWORD_INFO;
        // Telegram rejects a wrong cloud password at CheckPassword
        throw Object.assign(new Error("PASSWORD_HASH_INVALID"), {
          errorMessage: "PASSWORD_HASH_INVALID",
        });
      },
    };

    const outcome = await completeTwoFactorLogin(client, "wrong-password", okCompute);

    assert.strictEqual(outcome.ok, false);
    const msg = outcome.ok === false ? outcome.message : "";
    assert.match(msg, /2FA password check failed/);
    assert.match(msg, /PASSWORD_HASH_INVALID/);
    assert.match(msg, /Verify TELEGRAM_2FA_PASSWORD/);
    assert.ok(!msg.includes("wrong-password"), "must never echo the password back");
  });

  it("maps a thrown computeCheck (malformed SRP params) to a clear failure", async () => {
    const client = {
      invoke: async (request: unknown) => {
        if (request instanceof Api.account.GetPassword) return PASSWORD_INFO;
        throw new Error("CheckPassword should not be reached");
      },
    };
    const throwingCompute = async () => {
      throw new Error("Invalid password params");
    };

    const outcome = await completeTwoFactorLogin(client, "pw", throwingCompute);

    assert.strictEqual(outcome.ok, false);
    assert.match(outcome.ok === false ? outcome.message : "", /2FA password check failed: Invalid password params/);
  });

  it("succeeds when GetPassword and CheckPassword both resolve", async () => {
    const calls: string[] = [];
    let srpHandedToCheck: unknown;
    const client = {
      invoke: async (request: unknown) => {
        if (request instanceof Api.account.GetPassword) {
          calls.push("GetPassword");
          return PASSWORD_INFO;
        }
        if (request instanceof Api.auth.CheckPassword) {
          calls.push("CheckPassword");
          srpHandedToCheck = request.password;
          // Helper ignores the return value; a sentinel is enough.
          return { _: "auth.authorization" };
        }
        throw new Error(`unexpected invoke: ${String(request)}`);
      },
    };

    const outcome = await completeTwoFactorLogin(client, "correct-password", okCompute);

    assert.strictEqual(outcome.ok, true);
    assert.deepStrictEqual(calls, ["GetPassword", "CheckPassword"]);
    assert.strictEqual(srpHandedToCheck, fakeSrp, "computed SRP must flow into CheckPassword");
  });
});
