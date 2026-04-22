import assert from "node:assert";
import { describe, it } from "node:test";
import { encodeMessage, parseMessages } from "../ipc-protocol.js";

describe("encodeMessage", () => {
  it("encodes tool request as NDJSON line", () => {
    const line = encodeMessage({ type: "tool", id: "1", tool: "foo", args: { x: 1 } });
    assert.strictEqual(line, '{"type":"tool","id":"1","tool":"foo","args":{"x":1}}\n');
  });

  it("encodes tool response with result", () => {
    const line = encodeMessage({ type: "tool_response", id: "2", result: { ok: true } });
    assert.strictEqual(line, '{"type":"tool_response","id":"2","result":{"ok":true}}\n');
  });

  it("encodes tool response with error", () => {
    const line = encodeMessage({ type: "tool_response", id: "3", error: "something went wrong" });
    assert.strictEqual(line, '{"type":"tool_response","id":"3","error":"something went wrong"}\n');
  });

  it("encodes login_start", () => {
    const line = encodeMessage({ type: "login_start", id: "42" });
    assert.strictEqual(line, '{"type":"login_start","id":"42"}\n');
  });

  it("encodes login_qr with url", () => {
    const line = encodeMessage({ type: "login_qr", id: "42", url: "tg://login?token=abc" });
    assert.strictEqual(line, '{"type":"login_qr","id":"42","url":"tg://login?token=abc"}\n');
  });

  it("encodes login_done success", () => {
    const line = encodeMessage({ type: "login_done", id: "42", success: true, username: "foo" });
    assert.strictEqual(line, '{"type":"login_done","id":"42","success":true,"username":"foo"}\n');
  });
});

describe("parseMessages", () => {
  it("parses single complete tool message", () => {
    const msg = { type: "tool" as const, id: "1", tool: "ping", args: {} };
    const { messages, remaining } = parseMessages(`${JSON.stringify(msg)}\n`);
    assert.strictEqual(messages.length, 1);
    assert.deepStrictEqual(messages[0], msg);
    assert.strictEqual(remaining, "");
  });

  it("parses mixed message types in one chunk", () => {
    const m1 = { type: "tool" as const, id: "1", tool: "a", args: {} };
    const m2 = { type: "tool_response" as const, id: "2", result: 42 };
    const { messages } = parseMessages(`${JSON.stringify(m1)}\n${JSON.stringify(m2)}\n`);
    assert.strictEqual(messages.length, 2);
    assert.deepStrictEqual(messages[0], m1);
    assert.deepStrictEqual(messages[1], m2);
  });

  it("incomplete line → no messages, remaining holds the fragment", () => {
    const partial = '{"type":"tool","id":"1","tool":"foo"';
    const { messages, remaining } = parseMessages(partial);
    assert.strictEqual(messages.length, 0);
    assert.strictEqual(remaining, partial);
  });

  it("malformed JSON is skipped, valid messages still parsed", () => {
    const valid = { type: "tool_response" as const, id: "2", result: "ok" };
    const { messages } = parseMessages(`not-json\n${JSON.stringify(valid)}\n`);
    assert.strictEqual(messages.length, 1);
    assert.deepStrictEqual(messages[0], valid);
  });

  it("empty lines are ignored", () => {
    const msg = { type: "tool" as const, id: "1", tool: "x", args: {} };
    const { messages } = parseMessages(`\n\n${JSON.stringify(msg)}\n\n`);
    assert.strictEqual(messages.length, 1);
  });

  it("rejects messages without type (old protocol)", () => {
    const legacy = { id: "1", tool: "ping", args: {} };
    const { messages } = parseMessages(`${JSON.stringify(legacy)}\n`);
    assert.strictEqual(messages.length, 0);
  });

  it("rejects messages with unknown type", () => {
    const unknown = { type: "gibberish", id: "1" };
    const { messages } = parseMessages(`${JSON.stringify(unknown)}\n`);
    assert.strictEqual(messages.length, 0);
  });

  it("rejects messages without id", () => {
    const noId = { type: "tool", tool: "ping", args: {} };
    const { messages } = parseMessages(`${JSON.stringify(noId)}\n`);
    assert.strictEqual(messages.length, 0);
  });

  it("fragmented chunks accumulate correctly across two calls", () => {
    const msg = { type: "tool" as const, id: "1", tool: "foo", args: { a: "hello" } };
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

  it("whitespace-only lines are ignored", () => {
    const msg = { type: "tool_response" as const, id: "5", error: "oops" };
    const { messages } = parseMessages(`   \n${JSON.stringify(msg)}\n   \n`);
    assert.strictEqual(messages.length, 1);
  });
});
