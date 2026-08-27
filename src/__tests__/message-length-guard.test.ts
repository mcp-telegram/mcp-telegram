import assert from "node:assert";
import { describe, it } from "node:test";
import { HTMLParser } from "telegram/extensions/html.js";
import { checkMessageLength, MAX_MESSAGE_LENGTH } from "../tools/shared.js";

/**
 * `MESSAGE_TOO_LONG` was 18 of 22 `telegram-send-message` errors over 7 days, so the tools
 * now reject over-long text locally instead of paying an MTProto round-trip for an opaque
 * error that names neither the limit nor the overshoot.
 *
 * The subtlety this file pins: Telegram applies the 4096 cap to the PARSED message, not to
 * the markup source. GramJS strips `<b>`/`**` into entities before sending, so a 4097-char
 * HTML source can carry a perfectly legal 4090-char message. A naive `text.length` check
 * rejects that message — turning a working call into a failing one. Since parsed <= raw,
 * `raw <= limit` proves the message fits, but `raw > limit` proves nothing once a parseMode
 * is in play, so the guard defers to Telegram in exactly that case.
 */

describe("checkMessageLength", () => {
  it("accepts text at exactly the limit", () => {
    assert.equal(checkMessageLength("x".repeat(MAX_MESSAGE_LENGTH)), null);
  });

  it("rejects plain text over the limit and reports size and overshoot", () => {
    const msg = checkMessageLength("x".repeat(MAX_MESSAGE_LENGTH + 25));
    assert.ok(msg, "expected a rejection");
    assert.match(msg, /4121 characters/);
    assert.match(msg, /limit is 4096/);
    assert.match(msg, /25 over/);
  });

  it("defers to Telegram when a parseMode is set, because markup is not the sent text", () => {
    // Regression guard: this markup is 4097 raw chars but only 4090 once parsed, so Telegram
    // accepts it. Measuring the raw source rejected a legal message.
    const raw = `<b>${"x".repeat(MAX_MESSAGE_LENGTH - 6)}</b>`;
    const [parsed] = HTMLParser.parse(raw);

    assert.ok(raw.length > MAX_MESSAGE_LENGTH, "fixture must exceed the cap as raw markup");
    assert.ok(parsed.length <= MAX_MESSAGE_LENGTH, "fixture must fit once parsed");

    assert.equal(checkMessageLength(raw, "html"), null);
    assert.equal(checkMessageLength(raw, "md"), null);
  });

  it("still rejects when parseMode is explicitly undefined", () => {
    assert.ok(checkMessageLength("x".repeat(MAX_MESSAGE_LENGTH + 1), undefined));
  });
});
