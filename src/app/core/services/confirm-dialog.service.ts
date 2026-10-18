import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  /** `danger` styles the confirm button for destructive actions. */
  readonly tone?: 'default' | 'danger';
}

export interface ConfirmRequest {
  readonly id: number;
  readonly options: Required<ConfirmOptions>;
}

/**
 * Promise-based confirmation dialogs. The single `ConfirmDialogComponent` in the app shell
 * renders the current request; callers simply `await confirm(...)`.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private readonly _request = signal<ConfirmRequest | null>(null);
  private resolver: ((confirmed: boolean) => void) | null = null;
  private nextId = 1;

  readonly request = this._request.asReadonly();

  confirm(options: ConfirmOptions): Promise<boolean> {
    // Only one dialog at a time: a newer request cancels an older pending one.
    this.settle(false);
    return new Promise<boolean>((resolve) => {
      this.resolver = resolve;
      this._request.set({
        id: this.nextId++,
        options: {
          confirmLabel: 'Confirm',
          cancelLabel: 'Cancel',
          tone: 'default',
          ...options,
        },
      });
    });
  }

  /** Called by the dialog component when the user answers (or dismisses with Escape). */
  settle(confirmed: boolean): void {
    const resolve = this.resolver;
    this.resolver = null;
    this._request.set(null);
    resolve?.(confirmed);
  }
}
