import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';

import { SettingsService, ThemePreference } from './settings.service';

export type ResolvedTheme = 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Applies the active theme as `data-theme` on <html>. SCSS maps the attribute to CSS custom
 * properties, so switching theme never reloads styles.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly settings = inject(SettingsService);
  private readonly systemPrefersDark = signal(false);

  readonly preference = this.settings.theme;
  readonly resolved = computed<ResolvedTheme>(() => {
    const preference = this.preference();
    if (preference === 'system') {
      return this.systemPrefersDark() ? 'dark' : 'light';
    }
    return preference;
  });

  constructor() {
    const view = this.document.defaultView;
    if (view && typeof view.matchMedia === 'function') {
      const query = view.matchMedia(DARK_QUERY);
      this.systemPrefersDark.set(query.matches);
      const listener = (event: MediaQueryListEvent): void => this.systemPrefersDark.set(event.matches);
      query.addEventListener('change', listener);
      inject(DestroyRef).onDestroy(() => query.removeEventListener('change', listener));
    }

    effect(() => {
      const theme = this.resolved();
      const root = this.document.documentElement;
      root.setAttribute('data-theme', theme);
      root.style.colorScheme = theme;
    });
  }

  setPreference(preference: ThemePreference): void {
    this.settings.update({ theme: preference });
  }

  /** Quick toggle used by the header button: flips between light and dark. */
  toggle(): void {
    this.setPreference(this.resolved() === 'dark' ? 'light' : 'dark');
  }
}
