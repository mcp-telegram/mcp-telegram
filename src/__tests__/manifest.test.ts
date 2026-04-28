import assert from "node:assert";
import { describe, it } from "node:test";
import { _resetManifestCache, getToolManifest } from "../manifest.js";

describe("getToolManifest", () => {
  const manifest = getToolManifest();

  it("registers a substantial catalog (lower-bound, not exact)", () => {
    // Catalog can grow — assert a floor, not a fixed count, so legitimate
    // additions don't fail this test. Drift detection lives in the
    // cloud's `pnpm check-parity` step which is the actual parity gate.
    assert.ok(manifest.toolCount >= 150, `expected >= 150 tools, got ${manifest.toolCount}`);
    assert.strictEqual(manifest.toolCount, manifest.tools.length);
  });

  it("reports tier breakdown that sums to toolCount", () => {
    const sum = manifest.tiers["read-only"] + manifest.tiers.write + manifest.tiers.destructive;
    assert.strictEqual(sum, manifest.toolCount);
  });

  it("has tools in every tier", () => {
    assert.ok(manifest.tiers["read-only"] > 0, "no read-only tools");
    assert.ok(manifest.tiers.write > 0, "no write tools");
    assert.ok(manifest.tiers.destructive > 0, "no destructive tools");
  });

  it("returns a stable cached manifest across calls (no env race)", () => {
    const a = getToolManifest();
    const b = getToolManifest();
    assert.strictEqual(a, b, "expected cached identity");
  });

  it("returns tools sorted by name", () => {
    const names = manifest.tools.map((t) => t.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    assert.deepStrictEqual(names, sorted);
  });

  it("classifies known read-only tools correctly", () => {
    const status = manifest.tools.find((t) => t.name === "telegram-status");
    assert.ok(status, "telegram-status not found");
    assert.strictEqual(status.tier, "read-only");
  });

  it("classifies known destructive tools correctly", () => {
    const deleteMessage = manifest.tools.find((t) => t.name === "telegram-delete-message");
    assert.ok(deleteMessage, "telegram-delete-message not found");
    assert.strictEqual(deleteMessage.tier, "destructive");
  });

  it("classifies known write tools correctly", () => {
    const sendMessage = manifest.tools.find((t) => t.name === "telegram-send-message");
    assert.ok(sendMessage, "telegram-send-message not found");
    assert.strictEqual(sendMessage.tier, "write");
  });

  it("includes opt-in stars tools (env flag forced ON during introspection)", () => {
    const stars = manifest.tools.find((t) => t.name === "telegram-get-stars-status");
    assert.ok(stars, "telegram-get-stars-status not found — opt-in flag not forced?");
  });

  it("includes opt-in group calls tools", () => {
    const gc = manifest.tools.find((t) => t.name === "telegram-get-group-call");
    assert.ok(gc, "telegram-get-group-call not found");
  });

  it("includes opt-in quick replies tools", () => {
    const qr = manifest.tools.find((t) => t.name === "telegram-get-quick-replies");
    assert.ok(qr, "telegram-get-quick-replies not found");
  });

  it("does not leak forced env flags after invocation", () => {
    const original = process.env.MCP_TELEGRAM_ENABLE_STARS;
    delete process.env.MCP_TELEGRAM_ENABLE_STARS;
    try {
      _resetManifestCache();
      getToolManifest();
      assert.strictEqual(process.env.MCP_TELEGRAM_ENABLE_STARS, undefined);
    } finally {
      if (original === undefined) delete process.env.MCP_TELEGRAM_ENABLE_STARS;
      else process.env.MCP_TELEGRAM_ENABLE_STARS = original;
    }
  });

  it("preserves pre-set env flags after invocation", () => {
    const original = process.env.MCP_TELEGRAM_ENABLE_STARS;
    process.env.MCP_TELEGRAM_ENABLE_STARS = "0";
    try {
      _resetManifestCache();
      getToolManifest();
      assert.strictEqual(process.env.MCP_TELEGRAM_ENABLE_STARS, "0");
    } finally {
      if (original === undefined) delete process.env.MCP_TELEGRAM_ENABLE_STARS;
      else process.env.MCP_TELEGRAM_ENABLE_STARS = original;
    }
  });

  it("emits a parseable ISO timestamp", () => {
    assert.ok(!Number.isNaN(Date.parse(manifest.generatedAt)));
  });

  it("every entry has a non-empty name", () => {
    for (const tool of manifest.tools) {
      assert.ok(tool.name.length > 0, `empty name: ${JSON.stringify(tool)}`);
      assert.ok(tool.name.startsWith("telegram-"), `unexpected prefix: ${tool.name}`);
    }
  });
});
