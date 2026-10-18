import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

/** Keep in sync with `$breakpoints` in `src/styles/_tokens.scss`. */
const MOBILE_QUERY = '(max-width: 767.98px)';
const TABLET_QUERY = '(min-width: 768px) and (max-width: 1023.98px)';

/** Responsive navigation state: off-canvas drawer on phones, collapsible rail on tablets. */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  readonly isMobile = signal(false);
  readonly isTablet = signal(false);
  /** Tablet/desktop: sidebar shows icons only. */
  readonly sidebarCollapsed = signal(false);
  /** Mobile: drawer is open. */
  readonly mobileNavOpen = signal(false);

  readonly navExpanded = computed(() =>
    this.isMobile() ? this.mobileNavOpen() : !this.sidebarCollapsed(),
  );

  constructor() {
    this.watch(MOBILE_QUERY, (matches) => {
      this.isMobile.set(matches);
      if (!matches) {
        this.mobileNavOpen.set(false);
      }
    });
    this.watch(TABLET_QUERY, (matches) => {
      this.isTablet.set(matches);
      // Tablets start collapsed to give notes more room; desktop starts expanded.
      this.sidebarCollapsed.set(matches);
    });
  }

  toggleNav(): void {
    if (this.isMobile()) {
      this.mobileNavOpen.update((open) => !open);
    } else {
      this.sidebarCollapsed.update((collapsed) => !collapsed);
    }
  }

  closeMobileNav(): void {
    this.mobileNavOpen.set(false);
  }

  private watch(query: string, apply: (matches: boolean) => void): void {
    const view = this.document.defaultView;
    if (!view || typeof view.matchMedia !== 'function') {
      return;
    }
    const list = view.matchMedia(query);
    apply(list.matches);
    const listener = (event: MediaQueryListEvent): void => apply(event.matches);
    list.addEventListener('change', listener);
    this.destroyRef.onDestroy(() => list.removeEventListener('change', listener));
  }
}
