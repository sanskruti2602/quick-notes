import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';

import { IconComponent, IconName } from '../icon/icon.component';

export interface MenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly danger?: boolean;
}

let nextMenuId = 0;

/**
 * Accessible "more actions" menu following the WAI-ARIA menu button pattern:
 * Enter/Space/ArrowDown open it, arrow keys/Home/End move focus, Escape closes and returns focus
 * to the trigger, Tab or an outside click closes it.
 */
@Component({
  selector: 'qn-action-menu',
  imports: [IconComponent],
  templateUrl: './action-menu.component.html',
  styleUrl: './action-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class ActionMenuComponent {
  readonly items = input.required<readonly MenuItem[]>();
  /** Accessible name for the trigger button, e.g. "More actions for Shopping list". */
  readonly label = input.required<string>();
  readonly selected = output<string>();

  protected readonly open = signal(false);
  protected readonly menuId = `qn-menu-${nextMenuId++}`;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly menuItems = viewChildren<ElementRef<HTMLButtonElement>>('menuItem');

  protected toggle(): void {
    if (this.open()) {
      this.close(true);
    } else {
      this.openMenu('first');
    }
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.openMenu(event.key === 'ArrowDown' ? 'first' : 'last');
    }
  }

  protected onMenuKeydown(event: KeyboardEvent): void {
    const items = this.menuItems().map((ref) => ref.nativeElement);
    const index = items.findIndex((item) => item === event.target);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        items[(index + 1) % items.length]?.focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        items[(index - 1 + items.length) % items.length]?.focus();
        break;
      case 'Home':
        event.preventDefault();
        items[0]?.focus();
        break;
      case 'End':
        event.preventDefault();
        items[items.length - 1]?.focus();
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.close(true);
        break;
      case 'Tab':
        this.close(false);
        break;
    }
  }

  protected select(item: MenuItem): void {
    this.close(true);
    this.selected.emit(item.id);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && event.target instanceof Node && !this.host.nativeElement.contains(event.target)) {
      this.close(false);
    }
  }

  private openMenu(focus: 'first' | 'last'): void {
    this.open.set(true);
    afterNextRender(
      () => {
        const items = this.menuItems();
        const target = focus === 'first' ? items[0] : items[items.length - 1];
        target?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  private close(returnFocus: boolean): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    if (returnFocus) {
      this.trigger().nativeElement.focus();
    }
  }
}
