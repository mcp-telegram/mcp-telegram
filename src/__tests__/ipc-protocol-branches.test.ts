import assert from "node:assert";
import { describe, it } from "node:test";
import { encodeMessage, parseMessages } from "../ipc-protocol.js";

describe("parseMessages — edge cases", () => {
  it("malformed JSON line is skipped, valid lines still parsed", () => {
    const good = encodeMessage({ type: "tool", id: "1", tool: "ping", args: {} });
    const buf = `not-valid-json\n${good}`;
    const { messages, remaining } = parseMessages(buf);
    assert.strictEqual(messages.length, 1);
    assert.strictEqual(messages[0].id, "1");
    assert.strictEqual(remaining, "");
  });

  it("blank lines between messages are skipped", () => {
    const m1 = encodeMessage({ type: "tool", id: "a", tool: "foo", args: {} });
    const m2 = encodeMessage({ type: "tool", id: "b", tool: "bar", args: {} });
    const buf = `${m1}\n\n${m2}`;
    const { messages } = parseMessages(buf);
    assert.strictEqual(messages.length, 2);
  });

  it("partial line (no trailing newline) stays in remaining", () => {
    const partial = '{"type":"tool","id":"x","tool":"y"';
    const { messages, remaining } = parseMessages(partial);
    assert.strictEqual(messages.length, 0);
    assert.strictEqual(remaining, partial);
  });

  it("multiple complete messages in one chunk all parsed", () => {
    const msgs = [
      encodeMessage({ type: "tool", id: "1", tool: "a", args: {} }),
      encodeMessage({ type: "tool_response", id: "2", result: "ok" }),
      encodeMessage({ type: "tool_response", id: "3", error: "boom" }),
    ].join("");
    const { messages, remaining } = parseMessages(msgs);
    assert.strictEqual(messages.length, 3);
    assert.strictEqual(remaining, "");
  });

  it("empty buffer → no messages, empty remaining", () => {
    const { messages, remaining } = parseMessages("");
    assert.strictEqual(messages.length, 0);
    assert.strictEqual(remaining, "");
  });

  it("only newline → no messages, empty remaining", () => {
    const { messages, remaining } = parseMessages("\n");
    assert.strictEqual(messages.length, 0);
    assert.strictEqual(remaining, "");
  });
});

describe("encodeMessage", () => {
  it("produces newline-terminated JSON", () => {
    const encoded = encodeMessage({ type: "tool", id: "1", tool: "test", args: { x: 1 } });
    assert.ok(encoded.endsWith("\n"));
    const parsed = JSON.parse(encoded.trim());
    assert.strictEqual(parsed.type, "tool");
    assert.strictEqual(parsed.id, "1");
    assert.strictEqual(parsed.tool, "test");
  });

  it("round-trips through parseMessages", () => {
    const original = {
      type: "tool_response" as const,
      id: "abc",
      result: { content: [{ type: "text", text: "hello" }] },
    };
    const encoded = encodeMessage(original);
    const { messages } = parseMessages(encoded);
    assert.strictEqual(messages.length, 1);
    assert.deepStrictEqual(messages[0], original);
  });
});
