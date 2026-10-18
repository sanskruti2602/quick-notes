import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { NotificationService, ToastKind } from '../../../core/services/notification.service';
import { IconComponent, IconName } from '../icon/icon.component';

const KIND_ICONS: Readonly<Record<ToastKind, IconName>> = {
  success: 'circle-check',
  info: 'info',
  warning: 'warning',
  error: 'circle-alert',
};

/**
 * Visual stack of toasts. Two live regions are used so errors interrupt (assertive) while
 * confirmations are announced politely.
 */
@Component({
  selector: 'qn-toast-container',
  imports: [IconComponent],
  templateUrl: './toast-container.component.html',
  styleUrl: './toast-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastContainerComponent {
  protected readonly notifier = inject(NotificationService);
  protected readonly icons = KIND_ICONS;

  /** Errors go to an assertive region, everything else to a polite one. */
  protected readonly regions = computed(() => {
    const toasts = this.notifier.toasts();
    return [
      {
        role: 'alert',
        live: 'assertive',
        toasts: toasts.filter((toast) => toast.kind === 'error'),
      },
      {
        role: 'status',
        live: 'polite',
        toasts: toasts.filter((toast) => toast.kind !== 'error'),
      },
    ] as const;
  });
}
