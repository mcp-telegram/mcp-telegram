import assert from "node:assert";
import { describe, it } from "node:test";
import { encodeMessage, parseMessages } from "../ipc-protocol.js";

describe("encodeMessage", () => {
  it("encodes request as NDJSON line", () => {
    const line = encodeMessage({ id: "1", tool: "foo", args: { x: 1 } });
    assert.strictEqual(line, '{"id":"1","tool":"foo","args":{"x":1}}\n');
  });

  it("encodes response with result", () => {
    const line = encodeMessage({ id: "2", result: { ok: true } });
    assert.strictEqual(line, '{"id":"2","result":{"ok":true}}\n');
  });

  it("encodes response with error", () => {
    const line = encodeMessage({ id: "3", error: "something went wrong" });
    assert.strictEqual(line, '{"id":"3","error":"something went wrong"}\n');
  });
});

describe("parseMessages", () => {
  it("parses single complete line", () => {
    const msg = { id: "1", tool: "ping", args: {} };
    const { messages, remaining } = parseMessages(`${JSON.stringify(msg)}\n`);
    assert.strictEqual(messages.length, 1);
    assert.deepStrictEqual(messages[0], msg);
    assert.strictEqual(remaining, "");
  });

  it("parses multiple messages in one chunk", () => {
    const m1 = { id: "1", tool: "a", args: {} };
    const m2 = { id: "2", result: 42 };
    const { messages } = parseMessages(`${JSON.stringify(m1)}\n${JSON.stringify(m2)}\n`);
    assert.strictEqual(messages.length, 2);
    assert.deepStrictEqual(messages[0], m1);
    assert.deepStrictEqual(messages[1], m2);
  });

  it("incomplete line → no messages, remaining holds the fragment", () => {
    const partial = '{"id":"1","tool":"foo"';
    const { messages, remaining } = parseMessages(partial);
    assert.strictEqual(messages.length, 0);
    assert.strictEqual(remaining, partial);
  });

  it("malformed JSON is skipped, valid messages still parsed", () => {
    const valid = { id: "2", result: "ok" };
    const { messages } = parseMessages(`not-json\n${JSON.stringify(valid)}\n`);
    assert.strictEqual(messages.length, 1);
    assert.deepStrictEqual(messages[0], valid);
  });

  it("empty lines are ignored", () => {
    const msg = { id: "1", tool: "x", args: {} };
    const { messages } = parseMessages(`\n\n${JSON.stringify(msg)}\n\n`);
    assert.strictEqual(messages.length, 1);
  });

  it("fragmented chunks accumulate correctly across two calls", () => {
    const msg = { id: "1", tool: "foo", args: { a: "hello" } };
    const full = encodeMessage(msg);
    const split = Math.floor(full.length / 2);
    const half1 = full.slice(0, split);
    const half2 = full.slice(split);

    const r1 = parseMessages(half1);
    assert.strictEqual(r1.messages.length, 0);

    const r2 = parseMessages(r1.remaining + half2);
    assert.strictEqual(r2.messages.length, 1);
    assert.deepStrictEqual(r2.messages[0], msg);
    assert.strictEqual(r2.remaining, "");
  });

  it("two messages split across chunks", () => {
    const m1 = { id: "1", tool: "a", args: {} };
    const m2 = { id: "2", tool: "b", args: {} };
    const combined = encodeMessage(m1) + encodeMessage(m2);
    const split = Math.floor(combined.length / 2);

    const r1 = parseMessages(combined.slice(0, split));
    const r2 = parseMessages(r1.remaining + combined.slice(split));

    assert.strictEqual(r1.messages.length + r2.messages.length, 2);
  });

  it("whitespace-only lines are ignored", () => {
    const msg = { id: "5", error: "oops" };
    const { messages } = parseMessages(`   \n${JSON.stringify(msg)}\n   \n`);
    assert.strictEqual(messages.length, 1);
  });
});
