import { DestroyRef, Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';

const EDITOR_URL = /^\/notes\/[^/?#]+/;

/**
 * Remembers the last list page (All Notes, Archive, a tag…) so the editor's Back / Cancel
 * returns the user to where they came from.
 */
@Injectable({ providedIn: 'root' })
export class NavigationHistoryService {
  private readonly router = inject(Router);
  private lastListUrl = '/notes';

  constructor() {
    const subscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd && !EDITOR_URL.test(event.urlAfterRedirects)) {
        this.lastListUrl = event.urlAfterRedirects;
      }
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  get returnUrl(): string {
    return this.lastListUrl;
  }
}
