import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';

import { LayoutService } from './core/services/layout.service';
import { NotesStateService } from './features/notes/services/notes-state.service';
import { HeaderComponent } from './layout/header/header.component';
import { SidebarComponent } from './layout/sidebar/sidebar.component';
import { ConfirmDialogComponent } from './shared/components/confirm-dialog/confirm-dialog.component';
import { IconComponent } from './shared/components/icon/icon.component';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container.component';

/** Application shell: sidebar, header, routed content, toasts and the confirmation dialog. */
@Component({
  selector: 'qn-root',
  imports: [
    RouterOutlet,
    SidebarComponent,
    HeaderComponent,
    IconComponent,
    ToastContainerComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
    '(window:beforeunload)': 'onBeforeUnload($event)',
  },
})
export class App {
  protected readonly layout = inject(LayoutService);
  protected readonly state = inject(NotesStateService);

  constructor() {
    const subscription = inject(Router).events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.layout.closeMobileNav();
      }
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  protected onEscape(): void {
    if (this.layout.mobileNavOpen()) {
      this.layout.closeMobileNav();
    }
  }

  /** Warn before closing the tab if changes could not be written to storage. */
  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.state.hasUnpersistedChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}
