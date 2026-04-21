import assert from "node:assert";
import { describe, it } from "node:test";
import { DESTRUCTIVE, fail, formatReactions, ok, READ_ONLY, sanitize, WRITE } from "../../tools/shared.js";

describe("shared utilities", () => {
  describe("ok()", () => {
    it("should return success response with text content", () => {
      const result = ok("Operation successful");
      assert.deepStrictEqual(result, {
        content: [{ type: "text", text: "Operation successful" }],
      });
    });

    it("should handle empty string", () => {
      const result = ok("");
      assert.deepStrictEqual(result, {
        content: [{ type: "text", text: "" }],
      });
    });

    it("should auto-sanitize unpaired surrogates", () => {
      const result = ok("Name: \uD800bad");
      assert.strictEqual(result.content[0].text, "Name: \uFFFDbad");
    });
  });

  describe("fail()", () => {
    it("should return error response with isError flag", () => {
      const error = new Error("Something went wrong");
      const result = fail(error);
      assert.deepStrictEqual(result, {
        content: [{ type: "text", text: "Error: Something went wrong" }],
        isError: true,
      });
    });

    it("should handle string errors", () => {
      const result = fail("plain string error");
      assert.strictEqual(result.content[0].text, "Error: plain string error");
      assert.strictEqual(result.isError, true);
    });

    it("should handle non-Error objects via String()", () => {
      const result = fail({ message: "Custom error" });
      assert.ok(result.content[0].text.startsWith("Error:"));
      assert.strictEqual(result.isError, true);
    });

    it("should sanitize surrogate chars in error messages", () => {
      const result = fail(new Error("bad\uD800name"));
      assert.strictEqual(result.content[0].text, "Error: bad\uFFFDname");
    });
  });

  describe("sanitize()", () => {
    it("should remove unpaired high surrogates", () => {
      const input = "Hello\uD800World";
      const result = sanitize(input);
      assert.strictEqual(result, "Hello\uFFFDWorld");
    });

    it("should remove unpaired low surrogates", () => {
      const input = "Hello\uDC00World";
      const result = sanitize(input);
      assert.strictEqual(result, "Hello\uFFFDWorld");
    });

    it("should preserve valid surrogate pairs", () => {
      const input = "Hello\uD83D\uDE00World"; // 😀 emoji
      const result = sanitize(input);
      assert.strictEqual(result, "Hello\uD83D\uDE00World");
    });

    it("should handle normal text without surrogates", () => {
      const input = "Hello World";
      const result = sanitize(input);
      assert.strictEqual(result, "Hello World");
    });

    it("should handle empty string", () => {
      const result = sanitize("");
      assert.strictEqual(result, "");
    });
  });

  describe("formatReactions()", () => {
    it("should format reactions with counts", () => {
      const reactions = [
        { emoji: "👍", count: 5, me: false },
        { emoji: "❤️", count: 3, me: true },
        { emoji: "🔥", count: 1, me: false },
      ];
      const result = formatReactions(reactions);
      assert.strictEqual(result, " [👍×5 ❤️×3(me) 🔥×1]");
    });

    it("should mark reactions from current user", () => {
      const reactions = [{ emoji: "👍", count: 2, me: true }];
      const result = formatReactions(reactions);
      assert.strictEqual(result, " [👍×2(me)]");
    });

    it("should return empty string for undefined reactions", () => {
      const result = formatReactions(undefined);
      assert.strictEqual(result, "");
    });

    it("should return empty string for empty reactions array", () => {
      const result = formatReactions([]);
      assert.strictEqual(result, "");
    });

    it("should handle single reaction", () => {
      const reactions = [{ emoji: "🎉", count: 1, me: false }];
      const result = formatReactions(reactions);
      assert.strictEqual(result, " [🎉×1]");
    });
  });

  describe("MCP tool annotations", () => {
    it("should define READ_ONLY preset", () => {
      assert.deepStrictEqual(READ_ONLY, {
        readOnlyHint: true,
        openWorldHint: true,
      });
    });

    it("should define WRITE preset", () => {
      assert.deepStrictEqual(WRITE, {
        readOnlyHint: false,
        openWorldHint: true,
      });
    });

    it("should define DESTRUCTIVE preset", () => {
      assert.deepStrictEqual(DESTRUCTIVE, {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      });
    });
  });
});
