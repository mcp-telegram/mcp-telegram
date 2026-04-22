/** FIFO mutex — ensures only one critical section runs at a time.
 * Used in master to serialize tool calls with QR login flow:
 * login holds the lock for up to minutes; tool calls queue behind it. */
export class GlobalLock {
  private locked = false;
  private waiters: Array<() => void> = [];

  async acquire(): Promise<() => void> {
    if (this.locked) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.locked = true;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.locked = false;
      const next = this.waiters.shift();
      if (next) next();
    };
  }

  isLocked(): boolean {
    return this.locked;
  }

  waitingCount(): number {
    return this.waiters.length;
  }
}
