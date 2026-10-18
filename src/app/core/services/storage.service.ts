import { Injectable, InjectionToken, inject } from '@angular/core';

/**
 * The Web Storage backend. Resolved lazily because simply touching `window.localStorage` throws
 * in some privacy modes. Tests can provide an in-memory implementation.
 */
export const BROWSER_STORAGE = new InjectionToken<Storage | null>('BROWSER_STORAGE', {
  providedIn: 'root',
  factory: () => {
    try {
      return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
      return null;
    }
  },
});

export type StorageErrorKind = 'quota' | 'unavailable' | 'unknown';

export type StorageWriteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: StorageErrorKind };

export function isQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof DOMException)) {
    return false;
  }
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22 ||
    error.code === 1014
  );
}

export type JsonReadResult =
  | { readonly status: 'missing' }
  | { readonly status: 'ok'; readonly value: unknown; readonly raw: string }
  | { readonly status: 'invalid'; readonly raw: string };

const PROBE_KEY = 'quick-notes:__probe__';

/**
 * Thin, failure-tolerant wrapper around LocalStorage.
 *
 * - If LocalStorage is unavailable (blocked, private mode, SSR) it falls back to an in-memory map
 *   so the app keeps working for the current session, and reports `isPersistent === false`.
 * - Writes never throw: they return a result describing quota or other failures so callers can
 *   keep the user's data in memory and warn them instead of losing it silently.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly backend: Storage | null;
  private readonly memory = new Map<string, string>();

  /** True when data written here survives a page refresh. */
  readonly isPersistent: boolean;

  constructor() {
    const candidate = inject(BROWSER_STORAGE);
    this.backend = StorageService.probe(candidate) ? candidate : null;
    this.isPersistent = this.backend !== null;
  }

  private static probe(storage: Storage | null): storage is Storage {
    if (!storage) {
      return false;
    }
    try {
      storage.setItem(PROBE_KEY, '1');
      storage.removeItem(PROBE_KEY);
      return true;
    } catch (error) {
      // A full quota still means storage exists and existing data can be read.
      return isQuotaExceededError(error);
    }
  }

  read(key: string): string | null {
    if (!this.backend) {
      return this.memory.get(key) ?? null;
    }
    try {
      return this.backend.getItem(key);
    } catch {
      return null;
    }
  }

  write(key: string, value: string): StorageWriteResult {
    if (!this.backend) {
      this.memory.set(key, value);
      return { ok: true };
    }
    try {
      this.backend.setItem(key, value);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: isQuotaExceededError(error) ? 'quota' : 'unknown' };
    }
  }

  remove(key: string): void {
    if (!this.backend) {
      this.memory.delete(key);
      return;
    }
    try {
      this.backend.removeItem(key);
    } catch {
      // Removing is best-effort; nothing useful to report.
    }
  }

  /** Reads and parses JSON without ever throwing. */
  readJson(key: string): JsonReadResult {
    const raw = this.read(key);
    if (raw === null) {
      return { status: 'missing' };
    }
    try {
      return { status: 'ok', value: JSON.parse(raw) as unknown, raw };
    } catch {
      return { status: 'invalid', raw };
    }
  }
}
