/**
 * In-memory `Storage` implementation for unit tests, with switches to simulate quota errors and
 * blocked storage.
 */
export class MemoryStorage implements Storage {
  [key: string]: unknown;

  private readonly data = new Map<string, string>();

  /** When set, `setItem` throws: `quota` → QuotaExceededError, `blocked` → SecurityError. */
  failWrites: 'quota' | 'blocked' | null = null;
  /** When true, every access throws (simulates storage disabled by the browser). */
  unavailable = false;

  get length(): number {
    this.guard();
    return this.data.size;
  }

  clear(): void {
    this.guard();
    this.data.clear();
  }

  getItem(key: string): string | null {
    this.guard();
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    this.guard();
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.guard();
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.guard();
    if (this.failWrites === 'quota') {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    }
    if (this.failWrites === 'blocked') {
      throw new DOMException('Access denied.', 'SecurityError');
    }
    this.data.set(key, String(value));
  }

  /** Test helper: keys currently stored. */
  keys(): string[] {
    return [...this.data.keys()];
  }

  private guard(): void {
    if (this.unavailable) {
      throw new DOMException('Storage is disabled.', 'SecurityError');
    }
  }
}
