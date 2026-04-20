import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import { reactionToEmoji } from "../telegram-client.js";

describe("reactionToEmoji", () => {
  it("returns emoticon for ReactionEmoji", () => {
    const r = new Api.ReactionEmoji({ emoticon: "👍" });
    assert.strictEqual(reactionToEmoji(r), "👍");
  });

  it("returns custom:<id> for ReactionCustomEmoji", () => {
    const r = new Api.ReactionCustomEmoji({ documentId: bigInt(12345) });
    assert.strictEqual(reactionToEmoji(r), "custom:12345");
  });

  it("returns star for ReactionPaid", () => {
    const r = new Api.ReactionPaid();
    assert.strictEqual(reactionToEmoji(r), "⭐");
  });

  it("returns null for ReactionEmpty", () => {
    const r = new Api.ReactionEmpty();
    assert.strictEqual(reactionToEmoji(r), null);
  });
});
