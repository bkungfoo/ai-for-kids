/**
 * A counting semaphore for bounding concurrency.
 *
 * `acquire()` resolves with a `release` function once a permit is free. Callers
 * must invoke `release` exactly once when done (the helpers in this repo wrap it
 * so it is idempotent at the call site).
 */
export class Semaphore {
  private permits: number;
  private readonly queue: Array<() => void> = [];

  constructor(permits: number) {
    if (permits < 1) throw new Error('Semaphore needs at least 1 permit');
    this.permits = permits;
  }

  /** Number of callers currently waiting for a permit. */
  get waiting(): number {
    return this.queue.length;
  }

  /** Permits not currently held. */
  get available(): number {
    return this.permits;
  }

  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const grant = () => {
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          this.release();
        });
      };

      if (this.permits > 0) {
        this.permits--;
        grant();
      } else {
        this.queue.push(() => {
          this.permits--;
          grant();
        });
      }
    });
  }

  private release(): void {
    this.permits++;
    const next = this.queue.shift();
    if (next) next();
  }
}
