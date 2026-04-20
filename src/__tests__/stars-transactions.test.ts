import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import { TelegramService } from "../telegram-client.js";

interface Internals {
  client: unknown;
  connected: boolean;
}

function makeService(invocations: unknown[], responder: (req: unknown) => unknown): TelegramService {
  const fakeClient = {
    invoke: async (req: unknown) => {
      invocations.push(req);
      return responder(req);
    },
  };
  const service = new TelegramService(1, "hash");
  const internals = service as unknown as Internals;
  internals.client = fakeClient;
  internals.connected = true;
  return service;
}

describe("TelegramService.getStarsTransactions", () => {
  it("invokes payments.GetStarsTransactions with resolved peer, default offset='' and limit=50", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      invocations,
      () =>
        new Api.payments.StarsStatus({
          balance: new Api.StarsAmount({ amount: bigInt(100), nanos: 0 }),
          history: [
            new Api.StarsTransaction({
              id: "tx-A",
              stars: new Api.StarsAmount({ amount: bigInt(25), nanos: 0 }),
              date: 1710000000,
              peer: new Api.StarsTransactionPeerAppStore(),
            }),
          ],
          nextOffset: "next-cursor",
          chats: [],
          users: [],
        }),
    );
    const internals = service as unknown as { resolvePeer: (id: string) => Promise<unknown> };
    internals.resolvePeer = async (_id: string) => new Api.InputPeerUser({ userId: bigInt(1), accessHash: bigInt(2) });

    const out = await service.getStarsTransactions("me");
    const call = invocations.find((r) => r instanceof Api.payments.GetStarsTransactions) as
      | Api.payments.GetStarsTransactions
      | undefined;
    assert.ok(call, "GetStarsTransactions must be invoked");
    assert.strictEqual(call.offset, "");
    assert.strictEqual(call.limit, 50);
    assert.strictEqual(call.inbound, undefined);
    assert.strictEqual(call.outbound, undefined);
    assert.strictEqual(call.ascending, undefined);
    assert.strictEqual(call.subscriptionId, undefined);
    assert.deepStrictEqual(out.balance, { amount: "100", nanos: 0 });
    assert.strictEqual(out.history?.length, 1);
    assert.strictEqual(out.history?.[0].id, "tx-A");
    assert.strictEqual(out.nextOffset, "next-cursor");
  });

  it("forwards filter and pagination options verbatim", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      invocations,
      () =>
        new Api.payments.StarsStatus({
          balance: new Api.StarsAmount({ amount: bigInt(0), nanos: 0 }),
          chats: [],
          users: [],
        }),
    );
    const internals = service as unknown as { resolvePeer: (id: string) => Promise<unknown> };
    internals.resolvePeer = async (_id: string) => new Api.InputPeerUser({ userId: bigInt(7), accessHash: bigInt(8) });

    await service.getStarsTransactions("me", {
      inbound: true,
      outbound: false,
      ascending: true,
      subscriptionId: "sub-9",
      offset: "cursor-xyz",
      limit: 25,
    });

    const call = invocations.find((r) => r instanceof Api.payments.GetStarsTransactions) as
      | Api.payments.GetStarsTransactions
      | undefined;
    assert.ok(call);
    assert.strictEqual(call.inbound, true);
    assert.strictEqual(call.outbound, false);
    assert.strictEqual(call.ascending, true);
    assert.strictEqual(call.subscriptionId, "sub-9");
    assert.strictEqual(call.offset, "cursor-xyz");
    assert.strictEqual(call.limit, 25);
  });

  it("throws when not connected", async () => {
    const service = new TelegramService(1, "hash");
    await assert.rejects(() => service.getStarsTransactions("me"), /Not connected/i);
  });
});
