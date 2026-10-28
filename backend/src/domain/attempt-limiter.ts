export interface AttemptLimiterOptions {
  maxAttempts: number;
  windowMs: number;
  maxEntries?: number;
  now?: () => number;
}

export interface HitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface Entry {
  count: number;
  resetAt: number;
}

const DEFAULT_MAX_ENTRIES = 10_000;

export class AttemptLimiter {
  private readonly entries = new Map<string, Entry>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(options: AttemptLimiterOptions) {
    this.maxAttempts = options.maxAttempts;
    this.windowMs = options.windowMs;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.entries.size;
  }

  hit(key: string): HitResult {
    const now = this.now();
    let entry = this.entries.get(key);

    if (!entry || entry.resetAt <= now) {
      this.makeRoom(now);
      entry = { count: 0, resetAt: now + this.windowMs };
      this.entries.set(key, entry);
    }

    if (entry.count >= this.maxAttempts) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      };
    }

    entry.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  release(key: string): void {
    const entry = this.entries.get(key);

    if (!entry) {
      return;
    }

    entry.count -= 1;

    if (entry.count <= 0) {
      this.entries.delete(key);
    }
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  private makeRoom(now: number): void {
    if (this.entries.size < this.maxEntries) {
      return;
    }

    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) {
        this.entries.delete(key);
      }
    }

    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();

      if (oldest.done) {
        break;
      }

      this.entries.delete(oldest.value);
    }
  }
}
