import assert from "node:assert";
import { describe, it } from "node:test";
import { GlobalLock } from "../global-lock.js";

describe("GlobalLock", () => {
  it("single acquire/release cycle works", async () => {
    const lock = new GlobalLock();
    assert.strictEqual(lock.isLocked(), false);
    const release = await lock.acquire();
    assert.strictEqual(lock.isLocked(), true);
    release();
    assert.strictEqual(lock.isLocked(), false);
  });

  it("second acquire waits until first releases", async () => {
    const lock = new GlobalLock();
    const order: string[] = [];

    const r1 = await lock.acquire();
    order.push("1-acquired");

    const p2 = lock.acquire().then((r2) => {
      order.push("2-acquired");
      return r2;
    });

    // Give microtask queue a chance — p2 should still be pending
    await Promise.resolve();
    assert.deepStrictEqual(order, ["1-acquired"]);
    assert.strictEqual(lock.waitingCount(), 1);

    r1();
    const r2 = await p2;
    assert.deepStrictEqual(order, ["1-acquired", "2-acquired"]);
    r2();
  });

  it("waiters are dispatched in FIFO order", async () => {
    const lock = new GlobalLock();
    const order: number[] = [];

    const r0 = await lock.acquire();

    const p1 = lock.acquire().then((r) => {
      order.push(1);
      r();
    });
    const p2 = lock.acquire().then((r) => {
      order.push(2);
      r();
    });
    const p3 = lock.acquire().then((r) => {
      order.push(3);
      r();
    });

    r0();
    await Promise.all([p1, p2, p3]);
    assert.deepStrictEqual(order, [1, 2, 3]);
  });

  it("double release is idempotent", async () => {
    const lock = new GlobalLock();
    const release = await lock.acquire();
    release();
    release();
    release();
    assert.strictEqual(lock.isLocked(), false);
  });

  it("double release does NOT wake an extra waiter (safety)", async () => {
    const lock = new GlobalLock();
    const r0 = await lock.acquire();

    let waiter2Acquired = false;
    const p1 = lock.acquire();
    const p2 = lock.acquire().then((r) => {
      waiter2Acquired = true;
      return r;
    });

    r0();
    r0(); // second call — must be no-op
    const r1 = await p1;
    await Promise.resolve();
    assert.strictEqual(waiter2Acquired, false, "second waiter must wait for r1");
    r1();
    const r2 = await p2;
    r2();
  });

  it("waitingCount reports pending queue size", async () => {
    const lock = new GlobalLock();
    const r0 = await lock.acquire();
    assert.strictEqual(lock.waitingCount(), 0);

    lock.acquire();
    lock.acquire();
    assert.strictEqual(lock.waitingCount(), 2);

    r0();
    await Promise.resolve();
    assert.strictEqual(lock.waitingCount(), 1);
  });
});
