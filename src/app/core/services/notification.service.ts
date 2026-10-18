import { DestroyRef, Injectable, inject, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  readonly label: string;
  readonly run: () => void;
}

export interface Toast {
  readonly id: number;
  readonly kind: ToastKind;
  readonly message: string;
  readonly action?: ToastAction;
  readonly durationMs: number;
}

export interface ToastOptions {
  readonly action?: ToastAction;
  /** Milliseconds before auto-dismiss. `0` keeps the toast until dismissed. */
  readonly durationMs?: number;
}

const DEFAULT_DURATION: Readonly<Record<ToastKind, number>> = {
  success: 4000,
  info: 4000,
  warning: 7000,
  error: 8000,
};

const MAX_VISIBLE = 4;

/** Queue of transient toast messages rendered by `ToastContainerComponent`. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly _toasts = signal<readonly Toast[]>([]);
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private nextId = 1;

  readonly toasts = this._toasts.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.timers.forEach((timer) => clearTimeout(timer));
      this.timers.clear();
    });
  }

  success(message: string, options?: ToastOptions): number {
    return this.show('success', message, options);
  }

  info(message: string, options?: ToastOptions): number {
    return this.show('info', message, options);
  }

  warning(message: string, options?: ToastOptions): number {
    return this.show('warning', message, options);
  }

  error(message: string, options?: ToastOptions): number {
    return this.show('error', message, options);
  }

  show(kind: ToastKind, message: string, options: ToastOptions = {}): number {
    const id = this.nextId++;
    const durationMs = options.durationMs ?? DEFAULT_DURATION[kind];
    const toast: Toast = { id, kind, message, durationMs, action: options.action };

    const current = this._toasts();
    const overflow = current.length - MAX_VISIBLE + 1;
    if (overflow > 0) {
      current.slice(0, overflow).forEach((old) => this.clearTimer(old.id));
    }
    this._toasts.set([...current.slice(Math.max(0, overflow)), toast]);

    if (durationMs > 0) {
      this.timers.set(
        id,
        setTimeout(() => this.dismiss(id), durationMs),
      );
    }
    return id;
  }

  /** Runs a toast's action (e.g. Undo) and dismisses it. */
  runAction(id: number): void {
    const toast = this._toasts().find((candidate) => candidate.id === id);
    this.dismiss(id);
    toast?.action?.run();
  }

  dismiss(id: number): void {
    this.clearTimer(id);
    this._toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  clear(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this._toasts.set([]);
  }

  private clearTimer(id: number): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
}
