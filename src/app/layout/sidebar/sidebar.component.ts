import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { LayoutService } from '../../core/services/layout.service';
import { IconComponent, IconName } from '../../shared/components/icon/icon.component';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { NotesStateService } from '../../features/notes/services/notes-state.service';

interface NavItem {
  readonly label: string;
  readonly path: string;
  readonly icon: IconName;
  readonly count?: number;
  readonly exact?: boolean;
}

const MAX_SIDEBAR_TAGS = 8;

/**
 * Primary navigation. Full width on desktop, an icon rail when collapsed (tablets), and an
 * off-canvas drawer on phones.
 */
@Component({
  selector: 'qn-sidebar',
  imports: [RouterLink, RouterLinkActive, IconComponent, TooltipDirective],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-collapsed]': 'collapsed()',
    '[class.is-open]': 'layout.mobileNavOpen()',
  },
})
export class SidebarComponent {
  protected readonly layout = inject(LayoutService);
  private readonly state = inject(NotesStateService);
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');

  /** Icon-only rail: collapsed on tablet/desktop, never in the mobile drawer. */
  protected readonly collapsed = computed(
    () => !this.layout.isMobile() && this.layout.sidebarCollapsed(),
  );

  protected readonly primaryItems = computed<readonly NavItem[]>(() => {
    const counts = this.state.counts();
    return [
      { label: 'All Notes', path: '/notes', icon: 'note', count: counts.all, exact: true },
      { label: 'Pinned', path: '/pinned', icon: 'pin', count: counts.pinned },
      { label: 'Tags', path: '/tags', icon: 'tags', exact: true },
      { label: 'Archived', path: '/archived', icon: 'archive', count: counts.archived },
      { label: 'Trash', path: '/trash', icon: 'trash', count: counts.trash },
    ];
  });

  protected readonly tags = computed(() => this.state.tags().slice(0, MAX_SIDEBAR_TAGS));
  protected readonly moreTags = computed(() => Math.max(0, this.state.tags().length - MAX_SIDEBAR_TAGS));

  constructor() {
    // Move focus into the drawer when it opens on mobile.
    effect(() => {
      if (this.layout.isMobile() && this.layout.mobileNavOpen()) {
        this.closeButton()?.nativeElement.focus();
      }
    });
  }
}
