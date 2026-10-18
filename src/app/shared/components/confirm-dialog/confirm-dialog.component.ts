import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';

import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';
import { IconComponent } from '../icon/icon.component';

/**
 * Renders the active confirmation request in a native modal <dialog>, which provides focus
 * trapping, an inert background and Escape-to-cancel for free. Focus returns to the element that
 * opened the dialog when it closes.
 */
@Component({
  selector: 'qn-confirm-dialog',
  imports: [IconComponent],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent {
  private readonly service = inject(ConfirmDialogService);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');
  private returnFocusTo: HTMLElement | null = null;

  protected readonly request = this.service.request;

  constructor() {
    effect(() => {
      const request = this.request();
      const dialog = this.dialog().nativeElement;
      if (request && !dialog.open) {
        const active = this.document.activeElement;
        this.returnFocusTo = active instanceof HTMLElement ? active : null;
        dialog.showModal();
        // Safer default for destructive actions: focus Cancel, not Confirm (once it has rendered).
        afterNextRender(() => this.cancelButton()?.nativeElement.focus(), {
          injector: this.injector,
        });
      } else if (!request && dialog.open) {
        dialog.close();
      }
    });
  }

  protected answer(confirmed: boolean): void {
    this.service.settle(confirmed);
  }

  /** Native `cancel` fires on Escape. */
  protected onCancel(event: Event): void {
    event.preventDefault();
    this.answer(false);
  }

  protected onClose(): void {
    if (this.request()) {
      this.service.settle(false);
    }
    this.returnFocusTo?.focus();
    this.returnFocusTo = null;
  }

  /** Clicking the backdrop (outside the panel) cancels. */
  protected onDialogClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) {
      this.answer(false);
    }
  }
}
