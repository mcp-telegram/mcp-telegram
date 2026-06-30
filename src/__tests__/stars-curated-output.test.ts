/**
 * Token-optimization Tier 1: telegram-get-stars-status / -transactions now
 * return curated text instead of a raw JSON.stringify dump. This locks the
 * format at the tool level so it can't silently regress to a verbose JSON blob.
 * Mock-only — no real Telegram connection.
 */
import assert from "node:assert";
import { describe, it } from "node:test";
import type { TelegramService } from "../telegram-client.js";
import { registerStarsTools } from "../tools/stars.js";

type ToolHandler = (args: unknown) => Promise<{ content: Array<{ type: string; text?: string }> }>;

/** Minimal McpServer stub that captures registered tool handlers by name. */
function captureHandlers(telegram: TelegramService): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();
  const server = {
    registerTool: (name: string, _def: unknown, handler: ToolHandler) => {
      handlers.set(name, handler);
    },
  } as unknown as Parameters<typeof registerStarsTools>[0];
  registerStarsTools(server, telegram);
  return handlers;
}

const prevEnv = process.env.MCP_TELEGRAM_ENABLE_STARS;
process.env.MCP_TELEGRAM_ENABLE_STARS = "1";

function textOf(res: { content: Array<{ type: string; text?: string }> }): string {
  const part = res.content[0];
  return part?.type === "text" ? (part.text ?? "") : "";
}

describe("Stars tools — curated text output (Tier 1 token optimization)", () => {
  it("get-stars-status renders curated text, not raw JSON", async () => {
    const telegram = {
      ensureConnected: async () => true,
      getStarsStatus: async () => ({
        balance: { amount: "1500", nanos: 0 },
        history: [
          {
            id: "txn_a",
            stars: { amount: "100", nanos: 0 },
            date: 1782700000,
            peer: { kind: "premiumBot" },
            title: "Sub",
          },
          {
            id: "txn_b",
            stars: { amount: "25", nanos: 500000000 },
            date: 1782600000,
            peer: { kind: "peer", peer: { kind: "user", id: "117799143" } },
            gift: true,
            pending: false,
          },
        ],
        nextOffset: "cur1",
      }),
    } as unknown as TelegramService;

    const handlers = captureHandlers(telegram);
    const handler = handlers.get("telegram-get-stars-status");
    assert.ok(handler, "stars-status handler registered");
    const text = textOf(await handler({ peer: "me" }));

    assert.throws(() => JSON.parse(text), "curated output must not be valid JSON");
    assert.match(text, /balance=1500⭐/);
    assert.match(text, /transactions \(2\):/);
    assert.match(text, /\[txn_a\] 100⭐ premiumBot date=2026-/); // ISO date
    assert.match(text, /25\.5⭐ user:117799143/);
    assert.match(text, /\[gift\]/);
    assert.doesNotMatch(text, /pending/, "falsy flags dropped");
    assert.match(text, /nextOffset=cur1/);
  });

  it("get-stars-status handles an empty wallet (no history)", async () => {
    const telegram = {
      ensureConnected: async () => true,
      getStarsStatus: async () => ({ balance: { amount: "0", nanos: 0 } }),
    } as unknown as TelegramService;
    const handler = captureHandlers(telegram).get("telegram-get-stars-status");
    assert.ok(handler);
    const text = textOf(await handler({ peer: "me" }));
    assert.match(text, /balance=0⭐/);
    assert.doesNotMatch(text, /transactions/);
  });
});

// Restore env after this suite's module-level mutation.
process.on("exit", () => {
  if (prevEnv === undefined) delete process.env.MCP_TELEGRAM_ENABLE_STARS;
  else process.env.MCP_TELEGRAM_ENABLE_STARS = prevEnv;
});
