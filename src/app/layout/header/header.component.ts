import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { LayoutService } from '../../core/services/layout.service';
import { ThemeService } from '../../core/services/theme.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { NoteSearchComponent } from '../../features/notes/components/note-search/note-search.component';

/** Top bar: navigation toggle, search, theme switch and the "New note" action. */
@Component({
  selector: 'qn-header',
  imports: [RouterLink, IconComponent, TooltipDirective, NoteSearchComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  protected readonly layout = inject(LayoutService);
  protected readonly theme = inject(ThemeService);

  protected readonly navToggleLabel = computed(() => {
    if (this.layout.isMobile()) {
      return this.layout.mobileNavOpen() ? 'Close navigation' : 'Open navigation';
    }
    return this.layout.sidebarCollapsed() ? 'Expand sidebar' : 'Collapse sidebar';
  });

  protected readonly navToggleIcon = computed(() => {
    if (this.layout.isMobile()) {
      return 'menu' as const;
    }
    return this.layout.sidebarCollapsed() ? ('panel-open' as const) : ('panel-close' as const);
  });

  protected readonly themeLabel = computed(() =>
    this.theme.resolved() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
  );
}
